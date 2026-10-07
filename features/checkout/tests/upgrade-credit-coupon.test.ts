import { describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  UPGRADE_CREDIT_COUPON_NAME,
  ensureUpgradeCreditCoupon,
} from "@features/checkout/server/stripeCheckout";

const stripeError = (code: string) => Object.assign(new Error(code), { code });
const fakeStripe = (retrieve: () => Promise<unknown>, create: () => Promise<unknown>) =>
  ({ coupons: { retrieve: vi.fn(retrieve), create: vi.fn(create) } }) as never;

describe("ensureUpgradeCreditCoupon", () => {
  it("reuses the coupon for that amount when it exists", async () => {
    const stripe = fakeStripe(
      async () => ({ id: "upgrade_credit_eur_1499" }),
      async () => ({})
    );
    expect(await ensureUpgradeCreditCoupon(stripe, 1499)).toBe("upgrade_credit_eur_1499");
    expect(
      (stripe as { coupons: { create: ReturnType<typeof vi.fn> } }).coupons.create
    ).not.toHaveBeenCalled();
  });

  it("makes it on first use: a one-time euro amount off, named for the reader", async () => {
    const stripe = fakeStripe(
      async () => {
        throw stripeError("resource_missing");
      },
      async () => ({})
    );
    expect(await ensureUpgradeCreditCoupon(stripe, 1499)).toBe("upgrade_credit_eur_1499");
    expect(
      (stripe as { coupons: { create: ReturnType<typeof vi.fn> } }).coupons.create
    ).toHaveBeenCalledWith({
      id: "upgrade_credit_eur_1499",
      amount_off: 1499,
      currency: "eur",
      duration: "once",
      name: UPGRADE_CREDIT_COUPON_NAME,
    });
  });

  it("takes the coupon another checkout made a moment earlier", async () => {
    const stripe = fakeStripe(
      async () => {
        throw stripeError("resource_missing");
      },
      async () => {
        throw stripeError("resource_already_exists");
      }
    );
    expect(await ensureUpgradeCreditCoupon(stripe, 500)).toBe("upgrade_credit_eur_500");
  });

  it("lets any other Stripe failure reach the route", async () => {
    const stripe = fakeStripe(
      async () => {
        throw stripeError("api_connection_error");
      },
      async () => ({})
    );
    await expect(ensureUpgradeCreditCoupon(stripe, 500)).rejects.toThrow("api_connection_error");
  });
});
