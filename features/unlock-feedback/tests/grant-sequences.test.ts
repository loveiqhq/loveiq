/**
 * The free unlock an answer gives, through the real grant, report access, upgrade credit and
 * refund code over an in-memory database (fakeDb). Purchase bugs have lived only in
 * sequences (a second purchase, another archetype, a refund after), so each case is one.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "./fakeDb";

const state = vi.hoisted(() => ({ db: null as unknown as FakeDb }));

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (url: string, init: never) => state.db.fetch(url, init),
}));
vi.mock("@shared/http/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
  CircuitOpenError: class CircuitOpenError extends Error {},
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const mockNotifySlack = vi.fn();
vi.mock("@shared/observability/slack", () => ({
  notifySlack: (...args: unknown[]) => mockNotifySlack(...args),
  escapeSlack: (s: string) => s,
  maskEmail: (s: string) => s,
}));
const mockEmailSend = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mockEmailSend };
  },
}));
const mockGa4 = vi.fn();
vi.mock("@features/analytics/server/ga4", () => ({
  sendGa4PurchaseEvent: (...args: unknown[]) => mockGa4(...args),
}));
const mockPosthog = vi.fn();
vi.mock("@features/analytics/server/posthog", () => ({
  sendPosthogPurchaseEvent: (...args: unknown[]) => mockPosthog(...args),
}));

const { createFakeDb, READER } = await import("./fakeDb");
const { unlockForFeedback } = await import("@features/unlock-feedback/server/grant");
const { getReportAccessPlanForSubmission, resolveUnlockedArchetypeTiers } =
  await import("@features/report/server/personalReport");
const { isPlanOwnedForArchetype } = await import("@features/report/server/access");
const { applyUpgradeCredit, getUpgradeCreditCents } =
  await import("@features/pricing/logic/reportPricing");
const { processStripeWebhookEvent } = await import("@features/checkout/server/fulfillment");

const unlock = () =>
  unlockForFeedback({ submissionId: READER.submissionId, archetype: READER.archetype });

/** What the report page resolves for the reader's own report. */
async function ownReportAccess() {
  const access = await getReportAccessPlanForSubmission(
    READER.submissionId,
    undefined,
    READER.archetype
  );
  return {
    accessPlan: access.accessPlan,
    tiers: resolveUnlockedArchetypeTiers({
      accessPlan: access.accessPlan,
      archetypeTiers: access.archetypeTiers,
      columnValues: access.unlockedArchetypeColumn,
      primaryArchetype: READER.archetype,
    }),
  };
}

/** What checkout-session's "already own it?" guard answers (it reads every payment). */
async function ownsAlready(plan: "full_report" | "all_reports", archetype: string | null) {
  const access = await getReportAccessPlanForSubmission(READER.submissionId);
  return isPlanOwnedForArchetype({
    accessPlan: access.accessPlan,
    targetPlan: plan,
    unlockedTier: archetype ? (access.archetypeTiers[archetype] ?? null) : null,
  });
}

const stripeEvent = (type: string, object: Record<string, unknown>) =>
  ({ id: `evt_${type}_${String(object.id)}`, type, data: { object } }) as never;
const refund = (chargeId: string, cents: number) =>
  stripeEvent("charge.refunded", {
    id: chargeId,
    amount: cents,
    amount_captured: cents,
    amount_refunded: cents,
    currency: "eur",
    payment_intent: null,
  });
const disputeOpened = (chargeId: string, cents: number) =>
  stripeEvent("charge.dispute.created", {
    id: `dp_${chargeId}`,
    charge: chargeId,
    payment_intent: null,
    amount: cents,
    currency: "eur",
    status: "needs_response",
    reason: "fraudulent",
  });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  // Set, so a purchase email WOULD reach the mocked Resend if anything tried to send one.
  process.env.RESEND_API_KEY = "re_test";
  state.db = createFakeDb();
  state.db.seedReader();
});

describe("the free unlock", () => {
  it("opens the reader's own full report, never all 14, as a gifted 0 payment", async () => {
    const outcome = await unlock();

    const [grant, ...more] = state.db.grants();
    expect(more).toHaveLength(0);
    expect(outcome).toEqual({ kind: "granted", paymentId: grant!.id });
    expect(grant).toMatchObject({
      amount: 0,
      currency: "EUR",
      status: "succeeded",
      is_test: false,
      user_id: READER.userId,
      personal_report_id: READER.personalReportId,
      stripe_charge_id: null,
      stripe_payment_intent_id: null,
      pricing_quote_id: null,
      metadata: { plan: "full_report", source: "unlock_feedback", archetype: READER.archetype },
    });
    expect(state.db.tables.payment_item).toEqual([
      expect.objectContaining({ payment_id: grant!.id, total_price: 0, unit_price: 0 }),
    ]);
    expect(state.db.report()).toMatchObject({
      payment_id: grant!.id,
      payment_status: "succeeded",
      price: 0,
      archetype_tiers: { [READER.archetype]: "full_report" },
    });

    expect(await ownReportAccess()).toEqual({
      accessPlan: "full_report",
      tiers: { [READER.archetype]: "full_report" },
    });

    // Gifted, not sold: no purchase email, no GA4 / PostHog purchase, no Slack payment ping.
    expect(mockEmailSend).not.toHaveBeenCalled();
    expect(mockGa4).not.toHaveBeenCalled();
    expect(mockPosthog).not.toHaveBeenCalled();
    expect(mockNotifySlack).not.toHaveBeenCalled();
  });

  it("flags a team member's gift as a test, like a staff purchase", async () => {
    const submission = state.db.tables.survey_submission![0]!;
    submission.app_user = { id: READER.userId, email: "eman@loveiq.org" };
    await unlock();
    expect(state.db.grants()[0]).toMatchObject({ is_test: true });
  });

  it("runs again without a second grant", async () => {
    const first = await unlock();
    const second = await unlock();
    expect(second).toEqual(first);
    expect(state.db.grants()).toHaveLength(1);
    expect(state.db.tables.payment_item).toHaveLength(1);
  });

  it("makes one grant when a double tap posts twice at the same instant", async () => {
    const [a, b] = await Promise.all([unlock(), unlock()]);
    expect(a).toEqual(b);
    expect(state.db.grants()).toHaveLength(1);
    expect(state.db.tables.payment_item).toHaveLength(1);
    expect((await ownReportAccess()).accessPlan).toBe("full_report");
  });

  it("finishes a grant whose payment was written before a failure", async () => {
    // The payment landed, then the request died: the next tap finds it and adds no other.
    await unlock();
    state.db.report().archetype_tiers = {};
    await unlock();
    expect(state.db.grants()).toHaveLength(1);
    expect(state.db.report().archetype_tiers).toEqual({ [READER.archetype]: "full_report" });
  });
});

describe("someone who paid gets nothing for an answer", () => {
  it("bought the full report before answering", async () => {
    state.db.buy({ plan: "full_report", amount: 4.99, chargeId: "ch_own" });
    expect(await unlock()).toEqual({ kind: "already_paid" });
    expect(state.db.grants()).toHaveLength(0);
    expect(state.db.tables.payment_item).toHaveLength(0);
  });

  it("bought between the email and the tap, even another archetype's report only", async () => {
    state.db.buy({
      plan: "full_report",
      archetype: "Spark Seeker",
      amount: 4.99,
      chargeId: "ch_x",
    });
    expect(await unlock()).toEqual({ kind: "already_paid" });
    expect(state.db.grants()).toHaveLength(0);
  });

  /** The EUR 1.99 Core Archetype on the reader's report: the gate's, or E07's EUR 0 gift. */
  const holdInitial = (row: { amount: number; status?: string; gifted?: string }) =>
    state.db.tables.payment!.push({
      id: 9001,
      amount: row.amount,
      currency: "EUR",
      is_test: false,
      metadata: { plan: "initial", ...(row.gifted ? { gifted: row.gifted } : {}) },
      personal_report_id: READER.personalReportId,
      refund_amount: null,
      status: row.status ?? "succeeded",
      user_id: READER.userId,
    });

  it.each([
    // An email sent before the gate's campaign stamped the report, answered after the EUR 1.99.
    ["bought the EUR 1.99 Core Archetype between the email and the tap", { amount: 1.99 }],
    ["holds the Core Archetype E07 gifted on day 4", { amount: 0, gifted: "e07" }],
  ])("%s", async (_label, held) => {
    holdInitial(held);
    expect(await unlock()).toEqual({ kind: "already_paid" });
    expect(state.db.grants()).toHaveLength(0);
  });

  it("a refunded EUR 1.99 is nothing held: the answer still unlocks", async () => {
    holdInitial({ amount: 1.99, status: "refunded" });
    expect((await unlock()).kind).toBe("granted");
  });

  it("a refunded purchase is no plan: the answer still unlocks", async () => {
    const bought = state.db.buy({ plan: "full_report", amount: 4.99, chargeId: "ch_r" });
    bought.status = "refunded";
    state.db.report().archetype_tiers = {};
    expect((await unlock()).kind).toBe("granted");
  });
});

describe("buying after the free unlock", () => {
  it("All 14 is still for sale, with no credit for the gift", async () => {
    await unlock();
    expect(await ownsAlready("all_reports", null)).toBe(false);
    expect(await getUpgradeCreditCents(READER.personalReportId)).toBe(0);
    const quote = { plan: "all_reports", chargedPriceCents: 1999 } as never;
    expect(applyUpgradeCredit(quote, 0)).toBe(quote);
  });

  it("another archetype's report is still for sale; the own one reads as owned", async () => {
    await unlock();
    expect(await ownsAlready("full_report", "Spark Seeker")).toBe(false);
    expect(await ownsAlready("full_report", READER.archetype)).toBe(true);
  });

  it("then a paid single: All 14 credits only the money", async () => {
    await unlock();
    state.db.buy({
      plan: "full_report",
      archetype: "Spark Seeker",
      amount: 4.99,
      chargeId: "ch_x",
    });
    expect(await getUpgradeCreditCents(READER.personalReportId)).toBe(499);
  });

  it("then All 14: everything opens", async () => {
    await unlock();
    state.db.buy({ plan: "all_reports", amount: 19.99, chargeId: "ch_all" });
    const access = await ownReportAccess();
    expect(access.accessPlan).toBe("all_reports");
    expect(Object.keys(access.tiers)).toHaveLength(14);
  });
});

describe("a refund or dispute on another payment leaves the gift open", () => {
  it("All 14 bought after the gift, then refunded: the own report stays open", async () => {
    await unlock();
    state.db.buy({ plan: "all_reports", amount: 19.99, chargeId: "ch_all" });

    await processStripeWebhookEvent({ event: refund("ch_all", 1999), stripe: {} as never });

    expect(state.db.report().archetype_tiers).toEqual({ [READER.archetype]: "full_report" });
    expect(await ownReportAccess()).toEqual({
      accessPlan: "full_report",
      tiers: { [READER.archetype]: "full_report" },
    });
    expect(mockNotifySlack).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: "report_access_change_failed" })
    );
  });

  it("a chargeback on another archetype's single locks only that one", async () => {
    await unlock();
    state.db.buy({
      plan: "full_report",
      archetype: "Spark Seeker",
      amount: 4.99,
      chargeId: "ch_x",
    });

    await processStripeWebhookEvent({ event: disputeOpened("ch_x", 499), stripe: {} as never });

    expect(state.db.report().archetype_tiers).toEqual({ [READER.archetype]: "full_report" });
    expect((await ownReportAccess()).accessPlan).toBe("full_report");
  });
});
