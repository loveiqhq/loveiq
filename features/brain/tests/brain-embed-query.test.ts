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
