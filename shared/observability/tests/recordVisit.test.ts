import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The two server-side funnel writers.
 *
 * `recordSurveyPageView` exists because the step above it in the funnel —
 * `survey_engine_mount` — is posted by the BROWSER using the `__liq_vid`
 * cookie, and proxy.ts mints that cookie only after someone clicks Accept. So
 * the numerator was consent-gated while its `unique_visitor` denominator was
 * not, and /admin labelled the gap "Bounced on landing". These tests pin the
 * properties that make the new one comparable to the denominator: same writer,
 * same id scheme, same event shape, different event_type.
 */
const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetch(...args),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { readFileSync } from "node:fs";

import { PAY_TO_START_OFFER_IDS, isPayToStartOfferId } from "@features/pay-to-start/logic/offer";

import {
  flaggedVisit,
  recordSurveyPageView,
  recordUniqueVisit,
} from "@shared/observability/recordVisit";

/** The JSON body of the single insert the writer performed. */
function insertedBody(): Record<string, unknown> {
  expect(mockFetch, "exactly one insert").toHaveBeenCalledTimes(1);
  const init = mockFetch.mock.calls[0]![1] as { body: string };
  return JSON.parse(init.body) as Record<string, unknown>;
}

describe("server-side funnel writers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    mockFetch.mockResolvedValue({ ok: true, status: 201, clone: () => ({ text: async () => "" }) });
  });

  it("writes a survey view under its own event type, not the browser-posted one", async () => {
    await recordSurveyPageView("white", "google");
    const body = insertedBody();
    expect(body.event_type).toBe("survey_page_view");
    /**
     * NOT `survey_engine_mount`. Reusing that event type would double count
     * every consenting visitor — the browser writes its own row with a
     * different visitor_id, and the primary key is (visitor_id, day,
     * event_type), so both would survive and COUNT(DISTINCT visitor_id) would
     * roughly double for anyone who accepted cookies.
     */
    expect(body.event_type).not.toBe("survey_engine_mount");
  });

  it("uses the same row shape as the visit count it sits under", async () => {
    await recordSurveyPageView("white_prev", "reddit");
    const survey = insertedBody();
    mockFetch.mockClear();
    await recordUniqueVisit("white_prev", "reddit");
    const visit = insertedBody();

    // Same keys, same day, same arm, same source — only the type differs. That
    // is what makes one divisible by the other.
    expect(Object.keys(survey).sort()).toEqual(Object.keys(visit).sort());
    expect(survey.day).toBe(visit.day);
    expect(survey.landing_variant).toBe(visit.landing_variant);
    expect(survey.utm_source).toBe(visit.utm_source);
    expect(survey.event_type).not.toBe(visit.event_type);
  });

  it("mints a fresh throwaway id per write, never a persistent one", async () => {
    await recordSurveyPageView("white");
    const first = insertedBody().visitor_id as string;
    mockFetch.mockClear();
    await recordSurveyPageView("white");
    const second = insertedBody().visitor_id as string;

    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    /**
     * Different every time, and never read back from a cookie. This is what
     * lets the row be written without analytics consent — there is nothing to
     * link across days or to a person. It is also why a start can never be
     * joined to its own visit, which the funnel labels rather than hides.
     */
    expect(second).not.toBe(first);
  });

  it("records an unrecognised arm as unknown rather than crediting white", async () => {
    // /survey is exactly the entry path that used to inflate white's
    // denominator by defaulting, and this is the server write path — a wrong
    // value here destroys the arm at write time and cannot be recovered.
    await recordSurveyPageView("not-an-arm");
    expect(insertedBody().landing_variant).toBe("unknown");
  });

  it("keeps pay to start's label, which proxy.ts gives that journey's visits", async () => {
    // Not an arm: dropped to "unknown" it would be indistinguishable from an entry the
    // landing test merely could not attribute.
    await recordUniqueVisit("pay_to_start", "google");
    expect(insertedBody().landing_variant).toBe("pay_to_start");
    mockFetch.mockClear();
    await recordSurveyPageView("pay_to_start");
    expect(insertedBody().landing_variant).toBe("pay_to_start");
  });

  it("writes which pay-to-start page a visit landed on, and nothing on any other visit", async () => {
    await recordUniqueVisit("pay_to_start", "google", "pre");
    expect(insertedBody().offer).toBe("pre");
    mockFetch.mockClear();
    await recordUniqueVisit("pay_to_start", undefined, "full");
    expect(insertedBody().offer).toBe("full");
    // Clamped like the label: the header comes from a request, and the column's CHECK would
    // refuse the whole row (the visit with it) for anything else.
    mockFetch.mockClear();
    await recordUniqueVisit("pay_to_start", undefined, "free");
    expect(insertedBody()).not.toHaveProperty("offer");
    // An arm's visit never carries an offer, whatever the header said.
    mockFetch.mockClear();
    await recordUniqueVisit("white_card", undefined, "pre");
    expect(insertedBody()).not.toHaveProperty("offer");
  });

  it("reads the visit proxy.ts flagged, offer included, as the layout hands it on", () => {
    expect(
      flaggedVisit(
        new Headers({
          "x-liq-new-visit": "pay_to_start",
          "x-liq-new-visit-utm": "google",
          "x-liq-new-visit-offer": "pre",
        })
      )
    ).toEqual(["pay_to_start", "google", "pre"]);
    expect(flaggedVisit(new Headers({ "x-liq-new-visit": "white_card" }))).toEqual([
      "white_card",
      undefined,
      undefined,
    ]);
    expect(flaggedVisit(new Headers())).toBeNull();
    // The layout spreads it into the writer, so no argument is dropped on the way.
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toContain("after(() => recordUniqueVisit(...newVisit))");
  });

  it("writes only offers the table's CHECK allows (20261023150000)", () => {
    // A value the CHECK refuses loses the whole visit: every offer the code knows is in it.
    const check = readFileSync(
      "supabase/migrations/20261023150000_funnel_event_offer.sql",
      "utf8"
    ).split("ADD CONSTRAINT")[1]!;
    for (const offer of PAY_TO_START_OFFER_IDS) expect(check).toContain(`'${offer}'`);
    expect(PAY_TO_START_OFFER_IDS.every(isPayToStartOfferId)).toBe(true);
  });

  it("omits utm_source entirely for direct traffic", async () => {
    await recordSurveyPageView("white");
    expect(insertedBody()).not.toHaveProperty("utm_source");
  });

  it("stays silent without credentials rather than throwing into the page", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await expect(recordSurveyPageView("white")).resolves.toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("swallows a failed insert — telemetry must never break the render", async () => {
    mockFetch.mockRejectedValue(new Error("supabase unreachable"));
    await expect(recordSurveyPageView("white")).resolves.toBeUndefined();
  });
});
