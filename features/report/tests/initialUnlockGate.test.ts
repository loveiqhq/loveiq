import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const mockFindBySubmission = vi.fn();
vi.mock("@features/pay-to-start/server/entitlement", () => ({
  findEntitlementByConsumedSubmission: (...args: unknown[]) => mockFindBySubmission(...args),
}));

import {
  buildInitialUnlockGatePayload,
  isInitialUnlockGatePayload,
  needsInitialUnlockGate,
  type InitialUnlockGateInput,
} from "@features/report/logic/initialUnlockGate";
import { hasLivePayToStartEntitlement } from "@features/report/server/initialUnlockGate";

const GATED: InitialUnlockGateInput = {
  gateEnabled: true,
  paywallEnforced: true,
  viewMode: "owner",
  inCohort: true,
  accessPlan: null,
  purchasedPlan: null,
  initialUnlock: false,
  livePayToStart: false,
  accessLookupFailed: false,
};

describe("needsInitialUnlockGate", () => {
  it("gates an owner in the cohort who bought nothing, while both switches are on", () => {
    expect(needsInitialUnlockGate(GATED)).toBe(true);
  });

  it.each([
    ["while the gate is switched off", { gateEnabled: false }],
    ["while the paywall kill switch opens every report", { paywallEnforced: false }],
    ["a shared viewer", { viewMode: "shared" as const }],
    ["a report from before the launch", { inCohort: false }],
    ["a reader with a full plan", { accessPlan: "full_report" }],
    ["a reader with a purchased plan", { purchasedPlan: "all_reports" }],
    ["a reader whose Core Archetype is paid or gifted", { initialUnlock: true }],
    ["a pay-to-start buyer whose payment is settling or paid", { livePayToStart: true }],
    ["a reader whose pay-to-start lookup failed", { livePayToStart: null }],
    ["a reader whose purchases could not be read", { accessLookupFailed: true }],
  ])("never gates %s", (_who, change) => {
    expect(needsInitialUnlockGate({ ...GATED, ...change })).toBe(false);
  });
});

describe("the gate payload", () => {
  it("carries the price, the credit, the guarantee and the reader's ids, nothing from the report", () => {
    expect(buildInitialUnlockGatePayload({ reportToken: "rpt_abc", submissionId: 123 })).toEqual({
      gate: "initial_unlock",
      priceCents: 199,
      currency: "EUR",
      creditCents: 1000,
      guaranteeDays: 14,
      reportToken: "rpt_abc",
      submissionId: 123,
      viewMode: "owner",
    });
  });

  it("is told apart from a report", () => {
    const payload = buildInitialUnlockGatePayload({ reportToken: null, submissionId: null });
    expect(isInitialUnlockGatePayload(payload)).toBe(true);
    expect(isInitialUnlockGatePayload({ primaryArchetype: "explorer", viewMode: "owner" })).toBe(
      false
    );
    expect(isInitialUnlockGatePayload({ gate: "initial_unlock", priceCents: "199" })).toBe(false);
    expect(isInitialUnlockGatePayload(null)).toBe(false);
    expect(isInitialUnlockGatePayload("initial_unlock")).toBe(false);
  });
});

type Status = "pending" | "succeeded" | "refunded" | "expired";

function entitlementBoundTo123(status: Status) {
  const paid = status === "succeeded" || status === "refunded";
  return {
    id: 7,
    prepaid_token: `rpp_${"g".repeat(32)}`,
    plan: "initial",
    status,
    offer: "pre",
    landing_variant: null,
    stripe_session_id: "cs_test_1",
    stripe_payment_intent_id: paid ? "pi_test_1" : null,
    payment_id: null,
    consumed_submission_id: 123,
    consumed_at: "2026-10-20T08:00:00.000Z",
    amount_cents: paid ? 199 : null,
    list_price_cents: 199,
    currency: "EUR",
    customer_email: "alice@example.com",
    is_test: false,
    paid_at: paid ? "2026-10-20T07:59:00.000Z" : null,
    utm_tracker: null,
    created_at: "2026-10-20T07:50:00.000Z",
  };
}

describe("hasLivePayToStartEntitlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["succeeded", true],
    ["pending", true],
    ["expired", false],
    ["refunded", false],
  ] as const)("an entitlement on this survey that is %s → %s", async (status, expected) => {
    mockFindBySubmission.mockImplementation(async (submissionId: number) =>
      submissionId === 123 ? entitlementBoundTo123(status) : null
    );
    await expect(hasLivePayToStartEntitlement(123)).resolves.toBe(expected);
  });

  it("no entitlement → false", async () => {
    mockFindBySubmission.mockResolvedValue(null);
    await expect(hasLivePayToStartEntitlement(123)).resolves.toBe(false);
  });

  it("a lookup that fails → null, so the gate stands aside", async () => {
    mockFindBySubmission.mockRejectedValue(new Error("prepaid_entitlement_lookup_failed"));
    await expect(hasLivePayToStartEntitlement(123)).resolves.toBeNull();
  });
});
