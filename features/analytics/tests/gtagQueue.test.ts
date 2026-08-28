// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The gtag delivery queue.
 *
 * Why it exists, measured on production 2026-08-28: an event pushed during hydration
 * never reaches GA4, while the identical call once gtag.js has loaded sends
 * immediately. `landing_page_view` and `experiment_exposure` fire from the landing
 * page's mount effect, so they had never once been recorded — 0 in GA4 every day for
 * nine days against ~100 sessions landing on `/` a day — while interaction events on
 * the same code path arrived fine.
 *
 * Hoisting `gtag('config')` out of lazyOnload the same day was a prerequisite but
 * only narrowed the loss to a race, and the race was still being lost.
 */
const GA4_ID = "G-QTYY69L46N";

const setAnalyticsConsent = () => {
  document.cookie = `cookieyes-consent=${["consent:yes", "action:yes", "necessary:yes", "analytics:yes", "advertisement:yes"].join(",")}; path=/`;
};

/**
 * A window where gtag.js has NOT yet initialised — no `google_tag_manager` entry.
 *
 * Must be called AFTER importing the client: posthog-js initialises at import time
 * and needs the real jsdom window, which this plain-object stub is not.
 */
const stubWindowBeforeGtagJs = (gtag: ReturnType<typeof vi.fn>) => {
  globalThis.window = {
    ...globalThis.window,
    gtag,
    dataLayer: [],
  } as typeof globalThis.window;
};

/** gtag.js finishing its init: this is the marker it sets, per destination. */
const gtagJsLoads = () => {
  (
    globalThis.window as unknown as { google_tag_manager: Record<string, unknown> }
  ).google_tag_manager = { [GA4_ID]: {} };
};

describe("gtag delivery queue", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.loveiq.org");
    setAnalyticsConsent();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    globalThis.window = originalWindow;
    document.cookie = "cookieyes-consent=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  });

  it("holds an event fired before gtag.js is live, then delivers it", async () => {
    const gtag = vi.fn();
    const { track } = await import("@features/analytics/client");
    stubWindowBeforeGtagJs(gtag);

    track("landing_page_view");
    // This is the whole bug: a direct call here is thrown away, so it must NOT
    // have gone out yet.
    expect(gtag).not.toHaveBeenCalled();

    gtagJsLoads();
    vi.advanceTimersByTime(300);

    expect(gtag).toHaveBeenCalledWith("event", "landing_page_view", undefined);
  });

  it("delivers straight away once gtag.js is already live", async () => {
    const gtag = vi.fn();
    const { track } = await import("@features/analytics/client");
    stubWindowBeforeGtagJs(gtag);
    gtagJsLoads();

    track("price_shown", { plan: "full_report" });
    // No timer advance: interaction events must not be delayed by the queue.
    expect(gtag).toHaveBeenCalledWith("event", "price_shown", { plan: "full_report" });
  });

  it("replays in order, so user properties still decorate their event", async () => {
    /**
     * Order is not cosmetic. `set user_properties` replayed AFTER the event it was
     * meant to segment would leave that event undecorated, which is how a
     * landing-arm breakdown quietly becomes all-(not set).
     */
    const gtag = vi.fn();
    const mod = await import("@features/analytics/client");
    stubWindowBeforeGtagJs(gtag);

    mod.setLandingVariant("white");
    mod.track("landing_page_view");
    expect(gtag).not.toHaveBeenCalled();

    gtagJsLoads();
    vi.advanceTimersByTime(300);

    expect(gtag.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ["set", "user_properties"],
      ["event", "landing_page_view"],
    ]);
  });

  it("gives up if gtag.js never arrives, rather than queueing forever", async () => {
    // Ad blocker, analytics consent withheld, or the script 404s. The page must not
    // accumulate calls or throw; the data is simply lost, which is already the case.
    const gtag = vi.fn();
    const { track } = await import("@features/analytics/client");
    stubWindowBeforeGtagJs(gtag);

    for (let i = 0; i < 5; i++) track(`ev_${i}`);
    expect(gtag).not.toHaveBeenCalled();

    expect(() => vi.advanceTimersByTime(60_000)).not.toThrow();
    expect(gtag).not.toHaveBeenCalled();

    // ...and the retry loop has stopped, so it is not still ticking every 250ms.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("still pushes to dataLayer immediately, which is GTM's path not gtag's", async () => {
    // The queue is specifically about gtag.js. GTM is present from the page's own
    // script, so the dataLayer object push has never had this problem and must not
    // be delayed with it.
    const gtag = vi.fn();
    const { track } = await import("@features/analytics/client");
    stubWindowBeforeGtagJs(gtag);

    track("landing_page_view");

    expect(globalThis.window.dataLayer).toEqual([{ event: "landing_page_view" }]);
  });
});
