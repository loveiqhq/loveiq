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
    // The repo-built corpora are counted through a `count=exact` HEAD-style read, so the
    // number arrives in the header rather than the body.
    if (path.includes("source=eq.report") || path.includes("source=eq.domain")) {
      const held = path.includes("source=eq.report")
        ? ((over.reportHeld as number | undefined) ?? 682)
        : ((over.domainHeld as number | undefined) ?? 341);
      return { ok: true, json: async () => [], headers: { get: () => `0-0/${held}` } };
    }
    // The corpus secret scan pages `select=body,title,url`. Default: one clean page, which
    // ends the loop. `leakyChunks` plants rows that still carry a secret.
    if (path.includes("select=body,title,url")) {
      if (over.scanFails) return fail();
      // `pages` lets a test put a leak on the SECOND page, which is the only way to prove
      // the scan does not stop after one — the defect the first version of it shipped with.
      const pages = (over.pages as unknown[][] | undefined) ?? [
        (over.leakyChunks as unknown[]) ?? [
          { body: "an ordinary chunk with no secret", title: "fine", url: null },
        ],
      ];
      const m = /offset=(\d+)/.exec(path);
      const index = m ? Number(m[1]) / 1000 : 0;
      return ok(pages[index] ?? []);
    }
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
    expect(readings).toHaveLength(7);
    expect(unread).toEqual([]);
    expect(reconcile(readings)).toEqual([]);
  });

  it("notices a chunk that still holds a secret", async () => {
    /**
     * The regression this exists for: on 2026-09-17 a hand-run WhatsApp sync from a stale
     * checkout put six live report-access tokens back into the corpus forty minutes after
     * they had been cleaned out, and nothing noticed.
     */
    supabaseFetch.mockImplementation(
      routeFetch({
        leakyChunks: [
          {
            body: "see https://www.loveiq.org/report/rpt_AAAAAAAAAAAAAAAAAAAA",
            title: "t",
            url: null,
          },
          { body: "clean", title: "t", url: null },
        ],
      })
    );
    const { buildReadings } = await import("@/app/api/cron/brain-reconcile/route");
    const { reconcile } = await import("@features/brain/server/reconcile");
    const { readings } = await buildReadings();
    const found = reconcile(readings).find((d) => d.what.includes("holding a secret"));
    expect(found).toBeDefined();
    expect(found!.gap).toBe(1);
  });

  it("keeps scanning past the first page", async () => {
    /**
     * THE DEFECT THIS CHECK ITSELF SHIPPED WITH. The first version read one page of 5,000
     * and reported zero while a planted token sat outside it — a bounded scan that says
     * "clean" is worse than no scan, because it answers confidently and wrongly.
     *
     * The leak is placed on the SECOND page, so a scan that stops after one cannot find it.
     */
    const fullPage = Array.from({ length: 1000 }, () => ({ body: "clean", title: "t", url: null }));
    supabaseFetch.mockImplementation(
      routeFetch({
        pages: [
          fullPage,
          [
            {
              body: "https://www.loveiq.org/report/rpt_AAAAAAAAAAAAAAAAAAAA",
              title: "t",
              url: null,
            },
          ],
        ],
      })
    );
    const { buildReadings } = await import("@/app/api/cron/brain-reconcile/route");
    const { reconcile } = await import("@features/brain/server/reconcile");
    const { readings } = await buildReadings();
    const found = reconcile(readings).find((d) => d.what.includes("holding a secret"));
    expect(found, "a leak on page two must still be found").toBeDefined();
    expect(found!.gap).toBe(1);
  });

  it("reports a failed scan as unread, never as a clean zero", async () => {
    /**
     * A scan that could not finish knows nothing about what it did not read. Pushing a
     * reading of zero there would publish "no secrets in the corpus" on the strength of
     * having looked at none of it.
     */
    supabaseFetch.mockImplementation(routeFetch({ scanFails: true }));
    const { buildReadings } = await import("@/app/api/cron/brain-reconcile/route");
    const { readings, unread } = await buildReadings();
    expect(unread.some((u) => u.includes("secret scan"))).toBe(true);
    expect(readings.some((r) => r.what.includes("holding a secret"))).toBe(false);
  });

  it("catches the shape of the defect that shipped: paid derived two ways", async () => {
    supabaseFetch.mockImplementation(
      routeFetch({ axis: [{ axis: "landing", arm: "white", completions: 425, paid: 9 }] })
    );
    const { buildReadings } = await import("@/app/api/cron/brain-reconcile/route");
    const { reconcile, summarise } = await import("@features/brain/server/reconcile");
    const found = reconcile((await buildReadings()).readings);
    expect(found).toHaveLength(1);
    expect(summarise(found, 6)).toContain("paid, last 30 days");
  });

  it("notices a repo-built corpus that lost rows without anyone noticing", async () => {
    /**
     * `report` and `domain` are built from files, so the count they SHOULD hold is knowable
     * exactly. Their ingesters refuse to sweep on an empty build — but a build producing
     * HALF its rows sweeps the rest away and looks like a normal run. A renamed data file
     * or a parser that stops matching is silent otherwise.
     */
    supabaseFetch.mockImplementation(routeFetch({ reportHeld: 340 }));
    const { buildReadings } = await import("@/app/api/cron/brain-reconcile/route");
    const { reconcile } = await import("@features/brain/server/reconcile");
    const found = reconcile((await buildReadings()).readings);
    const hit = found.find((f) => f.what.includes("report chunks"));
    expect(hit, "a corpus missing half its rows must be reported").toBeDefined();
    expect(hit!.detail).toContain("340");
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
