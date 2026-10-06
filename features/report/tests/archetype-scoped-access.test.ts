import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@shared/http/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
  CircuitOpenError: class CircuitOpenError extends Error {},
}));

const mockFetchWithTimeout = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

const { getReportAccessPlanForSubmission, resolveUnlockedArchetypeTiers } =
  await import("@features/report/server/personalReport");
const { isSectionUnlockedForPlan, ownsFullReportFor } =
  await import("@features/report/server/access");

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const OWN = "Loyal Ritualist";
const OTHER = "Analytical Sexualist";
const row = (tiers: Record<string, string> = {}) =>
  ({ id: 7, unlocked_archetypes: Object.keys(tiers), archetype_tiers: tiers }) as never;
const payments = (...list: Array<Record<string, unknown>>) =>
  ok(list.map((metadata, i) => ({ id: i + 1, metadata, payment_date_time: null })));

/**
 * A single report bought for ANOTHER archetype (its row in "Other Archetypes") opened
 * the buyer's own report too: the plan used to gate it was the strongest across every
 * payment, archetype ignored. Reproduced on staging 2026-10-06: €14.99 for Analytical
 * Sexualist, and Loyal Ritualist served all 19 sections.
 */
describe("a single report bought for another archetype", () => {
  beforeEach(() => {
    mockFetchWithTimeout.mockReset();
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-for-tests";
  });

  it("does not count towards the reader's own report", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce(payments({ plan: "full_report", archetype: OTHER }));
    const res = await getReportAccessPlanForSubmission(42, row({ [OTHER]: "full_report" }), OWN);
    expect(res.accessPlan).toBeNull();
    // Still "bought something": the reader's own findings open on any purchase.
    expect(res.anyPlan).toBe("full_report");
  });

  it("leaves the own report locked and opens only the archetype it was bought for", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce(payments({ plan: "full_report", archetype: OTHER }));
    const res = await getReportAccessPlanForSubmission(42, row({ [OTHER]: "full_report" }), OWN);
    const tiers = resolveUnlockedArchetypeTiers({
      accessPlan: res.accessPlan,
      archetypeTiers: res.archetypeTiers,
      columnValues: res.unlockedArchetypeColumn,
      primaryArchetype: OWN,
    });
    expect(tiers).toEqual({ [OTHER]: "full_report" });
    const gate = (archetype: string) =>
      isSectionUnlockedForPlan({
        accessPlan: res.accessPlan,
        archetypeTier: new Map(Object.entries(tiers)).get(archetype) ?? null,
        isPremium: true,
        sectionId: "typical_beliefs",
      });
    expect(gate(OWN)).toBe(false);
    expect(gate(OTHER)).toBe(true);
  });

  it.each([
    ["bought for the own archetype", { plan: "full_report", archetype: OWN }, "full_report"],
    ["with no archetype (before per-archetype pricing)", { plan: "full_report" }, "full_report"],
    ["with an empty archetype", { plan: "full_report", archetype: "" }, "full_report"],
    ["all 14", { plan: "all_reports" }, "all_reports"],
    ["legacy core (top 3, own included)", { plan: "core" }, "core"],
    [
      "legacy essentials for the own archetype",
      { plan: "essentials", archetype: OWN },
      "essentials",
    ],
  ])("still opens the own report when %s", async (_label, metadata, expected) => {
    mockFetchWithTimeout.mockResolvedValueOnce(payments(metadata));
    const res = await getReportAccessPlanForSubmission(42, row(), OWN);
    expect(res.accessPlan).toBe(expected);
  });

  it("own + another: the own purchase still counts", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce(
      payments({ plan: "full_report", archetype: OTHER }, { plan: "full_report", archetype: OWN })
    );
    const res = await getReportAccessPlanForSubmission(42, row(), OWN);
    expect(res.accessPlan).toBe("full_report");
  });

  it("without the own archetype the plan stays global (checkout status and duplicate guard)", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce(payments({ plan: "full_report", archetype: OTHER }));
    const res = await getReportAccessPlanForSubmission(42, row());
    expect(res.accessPlan).toBe("full_report");
  });
});

describe("ownsFullReportFor (the unlock bar)", () => {
  it("is true on the own report once the own report is bought", () => {
    expect(ownsFullReportFor("full_report", {}, OWN)).toBe(true);
  });
  it("is false on the own report when only another archetype was bought", () => {
    expect(ownsFullReportFor(null, { [OTHER]: "full_report" }, OWN)).toBe(false);
  });
  it("is true on the other archetype's report that was bought", () => {
    expect(ownsFullReportFor(null, { [OTHER]: "full_report" }, OTHER)).toBe(true);
  });
  it("is false for an essentials-only tier and true for all 14", () => {
    expect(ownsFullReportFor(null, { [OTHER]: "essentials" }, OTHER)).toBe(false);
    expect(ownsFullReportFor("all_reports", {}, OTHER)).toBe(true);
  });
});
