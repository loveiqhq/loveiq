// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  cacheReportCheckoutQuote,
  getCachedReportCheckoutQuote,
} from "@features/checkout/server/reportCheckoutQuoteCache";

/**
 * The sessionStorage hand-off between /report and /checkout.
 *
 * Everything this rejects, it rejects so the two pages cannot disagree about the
 * price: a stale, malformed or wrong-plan entry costs one fetch from `/api/price`,
 * whereas honouring one would show a number the checkout POST does not charge.
 *
 * These used to live in urgency-strike-guard.test.ts alongside the +2 EUR surcharge's
 * own staleness rule; that surcharge was removed on 2026-08-31 and the rest of the
 * cache's contract came here rather than going with it.
 */
const TOKEN = "rpt_ABCDEFGHIJKLMNOPQRST";

function makeQuote(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    plan: "full_report" as const,
    currency: "EUR" as const,
    currentPriceCents: 2900,
    chargedPriceCents: 2900,
    initialPriceCents: 2900,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    ...overrides,
  } as never;
}

const read = (plan: "full_report" | "core" = "full_report") =>
  getCachedReportCheckoutQuote({ plan, sessionId: null, token: TOKEN });

beforeEach(() => sessionStorage.clear());

describe("report checkout quote cache", () => {
  it("round-trips a quote for the same token and plan", () => {
    cacheReportCheckoutQuote({
      plan: "full_report",
      quote: makeQuote(),
      sessionId: null,
      token: TOKEN,
    });
    expect(read()?.chargedPriceCents).toBe(2900);
  });

  it("keys per plan, so one plan's price is never served for another", () => {
    cacheReportCheckoutQuote({
      plan: "full_report",
      quote: makeQuote(),
      sessionId: null,
      token: TOKEN,
    });
    expect(read("core")).toBeNull();
  });

  it("keys per report, so another report's quote is never served", () => {
    cacheReportCheckoutQuote({
      plan: "full_report",
      quote: makeQuote(),
      sessionId: null,
      token: TOKEN,
    });
    expect(
      getCachedReportCheckoutQuote({
        plan: "full_report",
        sessionId: null,
        token: "rpt_ZZZZZZZZZZZZZZZZZZZZ",
      })
    ).toBeNull();
  });

  it("falls back to the session id when there is no token, and to nothing with neither", () => {
    cacheReportCheckoutQuote({
      plan: "full_report",
      quote: makeQuote(),
      sessionId: "sess-1",
      token: null,
    });
    expect(
      getCachedReportCheckoutQuote({ plan: "full_report", sessionId: "sess-1", token: null })
    ).not.toBeNull();
    // No key at all: nothing is written and nothing is read.
    cacheReportCheckoutQuote({
      plan: "core",
      quote: makeQuote({ plan: "core" }),
      sessionId: null,
      token: null,
    });
    expect(getCachedReportCheckoutQuote({ plan: "core", sessionId: null, token: null })).toBeNull();
  });

  it("rejects an expired quote", () => {
    cacheReportCheckoutQuote({
      plan: "full_report",
      quote: makeQuote({ expiresAt: new Date(Date.now() - 1_000).toISOString() }),
      sessionId: null,
      token: TOKEN,
    });
    expect(read()).toBeNull();
  });

  it("rejects an entry with no charged price rather than guessing one", () => {
    // `chargedPriceCents` is the number the Stripe line item uses. An older entry
    // written before it existed has nothing to render, so it must not be honoured.
    const { chargedPriceCents: _dropped, ...withoutCharged } = makeQuote() as Record<
      string,
      unknown
    >;
    cacheReportCheckoutQuote({
      plan: "full_report",
      quote: withoutCharged as never,
      sessionId: null,
      token: TOKEN,
    });
    expect(read()).toBeNull();
  });

  it("rejects a corrupt entry instead of throwing", () => {
    sessionStorage.setItem(`loveiq-report-checkout-quote:token:${TOKEN}:full_report`, "{not json");
    expect(read()).toBeNull();
  });
});
