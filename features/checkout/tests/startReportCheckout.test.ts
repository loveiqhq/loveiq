// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCapture = vi.fn();
vi.mock("posthog-js", () => ({ default: { capture: (...a: unknown[]) => mockCapture(...a) } }));
vi.mock("@shared/http/csrf-client", () => ({ getCsrfToken: () => "csrf-token" }));
vi.mock("@features/analytics/client", () => ({
  getGaMeasurementContext: () => ({
    clientId: "ga-client",
    sessionId: "ga-session",
    consent: true,
  }),
}));
vi.mock("@features/survey/ui/hooks/surveySession", () => ({
  getReportNurturePromo: () => "PROMO50",
  getReportPricingSessionId: () => "550e8400-e29b-41d4-a716-446655440111",
}));

import { startReportCheckout } from "@features/checkout/ui/startReportCheckout";

/**
 * The single door to Stripe, since the `/checkout` review page was removed on
 * 2026-08-31. It is the only thing between an unlock click and a charge, so what
 * is asserted here is what used to be spread across that page's six tests:
 * the quote the reader saw is the quote sent, every failure mode is reported
 * rather than swallowed, and a failure never navigates.
 */
const QUOTE = {
  id: 22,
  plan: "full_report" as const,
  currency: "EUR" as const,
  chargedPriceCents: 2900,
} as never;

const assign = vi.fn();
let originalLocation: Location;

beforeEach(() => {
  vi.clearAllMocks();
  originalLocation = window.location;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, assign },
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});

function respond(body: unknown, ok = true) {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok, json: async () => body } as Response);
}

describe("startReportCheckout", () => {
  it("sends the reader's own quote id and navigates to Stripe", async () => {
    respond({ enabled: true, url: "https://checkout.stripe.com/c/pay/cs_1" });

    const result = await startReportCheckout({
      archetype: "Spark Seeker",
      plan: "full_report",
      quote: QUOTE,
      token: "rpt_ABCDEFGHIJKLMNOPQRST",
    });

    expect(result).toBeNull();
    const body = JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0]![1]!.body as string);
    // quoteId is the whole point: the server re-derives the price from THIS row,
    // so the amount charged is the amount that was on screen.
    expect(body.quoteId).toBe(22);
    expect(body.plan).toBe("full_report");
    expect(body.archetype).toBe("Spark Seeker");
    expect(body.reportToken).toBe("rpt_ABCDEFGHIJKLMNOPQRST");
    // A token checkout must not also claim a session — the server picks one.
    expect(body.reportSessionId).toBeNull();
    // Consent + GA ids ride along so the webhook can replay the purchase.
    expect(body.gaConsent).toBe(true);
    expect(body.gaClientId).toBe("ga-client");
    expect(body.promo).toBe("PROMO50");
    expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_1");
    expect(mockCapture).toHaveBeenCalledWith("checkout_started", {
      currency: "EUR",
      plan: "full_report",
    });
  });

  it("uses the report session when there is no token", async () => {
    respond({ enabled: true, url: "https://checkout.stripe.com/c/pay/cs_2" });

    await startReportCheckout({
      plan: "core",
      quote: QUOTE,
      reportSessionId: "02d88f31-eceb-4402-940d-c8cd98d01848",
      token: null,
    });

    const body = JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0]![1]!.body as string);
    expect(body.reportSessionId).toBe("02d88f31-eceb-4402-940d-c8cd98d01848");
    expect(body.reportToken).toBeNull();
  });

  // The two guards below assert their exact MESSAGE, not just `status: "error"`.
  // Both sit inside the try/catch, so deleting either one still produces an
  // "error" result — from the crash rather than the guard — and a status-only
  // assertion passes on a mutant. The message is the only thing that separates
  // "we refused" from "we blew up".
  it("refuses without a report context, and never calls Stripe", async () => {
    globalThis.fetch = vi.fn();
    const result = await startReportCheckout({ plan: "full_report", quote: QUOTE, token: null });

    expect(result).toEqual({
      status: "error",
      message: "This checkout is tied to a saved report. Open your report again and retry.",
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("refuses without a quote rather than letting the server invent a price", async () => {
    globalThis.fetch = vi.fn();
    const result = await startReportCheckout({
      plan: "full_report",
      quote: null,
      token: "rpt_ABCDEFGHIJKLMNOPQRST",
    });

    expect(result).toEqual({
      status: "error",
      message: "We're still preparing your price. Try again in a moment.",
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("reports a disabled checkout as disabled, not as an error", async () => {
    // The environment has payments switched off. That is a message to show, not
    // a failure to retry — the old /checkout page drew the same distinction.
    respond({ enabled: false, message: "Checkout preview only." });

    const result = await startReportCheckout({
      plan: "full_report",
      quote: QUOTE,
      token: "rpt_ABCDEFGHIJKLMNOPQRST",
    });

    expect(result).toEqual({ status: "disabled", message: "Checkout preview only." });
    expect(assign).not.toHaveBeenCalled();
  });

  it("surfaces the server's own error text on a non-2xx", async () => {
    respond({ error: "Please try again later." }, false);

    const result = await startReportCheckout({
      plan: "full_report",
      quote: QUOTE,
      token: "rpt_ABCDEFGHIJKLMNOPQRST",
    });

    expect(result).toEqual({ status: "error", message: "Please try again later." });
    expect(assign).not.toHaveBeenCalled();
  });

  it("errors rather than navigating when Stripe returns no url", async () => {
    respond({ enabled: true });

    const result = await startReportCheckout({
      plan: "full_report",
      quote: QUOTE,
      token: "rpt_ABCDEFGHIJKLMNOPQRST",
    });

    expect(result?.status).toBe("error");
    expect(assign).not.toHaveBeenCalled();
    // No half-conversion: nothing is counted as started if nothing started.
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("survives the network being down", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("offline"));

    const result = await startReportCheckout({
      plan: "full_report",
      quote: QUOTE,
      token: "rpt_ABCDEFGHIJKLMNOPQRST",
    });

    expect(result?.status).toBe("error");
    expect(assign).not.toHaveBeenCalled();
  });
});
