import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@shared/http/google-oauth", () => ({
  DIRECTORY_SCOPE: "directory",
  GMAIL_SCOPE: "gmail",
  getGoogleAccessToken: vi.fn(async () => "own-token"),
  getDelegatedToken: vi.fn(async () => "delegated-token"),
  googleCredentialShape: () => "oidc=1",
}));

let existing: Array<{ source_id: string; meta: Record<string, unknown> }> = [];
let touchedCount = 0;
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    // sweepMissing's paged id listing -- `select=source_id&` (with the ampersand)
    // distinguishes it from knownThreads' `select=source_id,meta`.
    if (method === "GET" && /select=source_id&/.test(path)) {
      const off = Number(/offset=(\d+)/.exec(path)?.[1] ?? 0);
      return {
        ok: true,
        headers: new Headers(),
        json: async () => (off === 0 ? existing.map((e) => ({ source_id: e.source_id })) : []),
      };
    }
    if (method === "DELETE") {
      deletedIds.push(
        ...(decodeURIComponent(path).match(/"([^"]+)"/g) ?? []).map((q) => q.slice(1, -1))
      );
      return {
        ok: true,
        headers: new Headers(),
        json: async () => deletedIds.map(() => ({})),
      };
    }
    if (method === "GET" && path.includes("select=source_id,meta")) {
      const off = Number(/offset=(\d+)/.exec(path)?.[1] ?? 0);
      return { ok: true, headers: new Headers(), json: async () => (off === 0 ? existing : []) };
    }
    if (method === "PATCH") {
      touchedIds = [...String(init?.body ?? "").matchAll(/thread:[A-Za-z0-9_-]+/g)].map(
        (m) => m[0]
      );
      const inUrl = [...path.matchAll(/thread%3A[A-Za-z0-9_-]+/g)].map((m) =>
        decodeURIComponent(m[0])
      );
      if (inUrl.length) touchedIds = inUrl;
      touchedCount = existing.length;
      return {
        ok: true,
        headers: new Headers({ "content-range": `*/${touchedCount}` }),
        json: async () => [],
      };
    }
    return {
      ok: true,
      status: 201,
      headers: new Headers({ "content-range": "0-0/0" }),
      json: async () => [],
    };
  }),
}));

let listingOk = true;
/** RAW gmail thread ids whose FETCH fails, while the listing still names them. */
let failingThreadIds: string[] = [];
/** Threads the listing returns. */
let listedThreads: Array<{ id: string; historyId: string }> = [];
/** source_id -> whether touchChunks was asked to confirm it. */
let touchedIds: string[] = [];
/** Ids this run actually DELETED. Gmail sweeps by id set now, not by timestamp. */
const deletedIds: string[] = [];
/** Every URL the walk requested — the only way to see WHICH mailboxes it visited. */
const fetchedUrls: string[] = [];
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(async (url: string) => {
    fetchedUrls.push(url);
    // Directory API: pretend delegation cannot resolve the domain's mailboxes,
    // which is the real-world state this test exists for.
    if (url.includes("admin/directory")) {
      return { ok: false, status: 403, text: async () => "not delegated" };
    }
    // A single thread FETCH: /threads/<id>?format=full
    const one = /\/threads\/([^?]+)\?format=full/.exec(url);
    if (one) {
      const id = decodeURIComponent(one[1]!);
      if (failingThreadIds.includes(id)) {
        return { ok: false, status: 404, text: async () => '{"error":{"code":404}}' };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id,
          historyId: "9",
          messages: [
            {
              id: `m-${id}`,
              internalDate: "1787900000000",
              payload: {
                headers: [
                  { name: "Subject", value: `Thread ${id}` },
                  { name: "From", value: "Marcus <marcus@loveiq.org>" },
                ],
                mimeType: "text/plain",
                body: {
                  data: Buffer.from(
                    "A real conversation with enough text to clear the stub filter. ".repeat(3)
                  ).toString("base64"),
                },
              },
            },
          ],
        }),
        text: async () => "",
      };
    }
    if (url.includes("/threads")) {
      return listingOk
        ? {
            ok: true,
            status: 200,
            json: async () => ({ threads: listedThreads }),
            text: async () => "",
          }
        : {
            ok: false,
            status: 400,
            text: async () => '{"error":{"code":400,"message":"Precondition check failed."}}',
          };
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
  }),
}));

import { GMAIL_BUILDER_VERSION, ingestGmail } from "@features/brain/server/ingest/gmail";

beforeEach(() => {
  existing = [];
  touchedCount = 0;
  listingOk = true;
  failingThreadIds = [];
  listedThreads = [];
  touchedIds = [];
  deletedIds.length = 0;
  fetchedUrls.length = 0;
  process.env.GMAIL_MAILBOXES = "";
  delete process.env.GMAIL_EXCLUDE_MAILBOXES;
});

describe("a broken Gmail walk must not report success", () => {
  /**
   * THE REGRESSION THIS EXISTS FOR.
   *
   * `gmail-nothing-to-index` is a deliberate skip — it reports success and never
   * alerts, because an empty mailbox is not a fault. It was checked BEFORE
   * `complete`, so a run where Gmail refused every request also matched it.
   *
   * Observed in production on 2026-08-30: delegation stopped resolving mailboxes,
   * Gmail answered 400 "Precondition check failed" to every listing, and the only
   * thing keeping it visible was that the run still touched 9,061 existing rows.
   * A builder-version bump correctly stopped those touches — and the same broken
   * run started reporting success.
   */
  it("reports an incomplete walk, not 'nothing to index', when the API refuses everything", async () => {
    listingOk = false;
    const result = await ingestGmail("2026-08-30T00:00:00.000Z", () => false, null);
    expect(result.skipped).toBe("gmail-walk-incomplete");
    expect(result.skipped).not.toBe("gmail-nothing-to-index");
  });

  it("still reports 'nothing to index' when the walk genuinely completes and finds nothing", async () => {
    listingOk = true;
    const result = await ingestGmail("2026-08-30T00:00:00.000Z", () => false, null);
    expect(result.skipped).toBe("gmail-nothing-to-index");
  });

  it("never sweeps after a failed walk, or an outage would delete the corpus", async () => {
    listingOk = false;
    const result = await ingestGmail("2026-08-30T00:00:00.000Z", () => false, null);
    expect(result.swept).toBe(0);
  });
});

describe("one flaky thread must not block the sweep for the other 3,900", () => {
  const thread = (n: number) => ({ id: `t${n}`, historyId: "9" });

  it("completes the walk when a single thread fetch 404s", async () => {
    // A thread can be deleted between the listing and the fetch. Treating that as
    // an incomplete walk is why brain-gmail had never once completed, and an
    // incomplete walk blocks the sweep — so deleted threads lingered forever.
    listedThreads = [thread(1), thread(2), thread(3)];
    failingThreadIds = ["t2"];
    const result = await ingestGmail("2026-08-31T00:00:00.000Z", () => false, null);
    expect(result.skipped).toBeUndefined();
  });

  it("protects the failed thread's existing rows from that same sweep", async () => {
    /**
     * The reason this is safe. We could not read the thread, so we know nothing new
     * about it — deleting a real conversation because one fetch returned 404 is far
     * worse than carrying its chunk in an older shape for one more run.
     */
    listedThreads = [thread(1), thread(2)];
    failingThreadIds = ["t2"];
    /**
     * The three current rows are not decoration. Deleting t2 has to be a MINORITY of
     * this source or `sweepMissing` refuses on its majority guard, and the assertion
     * below would pass because nothing was ever deleted rather than because t2 was
     * protected. Verified by mutation: dropping the failed-thread branch in the
     * ingester deletes t2 and fails this test.
     */
    existing = [
      { source_id: "thread:t2", meta: { v: 1 } }, // deliberately STALE version
      { source_id: "thread:keep1", meta: { v: GMAIL_BUILDER_VERSION } },
      { source_id: "thread:keep2", meta: { v: GMAIL_BUILDER_VERSION } },
      { source_id: "thread:keep3", meta: { v: GMAIL_BUILDER_VERSION } },
    ];
    await ingestGmail("2026-08-31T00:00:00.000Z", () => false, null);
    // Used to assert the row was CONFIRMED by writing to it. There is no confirm
    // write any more, so assert what actually mattered: it is not deleted.
    expect(deletedIds).not.toContain("thread:t2");
  });

  it("still calls the walk incomplete when failures are systemic, not incidental", async () => {
    // 26 failures is a different KIND of problem from one, and must not sweep.
    listedThreads = Array.from({ length: 30 }, (_, i) => thread(i));
    failingThreadIds = Array.from({ length: 26 }, (_, i) => `t${i}`);
    const result = await ingestGmail("2026-08-31T00:00:00.000Z", () => false, null);
    expect(result.skipped).toBe("gmail-walk-incomplete");
  });
});

describe("a converging re-walk must not be as loud as an outage", () => {
  const thread = (n: number) => ({ id: `t${n}`, historyId: "9" });

  /**
   * THE MIRROR OF THE BUG ABOVE, and it was live for hours.
   *
   * A builder bump re-walks ~9,000 threads, which does not fit in one 60s run. So
   * every hourly run was incomplete, every run reported `error`, and `list_sources`
   * said Gmail was FAILING for what would have been ~18 predictable hours. An alert
   * that is permanently red cannot reveal a real outage inside that window — it
   * defeats the very guard the tests above exist to protect.
   *
   * Budget truncation heals itself on the next run. A refused listing does not.
   */
  it("reports a budget-truncated walk that advanced as progress, not failure", async () => {
    listedThreads = [thread(1), thread(2), thread(3)];
    let calls = 0;
    const result = await ingestGmail("2026-08-31T00:00:00.000Z", () => ++calls > 3, null);
    expect(result.skipped).toBe("gmail-walk-in-progress");
  });

  it("keeps a truncated walk that advanced NOTHING loud, so a stalled budget cannot hide", async () => {
    // If the budget were mis-set, every run would defer everything. Silence there
    // would mean Gmail quietly stopped updating and nothing ever said so.
    // The budget has to expire AFTER the entry guard -- exhausted on arrival is a
    // different, already-loud skip (`gmail-time-budget`).
    listedThreads = [thread(1), thread(2), thread(3)];
    let calls = 0;
    const result = await ingestGmail("2026-08-31T00:00:00.000Z", () => calls++ > 0, null);
    expect(result.skipped).toBe("gmail-walk-incomplete");
  });

  it("stays loud when a stall is masked by rows the DATABASE already held", async () => {
    /**
     * THE PRODUCTION CASE, AND WHY THE TWO TESTS ABOVE PASS WITHOUT COVERING IT.
     *
     * They run against an EMPTY corpus, so `touched` is 0 and `written + touched`
     * behaves exactly like `written`. In production the corpus holds ~9,000 rows,
     * `touched` is built from what the DATABASE already has rather than from
     * anything the walk did, and the sum is satisfied whether or not Gmail
     * answered at all. The loud branch was reachable only while the corpus was
     * empty -- once, ever, after a builder bump.
     *
     * Verified live on 2026-09-06: `brain_sweep_state` has NO gmail row, meaning
     * gmail has never once completed a walk, across 24 consecutive runs in 24
     * hours all recorded as `success` with no error.
     *
     * Progress is rows WRITTEN this run. What the database already held is not
     * evidence that Gmail answered.
     */
    existing = Array.from({ length: 40 }, (_, i) => ({
      source_id: `thread:old${i}`,
      meta: { v: GMAIL_BUILDER_VERSION },
    }));
    listedThreads = [thread(1), thread(2), thread(3)];
    let calls = 0;
    // Budget expires after the entry guard, so the walk is truncated having
    // written nothing -- while `touched` is 40.
    const result = await ingestGmail("2026-08-31T00:00:00.000Z", () => calls++ > 0, null);
    expect(result.skipped).toBe("gmail-walk-incomplete");
  });

  it("is exhausted-on-arrival, not 'incomplete', when there was never any budget", async () => {
    const result = await ingestGmail("2026-08-31T00:00:00.000Z", () => true, null);
    expect(result.skipped).toBe("gmail-time-budget");
  });

  it("keeps a refused listing loud even though it is also 'incomplete'", async () => {
    listingOk = false;
    const result = await ingestGmail("2026-08-31T00:00:00.000Z", () => false, null);
    expect(result.skipped).toBe("gmail-walk-incomplete");
  });

  it("still never sweeps while converging", async () => {
    listedThreads = [thread(1), thread(2), thread(3)];
    let calls = 0;
    const result = await ingestGmail("2026-08-31T00:00:00.000Z", () => ++calls > 3, null);
    expect(result.swept).toBe(0);
  });

  it("the cron treats only the progress skip as deliberate", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("app/api/cron/brain-gmail/route.ts", "utf8")
    );
    const block = src.slice(src.indexOf("DELIBERATE_SKIPS"), src.indexOf("export async function"));
    expect(block).toContain("gmail-walk-in-progress");
    expect(block).not.toContain('"gmail-walk-incomplete"');
  });
});

describe("the sweep may only judge mailboxes it actually walked", () => {
  /**
   * A LATENT DATA-LOSS BUG, found by looking at production rather than at the code.
   *
   * `domainMailboxes` lists `isSuspended=false` users, so an offboarded colleague
   * silently drops off the walk the day their account is suspended — which the
   * function's own doc comment says is fine, because "a departed colleague's mail
   * stays in the corpus as history but stops being re-read."
   *
   * It did not stay. Their rows are never listed, never written, and — being
   * stale-version after any builder bump — never confirmed either, so
   * `sweepMissing` reads them as deleted from the source. Measured 2026-09-06:
   * 232 rows across philipp.leonhard@, sk@ and teamwork@ sat in exactly that
   * state, 3.3% of the source, well under the majority guard. The first walk to
   * complete would have deleted all of them without a word.
   *
   * The rule is that "not seen" only means "gone" if we looked where it lives.
   */
  const thread = (n: number) => ({ id: `t${n}`, historyId: "9" });
  const current = (id: string) => ({
    source_id: `thread:${id}`,
    meta: { v: GMAIL_BUILDER_VERSION, mailbox: "me" },
  });

  beforeEach(() => {
    listedThreads = [thread(1)];
    existing = [
      // The offboarded colleague: stale version, mailbox nobody walks any more.
      { source_id: "thread:gone-box", meta: { v: 1, mailbox: "philipp.leonhard@loveiq.org" } },
      // Same staleness, but in a mailbox this run DID walk — still a sweep target.
      { source_id: "thread:stale-here", meta: { v: 1, mailbox: "me" } },
      // Keeps the orphan count a minority so the guard cannot pass this by refusing.
      current("k1"),
      current("k2"),
      current("k3"),
      current("k4"),
    ];
  });

  it("keeps rows from a mailbox that is no longer walked", async () => {
    await ingestGmail("2026-09-06T00:00:00.000Z", () => false, null);
    expect(deletedIds).not.toContain("thread:gone-box");
  });

  it("still sweeps a stale row from a mailbox it did walk", async () => {
    // The positive control. A blanket "keep everything stale" would pass the test
    // above while undoing the v2-stub cleanup that rule was written for.
    await ingestGmail("2026-09-06T00:00:00.000Z", () => false, null);
    expect(deletedIds).toContain("thread:stale-here");
  });

  it("keeps a row it cannot attribute to any mailbox", async () => {
    // Absence of evidence is not evidence of deletion.
    existing.push({ source_id: "thread:no-box", meta: { v: 1 } });
    await ingestGmail("2026-09-06T00:00:00.000Z", () => false, null);
    expect(deletedIds).not.toContain("thread:no-box");
  });
});

describe("the walk must say which of the six ways it stopped", () => {
  /**
   * `complete = false` was set at six different places and reported as one bit, so
   * a page cap, a time budget, a refused listing and an unreachable mailbox all
   * looked the same from `cron_run`. Gmail has never completed a walk — and with
   * only that bit there was no way to tell, from stored data, which of the six was
   * happening.
   */
  const thread = (n: number) => ({ id: `t${n}`, historyId: "9" });

  it("names a refused listing, and says the walk did not complete", async () => {
    listingOk = false;
    const r = await ingestGmail("2026-09-06T00:00:00.000Z", () => false, null);
    expect(r.complete).toBe(false);
    expect(r.detail).toMatch(/stopped=listing-refused@/);
  });

  it("names the time budget, and distinguishes it from a refused listing", async () => {
    listedThreads = [thread(1), thread(2)];
    // False once so the walk actually starts, then true — otherwise this measures
    // the "never started" path, which is a different outcome with its own detail.
    let first = true;
    const r = await ingestGmail(
      "2026-09-06T00:00:00.000Z",
      () => {
        if (first) {
          first = false;
          return false;
        }
        return true;
      },
      null
    );
    expect(r.detail).toMatch(/stopped=time-budget@/);
    expect(r.detail).not.toMatch(/listing-refused/);
  });

  it("reports the FIRST fault, not the last, when several mailboxes fail", async () => {
    /**
     * The first fault is the one that explains the rest. Last-wins would report the
     * time budget running out on the fourth mailbox and bury the refused listing on
     * the first — which is the difference between "slow" and "broken".
     */
    process.env.GMAIL_MAILBOXES = "first@loveiq.org,second@loveiq.org";
    listingOk = false;
    const r = await ingestGmail("2026-09-06T00:00:00.000Z", () => false, null);
    expect(r.detail).toMatch(/stopped=listing-refused@first@loveiq\.org/);
    expect(r.detail).not.toMatch(/stopped=listing-refused@second/);
  });

  it("reports a complete walk as complete, with its counts", async () => {
    // The positive control: a detail that always said "stopped" would be useless.
    listedThreads = [thread(1)];
    const r = await ingestGmail("2026-09-06T00:00:00.000Z", () => false, null);
    expect(r.complete).toBe(true);
    expect(r.detail).toMatch(/complete=true/);
    expect(r.detail).not.toMatch(/stopped=/);
    expect(r.detail).toMatch(/listed=1/);
  });
});

describe("a mailbox can be excluded from the walk without deleting its history", () => {
  /**
   * WIRING, not logic. `excludeMailboxes` has its own unit tests and they all passed
   * while the walk ignored it entirely — proven by mutation: replacing the call at the
   * call site with the identity function left every one of them green. A helper that is
   * correct and never invoked is the same as no helper.
   *
   * The directory drops a person when their account is SUSPENDED, which does not cover
   * a colleague who has left while their account is still live during handover.
   */
  const thread = (n: number) => ({ id: `t${n}`, historyId: "9" });

  it("does not visit a mailbox named in the exclusion list", async () => {
    process.env.GMAIL_MAILBOXES = "stays@loveiq.org,goes@loveiq.org";
    process.env.GMAIL_EXCLUDE_MAILBOXES = "goes@loveiq.org";
    listedThreads = [thread(1)];
    await ingestGmail("2026-09-06T00:00:00.000Z", () => false, null);
    expect(fetchedUrls.some((u) => u.includes("stays%40loveiq.org"))).toBe(true);
    expect(fetchedUrls.some((u) => u.includes("goes%40loveiq.org"))).toBe(false);
  });

  it("keeps the excluded mailbox's existing rows rather than sweeping them", async () => {
    /**
     * The half that makes exclusion safe. An unwalked mailbox is not a deleted one —
     * the keep-set spares it — so turning a mailbox off preserves its history instead
     * of quietly destroying it. Removing that history is a separate, deliberate act.
     */
    process.env.GMAIL_MAILBOXES = "stays@loveiq.org,goes@loveiq.org";
    process.env.GMAIL_EXCLUDE_MAILBOXES = "goes@loveiq.org";
    listedThreads = [thread(1)];
    existing = [
      { source_id: "thread:old", meta: { v: 1, mailbox: "goes@loveiq.org" } },
      ...Array.from({ length: 4 }, (_, i) => ({
        source_id: `thread:k${i}`,
        meta: { v: GMAIL_BUILDER_VERSION, mailbox: "stays@loveiq.org" },
      })),
    ];
    await ingestGmail("2026-09-06T00:00:00.000Z", () => false, null);
    expect(deletedIds).not.toContain("thread:old");
  });
});
