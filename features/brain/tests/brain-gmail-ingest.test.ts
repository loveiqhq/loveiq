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
/** RAW gmail thread ids whose FETCH returns a one-line stub, which threadToRows refuses. */
let stubThreadIds: string[] = [];
/** RAW gmail thread ids whose FETCH returns a candidate's application task. */
let recruitingBodyIds: string[] = [];
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
      const text = stubThreadIds.includes(id)
        ? "ok"
        : recruitingBodyIds.includes(id)
          ? "Thanks for the call. As aligned, here is the Application Task for the role. ".repeat(2)
          : "A real conversation with enough text to clear the stub filter. ".repeat(3);
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
                body: { data: Buffer.from(text).toString("base64") },
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

import { decodeEntities } from "@shared/format/html-escape";
import {
  GMAIL_BUILDER_VERSION,
  RECRUITING_SUBJECT_TERMS,
  ingestGmail,
  isRecruitingThread,
  messageText,
} from "@features/brain/server/ingest/gmail";

beforeEach(() => {
  existing = [];
  touchedCount = 0;
  listingOk = true;
  failingThreadIds = [];
  stubThreadIds = [];
  recruitingBodyIds = [];
  listedThreads = [];
  touchedIds = [];
  deletedIds.length = 0;
  fetchedUrls.length = 0;
  process.env.GMAIL_MAILBOXES = "";
  delete process.env.GMAIL_EXCLUDE_MAILBOXES;
  delete process.env.GMAIL_EXCLUDE_SUBJECTS;
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
    // k1-k4 are LISTED: a current row stands for a thread that still exists, and one
    // that is no longer listed is exactly what the sweep is for (see the next block).
    listedThreads = [thread(1), ...["k1", "k2", "k3", "k4"].map((id) => ({ id, historyId: "9" }))];
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

describe("a current row is kept only while its thread is still listed", () => {
  /**
   * THE PROMISE THE KEEP-SET NEVER KEPT.
   *
   * `excludeSubjects` and CLAUDE.md both say an excluded thread is swept because it is
   * never listed: "sweepMissing keeps anything in `seen`". The keep-set never looked at
   * `seen` — it kept every current-version row from a walked mailbox, listed or not — so
   * an exclusion only ever took effect when a builder bump made the old rows stale.
   */
  const current = (id: string) => ({
    source_id: `thread:${id}`,
    meta: { v: GMAIL_BUILDER_VERSION, mailbox: "me", historyId: "9" },
  });
  const listed = (id: string) => ({ id, historyId: "9" });

  beforeEach(() => {
    // Enough listed, current threads that the orphans stay a minority, so the majority
    // guard cannot make any of these pass by refusing to sweep at all.
    listedThreads = ["k1", "k2", "k3", "k4", "k5"].map(listed);
    existing = ["k1", "k2", "k3", "k4", "k5"].map(current);
  });

  it("sweeps a current row whose thread is no longer listed", async () => {
    // Deleted upstream, or newly excluded by subject: either way, not listed.
    existing.push(current("vanished"));
    await ingestGmail("2026-09-23T00:00:00.000Z", () => false, null);
    expect(deletedIds).toContain("thread:vanished");
  });

  it("sweeps a current row whose thread was re-read and refused", async () => {
    // Listed, fetched because its history moved, and no longer something we index.
    listedThreads.push({ id: "refused", historyId: "10" });
    stubThreadIds = ["refused"];
    existing.push(current("refused"));
    await ingestGmail("2026-09-23T00:00:00.000Z", () => false, null);
    expect(deletedIds).toContain("thread:refused");
  });

  it("keeps a current, listed, unchanged thread without re-reading it", async () => {
    // The positive control: the common case must neither be swept nor re-fetched.
    await ingestGmail("2026-09-23T00:00:00.000Z", () => false, null);
    expect(deletedIds).not.toContain("thread:k1");
    expect(fetchedUrls.some((u) => /\/threads\/k1\?format=full/.test(u))).toBe(false);
  });

  it("still keeps a listed thread whose re-read failed", async () => {
    // A 404 between listing and fetch is not evidence of deletion.
    listedThreads.push({ id: "flaky", historyId: "10" });
    failingThreadIds = ["flaky"];
    existing.push(current("flaky"));
    await ingestGmail("2026-09-23T00:00:00.000Z", () => false, null);
    expect(deletedIds).not.toContain("thread:flaky");
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

describe("subject exclusions must reach the Gmail listing query", () => {
  /** The decoded `q=` of the first thread-listing request the walk made. */
  const listingQuery = (): string => {
    const url = fetchedUrls.find((u) => /\/threads\?maxResults/.test(u));
    if (!url) throw new Error("the walk never listed any threads");
    return decodeURIComponent(/[?&]q=([^&]*)/.exec(url)?.[1] ?? "");
  };

  /**
   * THE GUARD THIS EXISTS FOR, found by mutation testing on 2026-09-06.
   *
   * `excludeSubjects()` had six unit tests of its own and all six passed while the
   * call was deleted from the listing URL — the parser was covered, the WIRING was
   * not, so the whole exclusion could be silently dead with a green suite. The
   * listing is also the only placement that works: `seen` is filled from it and
   * `sweepMissing` protects everything in `seen`, so filtering anywhere later would
   * leave the already-indexed rows alive forever.
   */
  it("puts the configured term in the query the walk actually sends", async () => {
    process.env.GMAIL_EXCLUDE_SUBJECTS = "SHOWUP";
    await ingestGmail("2026-08-30T00:00:00.000Z", () => false, null);
    expect(listingQuery()).toContain("-subject:SHOWUP");
  });

  it("still excludes Google's own noise buckets alongside it", async () => {
    process.env.GMAIL_EXCLUDE_SUBJECTS = "SHOWUP";
    await ingestGmail("2026-08-30T00:00:00.000Z", () => false, null);
    expect(listingQuery()).toContain("-in:spam");
  });

  it("adds nothing beyond the always-on recruiting terms when none is configured", async () => {
    delete process.env.GMAIL_EXCLUDE_SUBJECTS;
    await ingestGmail("2026-08-30T00:00:00.000Z", () => false, null);
    const terms = [...listingQuery().matchAll(/-subject:("[^"]+"|\S+)/g)].map((m) =>
      m[1]!.replace(/"/g, "")
    );
    expect(terms.length).toBeGreaterThan(0);
    for (const t of terms) expect(RECRUITING_SUBJECT_TERMS).toContain(t);
  });

  /**
   * JOB APPLICATIONS STAY OUT (owner's decision, 2026-09-23), at the listing so an
   * excluded thread is neither fetched nor kept. The wiring is what matters: a term list
   * nobody sends is the 2026-09-06 failure above.
   */
  it("sends every recruiting term in the query the walk actually makes", async () => {
    await ingestGmail("2026-09-23T00:00:00.000Z", () => false, null);
    const q = listingQuery();
    for (const t of ["application", "applicants", "internship", "interview", "cv", "candidate"]) {
      expect(q).toContain(`-subject:${t}`);
    }
    expect(q).toContain('-subject:"design intern follow up"');
  });
});

describe("recruiting mail the subject does not give away", () => {
  it("refuses a thread whose body carries a candidate's application task", () => {
    expect(
      isRecruitingThread("Follow-up :)", "Hey :) As aligned, here is the Application Task.")
    ).toBe(true);
    expect(
      isRecruitingThread("Follow-up :)", "Application Taks — Chief of Staff (Internship)")
    ).toBe(true);
  });

  it("refuses such a thread in the walk, and sweeps what it had stored", async () => {
    // At the call site, not only the predicate: a rule nothing calls is decoration.
    const current = (id: string) => ({
      source_id: `thread:${id}`,
      meta: { v: GMAIL_BUILDER_VERSION, mailbox: "me", historyId: "9" },
    });
    listedThreads = [
      ...["k1", "k2", "k3", "k4"].map((id) => ({ id, historyId: "9" })),
      { id: "task", historyId: "10" },
    ];
    existing = [...["k1", "k2", "k3", "k4"].map(current), current("task")];
    recruitingBodyIds = ["task"];
    await ingestGmail("2026-09-23T00:00:00.000Z", () => false, null);
    expect(deletedIds).toContain("thread:task");
    expect(deletedIds).not.toContain("thread:k1");
  });

  it("keeps a thread with the same subject that is not about a candidate", () => {
    // The sixth "Follow-up :)" is a letter about the Academic Board.
    expect(
      isRecruitingThread(
        "Follow-up :)",
        "Lieber Konrad, anbei das Manifest unseres Academic Boards."
      )
    ).toBe(false);
  });
});

describe("a never-index mailbox is neither walked nor kept", () => {
  const listed = (id: string) => ({ id, historyId: "9" });
  const row = (id: string, mailbox: string) => ({
    source_id: `thread:${id}`,
    meta: { v: GMAIL_BUILDER_VERSION, mailbox, historyId: "9" },
  });

  it("never lists threads from it, even when it is configured", async () => {
    process.env.GMAIL_MAILBOXES = "me@loveiq.org,hr@loveiq.org";
    await ingestGmail("2026-09-23T00:00:00.000Z", () => false, null);
    expect(
      fetchedUrls.some(
        (u) => u.includes(encodeURIComponent("hr@loveiq.org")) || u.includes("/users/hr@")
      )
    ).toBe(false);
  });

  it("sweeps what it already stored, unlike a mailbox that merely stopped being walked", async () => {
    process.env.GMAIL_MAILBOXES = "me@loveiq.org";
    listedThreads = ["k1", "k2", "k3", "k4"].map(listed);
    existing = [
      ...["k1", "k2", "k3", "k4"].map((id) => row(id, "me@loveiq.org")),
      row("cv-thread", "hr@loveiq.org"),
      row("departed", "philipp.leonhard@loveiq.org"),
    ];
    await ingestGmail("2026-09-23T00:00:00.000Z", () => false, null);
    expect(deletedIds).toContain("thread:cv-thread");
    // The control: history from an offboarded colleague is still kept.
    expect(deletedIds).not.toContain("thread:departed");
  });
});

/**
 * WHO WROTE IT, coarsely — the one fact that separates a colleague from a vendor.
 *
 * The sender's address was already being read and thrown away by `person()`, which keeps
 * the display name only, so "was this from inside the company" was unanswerable from what
 * we stored. Measured 2026-09-10: gmail took rank 1 on 88 of 468 real questions and was
 * wrong on 59% of them (repository documentation: 12%), and 77% of its rank-1 wins were
 * vendor or notification mail. The internal half is genuinely useful — the team-sync
 * invitation is what correctly answers "when is the weekly team sync" — so the two have
 * to be told apart rather than the source demoted wholesale.
 */
describe("a thread records whether we were writing or being written at", () => {
  it("reads the domain, never the address", async () => {
    const { senderDomain } = await import("@features/brain/server/ingest/gmail");
    expect(senderDomain("Marcus <m@loveiq.org>")).toBe("loveiq.org");
    expect(senderDomain('"Stripe" <noreply@stripe.com>')).toBe("stripe.com");
    expect(senderDomain("ema.djedovic@loveiq.org")).toBe("loveiq.org");
    expect(senderDomain("no-reply@e.substack.com")).toBe("e.substack.com");
    expect(senderDomain("not an address")).toBeNull();
    // The repository is public and `meta` is returned verbatim by every search, so the
    // local part must never survive.
    expect(senderDomain("Marcus <m@loveiq.org>")).not.toContain("m@");
  });

  it("knows a colleague writing from a personal address", async () => {
    const { threadToRows } = await import("@features/brain/server/ingest/gmail");
    // TWO of the team write from personal gmail addresses -- `brain_person` records
    // `marcus.boerner@gmail.com` and `fatihhadzic64@gmail.com` -- so the sending domain
    // alone gets them exactly backwards. Measured 2026-09-11: a colleague's mail about
    // pricing was classified as a vendor broadcast, and it is one of the best gmail hits
    // in the corpus.
    const registry = new Map([
      ["marcus.boerner@gmail.com", { canonical: "Marcus Börner" }],
      ["marcus börner", { canonical: "Marcus Börner" }],
    ]);
    const msg = (from: string) => ({
      internalDate: "1788000000000",
      payload: {
        headers: [
          { name: "From", value: from },
          { name: "To", value: "team@loveiq.org" },
          { name: "Subject", value: "Pricing" },
        ],
        mimeType: "text/plain",
        body: {
          data: Buffer.from(
            "Here is the pricing change we discussed, take a look before Thursday please."
          ).toString("base64url"),
        },
      },
    });
    const run = (from: string, reg: typeof registry | null) =>
      threadToRows(
        { id: "t2", messages: [msg(from)] } as never,
        "team@loveiq.org",
        "2026-09-11T00:00:00Z",
        reg as never
      )[0]?.meta.correspondents;

    expect(run("Marcus <marcus.boerner@gmail.com>", registry)).toBe("internal");
    // Matched on the display name too, because Gmail supplies whichever was configured.
    expect(run("Marcus Börner <someone.else@gmail.com>", registry)).toBe("internal");
    // A stranger on the same domain is still a stranger.
    expect(run("Recruiter <recruiter@gmail.com>", registry)).toBe("external");
    // No registry degrades to the domain check rather than calling everything external.
    expect(run("Eman <ec@loveiq.org>", null)).toBe("internal");
  });

  it("counts a thread as ours when ANY message came from us", async () => {
    const { threadToRows } = await import("@features/brain/server/ingest/gmail");
    const msg = (from: string, text: string) => ({
      internalDate: "1788000000000",
      payload: {
        headers: [
          { name: "From", value: from },
          { name: "To", value: "team@loveiq.org" },
          { name: "Subject", value: "A subject line" },
        ],
        mimeType: "text/plain",
        body: { data: Buffer.from(text).toString("base64url") },
      },
    });
    const rows = (t: ReturnType<typeof msg>[]) =>
      threadToRows({ id: "t1", messages: t } as never, "team@loveiq.org", "2026-09-10T00:00:00Z");

    const vendorOnly = rows([
      msg(
        '"Stripe" <noreply@stripe.com>',
        "Your invoice for August is ready to view in the billing dashboard, no action needed."
      ),
    ]);
    expect(vendorOnly[0]?.meta.correspondents).toBe("external");

    // A vendor thread a colleague REPLIED to is a conversation we had, not a broadcast.
    const replied = rows([
      msg(
        '"Stripe" <noreply@stripe.com>',
        "Your invoice for August is ready to view in the billing dashboard, no action needed."
      ),
      msg("Eman <ec@loveiq.org>", "Paid this one, closing the loop on it."),
    ]);
    expect(replied[0]?.meta.correspondents).toBe("internal");

    // A colleague's own domain is ours.
    const ownDomain = rows([
      msg(
        "Mark <mo@markoldenburg.com>",
        "Sending over the deck now, it has the pricing slide we talked through yesterday."
      ),
    ]);
    expect(ownDomain[0]?.meta.correspondents).toBe("internal");

    // gmail.com is NOT ours: it is where most inbound vendor and candidate mail arrives.
    const personal = rows([
      msg(
        "Someone <someone@gmail.com>",
        "I would like to apply for the growth role you advertised, my CV is attached below."
      ),
    ]);
    expect(personal[0]?.meta.correspondents).toBe("external");
  });
});

/**
 * HTML mail is not text, and the corpus was storing the difference.
 *
 * Measured 2026-09-19 over 9,776 gmail chunks: 262 carried a raw HTML entity and 115
 * carried CSS declarations as if they were prose — `line-height: 2em; color:#000; }`
 * sitting in the body of an indexed email. Neither answers a question, and both are
 * text a search can match.
 */
describe("messageText on HTML mail", () => {
  const html = (markup: string) => ({
    mimeType: "text/html",
    body: { data: Buffer.from(markup, "utf8").toString("base64url") },
  });

  it("decodes the entities marketing mail actually uses", () => {
    const out = messageText(
      html("<p>Plans &bull; Pricing &mdash; 50&#37; off &#x2022; caf&eacute;</p>")
    );
    expect(out).toContain("•");
    expect(out).toContain("—");
    expect(out).toContain("%");
    expect(out).not.toContain("&bull;");
    expect(out).not.toContain("&mdash;");
  });

  it("does NOT double-decode, which turned escaped text into markup", () => {
    // `&amp;lt;` is the sender writing a literal "&lt;". Decoding & first and then
    // lt second produced "<" — a tag the sender never wrote.
    expect(messageText(html("<p>&amp;lt;b&amp;gt;</p>")).trim()).toBe("&lt;b&gt;");
  });

  it("leaves an unknown entity alone rather than eating it", () => {
    expect(messageText(html("<p>&notarealentity; x</p>"))).toContain("&notarealentity;");
  });

  it("strips a stylesheet that sits in <head> with no closing style tag", () => {
    const out = messageText(
      html(
        "<html><head><style>.a { line-height: 2em; color:#000; }</head><body><p>Real text</p></body></html>"
      )
    );
    expect(out).toContain("Real text");
    expect(out).not.toContain("line-height");
  });

  it("still strips a normal style block and keeps the prose", () => {
    const out = messageText(html("<style>p{margin:0}</style><p>Hello there</p>"));
    expect(out).toContain("Hello there");
    expect(out).not.toContain("margin");
  });
});

/**
 * The map is not a guess. These are the named entities actually present in the gmail
 * corpus on 2026-09-19, by frequency: zwnj 864, bull 73, mdash 19, ldquo 17, rdquo 17,
 * middot 16, rsquo 15, gt 11, lt 11, amp 10, nbsp 9, ndash 9, rarr 6, apos 3, reg 2.
 * `rarr` was the one the first draft missed, which is why this test reads from the
 * measurement rather than from what seemed likely.
 */
describe("the entity map covers what the corpus actually contains", () => {
  const MEASURED = [
    "zwnj",
    "bull",
    "mdash",
    "ldquo",
    "rdquo",
    "middot",
    "rsquo",
    "gt",
    "lt",
    "amp",
    "nbsp",
    "ndash",
    "rarr",
    "apos",
    "reg",
  ];

  it("decodes every one of them", () => {
    const undecoded = MEASURED.filter((name) => decodeEntities(`&${name};`) === `&${name};`);
    expect(undecoded, `these entities are in the corpus but not in HTML_ENTITIES`).toEqual([]);
  });

  it("removes zero-width padding rather than rendering it", () => {
    // 864 occurrences, all of it invisible preheader padding in marketing mail.
    expect(decodeEntities("Order&zwnj;&zwnj;confirmed")).toBe(
      "Ordconfirmed".replace("Ord", "Order")
    );
  });
});
