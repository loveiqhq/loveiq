import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const mockNotifySlack = vi.fn();
vi.mock("@shared/observability/slack", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/observability/slack")>();
  return { ...actual, notifySlack: (...args: unknown[]) => mockNotifySlack(...args) };
});
vi.mock("@features/checkout/server/fulfillment", () => ({
  applyPayToStartEntitlement: vi.fn(),
  settlePayToStartSession: vi.fn(),
}));
vi.mock("@features/checkout/server/stripeCheckout", () => ({ getStripeServerClient: vi.fn() }));
vi.mock("@features/pay-to-start/server/entitlement", () => ({
  bindEntitlement: vi.fn(),
  findEntitlementByConsumedSubmission: vi.fn(),
  findEntitlementById: vi.fn(),
  findEntitlementByToken: vi.fn(),
}));

import {
  applyPayToStartEntitlement,
  settlePayToStartSession,
} from "@features/checkout/server/fulfillment";
import { getStripeServerClient } from "@features/checkout/server/stripeCheckout";
import {
  claimPayToStartForSubmission,
  claimResponseFields,
  claimSettlesCookie,
  claimedEntitlementFor,
  reportClaimProblem,
} from "@features/pay-to-start/server/claim";
import {
  bindEntitlement,
  findEntitlementByConsumedSubmission,
  findEntitlementById,
  findEntitlementByToken,
  type Entitlement,
} from "@features/pay-to-start/server/entitlement";

const TOKEN = `rpp_${"h".repeat(32)}`;

function row(overrides: Partial<Entitlement> = {}): Entitlement {
  return {
    id: 7,
    prepaid_token: TOKEN,
    plan: "full_report",
    status: "succeeded",
    offer: "full",
    landing_variant: "sexual-archetype",
    stripe_session_id: "cs_test_1",
    stripe_payment_intent_id: "pi_test_1",
    payment_id: null,
    consumed_submission_id: null,
    consumed_at: null,
    amount_cents: 2900,
    list_price_cents: 2900,
    currency: "EUR",
    customer_email: "buyer@example.com",
    is_test: false,
    paid_at: "2026-10-18T10:05:00.000Z",
    utm_tracker: null,
    created_at: "2026-10-18T10:00:00.000Z",
    ...overrides,
  };
}

const claim = () =>
  claimPayToStartForSubmission({ reportToken: "rpt_abc", submissionId: 42, token: TOKEN });

function settles(state: string, paymentId: number | null = null) {
  vi.mocked(settlePayToStartSession).mockResolvedValue({
    state: state as never,
    entitlement: row(),
    session: null,
    firstFlip: false,
    paymentId,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockNotifySlack.mockResolvedValue(undefined);
  vi.mocked(bindEntitlement).mockResolvedValue(true);
  vi.mocked(applyPayToStartEntitlement).mockResolvedValue(41);
  vi.mocked(getStripeServerClient).mockReturnValue({} as never);
});

describe("refusals", () => {
  it("refuses a token with no entitlement", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(null);
    expect(await claim()).toEqual({ outcome: "refused", reason: "not_found" });
    expect(bindEntitlement).not.toHaveBeenCalled();
  });

  it("refuses one another submission claimed, or one already applied", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(row({ consumed_submission_id: 41 }));
    expect(await claim()).toMatchObject({ outcome: "refused", reason: "used" });
    vi.mocked(findEntitlementByToken).mockResolvedValue(row({ payment_id: 12 }));
    expect(await claim()).toMatchObject({ outcome: "refused", reason: "used" });
    expect(bindEntitlement).not.toHaveBeenCalled();
  });

  it("refuses a refunded or expired one without binding it", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(row({ status: "refunded" }));
    expect(await claim()).toMatchObject({ outcome: "refused", reason: "refunded" });
    vi.mocked(findEntitlementByToken).mockResolvedValue(row({ status: "expired" }));
    expect(await claim()).toMatchObject({ outcome: "refused", reason: "expired" });
    expect(bindEntitlement).not.toHaveBeenCalled();
  });

  it("refuses when another submission won the bind", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(row());
    vi.mocked(bindEntitlement).mockResolvedValue(false);
    vi.mocked(findEntitlementById).mockResolvedValue(row({ consumed_submission_id: 43 }));
    expect(await claim()).toMatchObject({ outcome: "refused", reason: "used" });
    expect(applyPayToStartEntitlement).not.toHaveBeenCalled();
  });
});

describe("unlocking", () => {
  it("binds a paid entitlement to this submission, then applies it", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(row());
    vi.mocked(findEntitlementById).mockResolvedValue(row({ consumed_submission_id: 42 }));
    expect(await claim()).toEqual({
      outcome: "unlocked",
      entitlementId: 7,
      paymentId: 41,
      offer: "full",
    });
    expect(bindEntitlement).toHaveBeenCalledWith({ id: 7, submissionId: 42 });
    expect(applyPayToStartEntitlement).toHaveBeenCalledWith({
      entitlement: expect.objectContaining({ id: 7, consumed_submission_id: 42 }),
      reportToken: "rpt_abc",
    });
  });

  it("says which offer was bought: the initial report's for a EUR 1.99 row", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(
      row({ offer: "pre", plan: "initial", consumed_submission_id: 42 })
    );
    expect(await claim()).toMatchObject({ outcome: "unlocked", offer: "pre" });
  });

  it("treats a lost bind that this submission made anyway as ours (a retry)", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(row());
    vi.mocked(bindEntitlement).mockResolvedValue(false);
    vi.mocked(findEntitlementById).mockResolvedValue(row({ consumed_submission_id: 42 }));
    expect(await claim()).toMatchObject({ outcome: "unlocked" });
  });

  it("re-applies its own claim idempotently, and skips an applied one", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(row({ consumed_submission_id: 42 }));
    expect(await claim()).toMatchObject({ outcome: "unlocked", paymentId: 41 });
    expect(bindEntitlement).not.toHaveBeenCalled();

    vi.mocked(applyPayToStartEntitlement).mockClear();
    vi.mocked(findEntitlementByToken).mockResolvedValue(
      row({ consumed_submission_id: 42, payment_id: 33 })
    );
    expect(await claim()).toEqual({
      outcome: "unlocked",
      entitlementId: 7,
      paymentId: 33,
      offer: "full",
    });
    expect(applyPayToStartEntitlement).not.toHaveBeenCalled();
  });

  it("tries the apply once more when it throws, so a passing blip does not lock the report", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(row({ consumed_submission_id: 42 }));
    vi.mocked(applyPayToStartEntitlement)
      .mockRejectedValueOnce(new Error("pts_apply_payment_persist_failed"))
      .mockResolvedValueOnce(41);
    expect(await claim()).toEqual({
      outcome: "unlocked",
      entitlementId: 7,
      paymentId: 41,
      offer: "full",
    });
    expect(applyPayToStartEntitlement).toHaveBeenCalledTimes(2);
  });

  it("gives up after the second failure: an error for #ops, finished by the sweep", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(row({ consumed_submission_id: 42 }));
    vi.mocked(applyPayToStartEntitlement).mockRejectedValue(new Error("db down"));
    expect(await claim()).toMatchObject({ outcome: "error", entitlementId: 7 });
    expect(applyPayToStartEntitlement).toHaveBeenCalledTimes(2);
  });

  it("reports an apply that wrote nothing as an error", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(row({ consumed_submission_id: 42 }));
    vi.mocked(applyPayToStartEntitlement).mockResolvedValue(null);
    expect(await claim()).toMatchObject({ outcome: "error", entitlementId: 7 });
  });

  it("never throws: a failure is an error outcome", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(row());
    vi.mocked(bindEntitlement).mockRejectedValue(new Error("prepaid_entitlement_bind_failed"));
    expect(await claim()).toMatchObject({ outcome: "error", entitlementId: 7 });
  });
});

describe("a payment not settled at the end of the survey", () => {
  beforeEach(() => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(row({ status: "pending" }));
    vi.mocked(findEntitlementById).mockResolvedValue(
      row({ status: "pending", consumed_submission_id: 42 })
    );
  });

  it("asks Stripe once, and unlocks when it turns out paid", async () => {
    settles("paid", 41);
    expect(await claim()).toEqual({
      outcome: "unlocked",
      entitlementId: 7,
      paymentId: 41,
      offer: "full",
    });
    expect(settlePayToStartSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "cs_test_1", source: "claim" })
    );
  });

  it("says pending while a delayed method settles", async () => {
    settles("processing");
    expect(await claim()).toEqual({ outcome: "pending", entitlementId: 7, offer: "full" });
  });

  it("says unpaid for a checkout left open, bound so paying later unlocks it", async () => {
    settles("open");
    expect(await claim()).toEqual({ outcome: "unpaid", entitlementId: 7 });
    expect(bindEntitlement).toHaveBeenCalled();
  });

  it("refuses when Stripe says it was refunded", async () => {
    settles("refunded");
    expect(await claim()).toMatchObject({ outcome: "refused", reason: "refunded" });
  });

  it("reports an error when the money is in but the apply failed", async () => {
    settles("paid", null);
    expect(await claim()).toMatchObject({ outcome: "error" });
  });

  it("says unpaid where Stripe is not configured", async () => {
    vi.mocked(getStripeServerClient).mockReturnValue(null);
    expect(await claim()).toEqual({ outcome: "unpaid", entitlementId: 7 });
    expect(settlePayToStartSession).not.toHaveBeenCalled();
  });
});

describe("a replay without the cookie", () => {
  it("finds the claim this submission made", async () => {
    vi.mocked(findEntitlementByConsumedSubmission).mockResolvedValue(
      row({ consumed_submission_id: 42, payment_id: 41 })
    );
    expect(await claimedEntitlementFor(42)).toEqual({
      outcome: "unlocked",
      entitlementId: 7,
      paymentId: 41,
      offer: "full",
    });
  });

  it("returns nothing when it made none", async () => {
    vi.mocked(findEntitlementByConsumedSubmission).mockResolvedValue(null);
    expect(await claimedEntitlementFor(42)).toBeNull();
  });

  it("treats a lookup that fails as no claim, never as a failed one", async () => {
    // Almost every replay is a free reader's: an error here put the journey in their reply
    // (the paid wizard) and a failed claim in #ops.
    vi.mocked(findEntitlementByConsumedSubmission).mockRejectedValue(
      new Error("prepaid_entitlement_lookup_failed")
    );
    expect(await claimedEntitlementFor(42)).toBeNull();
  });
});

describe("what the reply carries", () => {
  it("says unlocked, or pending, under the journey, with the offer's wizard", () => {
    expect(
      claimResponseFields({ outcome: "unlocked", entitlementId: 7, paymentId: 41, offer: "full" })
    ).toEqual({
      journey: "pay_to_start",
      unlocked: true,
      wizard: "pay_to_start",
    });
    expect(claimResponseFields({ outcome: "pending", entitlementId: 7, offer: "full" })).toEqual({
      journey: "pay_to_start",
      unlocked: false,
      unlockPending: true,
      wizard: "pay_to_start",
    });
    // Nothing opens: no wizard of the journey's.
    expect(claimResponseFields({ outcome: "refused", reason: "used" })).toEqual({
      journey: "pay_to_start",
      unlocked: false,
    });
  });

  it("names the initial report's five-slide wizard for its EUR 1.99 buyer (Marcus, 20.10)", () => {
    expect(
      claimResponseFields({ outcome: "unlocked", entitlementId: 7, paymentId: 41, offer: "pre" })
    ).toMatchObject({ unlocked: true, wizard: "pay_to_start_initial" });
    expect(
      claimResponseFields({ outcome: "pending", entitlementId: 7, offer: "pre" })
    ).toMatchObject({ unlockPending: true, wizard: "pay_to_start_initial" });
  });

  it("clears the cookie unless the claim failed", () => {
    expect(
      claimSettlesCookie({ outcome: "unlocked", entitlementId: 7, paymentId: 41, offer: "full" })
    ).toBe(true);
    expect(claimSettlesCookie({ outcome: "pending", entitlementId: 7, offer: "full" })).toBe(true);
    expect(claimSettlesCookie({ outcome: "refused", reason: "refunded" })).toBe(true);
    expect(claimSettlesCookie({ outcome: "error", error: new Error("x") })).toBe(false);
    // Cleared: kept, the next purchase in this browser (someone else's, or a second one
    // for a report already bought) would pay for this survey.
    expect(claimSettlesCookie({ outcome: "unpaid", entitlementId: 7 })).toBe(true);
  });
});

describe("reportClaimProblem", () => {
  it("alerts #ops on an error", async () => {
    await reportClaimProblem({ outcome: "error", entitlementId: 7, error: new Error("db") }, 42);
    expect(mockNotifySlack).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "ops", kind: "pts_claim_failed" })
    );
  });

  it("only logs a refusal or an unpaid claim", async () => {
    await reportClaimProblem({ outcome: "refused", reason: "used", entitlementId: 7 }, 42);
    await reportClaimProblem({ outcome: "unpaid", entitlementId: 7 }, 42);
    expect(mockNotifySlack).not.toHaveBeenCalled();
  });
});
