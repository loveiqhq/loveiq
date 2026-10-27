import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logger = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@shared/observability/logger", () => ({ default: logger }));

import type Stripe from "stripe";
import {
  createCheckoutSession,
  resetAutomaticTaxCache,
} from "@features/checkout/server/stripeCheckout";

const PARAMS = {
  mode: "payment",
  line_items: [
    {
      price_data: {
        currency: "eur",
        product_data: { name: "LoveIQ: Your Core Archetype" },
        tax_behavior: "inclusive",
        unit_amount: 199,
      },
      quantity: 1,
    },
  ],
} as Stripe.Checkout.SessionCreateParams;

/** What stripe-node throws for a 400. */
function invalidRequest(param: string, message: string) {
  return Object.assign(new Error(message), { type: "StripeInvalidRequestError", param });
}

function stripeWith(taxStatus: string | Error) {
  const create = vi.fn(async () => ({
    id: "cs_test_1",
    url: "https://checkout.stripe.com/c/pay/cs_test_1",
  }));
  const retrieve = vi.fn(async () => {
    if (taxStatus instanceof Error) throw taxStatus;
    return { status: taxStatus };
  });
  const stripe = {
    checkout: { sessions: { create } },
    tax: { settings: { retrieve } },
  } as unknown as Stripe;
  return { stripe, create, retrieve };
}

beforeEach(() => {
  resetAutomaticTaxCache();
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());

describe("createCheckoutSession: VAT on the receipt (LoveIQ Sync, 12 Oct 2026)", () => {
  it("asks Stripe for automatic tax when the account's tax settings are active", async () => {
    const { stripe, create } = stripeWith("active");
    await createCheckoutSession(stripe, PARAMS, "key-1");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      { ...PARAMS, automatic_tax: { enabled: true } },
      // Its own key: Stripe refuses a reused key whose parameters differ.
      { idempotencyKey: "key-1:tax" }
    );
  });

  it("leaves tax off in a mode whose tax settings are not active (staging's test account)", async () => {
    const { stripe, create } = stripeWith("pending");
    await createCheckoutSession(stripe, PARAMS, "key-1");
    expect(create).toHaveBeenCalledWith(PARAMS, { idempotencyKey: "key-1" });
  });

  it("leaves tax off, and says so, when the tax settings cannot be read", async () => {
    const { stripe, create } = stripeWith(new Error("network down"));
    await createCheckoutSession(stripe, PARAMS, "key-1");
    expect(create).toHaveBeenCalledWith(PARAMS, { idempotencyKey: "key-1" });
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("reads the tax settings once per ten minutes, not once per checkout", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T19:00:00Z"));
    const { stripe, retrieve } = stripeWith("active");
    await createCheckoutSession(stripe, PARAMS, "a");
    await createCheckoutSession(stripe, PARAMS, "b");
    expect(retrieve).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-10-27T19:10:01Z"));
    await createCheckoutSession(stripe, PARAMS, "c");
    expect(retrieve).toHaveBeenCalledTimes(2);
  });

  it("still opens the checkout, without tax and with an alert, when Stripe refuses it over tax", async () => {
    const { stripe, create } = stripeWith("active");
    create.mockRejectedValueOnce(
      invalidRequest("automatic_tax[enabled]", "Stripe Tax has not been activated on your account.")
    );
    const session = await createCheckoutSession(stripe, PARAMS, "key-1");
    expect(session.url).toBe("https://checkout.stripe.com/c/pay/cs_test_1");
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenLastCalledWith(PARAMS, { idempotencyKey: "key-1" });
    // Error level is what reaches #prod-alerts.
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("does not hide any other refusal behind a retry", async () => {
    const { stripe, create } = stripeWith("active");
    create.mockRejectedValueOnce(
      invalidRequest("line_items[0][price_data][unit_amount]", "Invalid integer")
    );
    await expect(createCheckoutSession(stripe, PARAMS, "key-1")).rejects.toThrow("Invalid integer");
    expect(create).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("does not retry a failure that is not a refusal (network, 5xx)", async () => {
    const { stripe, create } = stripeWith("active");
    create.mockRejectedValueOnce(new Error("socket hang up"));
    await expect(createCheckoutSession(stripe, PARAMS, "key-1")).rejects.toThrow("socket hang up");
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("every checkout goes through createCheckoutSession", () => {
  it("no code outside it creates a Checkout Session, so none can skip the VAT", () => {
    const root = process.cwd();
    const callers = ["app", "features", "shared"]
      .flatMap((dir) =>
        (readdirSync(join(root, dir), { recursive: true }) as string[]).map((f) => join(dir, f))
      )
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/(^|\/)tests?\/|\.test\.tsx?$/.test(f))
      .filter((f) => /checkout\.sessions\.create\(/.test(readFileSync(join(root, f), "utf8")));
    expect(callers).toEqual(["features/checkout/server/stripeCheckout.ts"]);
  });
});
