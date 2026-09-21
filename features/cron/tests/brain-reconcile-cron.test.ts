import { beforeEach, describe, expect, it, vi } from "vitest";
import { reportingDay, reportingDayStart } from "@shared/time/reporting-day";

const supabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...a: unknown[]) => supabaseFetch(...a),
  /**
   * Mirrors the real countRows: it reads the total out of `content-range`, not
   * the body. Routed through the same fake fetch so a test can break the count
   * the same way it breaks any other source.
   */
  countRows: async (path: string) => {
    const res = (await supabaseFetch(path, {
      headers: { Prefer: "count=exact", Range: "0-0" },
    })) as { ok: boolean; headers: { get: (k: string) => string | null } };
    if (!res.ok) return null;
    const range = res.headers.get("content-range");
    const total = range?.split("/")[1];
    return total && total !== "*" ? Number(total) : null;
  },
  /**
   * Delegates to the same mock, so every fixture below still drives it.
   */
  fetchAllRows: async (path: string) => {
    const res = (await supabaseFetch(path)) as { ok: boolean; json: () => Promise<unknown> };
    if (!res?.ok) return null;
    return await res.json();
  },
}));

import { buildReportVoiceRows } from "@features/brain/server/ingest/report-voice";
import { buildDomainRows } from "@features/brain/server/ingest/domain";

/** Fixed so the fixture's rows and the route's rows are stamped identically. */
const STAMP = "2026-09-20T00:00:00.000Z";

/**
 * The anon-readability probe leaves the building through `fetchWithTimeout`, not through
 * `supabaseFetch` — it has to use the BROWSER key to mean anything at all.
 */
const anonProbe: { status: number; rows: unknown[]; throws: boolean } = {
  status: 200,
  rows: [],
  throws: false,
};
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(async () => {
    if (anonProbe.throws) throw new Error("network down");
    return {
      ok: anonProbe.status >= 200 && anonProbe.status < 300,
      status: anonProbe.status,
      json: async () => anonProbe.rows,
      text: async () => JSON.stringify(anonProbe.rows),
    };
  }),
}));

const ok = (body: unknown) => ({ ok: true, json: async () => body, headers: { get: () => null } });
const fail = () => ({
  ok: false,
  status: 500,
  json: async () => null,
  headers: { get: () => null },
});

/**
 * The contract readings compare the RPC's own output against facts, so the
 * fixtures have to be internally consistent rather than arbitrary: the series'
 * last day must be the day before the window closes, and firstRowDay must match
 * the server signal's first row. A test that wants to break one breaks it
 * explicitly through `over`.
 */
const PAYWALL_SIGNAL_DAY = "2026-09-05";
function defaultLastDay(): string {
  const until = reportingDayStart(reportingDay(new Date()));
  return reportingDay(new Date(until.getTime() - 1));
}

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
      return ok(
        "cvr" in over
          ? over.cvr
          : { days: [{ day: defaultLastDay(), visitors: 12308, completions: 417 }] }
      );
    if (path.includes("get_paywall_hits"))
      return ok("paywall" in over ? over.paywall : { hits: 131, firstRowDay: PAYWALL_SIGNAL_DAY });
    // The server paywall signal's first row, read for the firstRowDay contract.
    if (path.includes("report_price_quote") && path.includes("paywall_reached_at"))
      return ok(
        "serverSignal" in over
          ? over.serverSignal
          : [{ paywall_reached_at: `${PAYWALL_SIGNAL_DAY}T12:00:00Z` }]
      );
    // The submission count for the conservation reading (count=exact header).
    if (path.includes("/survey_submission?select=id")) {
      const n = (over.submissionCount as number | undefined) ?? 417;
      return { ok: true, json: async () => [], headers: { get: () => `0-0/${n}` } };
    }
    if (path.includes("get_landing_arm_funnel_daily"))
      return ok("arm" in over ? over.arm : { visitors: [{ n: 12308 }] });
    if (path.includes("source_id=eq.alltime"))
      return ok("corpus" in over ? over.corpus : [{ body: "Revenue: EUR 704.91" }]);
    if (path.includes("/payment?"))
      return ok("ledger" in over ? over.ledger : [{ amount: 704.91 }]);
    // The stored TEXT of the repo-built corpora, read back to compare against what the
    // builder produces. Defaults to exactly the builder's own rows, so an ordinary run
    // agrees; `reportEdited` stands in for a chapter rewritten after it was ingested.
    if (path.includes("select=source_id,body")) {
      if (over.textFails) return fail();
      const built = path.includes("source=eq.report")
        ? buildReportVoiceRows(STAMP)
        : buildDomainRows(STAMP);
      const rows = built.map((r) => ({ source_id: r.source_id, body: r.body }));
      if (over.reportEdited && path.includes("source=eq.report") && rows[0]) {
        rows[0] = { ...rows[0], body: `${rows[0].body} — and a sentence nobody shipped` };
      }
      if (over.domainDropped && path.includes("source=eq.domain")) rows.shift();
      return ok(rows);
    }
    // The repo-built corpora are counted through a `count=exact` HEAD-style read, so the
    // number arrives in the header rather than the body.
    if (path.includes("source=eq.report") || path.includes("source=eq.domain")) {
      const held = path.includes("source=eq.report")
        ? ((over.reportHeld as number | undefined) ?? 682)
        : ((over.domainHeld as number | undefined) ?? 341);
      return { ok: true, json: async () => [], headers: { get: () => `0-0/${held}` } };
    }
    /**
     * Rows that carry no sweep scope. Default none; `unsweepable` plants some.
     *
     * Answered through `content-range`, because that is what the real `countRows`
     * reads — a body-length fixture silently shadowed the shared mock and made an
     * unrelated check report 0 against 417.
     *
     * The planted rows are returned ONLY when the query actually covers `calendar`,
     * the source that had the problem. Without that, narrowing the check to gmail
     * alone passed every test.
     */
    if (path.includes("mailbox=is.null")) {
      if (over.unsweepableFails) return fail();
      const n = path.includes("calendar") ? ((over.unsweepable as number | undefined) ?? 0) : 0;
      return { ok: true, json: async () => [], headers: { get: () => `0-0/${n}` } };
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
  beforeEach(() => {
    vi.clearAllMocks();
    anonProbe.status = 200;
    anonProbe.rows = [];
    anonProbe.throws = false;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";
    process.env.SUPABASE_URL = "https://example.supabase.co";
  });

  it("builds every check and finds no gap when production agrees", async () => {
    supabaseFetch.mockImplementation(routeFetch());
    const { buildReadings } = await import("@/app/api/cron/brain-reconcile/route");
    const { reconcile } = await import("@features/brain/server/reconcile");
    const { readings, unread } = await buildReadings();
    expect(readings).toHaveLength(14);
    expect(unread).toEqual([]);
    expect(reconcile(readings)).toEqual([]);
  });

  /**
   * A REWRITTEN CHAPTER CHANGES NO COUNT.
   *
   * The chunk keeps its `source_id` and the corpus keeps the old words, so every count
   * in this reconciler still agrees while the brain quotes copy we no longer ship. The
   * second assertion is the one that earns this check its place: it proves the counting
   * check is blind here, so deleting the text check would not be caught by it.
   */
  it("notices a chapter whose stored text is no longer what we ship", async () => {
    supabaseFetch.mockImplementation(routeFetch({ reportEdited: true }));
    const { buildReadings } = await import("@/app/api/cron/brain-reconcile/route");
    const { reconcile } = await import("@features/brain/server/reconcile");
    const { readings } = await buildReadings();
    const found = reconcile(readings).find((d) => d.what.includes("stored text"));
    expect(found).toBeDefined();
    expect(found!.gap).toBe(1);
  });

  it("and the row COUNTS agree throughout, which is why counting them is not enough", async () => {
    supabaseFetch.mockImplementation(routeFetch({ reportEdited: true }));
    const { buildReadings } = await import("@/app/api/cron/brain-reconcile/route");
    const { reconcile } = await import("@features/brain/server/reconcile");
    const { readings } = await buildReadings();
    expect(
      reconcile(readings).find((d) => d.what.includes("chunks in the corpus"))
    ).toBeUndefined();
  });

  it("notices a chunk the builder produces that the corpus does not hold at all", async () => {
    supabaseFetch.mockImplementation(routeFetch({ domainDropped: true }));
    const { buildReadings } = await import("@/app/api/cron/brain-reconcile/route");
    const { reconcile } = await import("@features/brain/server/reconcile");
    const { readings } = await buildReadings();
    expect(reconcile(readings).find((d) => d.what.includes("stored text"))).toBeDefined();
  });

  it("reports the text as UNREAD when it cannot be fetched, rather than as agreeing", async () => {
    // "Could not read it" is not "it agrees" — the rule the whole reconciler runs on.
    supabaseFetch.mockImplementation(routeFetch({ textFails: true }));
    const { buildReadings } = await import("@/app/api/cron/brain-reconcile/route");
    const { reconcile } = await import("@features/brain/server/reconcile");
    const { readings, unread } = await buildReadings();
    expect(unread).toContain("report chunk text");
    expect(reconcile(readings).find((d) => d.what.includes("stored text"))).toBeUndefined();
  });

  /**
   * THE BOUNDARY NOTHING ELSE ENFORCES.
   *
   * `brain_chunk` holds the company's mail, contracts and meeting transcripts, and what
   * keeps it private is one RLS policy whose USING clause is `false`. The integration
   * test that covers it skips silently when `SUPABASE_TEST_URL` is unset — and it is
   * unset, in CI and locally — so until this check there was nothing between a dropped
   * policy and the whole corpus being readable with the key in every page source.
   */
  it("notices when the corpus answers a browser key with actual rows", async () => {
    anonProbe.rows = [{ id: 1 }, { id: 2 }];
    supabaseFetch.mockImplementation(routeFetch());
    const { buildReadings } = await import("@/app/api/cron/brain-reconcile/route");
    const { reconcile } = await import("@features/brain/server/reconcile");
    const { readings } = await buildReadings();
    const found = reconcile(readings).find((d) => d.what.includes("browser key"));
    expect(found).toBeDefined();
    expect(found!.gap).toBe(2);
  });

  it.each([401, 403])(
    "treats HTTP %i as the boundary HOLDING, not as a failure",
    async (status) => {
      // A refusal is the policy working. Only a 2xx that returns rows is exposure.
      anonProbe.status = status;
      supabaseFetch.mockImplementation(routeFetch());
      const { buildReadings } = await import("@/app/api/cron/brain-reconcile/route");
      const { reconcile } = await import("@features/brain/server/reconcile");
      const { readings, unread } = await buildReadings();
      expect(unread.join()).not.toContain("browser key");
      expect(reconcile(readings).find((d) => d.what.includes("browser key"))).toBeUndefined();
    }
  );

  it.each([
    [
      "an unexpected status",
      () => {
        anonProbe.status = 500;
      },
    ],
    [
      "a network failure",
      () => {
        anonProbe.throws = true;
      },
    ],
    [
      "no browser key configured",
      () => {
        delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      },
    ],
  ])("reports UNREAD on %s, rather than a clean bill of health", async (_what, arrange) => {
    arrange();
    supabaseFetch.mockImplementation(routeFetch());
    const { buildReadings } = await import("@/app/api/cron/brain-reconcile/route");
    const { reconcile } = await import("@features/brain/server/reconcile");
    const { readings, unread } = await buildReadings();
    expect(unread.join(" ")).toContain("browser key");
    expect(reconcile(readings).find((d) => d.what.includes("browser key"))).toBeUndefined();
  });

  /**
   * A ROW OUTSIDE EVERY SWEEP SCOPE OUTLIVES WHAT IT DESCRIBES.
   *
   * `calendar` sweeps by `meta.mailbox`, so six rows without one sat frozen since
   * 2026-09-17 while every other calendar chunk was touched hourly — two of them
   * occurrences of the Roadmap workshop on dates it had been moved off, so the corpus
   * held three dates for one meeting.
   */
  it("notices rows that carry no sweep scope", async () => {
    supabaseFetch.mockImplementation(routeFetch({ unsweepable: 6 }));
    const { buildReadings } = await import("@/app/api/cron/brain-reconcile/route");
    const { reconcile } = await import("@features/brain/server/reconcile");
    const { readings } = await buildReadings();
    const found = reconcile(readings).find((d) => d.what.includes("scope"));
    expect(found).toBeDefined();
    expect(found!.gap).toBe(6);
  });

  it("reports UNREAD when that count cannot be taken, not zero", async () => {
    supabaseFetch.mockImplementation(routeFetch({ unsweepableFails: true }));
    const { buildReadings } = await import("@/app/api/cron/brain-reconcile/route");
    const { reconcile } = await import("@features/brain/server/reconcile");
    const { readings, unread } = await buildReadings();
    expect(unread.join(" ")).toContain("sweep cannot reach");
    expect(reconcile(readings).find((d) => d.what.includes("scope"))).toBeUndefined();
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

  /**
   * The SQL-to-TypeScript contract readings.
   *
   * These exist because nothing else checks it: the unit tests everywhere else
   * mock the RPCs, so a fixture encodes what an RPC is BELIEVED to return and
   * production is free to disagree — which is how get_paywall_hits shipped a
   * firstRowDay that disabled the funnel's coverage caveat for weeks with every
   * test green. Each test below breaks one invariant and expects drift; a
   * reading that cannot fail is not a check.
   */
  it("drifts when firstRowDay is not the later paywall signal", async () => {
    // The defect exactly: MIN across both signals returns the LOSSY client
    // event's start instead of the server column's.
    supabaseFetch.mockImplementation(
      routeFetch({ paywall: { hits: 131, firstRowDay: "2026-05-24" } })
    );
    const { buildReadings } = await import("@/app/api/cron/brain-reconcile/route");
    const { reconcile } = await import("@features/brain/server/reconcile");
    const gaps = reconcile((await buildReadings()).readings);
    expect(gaps.map((g) => g.what)).toContain("paywall signal start, as the digest is told it");
  });

  it("drifts when the day series stops short of the window", async () => {
    // A bare ::date on a Berlin-midnight bound cuts the last day off the axis,
    // so the newest day reads as absent rather than zero.
    supabaseFetch.mockImplementation(
      routeFetch({ cvr: { days: [{ day: "2026-01-01", visitors: 12308, completions: 417 }] } })
    );
    const { buildReadings } = await import("@/app/api/cron/brain-reconcile/route");
    const { reconcile } = await import("@features/brain/server/reconcile");
    const gaps = reconcile((await buildReadings()).readings);
    expect(gaps.map((g) => g.what)).toContain("last day of the daily funnel series");
  });

  it("drifts when a submission falls outside the charted days", async () => {
    // The window total stays right and only the chart loses the row, so this
    // comparison is the only thing that sees it.
    supabaseFetch.mockImplementation(routeFetch({ submissionCount: 419 }));
    const { buildReadings } = await import("@/app/api/cron/brain-reconcile/route");
    const { reconcile } = await import("@features/brain/server/reconcile");
    const gaps = reconcile((await buildReadings()).readings);
    expect(gaps.map((g) => g.what)).toContain("submissions charted vs submissions that exist");
  });

  it("reports the contract sources as UNREAD when they cannot be read", async () => {
    // Never a silent pass: an unreadable RPC must not look like agreement.
    supabaseFetch.mockImplementation(routeFetch({ paywall: null, cvr: null }));
    const { buildReadings } = await import("@/app/api/cron/brain-reconcile/route");
    const { unread } = await buildReadings();
    expect(unread).toContain("get_paywall_hits firstRowDay");
    expect(unread).toContain("get_funnel_cvr_sparklines day series");
  });
});
