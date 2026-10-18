import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@features/pay-to-start/server/entitlement", () => ({
  listPendingForReconcile: vi.fn(),
  listBoundUnapplied: vi.fn(),
}));
vi.mock("@features/checkout/server/fulfillment", () => ({
  settlePayToStartSession: vi.fn(),
  applyPayToStartEntitlement: vi.fn(),
  reportPayToStartApplyFailure: vi.fn(),
}));

import type Stripe from "stripe";
import {
  applyPayToStartEntitlement,
  reportPayToStartApplyFailure,
  settlePayToStartSession,
} from "@features/checkout/server/fulfillment";
import {
  listBoundUnapplied,
  listPendingForReconcile,
  type Entitlement,
} from "@features/pay-to-start/server/entitlement";
import { sweepPayToStart } from "@features/pay-to-start/server/sweep";

const stripe = {} as Stripe;
const NOW = new Date("2026-10-18T12:00:00.000Z");

function row(overrides: Partial<Entitlement> = {}): Entitlement {
  return {
    id: 7,
    prepaid_token: `rpp_${"k".repeat(32)}`,
    plan: "full_report",
    status: "pending",
    offer: "full",
    landing_variant: "sexual-archetype",
    stripe_session_id: "cs_test_1",
    stripe_payment_intent_id: null,
    payment_id: null,
    consumed_submission_id: null,
    consumed_at: null,
    amount_cents: null,
    list_price_cents: 2900,
    currency: "EUR",
    customer_email: null,
    is_test: false,
    paid_at: null,
    utm_tracker: null,
    created_at: "2026-10-18T10:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listPendingForReconcile).mockResolvedValue([]);
  vi.mocked(listBoundUnapplied).mockResolvedValue([]);
});

describe("the payment sweep's pay-to-start steps", () => {
  it("asks Stripe about checkouts pending between 10 minutes and 48 hours", async () => {
    vi.mocked(listPendingForReconcile).mockResolvedValue([
      row({ id: 1, stripe_session_id: "cs_test_a" }),
      row({ id: 2, stripe_session_id: "cs_test_b" }),
    ]);
    vi.mocked(settlePayToStartSession)
      .mockResolvedValueOnce({ state: "paid" } as never)
      .mockResolvedValueOnce({ state: "expired" } as never);

    const summary = await sweepPayToStart({ stripe, now: NOW });

    expect(listPendingForReconcile).toHaveBeenCalledWith({
      limit: 25,
      newerThan: new Date("2026-10-16T12:00:00.000Z"),
      olderThan: new Date("2026-10-18T11:50:00.000Z"),
    });
    expect(settlePayToStartSession).toHaveBeenCalledWith({
      sessionId: "cs_test_a",
      source: "sweep",
      stripe,
    });
    expect(summary).toEqual({ reconciled: 2, paid: 1, applied: 0, errors: 0 });
  });

  it("counts a failing checkout and goes on to the next", async () => {
    vi.mocked(listPendingForReconcile).mockResolvedValue([row({ id: 1 }), row({ id: 2 })]);
    vi.mocked(settlePayToStartSession)
      .mockRejectedValueOnce(new Error("stripe down"))
      .mockResolvedValueOnce({ state: "paid" } as never);
    expect(await sweepPayToStart({ stripe, now: NOW })).toEqual({
      reconciled: 1,
      paid: 1,
      applied: 0,
      errors: 1,
    });
  });

  it("unlocks reports for entitlements claimed but never applied", async () => {
    const claimed = row({ status: "succeeded", consumed_submission_id: 42 });
    vi.mocked(listBoundUnapplied).mockResolvedValue([claimed]);
    vi.mocked(applyPayToStartEntitlement).mockResolvedValue(901);
    const summary = await sweepPayToStart({ stripe, now: NOW });
    expect(applyPayToStartEntitlement).toHaveBeenCalledWith({ entitlement: claimed, stripe });
    expect(summary.applied).toBe(1);
  });

  it("alerts when applying fails again", async () => {
    const claimed = row({ status: "succeeded", consumed_submission_id: 42 });
    vi.mocked(listBoundUnapplied).mockResolvedValue([claimed]);
    const failure = new Error("pts_apply_missing_user");
    vi.mocked(applyPayToStartEntitlement).mockRejectedValue(failure);
    const summary = await sweepPayToStart({ stripe, now: NOW });
    expect(reportPayToStartApplyFailure).toHaveBeenCalledWith(claimed, failure, "sweep");
    expect(summary.errors).toBe(1);
  });

  it("reconciles checkouts when the claimed list cannot be read", async () => {
    vi.mocked(listBoundUnapplied).mockRejectedValue(new Error("db down"));
    vi.mocked(listPendingForReconcile).mockResolvedValue([row()]);
    vi.mocked(settlePayToStartSession).mockResolvedValue({ state: "paid" } as never);
    expect(await sweepPayToStart({ stripe, now: NOW })).toEqual({
      reconciled: 1,
      paid: 1,
      applied: 0,
      errors: 1,
    });
  });

  it("runs the second step when the first cannot list", async () => {
    vi.mocked(listPendingForReconcile).mockRejectedValue(new Error("db down"));
    vi.mocked(listBoundUnapplied).mockResolvedValue([
      row({ status: "succeeded", consumed_submission_id: 42 }),
    ]);
    vi.mocked(applyPayToStartEntitlement).mockResolvedValue(901);
    expect(await sweepPayToStart({ stripe, now: NOW })).toEqual({
      reconciled: 0,
      paid: 0,
      applied: 1,
      errors: 1,
    });
  });

  it("stops between rows when the function is being shut down", async () => {
    vi.mocked(listPendingForReconcile).mockResolvedValue([row({ id: 1 }), row({ id: 2 })]);
    vi.mocked(settlePayToStartSession).mockResolvedValue({ state: "open" } as never);
    let calls = 0;
    const summary = await sweepPayToStart({ stripe, now: NOW, shouldStop: () => ++calls > 1 });
    expect(settlePayToStartSession).toHaveBeenCalledTimes(1);
    expect(summary.reconciled).toBe(1);
  });

  it("unlocks claimed reports before the checkouts use up the run's time", async () => {
    // The cron stops starting rows after 10 s. A backlog of abandoned checkouts, each a
    // Stripe call, used to spend it all before the buyers already reading a locked report.
    const claimed = row({ id: 9, status: "succeeded", consumed_submission_id: 42 });
    vi.mocked(listBoundUnapplied).mockResolvedValue([claimed]);
    vi.mocked(listPendingForReconcile).mockResolvedValue(
      Array.from({ length: 25 }, (_, i) => row({ id: 100 + i }))
    );
    vi.mocked(settlePayToStartSession).mockResolvedValue({ state: "open" } as never);
    vi.mocked(applyPayToStartEntitlement).mockResolvedValue(901);
    let calls = 0;
    const summary = await sweepPayToStart({ stripe, now: NOW, shouldStop: () => ++calls > 3 });
    expect(applyPayToStartEntitlement).toHaveBeenCalledWith({ entitlement: claimed, stripe });
    expect(summary.applied).toBe(1);
    expect(settlePayToStartSession).toHaveBeenCalledTimes(2);
  });
});
