import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const mockFindBySubmission = vi.fn();
vi.mock("@features/pay-to-start/server/entitlement", () => ({
  findEntitlementByConsumedSubmission: (...args: unknown[]) => mockFindBySubmission(...args),
}));
const mockGateEnabled = vi.fn();
const mockReadGateState = vi.fn();
vi.mock("@features/report/server/initialGateState", () => ({
  isInitialUnlockGateEnabled: (...args: unknown[]) => mockGateEnabled(...args),
  readInitialGateState: (...args: unknown[]) => mockReadGateState(...args),
}));
const mockAccess = vi.fn();
vi.mock("@features/report/server/personalReport", () => ({
  getReportAccessPlanForSubmission: (...args: unknown[]) => mockAccess(...args),
}));
const mockIsFeatureEnabled = vi.fn();
vi.mock("@shared/flags/system-flags", () => ({
  isFeatureEnabled: (...args: unknown[]) => mockIsFeatureEnabled(...args),
}));

import {
  buildInitialUnlockGatePayload,
  isInitialUnlockGatePayload,
  needsInitialUnlockGate,
  surveyMinutesFromDuration,
  type InitialUnlockGateInput,
} from "@features/report/logic/initialUnlockGate";
import {
  hasLivePayToStartEntitlement,
  ownerMeetsInitialGate,
} from "@features/report/server/initialUnlockGate";

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
      surveyMinutes: null,
    });
    expect(
      buildInitialUnlockGatePayload({ reportToken: null, submissionId: 1, surveyMinutes: 14 })
        .surveyMinutes
    ).toBe(14);
  });

  it("counts the survey's minutes only when they are time a reader would call invested", () => {
    expect(surveyMinutesFromDuration(13 * 60_000 + 40_000)).toBe(14);
    expect(surveyMinutesFromDuration(3 * 60_000)).toBe(3);
    expect(surveyMinutesFromDuration(90 * 60_000)).toBe(90);
    // A skim, a survey left open overnight, and no clock at all say nothing true.
    expect(surveyMinutesFromDuration(2 * 60_000)).toBeNull();
    expect(surveyMinutesFromDuration(91 * 60_000)).toBeNull();
    expect(surveyMinutesFromDuration(null)).toBeNull();
    expect(surveyMinutesFromDuration(undefined)).toBeNull();
    expect(surveyMinutesFromDuration(Number.NaN)).toBeNull();
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

/** For routes that act for an owner without building the report (the share route). */
describe("ownerMeetsInitialGate", () => {
  const OWNER = { submissionId: 55, personalReportId: 99 };
  const NOTHING_BOUGHT = {
    accessPlan: null,
    anyPlan: null,
    initialUnlock: false,
    archetypeTiers: {},
    personalReportId: 99,
    unlockedArchetypeColumn: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGateEnabled.mockResolvedValue(true);
    mockIsFeatureEnabled.mockImplementation(async (key: string, fallback: boolean) =>
      key === "report_paywall_enforced" ? true : fallback
    );
    // Each keyed to this owner: anyone else's report, purchases or entitlement read as
    // "not gated", so a lookup made with the wrong id fails the test that gates.
    mockReadGateState.mockImplementation(async (personalReportId: number) =>
      personalReportId === 99 ? { cohortAt: "2026-10-20T08:00:00.000Z", seenAt: null } : null
    );
    mockAccess.mockImplementation(async (submissionId: number) =>
      submissionId === 55 ? { ...NOTHING_BOUGHT } : { ...NOTHING_BOUGHT, accessPlan: "full_report" }
    );
    mockFindBySubmission.mockImplementation(async (submissionId: number) =>
      submissionId === 55 ? null : entitlementBoundTo123("succeeded")
    );
  });

  it("gates an owner in the cohort who bought nothing", async () => {
    await expect(ownerMeetsInitialGate(OWNER)).resolves.toBe(true);
  });

  it("reads nothing more while the gate is switched off", async () => {
    mockGateEnabled.mockResolvedValue(false);
    await expect(ownerMeetsInitialGate(OWNER)).resolves.toBe(false);
    expect(mockReadGateState).not.toHaveBeenCalled();
    expect(mockAccess).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a report from before the launch",
      () => mockReadGateState.mockResolvedValue({ cohortAt: null, seenAt: null }),
    ],
    ["an unreadable gate state", () => mockReadGateState.mockResolvedValue(null)],
    [
      "a reader with a plan",
      () => mockAccess.mockResolvedValue({ ...NOTHING_BOUGHT, accessPlan: "essentials" }),
    ],
    [
      "a reader who bought another archetype",
      () => mockAccess.mockResolvedValue({ ...NOTHING_BOUGHT, anyPlan: "full_report" }),
    ],
    [
      "a reader whose Core Archetype is open",
      () => mockAccess.mockResolvedValue({ ...NOTHING_BOUGHT, initialUnlock: true }),
    ],
    [
      "unreadable purchases",
      () => mockAccess.mockRejectedValue(new Error("payment_lookup_failed")),
    ],
    [
      "a settling pay-to-start payment",
      () => mockFindBySubmission.mockResolvedValue(entitlementBoundTo123("pending")),
    ],
    [
      "a failed pay-to-start lookup",
      () => mockFindBySubmission.mockRejectedValue(new Error("prepaid_entitlement_lookup_failed")),
    ],
    [
      "the paywall kill switch opening every report",
      () => mockIsFeatureEnabled.mockResolvedValue(false),
    ],
  ])("stands aside for %s", async (_who, arrange) => {
    arrange();
    await expect(ownerMeetsInitialGate(OWNER)).resolves.toBe(false);
  });
});
