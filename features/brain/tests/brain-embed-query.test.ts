import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const calls: Array<{ url: string; timeoutMs?: number }> = [];
/** The edge function's answer, given the texts it was sent. */
let respond: (texts: string[]) => Response;

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(async (url: string, init?: RequestInit & { timeoutMs?: number }) => {
    calls.push({ url, timeoutMs: init?.timeoutMs });
    const texts = (JSON.parse(String(init?.body ?? "{}")) as { texts?: string[] }).texts ?? [];
    return respond(texts);
  }),
}));

let chunkRows: Array<{ id: number; title: string; body: string }> = [];
/** What the rows say when a written batch is read back; null means unchanged. */
let rowsAfterWrite: typeof chunkRows | null = null;
/** Every chunk-read path this run issued, so the QUEUE ORDER can be asserted. */
const chunkReads: string[] = [];
const patches: Array<{ path: string; body: string }> = [];
/** The ids of every stored batch. */
const stored: number[][] = [];
/** How the read-back after a write goes wrong, if it does; and whether a clear succeeds. */
let readBack: "ok" | "refused" | "throws" = "ok";
let clearOk = true;
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      patches.push({ path, body: String(init.body) });
      return {
        ok: clearOk,
        status: clearOk ? 204 : 500,
        headers: new Headers(),
        json: async () => [],
      };
    }
    if (path.includes("rpc/brain_set_embeddings")) {
      stored.push((JSON.parse(String(init?.body)) as { ids: number[] }).ids);
      return { ok: true, headers: new Headers(), json: async () => 0 };
    }
    if (path.includes("select=id,title,body") && path.includes("id=in.")) {
      if (readBack === "throws") throw new Error("circuit open");
      if (readBack === "refused") {
        return { ok: false, status: 503, headers: new Headers(), json: async () => [] };
      }
      return {
        ok: true,
        headers: new Headers(),
        json: async () => {
          // Like PostgREST: only the ids asked for.
          const ids = new Set((/id=in\.\(([^)]*)\)/.exec(path)?.[1] ?? "").split(",").map(Number));
          return (rowsAfterWrite ?? chunkRows).filter((r) => ids.has(r.id));
        },
      };
    }
    if (path.includes("select=id,title,body")) {
      chunkReads.push(path);
      return { ok: true, headers: new Headers(), json: async () => chunkRows };
    }
    return {
      ok: true,
      headers: new Headers({ "content-range": "*/0" }),
      json: async () => [],
    };
  }),
}));

import { embedQuery } from "@features/brain/server/embed";

beforeEach(() => {
  calls.length = 0;
  patches.length = 0;
  stored.length = 0;
  rowsAfterWrite = null;
  readBack = "ok";
  clearOk = true;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  respond = () => new Response(JSON.stringify({ embeddings: [[0.1, 0.2, 0.3]] }), { status: 200 });
});

describe("embedQuery is on the path of every question", () => {
  it("gives up after ONE attempt when the edge worker refuses", async () => {
    // The backfill retries this same call six times with escalating backoff, which
    // is right when the cost of giving up is chunks left unsearchable. Here the
    // cost of waiting is a person watching a spinner, and lexical search is a fine
    // answer — so a cold worker must not add ~22s of backoff to every question.
    respond = () => new Response("WORKER_RESOURCE_LIMIT", { status: 546 });

    const t0 = Date.now();
    const out = await embedQuery("why do people give up before paying");

    expect(out).toBeNull();
    expect(calls).toHaveLength(1);
    expect(Date.now() - t0).toBeLessThan(1000); // no backoff sleep
  });

  it("bounds the wait at four seconds, not the backfill's two minutes", async () => {
    await embedQuery("anything at all");
    expect(calls[0]?.timeoutMs).toBe(4_000);
  });

  it("returns a Postgres vector literal, never an empty string", async () => {
    // "" would be cast to halfvec by Postgres and RAISE, turning a soft
    // degradation into a hard search failure.
    expect(await embedQuery("a real question")).toBe("[0.100000,0.200000,0.300000]");

    respond = () => new Response(JSON.stringify({ embeddings: [] }), { status: 200 });
    expect(await embedQuery("a different real question")).toBeNull();
  });

  it("does not call the edge function for a question too short to mean anything", async () => {
    expect(await embedQuery(" a ")).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("embeds a question once: the look outside a filter asks the same one again", async () => {
    // 2026-10-05: the second search embedded the same text again, in sequence.
    const first = await embedQuery("what did we decide about pricing");
    expect(await embedQuery("  what did we decide about pricing ")).toBe(first);
    expect(calls).toHaveLength(1);
  });

  it("keeps only successes, so a failed embedding is tried afresh", async () => {
    respond = () => new Response("WORKER_RESOURCE_LIMIT", { status: 546 });
    expect(await embedQuery("who owns the paywall copy")).toBeNull();
    respond = () => new Response(JSON.stringify({ embeddings: [[0.5]] }), { status: 200 });
    expect(await embedQuery("who owns the paywall copy")).toBe("[0.500000]");
    expect(calls).toHaveLength(2);
  });

  it("keeps a bounded number of questions, oldest out first", async () => {
    for (let i = 0; i < 65; i++) await embedQuery(`question number ${i}`);
    calls.length = 0;
    await embedQuery("question number 64");
    expect(calls).toHaveLength(0);
    await embedQuery("question number 0");
    expect(calls).toHaveLength(1);
  });
});

describe("embedding must never outlive the cron that called it", () => {
  /**
   * THE 504 THIS PREVENTS. The backoff totals 22.5 seconds across six attempts, and
   * `embedMissing` only checked its budget BETWEEN batches — so one bad batch late
   * in a run pushed brain-fast from its 40s budget past the 60s ceiling and Vercel
   * killed it mid-flight (observed 2026-08-31 00:37). Smaller batches made it
   * likelier by creating more chances to hit a bad one.
   */
  it("abandons its retries once the caller runs out of time mid-batch", async () => {
    respond = () => new Response("WORKER_RESOURCE_LIMIT", { status: 546 });
    const { embedMissing } = await import("@features/brain/server/embed");

    /**
     * The budget must be spendable, not spent. `embedMissing` checks it BEFORE the
     * first batch, so a clock that is already out of time returns immediately and
     * never reaches the retry loop — a test written that way passes whether or not
     * the guard exists, which is exactly how this nearly shipped untested.
     */
    chunkRows = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      title: `chunk ${i}`,
      body: "some text long enough to be worth embedding",
    }));

    let calls = 0;
    const isOutOfTime = () => {
      calls += 1;
      return calls > 2; // in budget for the first checks, out of it inside the retries
    };

    const t0 = Date.now();
    const result = await embedMissing(isOutOfTime, 5);
    const elapsed = Date.now() - t0;

    expect(result.complete).toBe(false);
    // The full backoff is 22.5s. Anything near that means the retries kept going.
    expect(elapsed).toBeLessThan(6000);
  });
});

describe("the backfill waits out the platform saying not now", () => {
  it("retries a bare 503 and a 429, and gives up at once on a real refusal", async () => {
    const { embedMissing } = await import("@features/brain/server/embed");
    chunkRows = [{ id: 1, title: "t", body: "text long enough to be worth embedding" }];
    const replies = [
      new Response("", { status: 503 }),
      new Response(JSON.stringify({ embeddings: [[0.1, 0.2, 0.3]] }), { status: 200 }),
    ];
    respond = () => replies.shift()!;
    const ok = await embedMissing(() => false, 1);
    expect(calls.filter((c) => c.url.includes("brain-embed"))).toHaveLength(2);
    expect(ok.embedded).toBe(1);

    calls.length = 0;
    respond = () => new Response("bad input", { status: 400 });
    await embedMissing(() => false, 1);
    expect(calls.filter((c) => c.url.includes("brain-embed"))).toHaveLength(1);
  });
});

describe("a timeout is a 503 too", () => {
  it("retries a call that THROWS (timeout, dropped connection) instead of giving up", async () => {
    // fetchWithTimeout throws on a timeout rather than returning a status, and only HTTP
    // answers were retried: the hourly job exited on its first try.
    const { embedMissing } = await import("@features/brain/server/embed");
    chunkRows = [{ id: 1, title: "t", body: "text long enough to be worth embedding" }];
    let first = true;
    respond = () => {
      if (first) {
        first = false;
        throw new Error("The operation was aborted due to timeout");
      }
      return new Response(JSON.stringify({ embeddings: [[0.1, 0.2, 0.3]] }), { status: 200 });
    };
    const ok = await embedMissing(() => false, 1);
    expect(calls.filter((c) => c.url.includes("brain-embed"))).toHaveLength(2);
    expect(ok.embedded).toBe(1);
  });
});

describe("embedMissing cannot outlive the function that calls it", () => {
  /**
   * `embedBatch` defaults to 6 attempts at 120s each -- the BACKFILL script's
   * patience, which has no ceiling. `brain-fast` has a 60s `maxDuration`, so one
   * cold edge worker (the model is ~130MB and loads on first call) can hang longer
   * than the function may live. Vercel kills it, and `recordCronRun` sits in the
   * `finally` that never runs, so the run counts as neither success nor failure --
   * it does not exist.
   *
   * Observed on 2026-09-06: retitling 187 analytics chunks nulled their embeddings,
   * the 08:52 brain-fast run had real work for the first time in a while, and it
   * left NO cron_run row while every neighbouring run recorded 7-10s and success.
   *
   * `isOutOfTime` cannot cover this -- it is checked BETWEEN attempts, never during
   * one -- so the bound has to be the per-request timeout itself.
   */
  it("forwards the caller's per-request bounds to the embed call", async () => {
    respond = () =>
      new Response(JSON.stringify({ embeddings: [[0.1, 0.2, 0.3]] }), { status: 200 });
    const { embedMissing } = await import("@features/brain/server/embed");
    chunkRows = [{ id: 1, title: "t", body: "text long enough to be worth embedding" }];

    await embedMissing(() => false, 1, { attempts: 2, timeoutMs: 15_000 });

    const embedCalls = calls.filter((c) => c.url.includes("brain-embed"));
    expect(embedCalls.length).toBeGreaterThan(0);
    for (const c of embedCalls) {
      expect(c.timeoutMs).toBe(15_000);
      // never the unbounded backfill default, which is what killed the cron
      expect(c.timeoutMs).not.toBe(120_000);
    }
  });

  it("still defaults to the patient backfill bound when no caller sets one", async () => {
    // The script has no ceiling and would rather wait than lose a batch, so the
    // default must NOT become the cron's bound.
    respond = () =>
      new Response(JSON.stringify({ embeddings: [[0.1, 0.2, 0.3]] }), { status: 200 });
    const { embedMissing } = await import("@features/brain/server/embed");
    chunkRows = [{ id: 2, title: "t", body: "text long enough to be worth embedding" }];

    await embedMissing(() => false, 1);
    const embedCalls = calls.filter((c) => c.url.includes("brain-embed"));
    expect(embedCalls.at(-1)?.timeoutMs).toBe(30_000);
  });
});

describe("which chunks get embedded first", () => {
  /**
   * NEWEST FIRST, AND THE DIRECTION IS THE WHOLE POINT.
   *
   * A chunk with no embedding still matches lexically but scores ZERO on the semantic
   * term while its rivals score 0.4-0.8 — so it is not merely less findable, it is
   * actively OUTRANKED by older rows saying the same thing. Draining the queue
   * oldest-first put every freshly-written chunk at the back of it and aimed that
   * penalty squarely at the newest facts.
   *
   * MEASURED 2026-09-09: "how many signups so far this month" returned AUGUST's monthly
   * total and September's daily rows, while September's own monthly total — written that
   * morning and matching both "September" and "signups" lexically — did not appear at
   * all. It was 181 rows down a queue drained oldest-first.
   */
  it("drains the queue newest WRITTEN first, so today's numbers are searchable today", async () => {
    // By `updated_at`, not `id`: the all-time and this-month totals are rewritten in place
    // every fifteen minutes and keep their old id, so `id.desc` left them behind any
    // backlog (2026-09-27: four funnel questions failed the battery that way).
    chunkReads.length = 0;
    chunkRows = [];
    respond = () => new Response(JSON.stringify({ embeddings: [] }), { status: 200 });
    const { embedMissing } = await import("@features/brain/server/embed");
    await embedMissing(() => false, 1);
    expect(chunkReads.length).toBeGreaterThan(0);
    expect(new URL(`http://x${chunkReads[0]}`).searchParams.get("order")).toBe(
      "updated_at.desc,id.desc"
    );
  });
});

describe("a row rewritten while it was being embedded", () => {
  it("is cleared for the next run, not left holding its old text's vector", async () => {
    chunkRows = [
      { id: 1, title: "Notion page", body: "what it used to say" },
      { id: 2, title: "Untouched", body: "same text" },
    ];
    // Row 1 was rewritten between the queue read and the write.
    rowsAfterWrite = [
      { id: 1, title: "Notion page", body: "what it says now" },
      { id: 2, title: "Untouched", body: "same text" },
    ];
    respond = () => new Response(JSON.stringify({ embeddings: [[0.1], [0.2]] }), { status: 200 });
    const { embedMissing } = await import("@features/brain/server/embed");
    const result = await embedMissing(() => false, 1);
    expect(patches).toEqual([
      { path: "/rest/v1/brain_chunk?id=in.(1)", body: JSON.stringify({ embedding: null }) },
    ]);
    expect(result.embedded).toBe(1);
  });

  it("leaves a batch alone when nothing moved", async () => {
    chunkRows = [{ id: 3, title: "t", body: "b" }];
    respond = () => new Response(JSON.stringify({ embeddings: [[0.1]] }), { status: 200 });
    const { embedMissing } = await import("@features/brain/server/embed");
    expect((await embedMissing(() => false, 1)).embedded).toBe(1);
    expect(patches).toEqual([]);
  });
});

describe("one text the edge cannot embed", () => {
  const vectorsFor = (texts: string[]) =>
    new Response(JSON.stringify({ embeddings: texts.map(() => [0.1]) }), { status: 200 });
  const rows = (...bodies: string[]) => bodies.map((body, i) => ({ id: i + 1, title: "t", body }));

  it("does not hold the rest of the queue: its batch is retried row by row", async () => {
    // The queue is read newest first, so a batch that always failed sat at the head of every
    // later read, and every row behind it waited for good.
    chunkRows = rows("a", "POISON", "b", "c", "d", "e");
    respond = (texts) =>
      texts.some((t) => t.includes("POISON"))
        ? new Response("bad", { status: 400 })
        : vectorsFor(texts);
    const { embedMissing } = await import("@features/brain/server/embed");
    const result = await embedMissing(() => false, 1);
    expect(stored).toEqual([[1, 3, 4, 5, 6]]);
    expect(result.embedded).toBe(5);
  });

  it("still stops when not one row embeds even alone, because then the edge is down", async () => {
    chunkRows = rows("a", "b", "c", "d", "e", "f");
    respond = () => new Response("bad", { status: 400 });
    const { embedMissing } = await import("@features/brain/server/embed");
    await embedMissing(() => false, 1);
    // The first batch, then its three rows alone; the second batch is never tried.
    expect(calls.filter((c) => c.url.includes("brain-embed"))).toHaveLength(4);
    expect(stored).toEqual([]);
  });

  it("retries a 500 from the edge (a crashed worker), unlike a 400", async () => {
    chunkRows = rows("a");
    const replies = [new Response('{"code":"WORKER_ERROR"}', { status: 500 }), vectorsFor(["a"])];
    respond = () => replies.shift()!;
    const { embedMissing } = await import("@features/brain/server/embed");
    expect((await embedMissing(() => false, 1)).embedded).toBe(1);
    expect(calls.filter((c) => c.url.includes("brain-embed"))).toHaveLength(2);
  });
});

describe("checking a stored batch for rewritten rows", () => {
  beforeEach(() => {
    chunkRows = [{ id: 7, title: "Old title", body: "same body" }];
    respond = () => new Response(JSON.stringify({ embeddings: [[0.1]] }), { status: 200 });
  });

  it("clears a row that was only retitled: the title is embedded too", async () => {
    rowsAfterWrite = [{ id: 7, title: "New title", body: "same body" }];
    const { embedMissing } = await import("@features/brain/server/embed");
    expect((await embedMissing(() => false, 1)).embedded).toBe(0);
    expect(patches).toHaveLength(1);
  });

  it("does not count a row deleted since the write as embedded", async () => {
    rowsAfterWrite = [];
    const { embedMissing } = await import("@features/brain/server/embed");
    expect((await embedMissing(() => false, 1)).embedded).toBe(0);
    expect(patches).toEqual([]);
  });

  it("keeps the vectors, and the count, when the check cannot read, throws or cannot clear", async () => {
    const { embedMissing } = await import("@features/brain/server/embed");
    readBack = "refused";
    expect((await embedMissing(() => false, 1)).embedded).toBe(1);
    readBack = "throws";
    expect((await embedMissing(() => false, 1)).embedded).toBe(1);
    readBack = "ok";
    rowsAfterWrite = [{ id: 7, title: "New title", body: "same body" }];
    clearOk = false;
    expect((await embedMissing(() => false, 1)).embedded).toBe(1);
  });
});
