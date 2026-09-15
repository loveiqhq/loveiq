import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...a: unknown[]) => supabaseFetch(...a),
}));

const ok = (body: unknown) => ({ ok: true, json: async () => body, headers: { get: () => null } });
const fail = () => ({
  ok: false,
  status: 500,
  json: async () => null,
  headers: { get: () => null },
});

/** Route each call by what it asks for, so a test can break exactly one source. */
function routeFetch(over: Record<string, unknown> = {}) {
  return (path: string) => {
    if (path.includes("get_arm_cohorts"))
      return ok(
        "cohorts" in over
          ? over.cohorts
          : [{ axis: "landing", arm: "white", n: 425, conversions: 5 }]
      );
    if (path.includes("get_axis_funnel_daily"))
      return ok(
        "axis" in over ? over.axis : [{ axis: "landing", arm: "white", completions: 425, paid: 5 }]
      );
    if (path.includes("get_funnel_cvr_sparklines"))
      return ok("cvr" in over ? over.cvr : { days: [{ visitors: 12308 }] });
    if (path.includes("get_landing_arm_funnel_daily"))
      return ok("arm" in over ? over.arm : { visitors: [{ n: 12308 }] });
    if (path.includes("source_id=eq.alltime"))
      return ok("corpus" in over ? over.corpus : [{ body: "Revenue: EUR 704.91" }]);
    if (path.includes("/payment?"))
      return ok("ledger" in over ? over.ledger : [{ amount: 704.91 }]);
    return ok([]);
  };
}

describe("brain-reconcile — the readings it actually assembles", () => {
  beforeEach(() => vi.clearAllMocks());

  it("builds every check and finds no gap when production agrees", async () => {
    supabaseFetch.mockImplementation(routeFetch());
    const { buildReadings } = await import("@/app/api/cron/brain-reconcile/route");
    const { reconcile } = await import("@features/brain/server/reconcile");
    const { readings, unread } = await buildReadings();
    expect(readings).toHaveLength(4);
    expect(unread).toEqual([]);
    expect(reconcile(readings)).toEqual([]);
  });

  it("catches the shape of the defect that shipped: paid derived two ways", async () => {
    supabaseFetch.mockImplementation(
      routeFetch({ axis: [{ axis: "landing", arm: "white", completions: 425, paid: 9 }] })
    );
    const { buildReadings } = await import("@/app/api/cron/brain-reconcile/route");
    const { reconcile, summarise } = await import("@features/brain/server/reconcile");
    const found = reconcile((await buildReadings()).readings);
    expect(found).toHaveLength(1);
    expect(summarise(found, 4)).toContain("paid, last 30 days");
  });

  it("reports an unreadable source as UNREAD, never as agreement", async () => {
    // Silence has to mean checked-and-fine. A failed read that quietly drops the check
    // turns "no news is good news" into a lie, which is the exact failure the battery's
    // hardcoded revenue fallback had.
    supabaseFetch.mockImplementation((path: string) =>
      path.includes("get_arm_cohorts") ? fail() : routeFetch()(path)
    );
    const { buildReadings } = await import("@/app/api/cron/brain-reconcile/route");
    const { readings, unread } = await buildReadings();
    expect(unread.join(" ")).toContain("get_arm_cohorts");
    // The checks it COULD run still run.
    expect(readings.length).toBeGreaterThan(0);
    expect(readings.every((r) => !r.what.includes("paid"))).toBe(true);
  });

  it("compares the corpus against the money, not the corpus against itself", async () => {
    // The published figure was wrong by EUR 145 this morning. Reading both sides from the
    // corpus would have agreed with itself perfectly and caught nothing.
    supabaseFetch.mockImplementation(routeFetch({ ledger: [{ amount: 559.51 }] }));
    const { buildReadings } = await import("@/app/api/cron/brain-reconcile/route");
    const { reconcile } = await import("@features/brain/server/reconcile");
    const found = reconcile((await buildReadings()).readings);
    expect(found.find((f) => f.what === "all-time revenue")?.detail).toContain("704.91");
  });
});
