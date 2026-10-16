// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ph = vi.hoisted(() => ({
  capture: vi.fn(),
  register: vi.fn(),
  identify: vi.fn(),
  init: vi.fn(),
}));
vi.mock("posthog-js", () => ({ default: ph }));

type Client = typeof import("@features/analytics/client");
let client: Client;
let beacon: ReturnType<typeof vi.fn>;
let gtag: ReturnType<typeof vi.fn>;

const grantConsent = () => {
  document.cookie =
    "cookieyes-consent=consent:yes,action:yes,necessary:yes,analytics:yes,advertisement:no; path=/";
};
const grantAllConsent = () => {
  document.cookie =
    "cookieyes-consent=consent:yes,action:yes,necessary:yes,analytics:yes,advertisement:yes; path=/";
};
const declineConsent = () => {
  document.cookie =
    "cookieyes-consent=consent:yes,action:yes,necessary:yes,analytics:no,advertisement:no; path=/";
};
const clearConsent = () => {
  document.cookie = "cookieyes-consent=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
};

beforeEach(async () => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.loveiq.org");
  /**
   * REQUIRED, and the reason the GA4 assertions below are not vacuous.
   *
   * `isProductionSite()` demands a Vercel environment as well as NODE_ENV, and
   * vitest sets none — so `track()` returned at its production check and GA4
   * never fired in this suite whatever consent said. The first version of the
   * "sends NOTHING to GA4" test passed for that reason rather than because the
   * consent check works, which is no test at all.
   */
  vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");
  vi.resetModules();
  clearConsent();
  // jsdom on an http origin refuses a __Host- prefixed cookie; the client also
  // accepts the __csrf fallback.
  document.cookie = "__csrf=tok123; path=/";
  delete (window as unknown as Record<string, unknown>).dataLayer;
  /**
   * `gtagSend` reaches Google through `window.gtag`, NOT through
   * `dataLayer.push` — and it only drains its queue once the GA4 container
   * reports itself live. Without both of these the Google Ads assertion below
   * cannot fail for any reason, which is how its first version passed while the
   * advertisement gate was deleted.
   */
  gtag = vi.fn();
  Object.defineProperty(window, "gtag", { configurable: true, writable: true, value: gtag });
  Object.defineProperty(window, "google_tag_manager", {
    configurable: true,
    writable: true,
    value: { "G-QTYY69L46N": {} },
  });
  beacon = vi.fn().mockReturnValue(true);
  Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beacon });
  client = await import("@features/analytics/client");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  delete (window as unknown as Record<string, unknown>).__loveiqReportSubmissionId;
});

const priceShown = () =>
  client.trackLockedCardPriceShown({
    plan: "full_report",
    price: 29,
    currency: "EUR",
    bucket: "A",
    pricing_cluster_id: "c",
    discount_step: 0,
    experiment_group: "A",
    msrp: 29.99,
    initial_price: 29,
  });

const dataLayer = () => (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];

/**
 * OUR OWN table is written whatever the visitor told the cookie banner; the
 * THIRD PARTIES still obey it. That split is the entire contract, so both halves
 * are asserted on the same call.
 *
 * Marcus and Mark's call, 2026-09-18. It replaces a pre-consent holding queue
 * that tried to replay events once a visitor accepted — which helped the people
 * who said yes late and did nothing for the people who said no. Measured over 30
 * days: 107 of the 406 readers who opened a report (26.4%) produced no durable
 * row at all, so the funnel could not see them past the server-side open.
 *
 * Why this is a different category from the tags: a first-party POST to our own
 * server sets no cookie, reads nothing off the device and sends nothing to
 * another company. The site already takes that posture for Microsoft Clarity
 * ("loaded on all visits", disclosed in the privacy policy) and PostHog.
 */
describe("first-party events are written whatever the banner says", () => {
  it.each([
    ["declined", declineConsent],
    ["never answered", () => {}],
  ])("persists the event when consent was %s", (_label, setup) => {
    setup();
    (window as unknown as Record<string, unknown>).__loveiqReportSubmissionId = 1296;
    priceShown();

    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, blob] = beacon.mock.calls[0]!;
    expect(url).toBe("/api/analytics-event");
    expect(blob).toBeInstanceOf(Blob);
  });

  it("carries the submission id and a CSRF token in the body", async () => {
    declineConsent();
    (window as unknown as Record<string, unknown>).__loveiqReportSubmissionId = 1296;
    priceShown();
    const body = JSON.parse(await (beacon.mock.calls[0]![1] as Blob).text()) as {
      submission_id: number;
      event_type: string;
      _csrf: string;
    };
    expect(body.submission_id).toBe(1296);
    expect(body.event_type).toBe("locked_card_price_shown");
    expect(body._csrf).toBe("tok123");
  });

  /**
   * Declined: since 15 Oct 2026 (owner decision, measure everyone) Google's own tag still
   * gets the event, as a cookieless ping under the banner's denied signal (Google Consent
   * Mode); the tag manager's push, which feeds pixels with no cookieless mode, stays held
   * behind consent.
   */
  it("sends Google's tag a cookieless event but the tag manager nothing when consent was declined", () => {
    declineConsent();
    (window as unknown as Record<string, unknown>).__loveiqReportSubmissionId = 1296;
    priceShown();

    expect(beacon).toHaveBeenCalledTimes(1); // ours
    expect(
      gtag.mock.calls.some((c) => c[0] === "event" && c[1] === "locked_card_price_shown")
    ).toBe(true);
    expect(dataLayer()).toHaveLength(0); // the tag manager's
  });

  it("sends to GA4 as well once consent is granted", () => {
    grantConsent();
    (window as unknown as Record<string, unknown>).__loveiqReportSubmissionId = 1296;
    priceShown();

    expect(beacon).toHaveBeenCalledTimes(1);
    expect(dataLayer().length).toBeGreaterThan(0);
  });

  const conversionCalls = () =>
    gtag.mock.calls.filter((c) => c[0] === "event" && c[1] === "conversion");

  it("fires the Google Ads conversion without advertising consent too (a cookieless ping)", () => {
    // analytics:yes but advertisement:no: since 15 Oct 2026 the conversion still goes, and the
    // banner's denied signal makes it cookieless for Google Ads to model.
    grantConsent();
    client.trackGoogleAdsPurchaseConversion({
      value: 29,
      currency: "EUR",
      transaction_id: "cs_test_1",
    });
    expect(conversionCalls()).toHaveLength(1);
  });

  it("sends a declining buyer's purchase to Google's tag and Ads, never to the tag manager", () => {
    declineConsent();
    client.trackReportPurchase({ value: 29, currency: "EUR", transaction_id: "cs_test_2" });
    const purchase = gtag.mock.calls.find((c) => c[0] === "event" && c[1] === "purchase");
    expect(purchase?.[2]).toMatchObject({
      transaction_id: "cs_test_2",
      value: 29,
      currency: "EUR",
    });
    expect(conversionCalls()).toHaveLength(1);
    expect(dataLayer()).toHaveLength(0);
    // A comp is still never sent, consent or not.
    gtag.mockClear();
    client.trackReportPurchase({ value: 0, currency: "EUR", transaction_id: "cs_test_3" });
    expect(gtag).not.toHaveBeenCalled();
  });

  it("fires the Google Ads conversion once the advertisement category is granted", () => {
    grantAllConsent();
    client.trackGoogleAdsPurchaseConversion({
      value: 29,
      currency: "EUR",
      transaction_id: "cs_test_1",
    });
    expect(conversionCalls()).toHaveLength(1);
  });

  it("reaches PostHog either way, which was already the case", () => {
    declineConsent();
    (window as unknown as Record<string, unknown>).__loveiqReportSubmissionId = 1296;
    priceShown();
    expect(ph.capture).toHaveBeenCalledWith("locked_card_price_shown", expect.any(Object));
  });

  /**
   * Unchanged rule, and the reason it survives the gate removal: the admin
   * timeline keys off `submission_id`, so an event with no submission context
   * has nowhere to land. UX signals on the landing page legitimately have none.
   */
  it("still writes nothing without a submission context", () => {
    declineConsent();
    client.trackScrollDepth(25, { pathname: "/", max_scroll_pct: 28 });
    expect(beacon).not.toHaveBeenCalled();
  });

  /**
   * The holding queue is gone with the gate. It polled for two minutes and
   * dropped whatever a visitor never answered; nothing should be waiting now.
   */
  it("holds no timer open waiting for an answer", () => {
    declineConsent();
    (window as unknown as Record<string, unknown>).__loveiqReportSubmissionId = 1296;
    priceShown();
    expect(vi.getTimerCount()).toBe(0);
    expect(beacon).toHaveBeenCalledTimes(1);
  });
});

/**
 * Reading per chapter describes someone reading about their sex life, so it goes to our
 * own table and nowhere else: not GA4 and not PostHog, even with every consent given. The
 * granted consent is what makes this a real test: a GA4 event would fire with it.
 */
describe("reading per chapter stays in our own table", () => {
  it("writes the row, and sends nothing to GA4 or PostHog", async () => {
    grantAllConsent();
    (window as unknown as Record<string, unknown>).__loveiqReportSubmissionId = 1296;
    client.persistReportChapterStats({
      archetype: "Spark Seeker",
      chapters: { typical_beliefs: { ms: 4000, open: 1 } },
    });

    expect(beacon).toHaveBeenCalledTimes(1);
    const body = JSON.parse(await (beacon.mock.calls[0]![1] as Blob).text()) as {
      event_type: string;
      metadata: Record<string, unknown>;
    };
    expect(body.event_type).toBe("report_chapter_stats");
    expect(body.metadata).toMatchObject({
      archetype: "Spark Seeker",
      chapters: { typical_beliefs: { ms: 4000, open: 1 } },
    });
    expect(dataLayer()).toHaveLength(0);
    expect(gtag).not.toHaveBeenCalled();
    expect(ph.capture).not.toHaveBeenCalled();
  });

  it("while the wizard's Skip Intro goes everywhere its slide moves go", () => {
    grantConsent();
    (window as unknown as Record<string, unknown>).__loveiqReportSubmissionId = 1296;
    client.trackWizardSkipped({ from_slide: 1, map_step: 2 });
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(ph.capture).toHaveBeenCalledWith("wizard_skipped", { from_slide: 1, map_step: 2 });
    expect(dataLayer()).toContainEqual({ event: "wizard_skipped", from_slide: 1, map_step: 2 });
  });
});
