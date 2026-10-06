/**
 * A full refund or an opened chargeback must take back what that payment unlocked.
 *
 * Until 2026-10-06 the payment was marked refunded/disputed and nothing else changed, but
 * access had moved to personal_report.archetype_tiers, so the buyer kept every archetype
 * they had paid for, while the pay screen promises a 14-day money-back guarantee.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchWithTimeout = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: Parameters<typeof mockFetchWithTimeout>) =>
    mockFetchWithTimeout(...args),
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
const mockUpsertTier = vi.fn();
const mockUnlockAll = vi.fn();
vi.mock("@features/report/server/personalReport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@features/report/server/personalReport")>();
  return {
    ...actual,
    ensurePersonalReportForSubmission: vi.fn(),
    resolveSubmissionAccessContext: vi.fn(),
    unlockAllArchetypesForPersonalReport: (...a: unknown[]) => mockUnlockAll(...a),
    upsertArchetypeTierForPersonalReport: (...a: unknown[]) => mockUpsertTier(...a),
  };
});
vi.mock("@features/pricing/logic/reportPricing", () => ({
  markReportPriceQuotePurchased: vi.fn(),
}));

const { processStripeWebhookEvent } = await import("@features/checkout/server/fulfillment");
const { revokeArchetypeTiers } = await import("@features/report/server/personalReport");

const json = (body: unknown) => ({ ok: true, json: async () => body }) as Response;
type Meta = Record<string, unknown>;

/** The DB as the handlers see it: payment 41 on report 5, plus any other succeeded payments. */
function db({
  paid,
  others = [],
  tiers,
}: {
  paid: Meta;
  others?: Meta[];
  tiers: Record<string, string>;
}) {
  const patches: Array<{ url: string; body: Record<string, unknown> }> = [];
  mockFetchWithTimeout.mockImplementation(
    async (url: string, o?: { method?: string; body?: string }) => {
      const method = o?.method ?? "GET";
      if (method === "PATCH") {
        patches.push({ url, body: JSON.parse(o?.body ?? "{}") });
        return json([]);
      }
      if (method === "POST") return json([{ id: 99 }]);
      if (url.includes("payment_webhook_event?stripe_event_id=eq.")) return json([]);
      if (url.includes("/payment?stripe_charge_id=eq.ch_1"))
        return json([{ id: 41, personal_report_id: 5 }]);
      if (url.includes("/payment?stripe_")) return json([]);
      if (url.includes("/payment?id=eq.41&select=metadata")) return json([{ metadata: paid }]);
      if (url.includes("/personal_report?id=eq.5&select=survey_submission_id"))
        return json([{ survey_submission_id: 70, archetype_tiers: tiers }]);
      if (url.includes("/payment?personal_report_id=eq.5&status=eq.succeeded&id=neq.41"))
        return json(others.map((metadata) => ({ metadata })));
      if (url.includes("/scoring_result?survey_submission_id=eq.70"))
        return json([
          { primary_archetype: "Loyal Ritualist", v5_primary_archetype: "Loyal Ritualist" },
        ]);
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    }
  );
  return patches;
}

const refund = () =>
  ({
    id: "evt_refund",
    type: "charge.refunded",
    data: {
      object: {
        id: "ch_1",
        amount: 1999,
        amount_captured: 1999,
        amount_refunded: 1999,
        currency: "eur",
        payment_intent: "pi_1",
      },
    },
  }) as unknown as import("stripe").Stripe.Event;
const dispute = (
  type: "charge.dispute.created" | "charge.dispute.closed",
  status = "needs_response"
) =>
  ({
    id: `evt_${type}_${status}`,
    type,
    data: {
      object: {
        id: "dp_1",
        charge: "ch_1",
        payment_intent: "pi_1",
        amount: 1999,
        currency: "eur",
        status,
        reason: "fraudulent",
      },
    },
  }) as unknown as import("stripe").Stripe.Event;
const stripe = {} as import("stripe").Stripe;
const tiersPatch = (patches: Array<{ url: string; body: Record<string, unknown> }>) =>
  patches.find((p) => p.url.includes("/personal_report?id=eq.5") && "archetype_tiers" in p.body)
    ?.body;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
});

describe("revokeArchetypeTiers", () => {
  it("removes what was paid for and keeps what something else covers", () => {
    const covered = new Map([["Spark Seeker", "essentials" as const]]);
    expect(
      revokeArchetypeTiers(
        {
          "Loyal Ritualist": "full_report",
          "Spark Seeker": "full_report",
          "Quiet Withdrawer": "full_report",
        },
        ["Loyal Ritualist", "Spark Seeker"],
        covered
      )
    ).toEqual({ "Spark Seeker": "essentials", "Quiet Withdrawer": "full_report" });
  });
  it("matches a stored legacy name", () => {
    expect(
      revokeArchetypeTiers({ "Approval Seeker": "full_report" }, ["Tender Devotee"], new Map())
    ).toEqual({});
  });
});

describe("a full refund locks what that payment paid for", () => {
  it("single report: its archetype comes off", async () => {
    const patches = db({
      paid: { plan: "full_report", archetype: "Spark Seeker" },
      tiers: { "Spark Seeker": "full_report" },
    });
    await processStripeWebhookEvent({ event: refund(), stripe });
    expect(tiersPatch(patches)).toMatchObject({ archetype_tiers: {}, unlocked_archetypes: [] });
    expect(mockNotifySlack).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: "report_access_change_failed" })
    );
  });

  it("all 14 refunded, own single still paid: only the own archetype stays", async () => {
    const all = Object.fromEntries(
      ["Loyal Ritualist", "Spark Seeker", "Quiet Withdrawer"].map((n) => [n, "full_report"])
    );
    const patches = db({
      paid: { plan: "all_reports" },
      others: [{ plan: "full_report", archetype: "Loyal Ritualist" }],
      tiers: all,
    });
    await processStripeWebhookEvent({ event: refund(), stripe });
    expect(tiersPatch(patches)?.archetype_tiers).toEqual({ "Loyal Ritualist": "full_report" });
  });

  it("a payment with no archetype was the reader's own report", async () => {
    const patches = db({
      paid: { plan: "full_report" },
      tiers: { "Loyal Ritualist": "full_report", "Spark Seeker": "full_report" },
    });
    await processStripeWebhookEvent({ event: refund(), stripe });
    expect(tiersPatch(patches)?.archetype_tiers).toEqual({ "Spark Seeker": "full_report" });
  });
});

describe("a chargeback", () => {
  it("opened: locks what it paid for", async () => {
    const patches = db({
      paid: { plan: "full_report", archetype: "Spark Seeker" },
      tiers: { "Spark Seeker": "full_report" },
    });
    await processStripeWebhookEvent({ event: dispute("charge.dispute.created"), stripe });
    expect(tiersPatch(patches)?.archetype_tiers).toEqual({});
  });

  it("won: opens it again", async () => {
    db({ paid: { plan: "full_report", archetype: "Spark Seeker" }, tiers: {} });
    await processStripeWebhookEvent({ event: dispute("charge.dispute.closed", "won"), stripe });
    expect(mockUpsertTier).toHaveBeenCalledWith({
      archetype: "Spark Seeker",
      personalReportId: 5,
      tier: "full_report",
    });
  });

  it("lost: stays locked, nothing re-opened", async () => {
    db({ paid: { plan: "full_report", archetype: "Spark Seeker" }, tiers: {} });
    await processStripeWebhookEvent({ event: dispute("charge.dispute.closed", "lost"), stripe });
    expect(mockUpsertTier).not.toHaveBeenCalled();
    expect(mockUnlockAll).not.toHaveBeenCalled();
  });
});
