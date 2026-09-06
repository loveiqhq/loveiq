import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const calls: Array<{ url: string; timeoutMs?: number }> = [];
let respond: () => Response;

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(async (url: string, init?: RequestInit & { timeoutMs?: number }) => {
    calls.push({ url, timeoutMs: init?.timeoutMs });
    return respond();
  }),
}));

let chunkRows: Array<{ id: number; title: string; body: string }> = [];
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(async (path: string) => {
    if (path.includes("select=id,title,body")) {
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
    expect(await embedQuery("a real question")).toBeNull();
  });

  it("does not call the edge function for a question too short to mean anything", async () => {
    expect(await embedQuery(" a ")).toBeNull();
    expect(calls).toHaveLength(0);
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
    expect(embedCalls.at(-1)?.timeoutMs).toBe(120_000);
  });
});
