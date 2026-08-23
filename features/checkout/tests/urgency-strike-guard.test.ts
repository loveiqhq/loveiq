// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  getReportPurchaseBadgeFromPrice,
  getReportPurchaseSaveCents,
  getReportPurchaseStrikePrice,
} from "@features/checkout/server/reportPurchase";

/**
 * What the surcharge does to the struck-through anchor.
 *
 * Group B's full report is priced AT its own MSRP (29.00 against a 29.00 anchor), so
 * once two euros are added the charged price overtakes the anchor. Left alone, the card
 * would read "€31.00" with "€29.00" struck through beside it — an advertisement for the
 * cheaper past, and arguably a misleading price claim.
 */
describe("strike and save with the urgency surcharge applied", () => {
  it("keeps the anchor while it is still above the charged price", () => {
    // Group A: 14.99 anchored at 49.99, +2 → 16.99. The anchor is still real.
    expect(getReportPurchaseStrikePrice(4999, 1699)).toBe("€49.99");
    expect(getReportPurchaseBadgeFromPrice({ strikeCents: 4999, currentCents: 1699 })).toBe(
      "66% OFF"
    );
    expect(getReportPurchaseSaveCents({ strikeCents: 4999, currentCents: 1699 })).toBe(3300);
  });

  it("drops the anchor when the surcharge overtakes it (Group B's full report)", () => {
    // 29.00 charged at a 29.00 anchor, +2 → 31.00.
    expect(getReportPurchaseStrikePrice(2900, 3100)).toBeNull();
    expect(getReportPurchaseBadgeFromPrice({ strikeCents: 2900, currentCents: 3100 })).toBeNull();
    expect(getReportPurchaseSaveCents({ strikeCents: 2900, currentCents: 3100 })).toBeNull();
  });

  it("drops the anchor when it exactly equals the charged price", () => {
    expect(getReportPurchaseStrikePrice(2900, 2900)).toBeNull();
    expect(getReportPurchaseSaveCents({ strikeCents: 2900, currentCents: 2900 })).toBeNull();
  });

  it("still formats an anchor for callers with no price to compare against", () => {
    // The checkout page renders a strike from the static catalogue before its quote
    // arrives; that call has nothing to compare and must keep working.
    expect(getReportPurchaseStrikePrice(4999)).toBe("€49.99");
    expect(getReportPurchaseStrikePrice(0)).toBeNull();
    expect(getReportPurchaseStrikePrice(null)).toBeNull();
  });

  it("the discount percentage shrinks rather than lying", () => {
    // Same anchor, two euros dearer: 70% off becomes 66% off. The badge is derived from
    // the charged price, so it cannot advertise a discount nobody is getting.
    expect(getReportPurchaseBadgeFromPrice({ strikeCents: 4999, currentCents: 1499 })).toBe(
      "70% OFF"
    );
    expect(getReportPurchaseBadgeFromPrice({ strikeCents: 4999, currentCents: 1699 })).toBe(
      "66% OFF"
    );
  });
});

describe("the checkout quote cache and the urgency window", () => {
  it("drops a quote cached before the window closed", async () => {
    // Otherwise /checkout would show the pre-surcharge figure from sessionStorage while
    // the checkout POST re-derived and charged the surcharged one.
    const { cacheReportCheckoutQuote, getCachedReportCheckoutQuote } =
      await import("@features/checkout/server/reportCheckoutQuoteCache");
    const base = {
      id: 1,
      plan: "full_report" as const,
      currency: "EUR" as const,
      currentPriceCents: 999,
      chargedPriceCents: 999,
      surchargeCents: 0,
      initialPriceCents: 999,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    };

    // window still open → the entry is usable
    cacheReportCheckoutQuote({
      plan: "full_report",
      quote: { ...base, urgencyDeadlineAt: new Date(Date.now() + 60_000).toISOString() } as never,
      sessionId: null,
      token: "rpt_ABCDEFGHIJKLMNOPQRST",
    });
    expect(
      getCachedReportCheckoutQuote({
        plan: "full_report",
        sessionId: null,
        token: "rpt_ABCDEFGHIJKLMNOPQRST",
      })
    ).not.toBeNull();

    // window closed while it sat there → stale, so the page refetches
    cacheReportCheckoutQuote({
      plan: "full_report",
      quote: { ...base, urgencyDeadlineAt: new Date(Date.now() - 60_000).toISOString() } as never,
      sessionId: null,
      token: "rpt_ABCDEFGHIJKLMNOPQRST",
    });
    expect(
      getCachedReportCheckoutQuote({
        plan: "full_report",
        sessionId: null,
        token: "rpt_ABCDEFGHIJKLMNOPQRST",
      })
    ).toBeNull();
  });

  it("keeps a quote that already carries the surcharge", async () => {
    const { cacheReportCheckoutQuote, getCachedReportCheckoutQuote } =
      await import("@features/checkout/server/reportCheckoutQuoteCache");
    cacheReportCheckoutQuote({
      plan: "core",
      quote: {
        id: 2,
        plan: "core",
        currency: "EUR",
        currentPriceCents: 1999,
        chargedPriceCents: 2199,
        surchargeCents: 200,
        initialPriceCents: 1999,
        urgencyDeadlineAt: new Date(Date.now() - 60_000).toISOString(),
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      } as never,
      sessionId: null,
      token: "rpt_ABCDEFGHIJKLMNOPQRST",
    });
    expect(
      getCachedReportCheckoutQuote({
        plan: "core",
        sessionId: null,
        token: "rpt_ABCDEFGHIJKLMNOPQRST",
      })?.chargedPriceCents
    ).toBe(2199);
  });
});
