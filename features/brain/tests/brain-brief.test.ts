import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let rows: Array<Record<string, unknown>> = [];
let dbOk = true;
const dbPaths: string[] = [];
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(async (path: string) => {
    dbPaths.push(path);
    return dbOk
      ? { ok: true, headers: new Headers(), json: async () => rows }
      : { ok: false, status: 500, headers: new Headers(), json: async () => [] };
  }),
}));

let llmConfigured = true;
let llmReply: { ok: true; text: string; truncated: boolean } | { ok: false; reason: string } = {
  ok: true,
  text: "Pricing moved to 39.99 [1].",
  truncated: false,
};
const prompts: Array<Array<{ role: string; content: string }>> = [];
vi.mock("@features/brain/server/llm", () => ({
  isLlmConfigured: () => llmConfigured,
  complete: vi.fn(async (messages: Array<{ role: string; content: string }>) => {
    prompts.push(messages);
    return llmReply;
  }),
}));

import { BRIEF_QUESTION, NOTHING, buildDailyBrief, chunksForDay } from "@features/brain/server/brief";

const chunk = (source: string, i: number) => ({
  source,
  source_id: `${source}:${i}`,
  title: `${source} thing ${i}`,
  url: `https://example.test/${source}/${i}`,
  body: "some body text",
  meta: {},
});

beforeEach(() => {
  rows = [chunk("commit", 1), chunk("notion", 1)];
  dbOk = true;
  dbPaths.length = 0;
  prompts.length = 0;
  llmConfigured = true;
  llmReply = { ok: true, text: "Pricing moved to 39.99 [1].", truncated: false };
});

describe("chunksForDay", () => {
  /**
   * `updated_at` is the INGEST stamp and moves on every chunk on every run, so
   * selecting on it would hand the model the entire 24,000-chunk corpus every
   * night. `period_end` is the date a chunk describes, which is the actual question.
   */
  it("selects on period_end, not on updated_at", async () => {
    await chunksForDay("2026-08-29");
    expect(dbPaths[0]).toContain("period_end=eq.2026-08-29");
    expect(dbPaths[0]).not.toContain("updated_at");
  });

  it("caps each source, so one noisy day of email cannot crowd out the one commit", async () => {
    rows = [...Array(30)].map((_, i) => chunk("gmail", i)).concat([chunk("commit", 99)]);
    const out = await chunksForDay("2026-08-29");
    expect(out.filter((c) => c.source === "gmail").length).toBeLessThanOrEqual(4);
    expect(out.some((c) => c.source === "commit")).toBe(true);
  });

  it("returns nothing rather than throwing when the corpus is unreachable", async () => {
    dbOk = false;
    expect(await chunksForDay("2026-08-29")).toEqual([]);
  });
});

describe("buildDailyBrief — silence is the design", () => {
  it("says nothing when the model calls the day routine", async () => {
    llmReply = { ok: true, text: NOTHING, truncated: false };
    expect(await buildDailyBrief("2026-08-29")).toBeNull();
  });

  it("says nothing when the day added no material at all", async () => {
    rows = [];
    expect(await buildDailyBrief("2026-08-29")).toBeNull();
    expect(prompts).toHaveLength(0); // and does not spend an LLM call finding out
  });

  it("says nothing when there is no model configured", async () => {
    llmConfigured = false;
    expect(await buildDailyBrief("2026-08-29")).toBeNull();
    expect(dbPaths).toHaveLength(0); // cheapest check first
  });

  it("says nothing when the model is unavailable, rather than posting an error", async () => {
    llmReply = { ok: false, reason: "rate_limited" };
    expect(await buildDailyBrief("2026-08-29")).toBeNull();
  });

  it("returns the brief and the chunks behind it when the day was not routine", async () => {
    const brief = await buildDailyBrief("2026-08-29");
    expect(brief?.text).toContain("39.99");
    expect(brief?.chunks).toHaveLength(2);
    expect(brief?.day).toBe("2026-08-29");
  });

  /**
   * The corpus is exactly as untrusted here as it is in Q&A — anyone who can send
   * us an email or write a commit message can put text in it. Reusing the answer
   * prompt is what keeps the fencing; a bespoke prompt would have quietly dropped it.
   */
  it("uses the hardened prompt, so quoted material cannot issue instructions", async () => {
    await buildDailyBrief("2026-08-29");
    const system = prompts[0]?.find((m) => m.role === "system")?.content ?? "";
    expect(system).toContain("UNTRUSTED DATA");
    expect(prompts[0]?.some((m) => m.content.includes(BRIEF_QUESTION))).toBe(true);
  });

  it("invites silence explicitly, or the model will find something every day", () => {
    expect(BRIEF_QUESTION).toContain(NOTHING);
    expect(BRIEF_QUESTION.toLowerCase()).toContain("not a failure");
  });
});
