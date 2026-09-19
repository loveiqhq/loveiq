import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { armColor, armLabel } from "@features/attribution/server/labels";
import { reportingDay, reportingDayStart } from "@shared/time/reporting-day";

const mockNotifySlack = vi.fn();
const mockTryClaim = vi.fn();
const mockMarkDelivered = vi.fn();
const mockRecordCronRun = vi.fn();
const mockStartCronTimer = vi.fn();
const mockIsProdCronHost = vi.fn();
const mockFetchLandingArmFunnel = vi.fn();
const mockFetchArmCohorts = vi.fn();
const mockFetchLandingStartFunnel = vi.fn();
const mockFetchAxisFunnelDaily = vi.fn();
const mockFetchFunnelCvrSparklines = vi.fn();
/**
 * Defaulted, not bare. As a bare `vi.fn()` it resolved `undefined` for every
 * test that did not set it, and the handler swallowed the resulting throw — so
 * 46 tests ran with the spend clause silently absent and nothing said so. An
 * empty-but-valid AdCost is the honest "GA4 has nothing for this window".
 */
const mockAdCostByDay = vi.fn(async () => ({
  byDay: new Map<string, number>(),
  from: null as string | null,
  to: null as string | null,
}));
const mockFetchMidwayProgress = vi.fn();
const mockFetchPaywallHits = vi.fn();
const mockFetchEmailExperiments = vi.fn();
const mockFetchUnitEconomics = vi.fn();

vi.mock("@shared/observability/logger", () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@shared/observability/slack", async (importActual) => {
  const actual = await importActual<typeof import("@shared/observability/slack")>();
  return { ...actual, notifySlack: (...args: unknown[]) => mockNotifySlack(...args) };
});

vi.mock("@shared/observability/slack-alert-dedup", () => ({
  verifyCronAuth: (request: Request) =>
    (request.headers.get("authorization") ?? "") === "Bearer test-cron-secret",
  tryClaimSlackAlert: (...args: unknown[]) => mockTryClaim(...args),
  markSlackAlertDelivered: (...args: unknown[]) => mockMarkDelivered(...args),
  recordCronRun: (...args: unknown[]) => mockRecordCronRun(...args),
  startCronTimer: (...args: unknown[]) => {
    mockStartCronTimer(...args);
    return async () => {};
  },
}));

vi.mock("@shared/http/is-prod-cron-host", () => ({
  isProdCronHost: () => mockIsProdCronHost(),
}));

// Partial: the digest also imports computeRate and dayString from here, and the
// site-wide trend must be able to fail independently of them.
vi.mock("@features/admin/server/digest-metrics", async (importActual) => {
  const actual = await importActual<typeof import("@features/admin/server/digest-metrics")>();
  return {
    ...actual,
    fetchFunnelCvrSparklines: (...args: unknown[]) => mockFetchFunnelCvrSparklines(...args),
  };
});

// Partial: only the GA4 read is replaced. `adCovers` is the pure coverage rule and is
// what keeps an unreported day out of the message, so it must stay the real one.
vi.mock("@features/brain/server/ingest/analytics", async (importActual) => {
  const actual = await importActual<typeof import("@features/brain/server/ingest/analytics")>();
  return { ...actual, adCostByDay: (...args: unknown[]) => mockAdCostByDay(...args) };
});

vi.mock("@features/admin/server/conversion-digest", async (importActual) => {
  const actual = await importActual<typeof import("@features/admin/server/conversion-digest")>();
  return {
    ...actual,
    fetchLandingArmFunnel: (...args: unknown[]) => mockFetchLandingArmFunnel(...args),
    fetchArmCohorts: (...args: unknown[]) => mockFetchArmCohorts(...args),
    fetchLandingStartFunnel: (...args: unknown[]) => mockFetchLandingStartFunnel(...args),
    fetchAxisFunnelDaily: (...args: unknown[]) => mockFetchAxisFunnelDaily(...args),
    fetchMidwayProgress: (...args: unknown[]) => mockFetchMidwayProgress(...args),
    fetchPaywallHits: (...args: unknown[]) => mockFetchPaywallHits(...args),
    fetchEmailExperimentResults: (...args: unknown[]) => mockFetchEmailExperiments(...args),
    fetchUnitEconomics: (...args: unknown[]) => mockFetchUnitEconomics(...args),
  };
});

import {
  GET,
  buildConversionDigest,
  buildArmSeries,
  buildSiteStartSeries,
  buildStartSeries,
} from "@/app/api/cron/conversion-digest/route";
import {
  buildAlerts,
  buildArmVerdict,
  buildFunnel,
  biggestLeak,
  TINY_ARM,
  buildEmailExperimentLines,
  buildUnitEconomicsLines,
} from "@features/admin/server/conversion-digest";
import type { SlackBlock } from "@shared/observability/slack";

/** Two arms, 30 days, shaped like the real RPC response. */
function makeFunnel(overrides: Partial<{ visitorArms: Record<string, number> }> = {}) {
  const days: string[] = [];
  for (let i = 30; i >= 1; i -= 1) {
    const d = new Date("2026-08-24T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const visitorArms = overrides.visitorArms ?? { white: 400, white_prev: 120 };
  return {
    visitors: days.flatMap((day) =>
      Object.entries(visitorArms).map(([arm, total]) => ({
        day,
        arm,
        n: Math.round(total / days.length),
      }))
    ),
    daily: days.flatMap((day, i) => [
      {
        day,
        arm: "white",
        completions: 10,
        reportOpens: 9,
        checkout: 2,
        paid: i % 3 === 0 ? 1 : 0,
        charges: i % 3 === 0 ? 1 : 0,
        freeUnlocks: 0,
        revenue: i % 3 === 0 ? 19.99 : 0,
      },
      {
        day,
        arm: "white_prev",
        completions: 8,
        reportOpens: 7,
        checkout: 1,
        paid: i % 5 === 0 ? 1 : 0,
        charges: i % 5 === 0 ? 1 : 0,
        freeUnlocks: 0,
        revenue: i % 5 === 0 ? 19.99 : 0,
      },
    ]),
    cohort: [
      { arm: "white", completions: 300, reportOpens: 290, checkout: 60, paid: 10, revenue: 199.9 },
      {
        arm: "white_prev",
        completions: 240,
        reportOpens: 230,
        checkout: 48,
        paid: 6,
        revenue: 119.94,
      },
    ],
  };
}

/** Landing -> survey-start, with the second arm launching part-way through. */
/**
 * 30 days x two arms on the SURVEY axis, which has no valid-from clip — so the
 * handler tests actually exercise the per-axis chart path rather than silently
 * skipping every axis.
 */
function makeAxisRows() {
  const rows = [];
  for (let d = 0; d < 30; d += 1) {
    const day = new Date(Date.UTC(2026, 6, 26) + d * 86_400_000).toISOString().slice(0, 10);
    rows.push({ axis: "survey", arm: "white", day, completions: 10, checkouts: 2, paid: 0 });
    rows.push({ axis: "survey", arm: "dark", day, completions: 8, checkouts: 1, paid: 0 });
  }
  return rows;
}

function makeStartFunnel(opts: { prevFromDay?: number } = {}) {
  const prevFrom = opts.prevFromDay ?? 27;
  const days: string[] = [];
  for (let i = 30; i >= 1; i -= 1) {
    const d = new Date("2026-08-24T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const daily = days.flatMap((day, i) => [
    { day, arm: "white", visits: 300 + (i % 5) * 20, starts: 22 + (i % 4) },
    ...(i >= prevFrom ? [{ day, arm: "white_prev", visits: 90, starts: 5 }] : []),
  ]);
  const sum = (arm: string, k: "visits" | "starts") =>
    daily.filter((r) => r.arm === arm).reduce((t, r) => t + r[k], 0);
  return {
    daily,
    totals: [
      { arm: "white", visits: sum("white", "visits"), starts: sum("white", "starts") },
      {
        arm: "white_prev",
        visits: sum("white_prev", "visits"),
        starts: sum("white_prev", "starts"),
      },
    ],
  };
}

function blockText(blocks: SlackBlock[]): string {
  return JSON.stringify(blocks);
}

/** Every signed chart payload in a message whose two legends name landing arms. */
function landingChartPayloads(blocks: SlackBlock[]): Array<{
  legendFirst?: string;
  legendLast?: string;
  colorFirst?: string;
  colorLast?: string;
}> {
  return blocks
    .map((b) => (b as { image_url?: string }).image_url)
    .filter((u): u is string => typeof u === "string")
    .map(
      (u) =>
        JSON.parse(Buffer.from(new URL(u).searchParams.get("d")!, "base64").toString("utf8")) as {
          legendFirst?: string;
          legendLast?: string;
          colorFirst?: string;
          colorLast?: string;
        }
    )
    .filter(
      (p) => p.legendFirst?.includes("Landing Page") || p.legendLast?.includes("Landing Page")
    );
}

/**
 * The same message the handler builds, but with the landing axis LIVE.
 *
 * VERDICT_AXES is empty in production as of 2026-09-19 — `landing` concluded in
 * favour of V2 — so the handler no longer emits a per-arm landing chart or a
 * landing verdict, and it should not. The block-building code behind those is
 * still there and still correct, and it is what the next experiment will run
 * through, so it stays under test rather than being deleted with the test that
 * ran it. These tests therefore go through `buildConversionDigest` with the axis
 * switched on, and the separate handler test below asserts that the LIVE message
 * carries none of it.
 *
 * Reads the mocks rather than restating their fixtures, so a change to the
 * shared `beforeEach` reaches these tests the same way it reaches the handler.
 */
async function landingLiveBlocks(): Promise<SlackBlock[]> {
  // Yesterday in Berlin, derived from the (faked) clock exactly as the handler
  // derives it. Hardcoding a day made every test that moves the clock — and
  // several do, because the landing axis is only valid from 21 Aug — silently
  // measure a window its fixtures do not cover.
  const now = new Date();
  const dayKey = reportingDay(new Date(reportingDayStart(reportingDay(now)).getTime() - 1));
  const digest = await buildConversionDigest({
    dayKey,
    liveAxesOverride: ["landing"],
    funnel: (await mockFetchLandingArmFunnel()) ?? null,
    cohorts: (await mockFetchArmCohorts()) ?? null,
    startFunnel: (await mockFetchLandingStartFunnel()) ?? null,
    axisRows: (await mockFetchAxisFunnelDaily()) ?? [],
    cvrDays: (await mockFetchFunnelCvrSparklines())?.days ?? null,
    midway: (await mockFetchMidwayProgress()) ?? null,
    paywall: (await mockFetchPaywallHits()) ?? null,
    emailExperiments: (await mockFetchEmailExperiments()) ?? null,
    unitEconomics: (await mockFetchUnitEconomics()) ?? null,
    adSpend: null,
    friction: null,
    now,
  });
  return digest.blocks;
}

describe("conversion-digest handler", () => {
  beforeAll(() => {
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.loveiq.org";
    process.env.STRATEGY_DIGEST_SIGNING_SECRET = "test-digest-signing-secret-value";
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Pin the clock INSIDE the scheduled window. Only the scheduled run consumes
    // the day, so without this these tests would pass or fail depending on what
    // time of day the suite happened to run.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T09:05:00.000Z"));
    mockIsProdCronHost.mockReturnValue(true);
    mockTryClaim.mockResolvedValue(true);
    mockFetchLandingArmFunnel.mockResolvedValue(makeFunnel());
    mockFetchLandingStartFunnel.mockResolvedValue(makeStartFunnel());
    mockFetchAxisFunnelDaily.mockResolvedValue(makeAxisRows());
    // Default: no site-wide CVR source, so the existing expectations about which
    // images a digest contains stay exactly as they were.
    mockFetchFunnelCvrSparklines.mockResolvedValue(null);
    // Default: midway RPC unavailable, so every expectation written before the
    // row existed keeps the funnel it was written against.
    mockFetchMidwayProgress.mockResolvedValue(null);
    // Default: paywall count unavailable, so expectations written before the
    // row existed keep the funnel they were written against.
    mockFetchPaywallHits.mockResolvedValue(null);
    mockFetchEmailExperiments.mockResolvedValue(null);
    mockFetchUnitEconomics.mockResolvedValue(null);
    mockFetchArmCohorts.mockResolvedValue([
      { axis: "landing", arm: "white", n: 300, conversions: 10 },
      { axis: "landing", arm: "white_prev", n: 240, conversions: 6 },
      { axis: "survey", arm: "white", n: 187, conversions: 5 },
      { axis: "survey", arm: "dark", n: 144, conversions: 5 },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function request(auth = "Bearer test-cron-secret") {
    return new Request("https://www.loveiq.org/api/cron/conversion-digest", {
      headers: { authorization: auth },
    });
  }

  it("401s without the cron secret", async () => {
    const res = await GET(request("Bearer wrong"));
    expect(res.status).toBe(401);
    expect(mockNotifySlack).not.toHaveBeenCalled();
  });

  it("skips on the staging host without claiming or posting", async () => {
    mockIsProdCronHost.mockReturnValue(false);
    const res = await GET(request());
    expect(await res.json()).toMatchObject({ skipped: true, reason: "non-prod-cron-host" });
    expect(mockTryClaim).not.toHaveBeenCalled();
    expect(mockNotifySlack).not.toHaveBeenCalled();
  });

  it("posts nothing when the day is already claimed", async () => {
    mockTryClaim.mockResolvedValue(false);
    const res = await GET(request());
    expect(await res.json()).toMatchObject({ sent: false, reason: "already-claimed" });
    expect(mockNotifySlack).not.toHaveBeenCalled();
    expect(mockMarkDelivered).not.toHaveBeenCalled();
  });

  it("posts exactly one ops message and marks it delivered", async () => {
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(mockNotifySlack).toHaveBeenCalledTimes(1);
    const arg = mockNotifySlack.mock.calls[0]![0] as {
      channel: string;
      kind: string;
      text: string;
      blocks: SlackBlock[];
    };
    expect(arg.channel).toBe("ops");
    expect(arg.kind).toBe("conversion_digest");
    // Fallback text is the only thing dead-lettered, so it must stand alone.
    expect(arg.text).toContain("Conversion");
    expect(arg.blocks.length).toBeGreaterThan(3);
    expect(mockMarkDelivered).toHaveBeenCalledWith("conversion_digest", "day", expect.any(String));
  });

  it("never prints a percentage change from a base of zero", async () => {
    // "EUR 29.00 (+∞%)" reads like a spike and states nothing. One sale after a
    // quiet week is the ordinary case that produced it.
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    expect(JSON.stringify(arg.blocks)).not.toContain("∞");
  });

  it("carries the fair-split caveat beside the landing numbers, not as an alert", async () => {
    // It used to be a daily `info` alert, and the only thing in the Alerts
    // section on a normal day. The fact still has to reach the reader — just at
    // the moment it changes how they read the number next to it.
    const blocks = await landingLiveBlocks();
    const landing = blocks.find((b) => JSON.stringify(b).includes("Landing page \u2192 survey"));
    expect(JSON.stringify(landing)).toContain("keep the design they first saw");
  });

  it("embeds a signed chart URL for the arm comparison", async () => {
    const blocks = await landingLiveBlocks();
    const image = blocks.find((b) => (b as { type?: string }).type === "image") as
      { image_url?: string } | undefined;
    expect(image?.image_url).toMatch(
      /^https:\/\/www\.loveiq\.org\/api\/admin\/digest-image\/conversion-by-arm\?d=[\w-]+&s=[\w-]+$/
    );
  });

  it("outside the scheduled hour a bare run behaves as a preview", async () => {
    // Vercel's "Run" button hits the bare path and cannot pass ?preview=1, so a
    // manual look must not consume the day.
    vi.setSystemTime(new Date("2026-08-24T20:00:00.000Z"));
    const res = await GET(request());
    expect(await res.json()).toMatchObject({ sent: true, preview: true });
    expect(mockNotifySlack).toHaveBeenCalledTimes(1);
    expect(mockTryClaim).not.toHaveBeenCalled();
    expect(mockMarkDelivered).not.toHaveBeenCalled();
  });

  it("inside the scheduled hour a bare run DOES consume the day", async () => {
    const res = await GET(request());
    expect(await res.json()).toMatchObject({ sent: true, preview: false });
    expect(mockTryClaim).toHaveBeenCalledWith("conversion_digest", "day", expect.any(String));
    expect(mockMarkDelivered).toHaveBeenCalled();
  });

  it("absorbs cron drift into the next hour rather than double-claiming", async () => {
    vi.setSystemTime(new Date("2026-08-24T10:04:00.000Z"));
    const res = await GET(request());
    expect(await res.json()).toMatchObject({ preview: false });
    expect(mockTryClaim).toHaveBeenCalled();
  });

  it("preview mode re-sends without claiming or consuming the day", async () => {
    // So the message can be looked at and tweaked without waiting for tomorrow.
    const res = await GET(
      new Request("https://www.loveiq.org/api/cron/conversion-digest?preview=1", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    expect(await res.json()).toMatchObject({ sent: true, preview: true });
    expect(mockNotifySlack).toHaveBeenCalledTimes(1);
    // Neither half of the idempotency handshake runs, so the real 09:00 send is
    // still pending and still fires exactly once.
    expect(mockTryClaim).not.toHaveBeenCalled();
    expect(mockMarkDelivered).not.toHaveBeenCalled();
  });

  it("preview still sends when the day is already claimed", async () => {
    mockTryClaim.mockResolvedValue(false);
    const res = await GET(
      new Request("https://www.loveiq.org/api/cron/conversion-digest?preview=1", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    expect(await res.json()).toMatchObject({ sent: true });
    expect(mockNotifySlack).toHaveBeenCalledTimes(1);
  });

  it("preview uses a unique kind so the 60s dedup cannot swallow a repeat", async () => {
    const req = () =>
      new Request("https://www.loveiq.org/api/cron/conversion-digest?preview=1", {
        headers: { authorization: "Bearer test-cron-secret" },
      });
    await GET(req());
    await GET(req());
    const kinds = mockNotifySlack.mock.calls.map((c) => (c[0] as { kind: string }).kind);
    expect(kinds).toHaveLength(2);
    expect(kinds[0]).not.toBe(kinds[1]);
    expect(kinds.every((k) => k.startsWith("conversion_digest_preview_"))).toBe(true);
  });

  it("preview still refuses without the cron secret, and off the prod host", async () => {
    const bad = await GET(
      new Request("https://www.loveiq.org/api/cron/conversion-digest?preview=1", {
        headers: { authorization: "Bearer wrong" },
      })
    );
    expect(bad.status).toBe(401);

    mockIsProdCronHost.mockReturnValue(false);
    const staging = await GET(
      new Request("https://www.loveiq.org/api/cron/conversion-digest?preview=1", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    expect(await staging.json()).toMatchObject({ skipped: true });
    expect(mockNotifySlack).not.toHaveBeenCalled();
  });

  it("ships the landing→survey chart as a trend, never as a verdict", async () => {
    // It was briefly titled "Visits → survey started, by homepage" and framed as
    // the primary metric. An audit found the two arms are not measuring the same
    // step: the current homepage's inline question writes the survey's
    // localStorage, and SurveyPage then skips straight to the engine — so
    // `survey_engine_mount` means "tapped the homepage question" for one arm and
    // "survived four wizard slides plus consent" for the other. Until the
    // instrumentation is symmetric the chart must not read as a verdict.
    const blocks = await landingLiveBlocks();
    const images = blocks.filter((b) => (b as { type?: string }).type === "image");
    // One: reached-survey. The survey-theme chart went with the concluded
    // experiment (2026-08-25), and the landing axis's own purchases chart was
    // removed earlier — the per-axis section is the only place landing is charted.
    expect(images).toHaveLength(1);
    const alt = JSON.stringify(images);
    // Wording trimmed with the promotion into *The tests*: the alt text now says
    // "A trend, not a verdict" and names the reason, in place of five clauses.
    expect(alt).toContain("A trend, not a verdict");
    expect(alt).toContain("different funnel steps");
    expect(alt).not.toContain("survey%20started%2C%20by%20homepage");
    // And the caption beside it carries the counts AND the caveat, because Slack
    // can fail to load an image and the caption is the accessible text.
    const flat = blockText(blocks);
    expect(flat).toContain("*Landing page → survey*");
    expect(flat).toContain("Not a like-for-like comparison");
    expect(flat).toMatch(/\d+\/\d+ started/);
  });

  it("does not claim the reached-survey number is consent-free", async () => {
    // The denominator is server-side and consent-free; the numerator needs
    // __liq_vid, which is minted only under analytics consent. The definitions
    // line used to assert "no analytics-consent gap" over both.
    const blocks = await landingLiveBlocks();
    const flat = blockText(blocks);
    expect(flat).not.toMatch(/counted server-side, no analytics-consent gap/);
    // The caveat rides on the chart itself — headline, footnote and alt text —
    // so it cannot outlive the chart. The header must not carry it: the chart is
    // absent for whole days at a time and the sentence would point at nothing.
    const alt = JSON.stringify(blocks.filter((b) => (b as { type?: string }).type === "image"));
    // Wording trimmed with the promotion into *The tests*: the alt text now says
    // "A trend, not a verdict" and names the reason, in place of five clauses.
    expect(alt).toContain("A trend, not a verdict");
    expect(alt).toContain("different funnel steps");
    const definitions = blockText(blocks.slice(0, 2));
    expect(definitions).not.toContain("arm-comparable");
  });

  it("says so plainly when the landing→start source does not answer", async () => {
    mockFetchLandingStartFunnel.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(200);
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    // Degrades to a stated absence, never to a silent omission or a zero. It no
    // longer blames an unapplied migration: the migration IS applied, and null
    // here only ever means the RPC did not answer.
    expect(blockText(arg.blocks)).toContain("did not answer");
    // No images left at all once this source is the one that failed: the fixture's
    // only other chart was the survey theme's, which retired with the experiment.
    // The rest of the digest must still ship — that is what this asserts.
    expect(blockText(arg.blocks)).toContain("*The funnel");
    expect(arg.blocks.filter((b) => (b as { type?: string }).type === "image")).toHaveLength(0);
  });

  it("says nothing at all about the reached-survey chart when it has no data", async () => {
    // The RPC floors its window at the first day BOTH arms were instrumented, so
    // it correctly answers with empty arrays for days before that. There used to
    // be a line accounting for the absence, because the header advertised the
    // chart; the header does not any more, so the correct behaviour is silence —
    // no dangling reference anywhere in the message, in either direction.
    mockFetchLandingStartFunnel.mockResolvedValue({ daily: [], totals: [] });
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    const flat = blockText(arg.blocks);
    expect(flat).not.toContain("survey-started by landing page");
    expect(flat).not.toContain("arm-comparable");
    // The rest of the digest still ships — one missing source takes nothing else.
    expect(flat).toContain("*The tests*");
    expect(arg.blocks.filter((b) => (b as { type?: string }).type === "image")).toHaveLength(0);
  });

  it("gaps the site-wide trend's warm-up instead of plotting a partial window", () => {
    // Same rule as every other trailing series here. Without it the first six
    // points are 1- to 6-day windows under a footnote promising seven days.
    const days = Array.from({ length: 10 }, (_, i) => ({
      day: new Date(Date.UTC(2026, 7, 1) + i * 86_400_000).toISOString().slice(0, 10),
      visitors: 100,
      starts: i === 9 ? 20 : 10,
    }));
    const series = buildSiteStartSeries(days);
    expect(series.values.slice(0, 6).every((v) => v === null)).toBe(true);
    expect(series.values.slice(6).every((v) => v != null)).toBe(true);
    // Index 9 trails days 3-9: six days at 10/100 plus one at 20/100 = 80/700.
    expect(series.values[9]).toBe(11.4);
    expect(series.labels).toHaveLength(10);
  });

  it("sorts the site-wide trend by day rather than trusting the RPC's order", () => {
    const shuffled = [
      { day: "2026-08-08", visitors: 100, starts: 30 },
      { day: "2026-08-01", visitors: 100, starts: 10 },
      { day: "2026-08-05", visitors: 100, starts: 10 },
      { day: "2026-08-02", visitors: 100, starts: 10 },
      { day: "2026-08-03", visitors: 100, starts: 10 },
      { day: "2026-08-07", visitors: 100, starts: 10 },
      { day: "2026-08-04", visitors: 100, starts: 10 },
      { day: "2026-08-06", visitors: 100, starts: 10 },
    ];
    const series = buildSiteStartSeries(shuffled);
    expect(series.labels[0]).toBe("1 Aug");
    expect(series.labels[7]).toBe("8 Aug");
    // Trailing window over days 2-8: 6x10 + 30 = 90/700.
    expect(series.values[7]).toBe(12.9);
  });

  it("prints a vanishing share as <0.1%, never as a bare 0% beside a real count", async () => {
    /**
     * 5 payments in 12,308 visits is 0.04%. Rounded to one decimal that is 0, and a
     * column reading 100 / 3.5 / 3.4 / 0.3 / 0 says nobody paid while the count
     * beside it says five. Once the test-payment exclusion landed, the paid count
     * dropped far enough for this to start happening for real.
     */
    const base = makeFunnel();
    mockFetchLandingArmFunnel.mockResolvedValue({
      ...base,
      // A big denominator and a tiny survivor, which is what production looks like.
      visitors: base.visitors.map((v: { n: number }) => ({ ...v, n: v.n * 40 })),
      cohort: [
        {
          arm: "white",
          completions: 425,
          reportOpens: 414,
          checkout: 33,
          paid: 5,
          revenue: 128.99,
        },
      ],
    });
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    const flat = blockText(arg.blocks);
    expect(flat).toContain("<0.1%");
    /**
     * And no row anywhere pairs a non-zero count with a bare 0%, in EITHER
     * percentage column.
     *
     * This regex is rewritten for the two-column row. The previous one was
     * `/`\s*[1-9]\d*`\s+0%/` — it matched a count in a backtick span of its own,
     * followed by the share. When the row became a single span holding the count
     * and both percentages, that shape stopped existing and the assertion could
     * never fire again: it would have passed against the exact bug it was written
     * to catch.
     */
    expect(flat).not.toMatch(/`\s*[1-9]\d*(?:\s+[\d.<%—]+)*\s+0%\s*`/);
  });

  it("names both spans the funnel covers, instead of implying one", async () => {
    /**
     * The chart is not one window and must not read as one. Everything down to
     * "Finished the survey" is events inside it; the "…of those" rows follow those
     * finishers forward with no end date. Unstated, a reader takes the "30 days"
     * heading as covering all six rows.
     */
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    const flat = blockText(arg.blocks);
    expect(flat).toContain("count the window");
    expect(flat).toContain("follow those finishers forward with no end date");
    // The definition has to sit ABOVE the numbers it defines: fitBlocks keeps
    // blocks from the front, so a footnote is the first thing dropped when the
    // message runs long — leaving every figure and no statement of what it means.
    expect(flat.indexOf("with no end date")).toBeLessThan(flat.indexOf("Visits to the site"));
  });

  it("puts the survey-start row in the message, not just in the builder", async () => {
    /**
     * The builder having the row proves nothing about the digest showing it — the
     * route has to pass the starts through. That gap is exactly how a correct
     * parser once shipped behind a call site that never called it.
     */
    mockFetchFunnelCvrSparklines.mockResolvedValue({
      // Starts must EXCEED the fixture's 510 finishers, or the row is correctly
      // suppressed as incomplete data and this test would be asserting the guard
      // rather than the row.
      days: Array.from({ length: 10 }, (_, i) => ({
        day: new Date(Date.UTC(2026, 7, 10) + i * 86_400_000).toISOString().slice(0, 10),
        visitors: 400,
        starts: 90,
      })),
    });
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    /**
     * Scoped to the funnel BLOCK, not the whole message. Searching the flattened
     * text found "Finished the survey" in the definition line above the numbers and
     * compared positions across two different blocks.
     */
    const funnel = arg.blocks
      .map((b) => (b as { text?: { text?: string } }).text?.text ?? "")
      .find((t) => t.includes("*The funnel —"));
    expect(funnel, "the funnel block must be in the message at all").toBeDefined();
    expect(funnel!).toContain("Started the survey");
    // Between the two rows it was asked to sit between, not appended somewhere.
    expect(funnel!.indexOf("Visits to the site")).toBeLessThan(
      funnel!.indexOf("Started the survey")
    );
    expect(funnel!.indexOf("Started the survey")).toBeLessThan(
      funnel!.indexOf("Finished the survey")
    );
  });

  it("draws each landing arm in ITS OWN colour, in every chart of one message", async () => {
    /**
     * Colour is bound to the arm (`armColor`), not to the series slot. Asked for on
     * the 2026-09-16 sync: "fixed colour codes for variants, preventing V1 and V2
     * colours from swapping". V1 is blue, V2 orange, permanently.
     *
     * THIS TEST USED TO ASSERT THE WRONG THING. It compared the two charts'
     * legendFirst/legendLast and checked they agreed — a proxy for colour that was
     * only valid while the renderer coloured by position. It never read a colour,
     * so it would have passed just as happily with V1 and V2 painted the same, or
     * swapped, as long as both charts listed the arms in the same order.
     */
    /**
     * Both fixtures are rebuilt here, aligned to a later clock. The shared ones
     * carry only the survey axis and sit around 24 Aug, and the landing axis is
     * only valid from 21 Aug (AXIS_VALID_FROM) — so at the default clock the
     * checkout chart has four eligible days against a seven-day minimum and is
     * never drawn. Without both charts present this test is vacuous.
     */
    vi.setSystemTime(new Date("2026-09-14T09:05:00.000Z"));
    const days = Array.from({ length: 24 }, (_, d) =>
      new Date(Date.UTC(2026, 7, 21) + d * 86_400_000).toISOString().slice(0, 10)
    );
    mockFetchAxisFunnelDaily.mockResolvedValue(
      days.flatMap((day) => [
        { axis: "landing", arm: "white", day, completions: 12, checkouts: 3, paid: 1 },
        { axis: "landing", arm: "white_prev", day, completions: 10, checkouts: 2, paid: 1 },
      ])
    );
    mockFetchLandingStartFunnel.mockResolvedValue({
      daily: days.flatMap((day) => [
        { day, arm: "white", visits: 300, starts: 30 },
        { day, arm: "white_prev", visits: 280, starts: 26 },
      ]),
      totals: [
        { arm: "white", visits: 300 * days.length, starts: 30 * days.length },
        { arm: "white_prev", visits: 280 * days.length, starts: 26 * days.length },
      ],
    });
    const blocks = await landingLiveBlocks();
    const landing = landingChartPayloads(blocks);

    // Both landing charts must be in this message, or the assertion below is
    // vacuous — one chart trivially agrees with itself.
    expect(landing.length).toBeGreaterThanOrEqual(2);

    // Every (arm -> colour) pair drawn anywhere in the message.
    const drawn = new Map<string, Set<string>>();
    for (const p of landing) {
      for (const [legend, colour] of [
        [p.legendFirst, p.colorFirst],
        [p.legendLast, p.colorLast],
      ] as const) {
        if (!legend || !colour) continue;
        if (!drawn.has(legend)) drawn.set(legend, new Set());
        drawn.get(legend)!.add(colour);
      }
    }

    const v1 = armLabel("landing", "white_prev").short;
    const v2 = armLabel("landing", "white").short;
    // Both arms actually appeared, so neither branch below is skipped silently.
    expect([...drawn.keys()].sort()).toEqual([v1, v2].sort());
    // One colour each, across every chart in the message.
    expect(drawn.get(v1)).toEqual(new Set([armColor("landing", "white_prev")]));
    expect(drawn.get(v2)).toEqual(new Set([armColor("landing", "white")]));
    // And they are different colours, which "one colour each" alone does not say.
    expect(armColor("landing", "white_prev")).not.toBe(armColor("landing", "white"));
  });

  it("keeps an arm's colour on a day when the other arm has no data", async () => {
    /**
     * The case the old design could not express, and the one that put this on the
     * agenda. When an arm reports nothing the chart still names it, but under
     * colour-by-position the SURVIVOR slid into the first slot and took the first
     * slot's colour — so the same arm was one colour on a two-arm day and another
     * on a one-arm day, with nothing in the picture saying why.
     *
     * Sorting the arms by label, which is what this route used to do, cannot fix
     * this: there is no second arm left to sort against.
     */
    vi.setSystemTime(new Date("2026-09-14T09:05:00.000Z"));
    const days = Array.from({ length: 24 }, (_, d) =>
      new Date(Date.UTC(2026, 7, 21) + d * 86_400_000).toISOString().slice(0, 10)
    );
    // V2 ("white") reports nothing at all this window. V1 carries the chart.
    mockFetchLandingStartFunnel.mockResolvedValue({
      daily: days.map((day) => ({ day, arm: "white_prev", visits: 280, starts: 26 })),
      totals: [
        { arm: "white_prev", visits: 280 * days.length, starts: 26 * days.length },
        { arm: "white", visits: 0, starts: 0 },
      ],
    });
    const blocks = await landingLiveBlocks();
    const landing = landingChartPayloads(blocks);
    expect(landing.length).toBeGreaterThanOrEqual(1);

    const v1 = armLabel("landing", "white_prev").short;
    for (const p of landing) {
      // Whichever slot V1 occupies, it is drawn in V1's colour and not V2's.
      const colour = p.legendFirst === v1 ? p.colorFirst : p.colorLast;
      expect(colour).toBe(armColor("landing", "white_prev"));
      expect(colour).not.toBe(armColor("landing", "white"));
    }
  });

  it("puts Midway Progress between started and finished, and names its threshold", async () => {
    /**
     * The step Mark named on 2026-09-16, which the KPI framework called the only
     * funnel step with no instrument at all. It had one — `current_index` on the
     * draft save — it just had no reader and no arm.
     *
     * The label carries the question number rather than the word "midway",
     * because the number is the fact and "midway" is the definition. An unnamed
     * figure in this table is exactly what produced a 96.5% nobody could source.
     */
    mockFetchFunnelCvrSparklines.mockResolvedValue({
      days: Array.from({ length: 10 }, (_, i) => ({
        day: new Date(Date.UTC(2026, 7, 10) + i * 86_400_000).toISOString().slice(0, 10),
        visitors: 400,
        starts: 90,
      })),
    });
    mockFetchMidwayProgress.mockResolvedValue({
      overall: { sessions: 1033, reached: 579 },
      daily: [],
      totals: [],
      midwayIndex: 30,
    });
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    const funnel = arg.blocks
      .map((b) => (b as { text?: { text?: string } }).text?.text ?? "")
      .find((t) => t.includes("*The funnel —"));
    expect(funnel, "the funnel block must be in the message at all").toBeDefined();
    expect(funnel!).toContain("Reached question 30");
    // Between the two rows it belongs between, not appended somewhere.
    expect(funnel!.indexOf("Started the survey")).toBeLessThan(
      funnel!.indexOf("Reached question 30")
    );
    expect(funnel!.indexOf("Reached question 30")).toBeLessThan(
      funnel!.indexOf("Finished the survey")
    );
  });

  it("omits the midway row entirely when the RPC is unavailable", async () => {
    // Not a zero. "0 reached the halfway point" above 411 finishers says
    // something false about the product rather than about the measurement.
    mockFetchMidwayProgress.mockResolvedValue(null);
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    expect(blockText(arg.blocks)).not.toContain("Reached question");
  });

  it("omits the midway row when it reads below the finisher count", async () => {
    /**
     * The sources disagree — midway comes from draft saves, finishers from the
     * submission cohort, different id spaces and different windows. Drawing it
     * anyway would clamp the finisher count DOWN to it and publish a smaller,
     * wrong number of completions under a truthful label. Same guard, same
     * reason, as the starts row.
     */
    mockFetchMidwayProgress.mockResolvedValue({
      overall: { sessions: 12, reached: 3 },
      daily: [],
      totals: [],
      midwayIndex: 30,
    });
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    const flat = blockText(arg.blocks);
    expect(flat).not.toContain("Reached question");
    // And the finisher count was NOT dragged down to 3 by a clamp.
    expect(flat).toContain("Finished the survey");
    expect(flat).not.toMatch(/`\s*3\s+[\d.<%—]+\s+[\d.<%—]+`\s+Finished the survey/);
  });

  it("splits midway progress by landing page once both arms have drafts", async () => {
    // Marcus's acceptance criterion from 2026-09-16: every metric differentiated
    // by landing-page experiment.
    const days = Array.from({ length: 14 }, (_, i) =>
      new Date(Date.UTC(2026, 8, 19) + i * 86_400_000).toISOString().slice(0, 10)
    );
    mockFetchMidwayProgress.mockResolvedValue({
      // Above the fixture's 510 finishers: below it, the sources-disagree guard
      // correctly suppresses the row and this test would assert the guard
      // rather than the feature.
      overall: { sessions: 900, reached: 620 },
      daily: days.flatMap((day) => [
        { day, arm: "white_prev", sessions: 30, reached: 16 },
        { day, arm: "white", sessions: 34, reached: 21 },
      ]),
      totals: [
        { arm: "white", sessions: 476, reached: 294 },
        { arm: "white_prev", sessions: 420, reached: 224 },
      ],
      midwayIndex: 30,
      firstArmDay: "2026-09-19",
    });
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    const flat = blockText(arg.blocks);

    expect(flat).toContain("Midway progress, by landing page");
    // Plain-English arm names, never a raw stored value.
    expect(flat).toContain("Landing Page V1 (First Design)");
    expect(flat).toContain("Landing Page V2 (Survey in Hero)");
    expect(flat).not.toContain("white_prev");
    // The counts are named, not bare percentages.
    expect(flat).toContain("224 of 420 drafts reached question 30");

    // And the trend chart is drawn, in each arm's own colour.
    const midwayChart = arg.blocks
      .map((b) => (b as { image_url?: string }).image_url)
      .filter((u): u is string => typeof u === "string")
      .map(
        (u) =>
          JSON.parse(Buffer.from(new URL(u).searchParams.get("d")!, "base64").toString("utf8")) as {
            title?: string;
            colorFirst?: string;
            colorLast?: string;
          }
      )
      .find((p) => p.title?.includes("reaching question 30"));
    expect(midwayChart, "the midway trend chart must be in the message").toBeDefined();
    expect(midwayChart!.colorFirst).toBe(armColor("landing", "white_prev"));
    expect(midwayChart!.colorLast).toBe(armColor("landing", "white"));
  });

  it("prints the per-arm line but no chart until a trend exists", async () => {
    /**
     * The state on day two: the arms have drafts, so the counts are real and worth
     * printing — but the 7-day trailing series is still all warm-up, so every
     * plotted value is null. A chart here would be an empty box under a headline
     * with numbers in it, which reads as a rendering failure rather than as "not
     * yet".
     *
     * This is the case the sibling test cannot reach: there, totals are empty and
     * the chart branch is never entered at all, so a mutation that always drew the
     * chart survived.
     */
    const days = Array.from({ length: 3 }, (_, i) =>
      new Date(Date.UTC(2026, 8, 19) + i * 86_400_000).toISOString().slice(0, 10)
    );
    mockFetchMidwayProgress.mockResolvedValue({
      overall: { sessions: 900, reached: 620 },
      daily: days.flatMap((day) => [
        { day, arm: "white_prev", sessions: 30, reached: 16 },
        { day, arm: "white", sessions: 34, reached: 21 },
      ]),
      totals: [
        { arm: "white", sessions: 102, reached: 63 },
        { arm: "white_prev", sessions: 90, reached: 48 },
      ],
      midwayIndex: 30,
      firstArmDay: "2026-09-19",
    });
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    const flat = blockText(arg.blocks);

    // The counts ARE worth printing.
    expect(flat).toContain("Midway progress, by landing page");
    expect(flat).toContain("48 of 90 drafts reached question 30");
    // The chart is not.
    const titles = arg.blocks
      .map((b) => (b as { image_url?: string }).image_url)
      .filter((u): u is string => typeof u === "string")
      .map(
        (u) =>
          (
            JSON.parse(
              Buffer.from(new URL(u).searchParams.get("d")!, "base64").toString("utf8")
            ) as { title?: string }
          ).title ?? ""
      );
    expect(titles.some((t) => t.includes("reaching question"))).toBe(false);
  });

  it("stays silent per-arm too when the funnel refuses the midway row", async () => {
    /**
     * One trust decision, two surfaces. When midway reads below the finisher
     * count the sources are measuring different populations and buildFunnel drops
     * the row. The per-arm block used to print anyway, so the message both
     * withheld and asserted the same figure.
     */
    mockFetchMidwayProgress.mockResolvedValue({
      // Below the fixture's 510 finishers.
      overall: { sessions: 300, reached: 40 },
      daily: [],
      totals: [
        { arm: "white", sessions: 160, reached: 22 },
        { arm: "white_prev", sessions: 140, reached: 18 },
      ],
      midwayIndex: 30,
      firstArmDay: "2026-09-19",
    });
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    const flat = blockText(arg.blocks);
    expect(flat).not.toContain("Reached question");
    expect(flat).not.toContain("Midway progress, by landing page");
    // Not the empty-state note either — that is for "no arm data", not "distrusted".
    expect(flat).not.toContain("Midway progress per landing page starts from");
  });

  it("names the drafts with no landing page, so the arms add up", async () => {
    /**
     * The RPC buckets arm-less rows as 'unknown' so the arms always sum to the
     * total. This caller filtered to the two live arms, which defeated the reason
     * the bucket exists: the printed lines did not reconcile with overall.sessions
     * and nothing said why. No cookie means a crawler, a direct hit or a consent
     * refusal — a real population.
     */
    const days = Array.from({ length: 14 }, (_, i) =>
      new Date(Date.UTC(2026, 8, 19) + i * 86_400_000).toISOString().slice(0, 10)
    );
    mockFetchMidwayProgress.mockResolvedValue({
      overall: { sessions: 1000, reached: 620 },
      daily: days.flatMap((day) => [
        { day, arm: "white_prev", sessions: 30, reached: 16 },
        { day, arm: "white", sessions: 34, reached: 21 },
      ]),
      totals: [
        { arm: "white", sessions: 476, reached: 294 },
        { arm: "white_prev", sessions: 420, reached: 224 },
        { arm: "unknown", sessions: 104, reached: 61 },
      ],
      midwayIndex: 30,
      firstArmDay: "2026-09-19",
    });
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    const flat = blockText(arg.blocks);
    expect(flat).toContain("no landing page recorded");
    expect(flat).toContain("61 of 104 drafts");
    // 476 + 420 + 104 = 1000 = overall.sessions, and every part is on screen.
  });

  it("says when per-arm midway starts, rather than drawing an empty chart", async () => {
    /**
     * Drafts only began carrying an arm on firstArmDay, so for the first week
     * there is nothing to plot. `funnel-digest` was unscheduled for being a rail
     * of charts with no decision attached; an "awaiting data" chart every morning
     * for a week is that mistake with a new name.
     */
    mockFetchMidwayProgress.mockResolvedValue({
      // Above the fixture's 510 finishers: below it, the sources-disagree guard
      // correctly suppresses the row and this test would assert the guard
      // rather than the feature.
      overall: { sessions: 900, reached: 620 },
      daily: [],
      totals: [],
      midwayIndex: 30,
      firstArmDay: "2026-09-19",
    });
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    const flat = blockText(arg.blocks);

    expect(flat).toContain("Midway progress per landing page starts from 2026-09-19");
    // A sentence, not a picture, and not a silent omission either.
    expect(flat).not.toContain("Midway progress, by landing page");
    const titles = arg.blocks
      .map((b) => (b as { image_url?: string }).image_url)
      .filter((u): u is string => typeof u === "string")
      .map(
        (u) =>
          (
            JSON.parse(
              Buffer.from(new URL(u).searchParams.get("d")!, "base64").toString("utf8")
            ) as { title?: string }
          ).title ?? ""
      );
    expect(titles.some((t) => t.includes("reaching question"))).toBe(false);
    // The whole-population row is unaffected and still present.
    expect(flat).toContain("Reached question 30");
  });

  it("shows a real over-100% step instead of clamping it to 100", async () => {
    /**
     * buildFunnel deliberately leaves the last three steps unclamped: a promo
     * one-tap or an admin-granted unlock sets purchased_at without a checkout, so
     * paid CAN exceed checkout truthfully. The table used computeRate, which
     * clamps to 100 — printing "100%" for a real 120% in the one column that
     * exists to say what happened between two steps.
     */
    const base = makeFunnel();
    mockFetchLandingArmFunnel.mockResolvedValue({
      ...base,
      cohort: [
        { arm: "white", completions: 100, reportOpens: 90, checkout: 5, paid: 6, revenue: 60 },
      ],
    });
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    const funnel = arg.blocks
      .map((b) => (b as { text?: { text?: string } }).text?.text ?? "")
      .find((t) => t.includes("*The funnel —"));
    expect(funnel).toBeDefined();
    const paidRow = funnel!.split("\n").find((l) => l.includes("ever paid"))!;
    expect(paidRow).toContain("120%");
    expect(paidRow).not.toMatch(/\s100%\s/);
  });

  it("prints an em dash, not <0.1%, when the step before is zero", async () => {
    /**
     * computeRate returns 0 for a zero denominator, and the table rendered that as
     * "<0.1%" — a vanishing ratio, for a ratio that does not exist. Reachable by
     * the same promo path: nobody starts checkout, one person is granted access.
     */
    const base = makeFunnel();
    mockFetchLandingArmFunnel.mockResolvedValue({
      ...base,
      cohort: [
        { arm: "white", completions: 100, reportOpens: 90, checkout: 0, paid: 1, revenue: 10 },
      ],
    });
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    const funnel = arg.blocks
      .map((b) => (b as { text?: { text?: string } }).text?.text ?? "")
      .find((t) => t.includes("*The funnel —"));
    const paidRow = funnel!.split("\n").find((l) => l.includes("ever paid"))!;
    expect(paidRow).toContain("—");
    expect(paidRow).not.toContain("<0.1%");
  });

  it("puts Paywall Hits between the report and checkout, as Mark named it", async () => {
    /**
     * The sixth step of the funnel language agreed on 2026-09-16. The digest
     * printed "started checkout" in that slot, which is a different decision —
     * hitting the wall is not deciding to buy, and the drop between them is the
     * most actionable number in the bottom half of the funnel.
     */
    mockFetchPaywallHits.mockResolvedValue({ hits: 300, firstRowDay: "2026-09-05" });
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    const funnel = arg.blocks
      .map((b) => (b as { text?: { text?: string } }).text?.text ?? "")
      .find((t) => t.includes("*The funnel —"));
    expect(funnel, "the funnel block must be in the message").toBeDefined();
    /**
     * Positions compared among the ROWS, not across the whole block.
     * `indexOf` on the block finds these step names in the HEADLINE first —
     * "biggest drop hit the paywall → started checkout" — and compares two
     * offsets that are not rows at all. The sibling test above this file already
     * documents the same trap one level up, where a step name in the definition
     * line was compared against one in the table.
     */
    const rowNames = funnel!
      .split("\n")
      .filter((l) => l.startsWith("`"))
      .map((l) => l.replace(/^`[^`]*`\s*/, ""));
    expect(rowNames.length).toBeGreaterThan(3);
    const at = (name: string) => rowNames.findIndex((r) => r.includes(name));
    expect(at("hit the paywall"), "the paywall row must exist").toBeGreaterThan(-1);
    expect(at("opened their report")).toBeLessThan(at("hit the paywall"));
    expect(at("hit the paywall")).toBeLessThan(at("started checkout"));
  });

  it("omits the paywall row rather than printing a zero", async () => {
    // The instrument only began on 2026-09-05. A 0 under a 30-day heading says
    // the paywall was never reached, which is a statement about the product.
    mockFetchPaywallHits.mockResolvedValue({ hits: 0, firstRowDay: null });
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    expect(blockText(arg.blocks)).not.toContain("hit the paywall");
  });

  it("counts paywall hits in people, so the row is a true subset", async () => {
    /**
     * THE BUG THIS REPLACED, and it shipped. The first version counted
     * `report_price_quote` ROWS over a HEAD request, because PostgREST has no
     * COUNT(DISTINCT) — and that table holds one row per plan, four per person.
     * A 30-day window read 500, was printed as 500 people, exceeded the 412
     * report opens above it, and the monotonic clamp pulled it back to 412 and
     * rendered "100%": a fabricated "everyone who opened their report hit the
     * paywall", derived from a figure 4x too large.
     *
     * Cohort-scoped and de-duplicated the real number is 106 of 412. This test
     * asserts the row is BELOW the one above it without the clamp having to act,
     * which is the property that makes the percentage meaningful.
     */
    const base = makeFunnel();
    mockFetchLandingArmFunnel.mockResolvedValue({
      ...base,
      cohort: [
        { arm: "white", completions: 420, reportOpens: 412, checkout: 34, paid: 4, revenue: 60 },
      ],
    });
    mockFetchPaywallHits.mockResolvedValue({ hits: 106, firstRowDay: "2026-09-05" });
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    const funnel = arg.blocks
      .map((b) => (b as { text?: { text?: string } }).text?.text ?? "")
      .find((t) => t.includes("*The funnel —"))!;
    const paywallRow = funnel.split("\n").find((l) => l.includes("hit the paywall"))!;
    // The count is the one we were given — not clamped to the row above.
    expect(paywallRow).toMatch(/`\s*106\s/);
    // And its step share is a real fraction, not a clamped 100%.
    expect(paywallRow).not.toContain("100%");
    expect(paywallRow).toContain("25.7%");
  });

  it("omits the paywall row when it exceeds report opens, rather than clamping it", async () => {
    /**
     * THIS TEST USED TO ASSERT THE OPPOSITE, and the opposite was wrong.
     *
     * It checked that a paywall count of 500 against 412 report opens was
     * clamped down to 412 — "monotonic", which it is, and a fabricated 100%,
     * which it also is. The clamp only pulls DOWN, so any excess becomes "every
     * single person who opened their report hit the paywall". That sentence is
     * what the 4x row-count bug printed, and fixing the count left the mechanism
     * that laundered it in place.
     *
     * It stays reachable with a CORRECT count: get_paywall_hits counts every
     * submission in the window while reportOpens comes from the arm-attributed
     * cohort (~92% of them), so the paywall row can legitimately include people
     * the row above excludes. When it does, the row is omitted. A missing step is
     * a gap someone notices; a clamped one is a number someone quotes.
     */
    const base = makeFunnel();
    mockFetchLandingArmFunnel.mockResolvedValue({
      ...base,
      cohort: [
        { arm: "white", completions: 420, reportOpens: 412, checkout: 34, paid: 4, revenue: 60 },
      ],
    });
    mockFetchPaywallHits.mockResolvedValue({ hits: 500, firstRowDay: "2026-09-05" });
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    const funnel = arg.blocks
      .map((b) => (b as { text?: { text?: string } }).text?.text ?? "")
      .find((t) => t.includes("*The funnel —"))!;

    expect(funnel).not.toContain("hit the paywall");
    // And above all: no row BELOW the first claims a clamped 100%. The first row
    // is "Visits to the site", legitimately 100% of all visits — every row under
    // it reaching 100% would mean nobody was lost at that step.
    const rows = funnel.split("\n").filter((l) => l.startsWith("`"));
    expect(rows.length).toBeGreaterThan(3);
    expect(rows.slice(1).filter((r) => r.includes("100%"))).toHaveLength(0);
    // The rest of the funnel is untouched and still monotonic.
    const counts = rows.map((l) => parseInt(l.replace(/^`\s*/, ""), 10));
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i]!).toBeLessThanOrEqual(counts[i - 1]!);
    }
  });

  it("puts the section in the message, above the friction detail", async () => {
    mockFetchUnitEconomics.mockResolvedValue({
      adSpend: 1187.6,
      revenue: 70,
      paidReports: 3,
      compedReports: 0,
      otherCurrencyReports: 0,
      coveredDays: 30,
      windowDays: 30,
    });
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    const flat = blockText(arg.blocks);
    expect(flat).toContain("Break-even");
    /**
     * Directly under the funnel that produces it: it is the number a decision
     * gets made on, so it precedes the friction detail that explains the shape.
     * Anchored on the funnel rather than on the friction block, which is absent
     * from this fixture — an indexOf of -1 would have made the comparison pass
     * or fail for the wrong reason.
     */
    expect(flat.indexOf("The funnel —")).toBeGreaterThan(-1);
    expect(flat.indexOf("The funnel —")).toBeLessThan(flat.indexOf("Break-even"));
  });

  it("omits the section entirely when the figures are unavailable", async () => {
    // Not zeros. "EUR 0.00 spent, EUR 0.00 earned" reads as a quiet month.
    mockFetchUnitEconomics.mockResolvedValue(null);
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    expect(blockText(arg.blocks)).not.toContain("Break-even");
  });

  it("names both percentages on every funnel row, and states which is which", async () => {
    /**
     * The 2026-09-16 sync spent real time on a "96.5%" nobody could source, because
     * the table printed one percentage bare and the other as a "▼ 45%" suffix and
     * named neither — so a reader could not tell which figure was measured against
     * the step above and which against all visits.
     */
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    const funnel = arg.blocks
      .map((b) => (b as { text?: { text?: string } }).text?.text ?? "")
      .find((t) => t.includes("*The funnel —"));
    expect(funnel, "the funnel block must be in the message at all").toBeDefined();

    // The columns are named, in the order they appear.
    expect(funnel!).toContain("% of the step before");
    expect(funnel!).toContain("% of all visits");
    expect(funnel!.indexOf("% of the step before")).toBeLessThan(
      funnel!.indexOf("% of all visits")
    );

    // A row below the first carries TWO percentages, not one. Anchored on a real
    // row so the assertion cannot be satisfied by the legend line alone.
    const rows = funnel!.split("\n").filter((l) => /^`\s*\d/.test(l));
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows.slice(1)) {
      expect(row.match(/%/g) ?? [], `row should carry both percentages: ${row}`).toHaveLength(2);
    }
    // The first row is the base: no step-conversion exists above it, so it says so
    // rather than claiming 100%.
    expect(rows[0]!).toContain("—");
    // And the old drop-suffix is gone, not merely joined by the new columns.
    expect(funnel!).not.toContain("▼");
  });

  it("draws the site-wide survey-reach trend through the AUDITED renderer", async () => {
    // The picture the digest leads with. Its per-arm sibling cannot be a trend
    // yet, so this one carries "how is it looking".
    const cvrDays = Array.from({ length: 14 }, (_, i) => ({
      day: new Date(Date.UTC(2026, 7, 10) + i * 86_400_000).toISOString().slice(0, 10),
      // 190, deliberately: the trailing rate then lands on 15.8%, a value with a
      // decimal, so the precision assertion below has something to protect.
      visitors: 190,
      starts: 20 + i,
    }));
    mockFetchFunnelCvrSparklines.mockResolvedValue({ days: cvrDays });
    await GET(request());
    let arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    const flat = blockText(arg.blocks);
    expect(flat).toContain("*Visits that reach the survey*");
    expect(flat).toMatch(/of visit-days, 7-day trailing/);

    const img = arg.blocks.find((b) =>
      (b as { alt_text?: string }).alt_text?.startsWith("Site-wide share")
    ) as { image_url: string; alt_text: string } | undefined;
    expect(img).toBeDefined();
    /**
     * The AUDITED renderer, in single-series mode — not the sparkline one this
     * started on. That one pinned its y-scale to the series' own maximum with no
     * axis labels, so the plot came out byte-identical when the same shape was
     * re-rendered at a tenth of the magnitude: a 6% rate and a 0.6% rate drew the
     * same picture. `conversion-by-arm` has gridlines, an absolute scale, the
     * inset that stops the peak clipping, and one-decimal labels.
     */
    expect(img!.image_url).toContain("/digest-image/conversion-by-arm");

    const payload = JSON.parse(
      Buffer.from(new URL(img!.image_url).searchParams.get("d")!, "base64").toString("utf8")
    ) as { first: Array<number | null>; last?: unknown; title: string; headline: string };
    // Single-series mode is the ABSENCE of `last`. An all-null `last` would be a
    // second arm with no data, which the renderer names in the legend instead.
    expect(payload.last).toBeUndefined();
    expect(payload.title).toBe("Visits that reach the survey");
    // Nulls survive to the renderer as gaps. Flattened to 0 they would draw a
    // plunge to the floor on any day the site recorded no visits.
    expect(payload.first.slice(0, 6).every((v) => v === null)).toBe(true);
    expect(payload.headline).toMatch(/% of visits reach the survey/);
    // ONE DECIMAL, not rounded. `Math.round` here is what published a 12.7% rate
    // as "13%" and made the image disagree with its own caption.
    expect(payload.headline).toMatch(/\d+\.\d+% of visits/);
    // The image and the caption beside it must agree — they did not when the
    // image rounded 6.1 to "6" while the caption said 6.1%.
    const caption = flat.match(/\*Visits that reach the survey\* — ([\d.]+)% of visit-days/);
    expect(caption).not.toBeNull();
    expect(payload.headline).toContain(`${caption![1]}%`);
    expect(img!.alt_text).toContain(`${caption![1]}%`);

    // And with no source at all it is simply absent — no empty plot, no zero.
    mockNotifySlack.mockClear();
    mockFetchFunnelCvrSparklines.mockResolvedValue(null);
    await GET(request());
    arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    expect(blockText(arg.blocks)).not.toContain("*Visits that reach the survey*");
    expect(
      arg.blocks.filter((b) => (b as { alt_text?: string }).alt_text?.startsWith("Site-wide"))
    ).toHaveLength(0);
  });
  it("says landing→survey has no data in ONE line, not four empty ones", async () => {
    // The RPC floors its window at the first day both sides carried an arm, so
    // before then it correctly answers with empty arrays. Four lines of "no
    // visits recorded yet" every morning is the filler that teaches people to
    // skim the whole message.
    mockFetchLandingStartFunnel.mockResolvedValue({ daily: [], totals: [] });
    const blocks = await landingLiveBlocks();
    const block = blocks.find((b) =>
      (b as { text?: { text?: string } }).text?.text?.startsWith("*Landing page → survey*")
    ) as { text: { text: string } } | undefined;
    expect(block).toBeDefined();
    expect(block!.text.text.split("\n")).toHaveLength(1);
    expect(block!.text.text).toContain("no per-arm data in this window yet");
    expect(block!.text.text).not.toContain("no visits recorded yet");
  });

  it("counts landing→survey per arm until a trend can be drawn, and dates it", async () => {
    // One day of data: too few for a 7-day trailing rate, but the numbers exist
    // and are what a reader came for. The date must be DERIVED — the window is
    // half-open and ends yesterday, so a day only enters the series in the
    // following run, and every hardcoded version of this has been a day out.
    mockFetchLandingStartFunnel.mockResolvedValue({
      daily: [
        { day: "2026-08-20", arm: "white", visits: 80, starts: 13 },
        { day: "2026-08-20", arm: "white_prev", visits: 64, starts: 10 },
      ],
      totals: [
        { arm: "white", visits: 80, starts: 13 },
        { arm: "white_prev", visits: 64, starts: 10 },
      ],
    });
    const blocks = await landingLiveBlocks();
    const text = blockText(blocks);
    expect(text).toContain("*Landing page → survey* — one day of per-arm data");
    // first day + 7, not +6: 20 Aug -> 27 Aug.
    expect(text).toContain("chart from 27 Aug");
    expect(text).toContain("80 visit-days → 13 started the survey");
    expect(text).toContain("64 visit-days → 10 started the survey");
    expect(text).toContain("Not a like-for-like comparison");
    // No image while it cannot honestly draw one.
    expect(blocks.filter((b) => (b as { type?: string }).type === "image")).toHaveLength(0);
  });

  it("puts a too-young test's numbers in a full-size section, not a footnote", async () => {
    // The counts ARE the content when there is no chart, so they must not render
    // as a small italic context block, which is where the eye goes last.
    const rows = [];
    for (let d = 0; d < 3; d += 1) {
      const day = new Date(Date.UTC(2026, 7, 21) + d * 86_400_000).toISOString().slice(0, 10);
      rows.push({ axis: "landing", arm: "white", day, completions: 7, checkouts: 1, paid: 0 });
      rows.push({ axis: "landing", arm: "white_prev", day, completions: 6, checkouts: 2, paid: 0 });
    }
    mockFetchAxisFunnelDaily.mockResolvedValue(rows);
    const blocks = await landingLiveBlocks();
    const section = blocks.find(
      (b) =>
        (b as { type?: string }).type === "section" &&
        (b as { text?: { text?: string } }).text?.text?.startsWith("*Landing page design*")
    ) as { text: { text: string } } | undefined;
    expect(section).toBeDefined();
    const text = section!.text.text;
    expect(text).toContain("since 21 Aug");
    expect(text).toContain("21 finished → 3 checkout → 0 paid");
    expect(text).toContain("18 finished → 6 checkout → 0 paid");
    expect(text).toMatch(/chart (from|once)/);
    // And no image was emitted for it — the whole point of the counts path.
    const imgs = blocks.filter((b) =>
      (b as { alt_text?: string }).alt_text?.startsWith("Landing page")
    );
    expect(imgs).toHaveLength(0);
  });

  it("keeps the whole message inside Slack's block and size limits with every chart", async () => {
    // Two images plus their captions. fitBlocks caps at 50 blocks / ~38k
    // serialized and drops from the TAIL, so an overflow would silently delete
    // the alerts at the bottom rather than fail — which is why this asserts the
    // TOTAL rather than the delta from before.
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    expect(arg.blocks.length).toBeLessThanOrEqual(50);
    expect(JSON.stringify(arg.blocks).length).toBeLessThan(38_000);
    // Every chart URL independently under Slack's image_url cap.
    for (const b of arg.blocks) {
      const url = (b as { image_url?: string }).image_url;
      if (url) expect(url.length).toBeLessThan(2800);
    }
  });

  it("explains an axis it cannot chart instead of silently omitting it", async () => {
    // Only one arm has data, so nothing can be compared. The digest must say so
    // rather than leave the reader wondering where the test went.
    mockFetchAxisFunnelDaily.mockResolvedValue(makeAxisRows().filter((r) => r.arm === "white"));
    const blocks = await landingLiveBlocks();
    const flat = blockText(blocks);
    expect(flat).toContain("nothing to compare");
    expect(flat).toContain("*The tests*");
  });

  it("records the run and 500s when a source throws", async () => {
    mockFetchArmCohorts.mockRejectedValue(new Error("boom"));
    const res = await GET(request());
    expect(res.status).toBe(500);
    expect(mockRecordCronRun).toHaveBeenCalledWith(
      "conversion-digest",
      expect.any(Number),
      "error",
      expect.stringContaining("boom")
    );
  });

  it("says the read FAILED rather than reporting zeros, when both sources are null", async () => {
    // A Supabase hiccup used to ship "0 finished, 0 paid yesterday; 0 paid in 30
    // days" as the notification text — the line that lands in push previews and
    // the dead-letter table. Asserting zero where the truth is "we could not
    // read it" is the same falsehood as plotting a missing day as a zero.
    mockFetchLandingArmFunnel.mockResolvedValue(null);
    mockFetchArmCohorts.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(mockNotifySlack).toHaveBeenCalledTimes(1);
    const arg = mockNotifySlack.mock.calls[0]![0] as { text: string; blocks: SlackBlock[] };
    expect(arg.text).toContain("data unavailable");
    expect(arg.text).not.toContain("0 finished");
    expect(blockText(arg.blocks)).toContain("measurement failure, not a result");
  });

  it("speaks up for a FAILED read and stays quiet for an empty one", async () => {
    // "No experiment data in this window" was removed with the 30-day verdict
    // block it headed: an empty window is already evident from the per-test
    // section. A failed READ is different — silence there would read as "no
    // tests running" rather than "we could not measure them".
    mockFetchArmCohorts.mockResolvedValue([]);
    const res = await GET(request());
    expect(res.status).toBe(200);
    let arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    expect(blockText(arg.blocks)).not.toContain("measurement failure");
    expect(blockText(arg.blocks)).not.toContain("No experiment data");

    mockNotifySlack.mockClear();
    mockFetchArmCohorts.mockResolvedValue(null);
    await GET(request());
    arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    expect(blockText(arg.blocks)).toContain("measurement failure");
  });

  it("keeps the definitions at the top, where trimming cannot reach them", async () => {
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    // fitBlocks keeps from the front, so as the LAST block this was the first
    // thing dropped — leaving every number and no statement of what it meant.
    const idx = arg.blocks.findIndex((b) => JSON.stringify(b).includes("visitor-days"));
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(3);
  });
});

describe("buildFunnel: the midway row and the clamp that moves with it", () => {
  const cohort = [
    // reportOpens ABOVE completions on purpose — the live shape. report_session
    // counts an open on the day it happens, so a report opened today from a
    // survey completed last month lands outside its cohort; production read 506
    // opens against 430 completions on 2026-09-16.
    { arm: "white", completions: 425, reportOpens: 500, checkout: 33, paid: 5, revenue: 0 },
  ];

  it("slots the row in and names the threshold on it", () => {
    const steps = buildFunnel(cohort, 12308, 1025, { reached: 700, index: 30 });
    expect(steps.map((x) => x.step)).toEqual([
      "Visits to the site",
      "Started the survey",
      "Reached question 30",
      "Finished the survey",
      "…of those, opened their report",
      "…of those, started checkout",
      "…of those, ever paid",
    ]);
    expect(steps.map((x) => x.count)).toEqual([12308, 1025, 700, 425, 425, 33, 5]);
  });

  it("keeps the funnel monotonic once the extra row shifts the clamp", () => {
    /**
     * THE REGRESSION THIS FILE EXISTS FOR. `CLAMPED_STEPS` counts array positions,
     * and it was hardcoded `hasStarts ? 4 : 3`. Adding the midway row pushes
     * "opened their report" from index 3 to index 4, so with the old constant it
     * falls OUTSIDE the clamp — and report opens legitimately exceed completions,
     * so the funnel starts going UP. That is the 117.7% the 2026-09-16 sync could
     * not explain, drawn as though it were a real step.
     *
     * A mutation run confirmed nothing else catches it: reverting the constant
     * left all 68 tests green.
     */
    const steps = buildFunnel(cohort, 12308, 1025, { reached: 700, index: 30 });
    for (let i = 1; i < 5; i += 1) {
      expect(
        steps[i]!.count,
        `${steps[i]!.step} must not exceed ${steps[i - 1]!.step}`
      ).toBeLessThanOrEqual(steps[i - 1]!.count);
    }
    // Specifically: opens clamped down to the 425 finishers, not left at 500.
    expect(steps.find((x) => x.step.includes("opened their report"))!.count).toBe(425);
  });

  it("still clamps correctly with no midway row, and with no starts row either", () => {
    // The constant has to be right in all four combinations, not just the new one.
    for (const [starts, midway] of [
      [1025, { reached: 700, index: 30 }],
      [1025, null],
      [null, { reached: 700, index: 30 }],
      [null, null],
    ] as const) {
      const steps = buildFunnel(cohort, 12308, starts, midway);
      const opened = steps.findIndex((x) => x.step.includes("opened their report"));
      expect(opened).toBeGreaterThan(0);
      expect(
        steps[opened]!.count,
        `opens must be clamped with starts=${starts} midway=${midway ? "yes" : "no"}`
      ).toBeLessThanOrEqual(steps[opened - 1]!.count);
    }
  });
});

describe("email A/B tests in the digest", () => {
  /**
   * Marcus asked on 2026-08-24 for CVR per EXPERIMENT. Five of ours are emails,
   * and until the arm started riding on the Resend tags they could not appear
   * here at all — pickEmailVariant chose a template and forgot.
   */
  it("reports click rate per arm, with a verdict, per experiment", () => {
    const lines = buildEmailExperimentLines([
      {
        experiment: "survey-complete",
        arm: "a",
        delivered: 900,
        complained: 0,
        bounced: 0,
        clicked: 90,
      },
      {
        experiment: "survey-complete",
        arm: "b",
        delivered: 900,
        complained: 0,
        bounced: 0,
        clicked: 140,
      },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!).toContain("survey-complete");
    expect(lines[0]!).toContain("A 10% (90/900)");
    expect(lines[0]!).toContain("B 15.6% (140/900)");
    expect(lines[0]!).toContain("genuinely ahead");
    expect(lines[0]!).toContain("95% CI");
  });

  it("measures clicks, not opens", () => {
    /**
     * Open tracking fires on a pixel load, and Apple Mail Privacy Protection
     * pre-fetches it for every message whether or not a human looked — so an
     * open rate measures which mail clients each arm drew, and both arms draw
     * the same clients. A click is a person deciding.
     */
    const lines = buildEmailExperimentLines([
      // B wins overwhelmingly on OPENS and loses on clicks. If the readout used
      // opens, it would call B the winner.
      { experiment: "invite", arm: "a", delivered: 500, complained: 0, bounced: 0, clicked: 100 },
      { experiment: "invite", arm: "b", delivered: 500, complained: 0, bounced: 0, clicked: 20 },
    ]);
    expect(lines[0]!).toContain("A 20% (100/500)");
    expect(lines[0]!).toContain("B 4% (20/500)");
    // The leader named is A, the click winner.
    expect(lines[0]!).toMatch(/A is genuinely ahead/);
  });

  it("says the measurement cannot run, rather than calling it a tie", () => {
    // "No clear winner" claims we measured and found the arms equal. With four
    // clicks the z-test cannot run at all, and collapsing the two is how a test
    // gets concluded on nothing.
    const lines = buildEmailExperimentLines([
      {
        experiment: "report-share",
        arm: "a",
        delivered: 40,
        complained: 0,
        bounced: 0,
        clicked: 2,
      },
      {
        experiment: "report-share",
        arm: "b",
        delivered: 40,
        complained: 0,
        bounced: 0,
        clicked: 2,
      },
    ]);
    expect(lines[0]!).toContain("not enough clicks yet");
    expect(lines[0]!).not.toContain("no clear winner");
  });

  it("does not present a single arm as a result", () => {
    // One arm with traffic is not a comparison; a lone rate reads as a finding.
    const lines = buildEmailExperimentLines([
      {
        experiment: "survey-paused",
        arm: "a",
        delivered: 300,
        complained: 0,
        bounced: 0,
        clicked: 30,
      },
      {
        experiment: "survey-paused",
        arm: "b",
        delivered: 0,
        complained: 0,
        bounced: 0,
        clicked: 0,
      },
    ]);
    expect(lines[0]!).toContain("only one arm has data yet");
    expect(lines[0]!).not.toContain("ahead");
  });

  it("handles a three-way test by comparing the top two", () => {
    const lines = buildEmailExperimentLines([
      {
        experiment: "report-share",
        arm: "a",
        delivered: 600,
        complained: 0,
        bounced: 0,
        clicked: 30,
      },
      {
        experiment: "report-share",
        arm: "b",
        delivered: 600,
        complained: 0,
        bounced: 0,
        clicked: 90,
      },
      {
        experiment: "report-share",
        arm: "c",
        delivered: 600,
        complained: 0,
        bounced: 0,
        clicked: 60,
      },
    ]);
    expect(lines).toHaveLength(1);
    // All three arms are shown…
    for (const arm of ["A ", "B ", "C "]) expect(lines[0]!).toContain(arm);
    // …and the verdict is about the leader.
    expect(lines[0]!).toMatch(/B is genuinely ahead/);
  });

  it("ranks on the raw proportion, not a rounded one", () => {
    /**
     * THE BUG: `rate()` rounds to one decimal, so 12/2000 (0.600%) and 13/2100
     * (0.619%) both became "0.6". The sort saw a tie, stable sort fell back to
     * alphabetical, and A was named as ahead — while the z-test, running on the
     * raw counts the sort had ignored, printed a NEGATIVE delta for A. The line
     * contradicted itself. Reachable at ordinary email volumes.
     */
    const lines = buildEmailExperimentLines([
      { experiment: "invite", arm: "a", delivered: 2000, complained: 0, bounced: 0, clicked: 12 },
      { experiment: "invite", arm: "b", delivered: 2100, complained: 0, bounced: 0, clicked: 13 },
    ]);
    // B is genuinely the higher rate, so B must be the one named.
    expect(lines[0]!).not.toMatch(/A is ahead/);
    // And no line may claim a direction while printing the opposite sign.
    const claimsA = /\bA is (ahead|genuinely ahead)/.test(lines[0]!);
    const negativeDelta = /\(-\d/.test(lines[0]!);
    expect(claimsA && negativeDelta, `self-contradicting line: ${lines[0]}`).toBe(false);
  });

  it("calls a dead heat level, not a lead", () => {
    // Identical rates with enough volume to say so. "A is ahead" over two
    // literally equal numbers is the sentence this digest exists to avoid.
    const lines = buildEmailExperimentLines([
      { experiment: "invite", arm: "a", delivered: 1000, complained: 0, bounced: 0, clicked: 100 },
      { experiment: "invite", arm: "b", delivered: 1000, complained: 0, bounced: 0, clicked: 100 },
    ]);
    expect(lines[0]!).toContain("level so far");
    expect(lines[0]!).not.toContain("ahead");
  });

  it("prefers 'not enough clicks' over 'level' when the sample is tiny", () => {
    // Identical rates on two clicks each is a coincidence, not a finding.
    const lines = buildEmailExperimentLines([
      { experiment: "invite", arm: "a", delivered: 40, complained: 0, bounced: 0, clicked: 2 },
      { experiment: "invite", arm: "b", delivered: 40, complained: 0, bounced: 0, clicked: 2 },
    ]);
    expect(lines[0]!).toContain("not enough clicks yet");
    expect(lines[0]!).not.toContain("level so far");
  });

  it("survives more clicks than deliveries, and says it capped them", () => {
    /**
     * Clicks are click EVENTS — Resend fires one per link, each with its own svix
     * id, so one reader clicking three links counts three times while `delivered`
     * counts one. twoProportionSignal REFUSES when successes exceed the sample,
     * so an arm with abundant clicks printed "not enough clicks yet" — the exact
     * opposite of the truth.
     */
    const lines = buildEmailExperimentLines([
      {
        experiment: "report-share",
        arm: "a",
        delivered: 40,
        complained: 0,
        bounced: 0,
        clicked: 45,
      },
      {
        experiment: "report-share",
        arm: "b",
        delivered: 40,
        complained: 0,
        bounced: 0,
        clicked: 10,
      },
    ]);
    expect(lines[0]!).not.toContain("not enough clicks yet");
    // The raw counts are still shown, and the verdict is declined with a reason
    // rather than manufactured from a capped 100% rate.
    expect(lines[0]!).toContain("45/40");
    expect(lines[0]!).toContain("not comparable");
    expect(lines[0]!).not.toContain("genuinely ahead");
  });

  it("names spam complaints beside the click rate", () => {
    /**
     * An arm that wins on clicks while being marked as spam twice as often has
     * not won. The webhook has always written these counters; until an audit
     * noticed, the readout selected only delivered/opened/clicked, so four of the
     * six event types accumulated forever with no consumer — including a test
     * asserting complaints were counted while the number was unreachable.
     */
    const lines = buildEmailExperimentLines([
      { experiment: "invite", arm: "a", delivered: 900, clicked: 90, complained: 1, bounced: 0 },
      { experiment: "invite", arm: "b", delivered: 900, clicked: 140, complained: 12, bounced: 0 },
    ]);
    expect(lines[0]!).toContain("spam:");
    expect(lines[0]!).toContain("B 12");
  });

  it("says why an experiment has no rate, instead of vanishing", () => {
    /**
     * Every arm has a zero denominator but clicks exist — delivered webhooks are
     * not arriving. The route's fallback only fires when the whole result set is
     * empty, so this experiment used to disappear entirely: no section, no line,
     * no explanation. That is the quiet omission the feature exists to remove.
     */
    const lines = buildEmailExperimentLines([
      { experiment: "invite", arm: "a", delivered: 0, clicked: 3, complained: 0, bounced: 0 },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!).toContain("invite");
    expect(lines[0]!).toContain("no deliveries");
  });

  it("flags an arm that has clicks but no recorded deliveries", () => {
    // Filtering it out silently loses the clicks AND hides that the denominator
    // is broken for that arm.
    const lines = buildEmailExperimentLines([
      { experiment: "invite", arm: "a", delivered: 300, clicked: 30, complained: 0, bounced: 0 },
      { experiment: "invite", arm: "b", delivered: 0, clicked: 7, complained: 0, bounced: 0 },
    ]);
    expect(lines[0]!).toContain("only one arm has data yet");
    expect(lines[0]!).toContain("B has clicks but no recorded deliveries");
  });

  it("puts each experiment on its own line", () => {
    const lines = buildEmailExperimentLines([
      { experiment: "invite", arm: "a", delivered: 400, complained: 0, bounced: 0, clicked: 40 },
      { experiment: "invite", arm: "b", delivered: 400, complained: 0, bounced: 0, clicked: 44 },
      {
        experiment: "survey-complete",
        arm: "a",
        delivered: 800,
        complained: 0,
        bounced: 0,
        clicked: 80,
      },
      {
        experiment: "survey-complete",
        arm: "b",
        delivered: 800,
        complained: 0,
        bounced: 0,
        clicked: 130,
      },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]!).toContain("invite");
    expect(lines[1]!).toContain("survey-complete");
  });
});

describe("break-even: what we spent against what came back", () => {
  /**
   * Marcus, 2026-09-18: "Our core mission is to turn the survey to report journey
   * break even." Nothing in the digest said how far off that is. Measured over
   * the 30 days to 2026-09-18: EUR 1,187.60 of ad spend against EUR 70.00 from 3
   * paid reports.
   *
   * The KPI framework marked this whole layer NO DATA because `marketing_spend`
   * is empty. It is — but the spend is not missing, it is in GA4 and already
   * ingested; nothing had joined the two halves.
   */
  it("states the spend, the return and the gap", () => {
    const lines = buildUnitEconomicsLines({
      adSpend: 1187.6,
      revenue: 70,
      paidReports: 3,
      compedReports: 0,
      otherCurrencyReports: 0,
      coveredDays: 30,
      windowDays: 30,
    });
    const all = lines.join("\n");
    expect(all).toContain("EUR 1,187.60");
    expect(all).toContain("EUR 70.00");
    expect(all).toContain("3 paid reports");
    // EUR 395.87 to acquire each one, against EUR 23.33 earned.
    expect(all).toContain("EUR 395.87");
    expect(all).toContain("EUR 23.33");
    // And the gap, named as a gap.
    expect(all).toContain("EUR -1,117.60");
    expect(all).toContain("short of break-even");
  });

  it("does not count a free unlock as a sale", () => {
    /**
     * `payment` rows at EUR 0 are comped unlocks — the post-call coupon. They
     * count as reports by an explicit decision, and they are not sales. Folded
     * into the denominator they make acquisition look cheaper than it is:
     * measured over the 30 days to 2026-09-19 there were 3 succeeded non-test
     * payments of which ONE was a zero, so cost per sale would divide by 3
     * instead of 2 — 33% flattering, the direction this file warns about
     * everywhere else.
     */
    const lines = buildUnitEconomicsLines({
      adSpend: 1000,
      revenue: 70,
      paidReports: 2,
      compedReports: 1,
      otherCurrencyReports: 0,
      coveredDays: 30,
      windowDays: 30,
    });
    const all = lines.join("\n");
    // Cost per sale divides by the 2 that paid, not the 3 unlocks.
    expect(all).toContain("EUR 500.00");
    expect(all).not.toContain("EUR 333.33");
    // And the free one is named rather than hidden.
    expect(all).toContain("1 unlocked free");
    expect(all).toContain("not counted as sales");
  });

  it("says nothing about comps when there were none", () => {
    const lines = buildUnitEconomicsLines({
      adSpend: 1000,
      revenue: 70,
      paidReports: 2,
      compedReports: 0,
      otherCurrencyReports: 0,
      coveredDays: 30,
      windowDays: 30,
    });
    expect(lines.join("\n")).not.toContain("unlocked free");
  });

  it("says what the figure does NOT include", () => {
    /**
     * The framework's own formula for CB I is "revenue − MARKETING". Salaries,
     * software and freelancers live in the Business Case spreadsheet and in no
     * database this reads — roughly EUR 3,000 a month. A reader who takes this
     * line for profit is out by that much.
     */
    const lines = buildUnitEconomicsLines({
      adSpend: 1000,
      revenue: 100,
      paidReports: 5,
      compedReports: 0,
      otherCurrencyReports: 0,
      coveredDays: 30,
      windowDays: 30,
    });
    expect(lines.join("\n")).toContain("Advertising only");
  });

  it("refuses to divide by no paid reports", () => {
    // "EUR 0.00 per report" would read as free acquisition. Dividing by nothing
    // is not a cost of nothing.
    const lines = buildUnitEconomicsLines({
      adSpend: 900,
      revenue: 0,
      paidReports: 0,
      compedReports: 0,
      otherCurrencyReports: 0,
      coveredDays: 30,
      windowDays: 30,
    });
    const all = lines.join("\n");
    expect(all).toContain("no paid reports in this window");
    expect(all).not.toMatch(/EUR 0\.00 to acquire/);
  });

  it("says a profitable report MAKES us money, not that it costs us a negative", () => {
    /**
     * There was no profitable branch at all: the line printed `cppr - arpp`
     * unconditionally, so the day the product started making money the line
     * whose whole job is to announce that read "each one costs us EUR -15.00".
     */
    const all = buildUnitEconomicsLines({
      adSpend: 100,
      revenue: 250,
      paidReports: 10,
      compedReports: 0,
      otherCurrencyReports: 0,
      coveredDays: 30,
      windowDays: 30,
    }).join("\n");
    expect(all).toContain("each one makes us EUR 15.00");
    expect(all, "a negative cost is not a way of saying profit").not.toContain("costs us EUR -");
    expect(all).toContain("above break-even");
  });

  it("says nothing came back rather than inventing a multiple", () => {
    /**
     * The shortfall was `Math.round(1 / Math.max(roas, 0.0001))`. With no
     * revenue that clamp produced "10000x short of break-even" — a number
     * measured from nothing. The honest output is that nothing came back.
     */
    const all = buildUnitEconomicsLines({
      adSpend: 900,
      revenue: 0,
      paidReports: 0,
      compedReports: 0,
      otherCurrencyReports: 0,
      coveredDays: 30,
      windowDays: 30,
    }).join("\n");
    expect(all).toContain("nothing came back at all");
    expect(all, "10000 is the clamp, not a measurement").not.toContain("10000x");
  });

  it("does not cap a real shortfall at the clamp", () => {
    // EUR 100,000 spent against EUR 1 is 100,000x short. The old clamp printed
    // "10000x" — understating the gap, the flattering direction.
    const all = buildUnitEconomicsLines({
      adSpend: 100_000,
      revenue: 1,
      paidReports: 1,
      compedReports: 0,
      otherCurrencyReports: 0,
      coveredDays: 30,
      windowDays: 30,
    }).join("\n");
    expect(all).toContain("100,000x short of break-even");
  });

  it("calls exactly break-even exactly that", () => {
    // `roas >= 1` printed "EUR 0.00 · above break-even" in one line.
    const all = buildUnitEconomicsLines({
      adSpend: 119,
      revenue: 119,
      paidReports: 4,
      compedReports: 0,
      otherCurrencyReports: 0,
      coveredDays: 30,
      windowDays: 30,
    }).join("\n");
    expect(all).toContain("exactly break-even");
    expect(all).not.toContain("above break-even");
  });

  it("refuses a cost per report when no spend was recorded", () => {
    /**
     * The guard was on `paidReports` alone, so a window with sales and no spend
     * printed "EUR 0.00 to acquire" — the exact cost-of-nothing the sibling
     * branch exists to refuse, wearing the sign of a bargain. Reachable whenever
     * ads are paused or GA4's ad report has not landed.
     */
    const all = buildUnitEconomicsLines({
      adSpend: 0,
      revenue: 119,
      paidReports: 4,
      compedReports: 0,
      otherCurrencyReports: 0,
      coveredDays: 0,
      windowDays: 30,
    }).join("\n");
    expect(all).toContain("no ad spend recorded in this window");
    expect(all).not.toMatch(/EUR 0\.00 to acquire/);
  });

  it("names a payment in another currency instead of summing it into euros", () => {
    const all = buildUnitEconomicsLines({
      adSpend: 100,
      revenue: 29,
      paidReports: 1,
      compedReports: 0,
      otherCurrencyReports: 1,
      coveredDays: 30,
      windowDays: 30,
    }).join("\n");
    expect(all).toContain("1 succeeded payment is in another currency");
  });

  it("calls out partial GA4 coverage, so the spend reads as a floor", () => {
    // Understating spend OVERSTATES profit, which is the direction that matters.
    const lines = buildUnitEconomicsLines({
      adSpend: 400,
      revenue: 50,
      paidReports: 2,
      compedReports: 0,
      otherCurrencyReports: 0,
      coveredDays: 11,
      windowDays: 30,
    });
    expect(lines.join("\n")).toContain("11 of 30 days");
    expect(lines.join("\n")).toContain("floor");
  });

  it("says so plainly when we are above break-even", () => {
    const lines = buildUnitEconomicsLines({
      adSpend: 100,
      revenue: 250,
      paidReports: 10,
      compedReports: 0,
      otherCurrencyReports: 0,
      coveredDays: 30,
      windowDays: 30,
    });
    expect(lines.join("\n")).toContain("above break-even");
    expect(lines.join("\n")).not.toContain("short of break-even");
  });
});

describe("conversion-digest verdicts", () => {
  it("calls a real winner and quotes the confidence interval", () => {
    // 60/500 vs 20/500 — a wide, unambiguous gap. On the LANDING axis: the survey
    // axis used to host this fixture, and its `dark` arm is retired now, so
    // buildArmVerdict correctly filters it and the pair collapses to one arm.
    const verdict = buildArmVerdict(
      "landing",
      [
        { arm: "white", n: 500, conversions: 60 },
        { arm: "white_prev", n: 500, conversions: 20 },
      ],
      { includeRetired: true }
    );
    expect(verdict.state).toBe("winner");
    expect(verdict.sentence).toContain("genuinely ahead");
    expect(verdict.sentence).toContain("95% CI");
    // Plain-English arm names only — never a raw stored value.
    expect(verdict.sentence).toContain("Landing Page V2 (Survey in Hero)");
    expect(verdict.sentence).not.toContain("white_prev");
  });

  it("refuses to call the real 308-vs-13 landing split, however tempting the rates", () => {
    // The live shape as measured in production: one arm is 24x the other, and the
    // big arm alone satisfies twoProportionSignal's combined n>=50 rule.
    const verdict = buildArmVerdict(
      "landing",
      [
        { arm: "white", n: 308, conversions: 10 },
        { arm: "white_prev", n: 13, conversions: 0 },
      ],
      { includeRetired: true }
    );
    expect(verdict.state).toBe("too-early");
    expect(verdict.sentence).toContain("too early");
    expect(verdict.sentence).toContain("13");
    expect(verdict.sentence).toContain(String(TINY_ARM));
    // The thing that must never appear: a declared winner.
    expect(verdict.sentence).not.toContain("ahead");
  });

  it("says insufficient data below a combined 50, and how many more are needed", () => {
    const verdict = buildArmVerdict(
      "landing",
      [
        { arm: "white", n: 12, conversions: 1 },
        { arm: "white_prev", n: 10, conversions: 0 },
      ],
      { includeRetired: true }
    );
    expect(verdict.state).toBe("insufficient-data");
    expect(verdict.sentence).toContain("not enough data");
    expect(verdict.sentence).toContain("28 more");
  });

  it("blames the conversion count, not the survey count, when purchases are the blocker", () => {
    // The shape of a real 30-day split: 328 finished surveys is plenty; TEN
    // purchases between them is not. This used to say "no clear winner", which
    // claims we measured the two arms and found them equal — but the z-test's
    // normal approximation is not even valid at 3 successes, so nothing was
    // measured. It must say which number is missing. (Originally written against
    // the pricing axis, moved to landing when the price test was concluded on
    // 2026-08-31 — `buildArmVerdict` drops retired arms, so a retired axis can no
    // longer exercise the two-arm branches.)
    const verdict = buildArmVerdict(
      "landing",
      [
        { arm: "white", n: 165, conversions: 3 },
        { arm: "white_prev", n: 163, conversions: 7 },
      ],
      { includeRetired: true }
    );
    expect(verdict.state).toBe("insufficient-data");
    expect(verdict.sentence).toContain("not enough purchases");
    expect(verdict.sentence).toContain("10");
    expect(verdict.sentence).toContain("328");
    // The two wrong answers: a winner, or a measured dead heat.
    expect(verdict.sentence).not.toContain("no clear winner");
    expect(verdict.sentence).not.toContain("ahead");
    // And it must not blame the survey count, which is not short.
    expect(verdict.sentence).not.toContain("more needed");
  });

  it("reports a close race as no winner once both arms have enough conversions", () => {
    // Same shape, but with conversions above the validity floor on both sides —
    // so the comparison genuinely runs and genuinely finds no winner. Keeps the
    // no-winner branch covered now that thin data no longer reaches it.
    const verdict = buildArmVerdict(
      "landing",
      [
        { arm: "white", n: 165, conversions: 20 },
        { arm: "white_prev", n: 163, conversions: 24 },
      ],
      { includeRetired: true }
    );
    expect(verdict.state).toBe("no-winner");
    expect(verdict.sentence).toContain("no clear winner");
  });

  it("drops a retired arm instead of comparing a live design against a dead one", () => {
    const verdict = buildArmVerdict(
      "landing",
      [
        { arm: "white", n: 300, conversions: 10 },
        // `control` is the retired dark landing — nobody has been served it for months.
        { arm: "control", n: 800, conversions: 40 },
      ]
      // No `includeRetired` here, deliberately: this is the test OF that filter.
    );
    expect(verdict.arms.map((a) => a.label)).toEqual(["Landing Page V2 (Survey in Hero)"]);
    expect(verdict.state).toBe("single-arm");
    expect(verdict.sentence).toContain("nothing to compare");
  });

  it("never lets conversions exceed the denominator", () => {
    const verdict = buildArmVerdict(
      "survey",
      [
        { arm: "white", n: 10, conversions: 999 },
        { arm: "dark", n: 10, conversions: 0 },
      ],
      { includeRetired: true }
    );
    expect(verdict.arms[0]!.rate).toBeLessThanOrEqual(100);
  });
});

describe("conversion-digest funnel", () => {
  it("splits the visits drop with a survey-start row when starts are available", () => {
    /**
     * Asked for by the strategy lead 2026-09-15. Without it the top of the funnel
     * is a single 96.5% drop that cannot distinguish "they never started" from
     * "they started and gave up" — two problems with completely different fixes.
     */
    const steps = buildFunnel(
      [{ arm: "white", completions: 425, reportOpens: 414, checkout: 33, paid: 5, revenue: 0 }],
      12308,
      1025
    );
    expect(steps.map((x) => x.step)).toEqual([
      "Visits to the site",
      "Started the survey",
      "Finished the survey",
      "…of those, opened their report",
      "…of those, started checkout",
      "…of those, ever paid",
    ]);
    expect(steps.map((x) => x.count)).toEqual([12308, 1025, 425, 414, 33, 5]);
    // The point of the row: the old single 96.5% becomes 91.7% then 58.5%, and the
    // second of those is the number nobody could see before.
    expect(steps[1]!.dropFromPrev).toBe(91.7);
    expect(steps[2]!.dropFromPrev).toBe(58.5);
    // Percentages stay relative to the TOP, not to the row above.
    expect(steps[1]!.pctOfTop).toBe(8.3);
  });

  it("omits the row when starts trail finishers, rather than clamping finishers down", () => {
    /**
     * Start tracking began 2026-08-16. Over the whole of recorded history the
     * source reports 1,038 starts against 1,673 finished surveys — missing data,
     * not a funnel. Drawn, the clamp would pull the finisher count down to the
     * start count and publish a smaller, wrong number under a truthful label,
     * which is the one thing this funnel has always refused to do.
     */
    const steps = buildFunnel(
      [{ arm: "white", completions: 1673, reportOpens: 1615, checkout: 205, paid: 37, revenue: 0 }],
      29630,
      1038
    );
    expect(steps.map((x) => x.step)).not.toContain("Started the survey");
    // The finisher count survives intact — that is the whole point.
    expect(steps[1]!.count).toBe(1673);
  });

  it("omits the row entirely when the start source is unreadable, rather than drawing zero", () => {
    // A zero row would read as "nobody started the survey this month", which is a
    // far worse falsehood than an absent row. Null and 0 both mean "cannot say".
    for (const starts of [null, undefined, 0]) {
      const steps = buildFunnel(
        [{ arm: "white", completions: 425, reportOpens: 414, checkout: 33, paid: 5, revenue: 0 }],
        12308,
        starts
      );
      expect(steps.map((x) => x.step)).not.toContain("Started the survey");
      expect(steps).toHaveLength(5);
    }
  });

  it("clamps every step to its predecessor so the funnel cannot go up", () => {
    // report_session counts opens on the day they happen, so a cohort can show
    // more opens than completions. A funnel that RISES reads as a product bug.
    const steps = buildFunnel(
      [{ arm: "white", completions: 100, reportOpens: 140, checkout: 20, paid: 5, revenue: 0 }],
      1000
    );
    const counts = steps.map((s) => s.count);
    expect(counts).toEqual([1000, 100, 100, 20, 5]);
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i]!).toBeLessThanOrEqual(counts[i - 1]!);
    }
    expect(steps.every((s) => s.dropFromPrev >= 0)).toBe(true);
  });

  it("finds the biggest proportional leak", () => {
    const steps = buildFunnel(
      [{ arm: "white", completions: 100, reportOpens: 95, checkout: 10, paid: 5, revenue: 0 }],
      1000
    );
    const leak = biggestLeak(steps);
    // 1000 -> 100 is a 90% loss, the worst step.
    expect(leak).toMatchObject({ from: "Visits to the site", to: "Finished the survey", pct: 90 });
  });

  it("returns no leak for a flat funnel", () => {
    const steps = buildFunnel(
      [{ arm: "white", completions: 10, reportOpens: 10, checkout: 10, paid: 10, revenue: 0 }],
      10
    );
    expect(biggestLeak(steps)).toBeNull();
  });
});

describe("conversion-digest alerts", () => {
  const base = {
    verdicts: [],
    visitorArms: [],
    yesterday: { visitors: 100, completions: 10, paid: 1 },
    baseline: { visitors: 100, completions: 10, paid: 1 },
    now: new Date("2026-08-24T09:00:00Z"),
  };

  it("says nothing happened rather than listing green ticks", () => {
    const alerts = buildAlerts(base);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.message).toContain("Nothing crossed a threshold");
  });

  it("emits no standing daily caveats, only things that happened", () => {
    // Two alerts were removed as noise: the retired-landing-label bucket (whose
    // subject, per-arm visit counts, the message no longer prints) and the
    // pricing-cutover warning (which pointed at a pooled 30-day line that no
    // longer exists). Both were true EVERY day, which is how a digest teaches
    // people to skim its alerts. This is the guard against them coming back.
    const alerts = buildAlerts({
      ...base,
      visitorArms: [{ arm: "control", n: 269 }],
      pricingCutoverIso: "2026-08-24T02:46:49Z",
    });
    const message = alerts.map((a) => a.message).join(" ");
    expect(message).not.toContain("retired landing page label");
    expect(message).not.toContain("POOLS both price levels");
    // No standing daily caveat survives here at all — see the test below.
    expect(alerts.some((a) => a.message.includes("not a fair split"))).toBe(false);
  });

  it("no longer raises the fair-split caveat as a daily alert", () => {
    // It was `info` severity and true every single day the test ran, and it was
    // the only thing in the Alerts section on a normal day — so the section
    // taught people to skip it before a real alert ever arrived. The fact did
    // not die: it now rides beside the landing numbers it qualifies, which the
    // digest test below pins.
    const alerts = buildAlerts({
      ...base,
      verdicts: [
        buildArmVerdict(
          "landing",
          [
            { arm: "white", n: 300, conversions: 10 },
            { arm: "white_prev", n: 240, conversions: 6 },
          ],
          { includeRetired: true }
        ),
      ],
    });
    expect(alerts.some((a) => a.message.includes("not a fair split"))).toBe(false);
  });

  it("warns on a traffic collapse but only off a meaningful baseline", () => {
    const collapsed = buildAlerts({
      ...base,
      yesterday: { visitors: 10, completions: 1, paid: 0 },
      baseline: { visitors: 100, completions: 10, paid: 1 },
    });
    expect(collapsed.some((a) => a.message.includes("below the usual"))).toBe(true);

    // Same 90% fall, tiny baseline — a percentage off 4 visits means nothing.
    const tiny = buildAlerts({
      ...base,
      yesterday: { visitors: 0, completions: 0, paid: 0 },
      baseline: { visitors: 4, completions: 1, paid: 0 },
    });
    expect(tiny.some((a) => a.message.includes("below the usual"))).toBe(false);
  });

  it("stops mentioning the price change once it is old news", () => {
    const alerts = buildAlerts({ ...base, pricingCutoverIso: "2026-07-01T00:00:00Z" });
    expect(alerts.some((a) => a.message.includes("POOLS"))).toBe(false);
  });

  it("escalates a regression to a warning", () => {
    const alerts = buildAlerts({
      ...base,
      verdicts: [
        {
          axis: "survey",
          axisTitle: "Survey design",
          state: "regression",
          sentence: "Survey design: Dark survey is genuinely behind — 1% vs 9%.",
          arms: [],
        },
      ],
    });
    expect(alerts.some((a) => a.severity === "warn" && a.message.includes("behind"))).toBe(true);
  });
});

describe("conversion-digest chart series", () => {
  it("smooths daily rates over 7 days so one sale cannot dominate the y-scale", () => {
    const funnel = makeFunnel();
    const series = buildArmSeries(funnel.daily, ["white", "white_prev"], (r) => r.paid);
    expect(series.labels).toHaveLength(30);
    expect(series.first).toHaveLength(30);
    expect(series.last).toHaveLength(30);
    // The first six days have no full 7-day window behind them, so they are
    // gaps. Plotting them drew 1- to 6-day rates on a chart whose footnote
    // promises a trailing one: on the real survey data day one was 7 of 12
    // finishers = 58% against a true rate of 10-17%, which set the y-scale and
    // squashed every honest value into the bottom sixth of the plot.
    expect(series.first.slice(0, 6).every((v) => v === null)).toBe(true);
    expect(series.last.slice(0, 6).every((v) => v === null)).toBe(true);
    expect(series.first[6]).not.toBeNull();
    // Every plotted point is a real percentage.
    for (const v of [...series.first, ...series.last].slice(6)) {
      if (v === null) continue;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    // A trailing window cannot produce the 100% spikes a single-day rate would:
    // 1 paid / 10 completions on its own day would be 10%, but across 7 days of
    // 70 completions it is ~3%.
    expect(Math.max(...(series.first.filter((v) => v !== null) as number[]))).toBeLessThan(20);
  });

  it("returns null, not zero, for days an arm had no traffic", () => {
    // This test previously asserted zeros — encoding the bug. 0% and "not running"
    // are different facts: the second landing page arm launched mid-window, and
    // filling its earlier days with 0 drew a flat line back to the start of the
    // window and claimed weeks of zero conversion for an arm that did not exist.
    const series = buildArmSeries(makeFunnel().daily, ["white", "does_not_exist"], (r) => r.paid);
    expect(series.last.every((v) => v === null)).toBe(true);
    expect(series.last.some((v) => v === 0)).toBe(false);
  });

  it("keeps a real zero distinct from a gap", () => {
    // An arm WITH finishers and no sales is a genuine 0% and must still plot.
    const funnel = makeFunnel();
    funnel.daily = funnel.daily.map((r) =>
      r.arm === "white_prev" ? { ...r, paid: 0, charges: 0, revenue: 0 } : r
    );
    const series = buildArmSeries(funnel.daily, ["white", "white_prev"], (r) => r.paid);
    expect(series.last.some((v) => v === 0)).toBe(true);
    expect(series.last.every((v) => v === null)).toBe(false);
  });

  it("gaps the start series for days an arm had no visits", () => {
    // The second arm launched part-way through the window. Its earlier days must
    // be absent, not a plotted 0% — that is the falsehood the paid chart carried.
    const series = buildStartSeries(makeStartFunnel({ prevFromDay: 27 }), ["white", "white_prev"]);
    // The first six days are the WARM-UP gap, not missing traffic: a window with
    // fewer than seven days behind it is not the 7-day trailing rate the footnote
    // promises. Everything after that is present for the arm that ran all window.
    expect(series.first.slice(0, 6).every((v) => v === null)).toBe(true);
    expect(series.first.slice(6).every((v) => v != null)).toBe(true);
    expect(series.last.slice(0, 20).every((v) => v === null)).toBe(true);
    expect(series.last.some((v) => v != null)).toBe(true);
    expect(series.last.some((v) => v === 0)).toBe(false);
  });

  it("computes the start rate off visits, not off finishers", () => {
    // Seven days, because a point needs a full window inside it now. Days 1-6 are
    // 10 starts per 100 visits and day 7 is 20, so the first drawable point is
    // 80/700 = 11.4%.
    const daily = Array.from({ length: 7 }, (_, i) => ({
      day: `2026-08-2${i}`,
      arm: "white",
      visits: 100,
      starts: i === 6 ? 20 : 10,
    }));
    const series = buildStartSeries(
      { daily, totals: [{ arm: "white", visits: 700, starts: 80 }] },
      ["white", "white_prev"]
    );
    expect(series.first.slice(0, 6).every((v) => v === null)).toBe(true);
    expect(series.first[6]).toBe(11.4);
  });

  it("keeps the signed chart URL under Slack's image_url cap at a full 30 days", async () => {
    // The whole payload rides in the URL because Slack's image proxy is anonymous,
    // and Slack rejects an image_url over ~3000 chars. 30 day-labels plus two
    // 30-point series is the largest this chart ever gets, so measure it rather
    // than assume — a silently dropped image is the failure mode.
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.loveiq.org";
    process.env.STRATEGY_DIGEST_SIGNING_SECRET = "test-digest-signing-secret-value";
    mockFetchLandingArmFunnel.mockResolvedValue(makeFunnel());
    mockIsProdCronHost.mockReturnValue(true);
    mockTryClaim.mockResolvedValue(true);
    mockFetchLandingStartFunnel.mockResolvedValue(makeStartFunnel());
    mockFetchAxisFunnelDaily.mockResolvedValue(makeAxisRows());
    const blocks = await landingLiveBlocks();
    const image = blocks.find((b) => (b as { type?: string }).type === "image") as
      { image_url?: string } | undefined;
    expect(image?.image_url).toBeDefined();
    expect(image!.image_url!.length).toBeLessThan(2800);
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

/**
 * SPEND NEXT TO THE PAID COUNT.
 *
 * "20 finished, 0 paid yesterday" reads as a slow day. Measured 2026-09-14: EUR 1,196 of
 * Google Ads over 30 days returned EUR 129 — an 11% return that nobody had to look at,
 * because the only figure posted daily was the free half of the ledger. The cost belongs
 * in the one line that reaches a phone notification.
 */
describe("conversion-digest — the daily line carries what the day cost", () => {
  const DAY = "2026-08-23"; // the day the pinned clock reports on

  beforeAll(() => {
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.loveiq.org";
    process.env.STRATEGY_DIGEST_SIGNING_SECRET = "test-digest-signing-secret-value";
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T09:05:00.000Z"));
    mockIsProdCronHost.mockReturnValue(true);
    mockTryClaim.mockResolvedValue(true);
    mockFetchLandingArmFunnel.mockResolvedValue(makeFunnel());
    mockFetchLandingStartFunnel.mockResolvedValue(makeStartFunnel());
    mockFetchAxisFunnelDaily.mockResolvedValue(makeAxisRows());
    mockFetchFunnelCvrSparklines.mockResolvedValue(null);
    mockFetchArmCohorts.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const postedText = () => {
    const call = mockNotifySlack.mock.calls.find(
      (c) => (c[0] as { kind?: string })?.kind === "conversion_digest"
    );
    return (call?.[0] as { text?: string })?.text ?? "";
  };

  const run = async () =>
    GET(
      new Request("https://www.loveiq.org/api/cron/conversion-digest", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );

  it("names what the day cost, beside what it earned", async () => {
    mockAdCostByDay.mockResolvedValue({
      byDay: new Map([[DAY, 41.75]]),
      from: "2026-05-28",
      to: DAY,
    });

    await run();

    expect(postedText()).toContain("EUR 41.75 spent");
  });

  /**
   * A day GA4 has not reported yet must not read as a free day. This is the same rule the
   * rollup keeps everywhere else — absence is unknown, never zero — and it matters most
   * here, because "0 paid, EUR 0.00 spent" is the reassuring falsehood the clause exists
   * to remove.
   */
  it("says nothing rather than EUR 0.00 when the day is outside GA4's window", async () => {
    mockAdCostByDay.mockResolvedValue({
      byDay: new Map(),
      from: "2026-05-28",
      to: "2026-08-20", // three days before the reported day
    });

    await run();

    const text = postedText();
    expect(text).toContain("paid");
    expect(text).not.toContain("spent");
    expect(text).not.toContain("EUR 0.00");
  });

  /** GA4 being unreachable costs the clause, never the digest. */
  it("still posts the digest when the spend read fails", async () => {
    mockAdCostByDay.mockRejectedValue(new Error("GA4 unreachable"));

    await run();

    const text = postedText();
    expect(text).toContain("Conversion");
    expect(text).toContain("paid");
    expect(text).not.toContain("spent");
  });

  /** A covered day with genuinely no spend is a real zero and should say so. */
  it("reports a covered day with no spend as zero, which is a fact", async () => {
    mockAdCostByDay.mockResolvedValue({
      byDay: new Map(),
      from: "2026-05-28",
      to: DAY,
    });

    await run();

    expect(postedText()).toContain("EUR 0.00 spent");
  });
});
