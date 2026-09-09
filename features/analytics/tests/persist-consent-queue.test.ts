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

const grantConsent = () => {
  document.cookie =
    "cookieyes-consent=consent:yes,action:yes,necessary:yes,analytics:yes,advertisement:no; path=/";
};
const clearConsent = () => {
  document.cookie = "cookieyes-consent=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
};

beforeEach(async () => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.loveiq.org");
  vi.resetModules();
  clearConsent();
  // jsdom on an http origin refuses a __Host- prefixed cookie; the client also
  // accepts the __csrf fallback.
  document.cookie = "__csrf=tok123; path=/";
  beacon = vi.fn().mockReturnValue(true);
  Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beacon });
  client = await import("@features/analytics/client");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  delete (window as unknown as Record<string, unknown>).__loveiqReportSubmissionId;
});

/**
 * The consent banner covers the page for the first seconds of every visit, so a
 * persisted event fired on mount was always dropped — and a caller holding a
 * one-shot ref never fired again. Measured on production:
 * `locked_card_price_shown` reached PostHog 331 times across 276 sessions while
 * writing ZERO rows to `analytics_event` for five weeks.
 */
describe("persisted events survive a consent banner answered late", () => {
  it("does not send while consent is missing", () => {
    (window as unknown as Record<string, unknown>).__loveiqReportSubmissionId = 1296;
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
    expect(beacon).not.toHaveBeenCalled();
    // PostHog is deliberately NOT consent-gated on this site, so it still gets it.
    expect(ph.capture).toHaveBeenCalledWith("locked_card_price_shown", expect.any(Object));
  });

  it("sends it once consent is granted, without the caller firing again", () => {
    (window as unknown as Record<string, unknown>).__loveiqReportSubmissionId = 1296;
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
    expect(beacon).not.toHaveBeenCalled();

    grantConsent();
    vi.advanceTimersByTime(2_000);

    expect(beacon).toHaveBeenCalledTimes(1);
    const [url] = beacon.mock.calls[0]!;
    expect(url).toBe("/api/analytics-event");
  });

  it("gives up rather than leaving a timer running for a visitor who never answers", () => {
    (window as unknown as Record<string, unknown>).__loveiqReportSubmissionId = 1296;
    client.trackReportViewed("locked", "Spiritual Lover");
    expect(beacon).not.toHaveBeenCalled();

    // Well past the bounded window.
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(beacon).not.toHaveBeenCalled();
    // And a late consent must not resurrect it — the queue was cleared.
    grantConsent();
    vi.advanceTimersByTime(10_000);
    expect(beacon).not.toHaveBeenCalled();
  });

  it("does not even start a poll for events with no submission context", () => {
    // UX signals on the landing page legitimately have none. Queueing them
    // would hold a timer open on every visit for nothing, and the beacon
    // assertion alone cannot see that — a queued context-less event is dropped
    // on drain either way. So assert the timer.
    expect(vi.getTimerCount()).toBe(0);
    client.trackScrollDepth(25, { pathname: "/", max_scroll_pct: 28 });
    expect(vi.getTimerCount()).toBe(0);

    grantConsent();
    vi.advanceTimersByTime(5_000);
    expect(beacon).not.toHaveBeenCalled();
  });

  it("starts exactly one poll however many events queue up", () => {
    (window as unknown as Record<string, unknown>).__loveiqReportSubmissionId = 1296;
    client.trackReportViewed("locked", "Spiritual Lover");
    client.trackReportViewed("locked", "Explorer of Edges");
    client.trackReportViewed("essentials", "Spiritual Lover");
    expect(vi.getTimerCount()).toBe(1);

    grantConsent();
    vi.advanceTimersByTime(2_000);
    // All three land, and the timer is cleaned up.
    expect(beacon).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("still sends immediately when consent is already in place", () => {
    grantConsent();
    (window as unknown as Record<string, unknown>).__loveiqReportSubmissionId = 1296;
    client.trackReportViewed("locked", "Spiritual Lover");
    expect(beacon).toHaveBeenCalledTimes(1);
  });
});
