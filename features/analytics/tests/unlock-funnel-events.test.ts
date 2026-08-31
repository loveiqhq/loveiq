// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so the vi.mock factory below closes over the same spies.
const ph = vi.hoisted(() => ({
  capture: vi.fn(),
  register: vi.fn(),
  identify: vi.fn(),
  init: vi.fn(),
}));
vi.mock("posthog-js", () => ({ default: ph }));

const grantAnalyticsConsent = () => {
  document.cookie =
    "cookieyes-consent=consent:yes,action:yes,necessary:yes,analytics:yes,advertisement:no; path=/";
};

type Client = typeof import("@features/analytics/client");
let client: Client;

beforeEach(async () => {
  vi.clearAllMocks();
  // track() gates on isProductionSite() — build-time, replacing the lazyOnload-race
  // window flag. Without these the assertions below would pass on an early return.
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.loveiq.org");
  vi.resetModules();
  document.cookie = "cookieyes-consent=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  client = await import("@features/analytics/client");
  window.gtag = vi.fn() as unknown as typeof window.gtag;
  // client.ts holds gtag calls until gtag.js has initialised; this is the marker
  // it sets, and these assertions describe a page where it has loaded.
  window.google_tag_manager = { "G-QTYY69L46N": {} };
  window.dataLayer = [];
  grantAnalyticsConsent();
  // No submission context: keeps durable persistence out of these assertions, which
  // are about what reaches GA4 / PostHog.
  client.setReportSubmissionContext(null);
});

afterEach(() => vi.unstubAllEnvs());

const captured = (name: string) => ph.capture.mock.calls.filter(([n]) => n === name);

/**
 * The two funnel events marketing asked for (2026-08-27), so the drop-off between
 * reading the report and paying is measurable and both can be fed to Google Ads as
 * secondary conversion signals.
 */
describe("begin_checkout carries a monetary value", () => {
  it("sends GA4's value + items alongside the original price", () => {
    client.trackBeginCheckout("full_report", 39.99, "EUR");

    const [[, params]] = captured("begin_checkout") as Array<[string, Record<string, unknown>]>;
    // The defect this pins: GA4 and Google Ads read `value`. Sending only `price`
    // made every begin_checkout arrive counted but worth nothing.
    expect(params.value).toBe(39.99);
    expect(params.currency).toBe("EUR");
    // `price` stays — the admin submission timeline renders metadata.price.
    expect(params.price).toBe(39.99);
    expect(params.items).toEqual([
      { item_id: "full_report", item_name: "full_report", price: 39.99, quantity: 1 },
    ]);
  });

  it("still fires when the price is unknown — the value drops, the event does not", () => {
    /**
     * The regression this pins, measured 2026-08-27.
     *
     * Every checkout surface used to read
     *     const quote = quotes?.[plan];
     *     if (quote) trackBeginCheckout(...)
     *     onUnlock(plan)          // ← ran regardless
     * so a click on a plan missing from the client-side quote map sent the buyer to
     * Stripe and recorded nothing at all. When pricing 2.0 split one plan into three
     * on 3 Aug, GA4 begin_checkout fell 137 -> 22 and our analytics_event fell ~78 ->
     * 10 in the same week that price_shown DOUBLED and payments held steady. Two
     * independent pipelines agreeing is what ruled out a persistence bug.
     *
     * An unpriced checkout start is still a checkout start. Counting it is the whole
     * point of the event; the money is secondary.
     */
    client.trackBeginCheckout("all_reports", null, null);

    const [[, params]] = captured("begin_checkout") as Array<[string, Record<string, unknown>]>;
    expect(params.plan).toBe("all_reports");
    // No invented money: absent rather than 0, which would understate revenue.
    expect(params).not.toHaveProperty("value");
    expect(params).not.toHaveProperty("price");
    expect(params).not.toHaveProperty("items");
    expect(params.currency).toBe("EUR");
  });

  /**
   * Source-level, following the pattern in ReportPage.paywallTrigger.test.ts and for
   * the same reason: the pricing modal is always mounted and only styled open, which
   * jsdom cannot distinguish. The behaviour is covered in a real browser by
   * `npm run qa:report`.
   *
   * These are deliberately sharp rather than "does the call exist". Mutation testing
   * killed the first version: re-adding `if (quote)` in front of the call — the exact
   * bug that collapsed the metric on 3 Aug — left it passing.
   */
  it("counts begin_checkout UNCONDITIONALLY at the only door to Stripe", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const src = readFileSync(join(process.cwd(), "features/report/ui/ReportPage.tsx"), "utf8");

    // Isolate the beginCheckout function body by brace matching.
    const at = src.indexOf("const beginCheckout = (plan: ReportPurchasePlanId");
    expect(at, "ReportPage.beginCheckout not found").toBeGreaterThan(-1);
    let depth = 0;
    let i = src.indexOf("{", at);
    const bodyStart = i;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) break;
    }
    const body = src.slice(bodyStart, i);

    const callAt = body.indexOf("trackBeginCheckout(");
    expect(callAt, "beginCheckout must count the event").toBeGreaterThan(-1);

    // THE assertion. Nothing conditional may precede it: an unpriced or
    // unrecognised plan still reached Stripe, so it must still be counted.
    const firstBranch = body.search(/\bif\s*\(/);
    if (firstBranch !== -1) {
      expect(
        callAt,
        "trackBeginCheckout must not sit behind a condition — that is the 3 Aug regression"
      ).toBeLessThan(firstBranch);
    }

    // And it must pass a null-tolerant price rather than reading through the quote.
    const call = body.slice(callAt, body.indexOf(";", callAt));
    expect(call).toContain("null");

    // The surfaces must NOT count it themselves — per-surface counting is what
    // let it be forgotten when pricing 2.0 split one plan into three.
    for (const f of [
      "features/report/ui/ReportPricingModal.tsx",
      "features/report/ui/ReportStickyUnlockBar.tsx",
    ]) {
      expect(
        readFileSync(join(process.cwd(), f), "utf8"),
        `${f} must not fire begin_checkout itself`
      ).not.toContain("trackBeginCheckout(");
    }
  });

  it("reaches gtag with the value, not just the dataLayer", () => {
    client.trackBeginCheckout("essentials", 19, "EUR");
    expect(window.gtag).toHaveBeenCalledWith(
      "event",
      "begin_checkout",
      expect.objectContaining({ value: 19, currency: "EUR" })
    );
  });
});

describe("unlock_click is one canonical event across every unlock surface", () => {
  it("fires for a locked-section click, tagged with the surface", () => {
    client.trackPaywallInitiated({
      source: "lock_click",
      section_id: "beliefs",
      archetype: "Spiritual Lover",
      plan_needed: "full_report",
    });

    expect(captured("paywall_initiated")).toHaveLength(1);
    const [[, params]] = captured("unlock_click") as Array<[string, Record<string, unknown>]>;
    expect(params).toEqual({
      surface: "lock_click",
      section_id: "beliefs",
      archetype: "Spiritual Lover",
      plan_needed: "full_report",
    });
  });

  it("fires for the sticky bar, which never opens the paywall", () => {
    // The sticky bar goes straight to checkout, so it is the one unlock CTA that
    // does not route through trackPaywallInitiated.
    client.trackStickyUnlockClicked({ variant: "mobile", archetype: "Loyal Ritualist" });

    const [[, params]] = captured("unlock_click") as Array<[string, Record<string, unknown>]>;
    expect(params).toEqual({
      surface: "sticky_bar",
      variant: "mobile",
      archetype: "Loyal Ritualist",
    });
  });

  it("fires exactly once per click, never twice", () => {
    // The reason it hangs off trackPaywallInitiated and trackStickyUnlockClicked
    // and NOT off trackLockIconClicked: a locked-section click fires the lock-icon
    // event AND paywall_initiated, so hooking all three would double-count the
    // step that Google Ads would be bidding on.
    client.trackLockIconClicked({ section_id: "beliefs", plan_needed: "full_report" });
    client.trackPaywallInitiated({ source: "lock_click", section_id: "beliefs" });

    expect(captured("lock_icon_clicked")).toHaveLength(1);
    expect(captured("unlock_click")).toHaveLength(1);
  });

  it("covers every paywall-initiated source, so a new CTA cannot be forgotten", () => {
    const sources = [
      "lock_click",
      "archetype_unlock",
      "offer_link",
      "archetype_breakdown_footer",
    ] as const;
    for (const source of sources) {
      ph.capture.mockClear();
      client.trackPaywallInitiated({ source });
      const [[, params]] = captured("unlock_click") as Array<[string, Record<string, unknown>]>;
      expect(params.surface, source).toBe(source);
    }
  });

  it("is not written to analytics_event — the granular events already are", async () => {
    // Persisting it too would put two rows on the same click and double the step in
    // the internal funnel that the digest's leak scoring reads.
    const beacons: Blob[] = [];
    Object.defineProperty(navigator, "sendBeacon", {
      value: (_url: string, body: Blob) => {
        beacons.push(body);
        return true;
      },
      configurable: true,
    });
    document.cookie = "__csrf=tok; path=/";
    client.setReportSubmissionContext(1648);

    client.trackPaywallInitiated({ source: "lock_click" });

    const types = await Promise.all(
      beacons.map(async (b) => (JSON.parse(await b.text()) as { event_type: string }).event_type)
    );
    // The click DID persist — under its granular name, exactly once.
    expect(types).toEqual(["paywall_initiated"]);
    expect(types).not.toContain("unlock_click");
  });
});
