import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSupabaseFetch = vi.fn();

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

import { CorpusUnavailableError, retrieve } from "@features/brain/server/retrieve";
import { toSlackMrkdwn } from "@features/brain/server/answer";

interface RowInput {
  source: string;
  source_id: string;
  title?: string | null;
  score: number;
  path?: string;
}

function row(input: RowInput) {
  return {
    id: Math.random(),
    source: input.source,
    source_id: input.source_id,
    title: input.title ?? input.source_id,
    url: `https://github.com/loveiqhq/loveiq/x/${input.source_id}`,
    body: `body of ${input.source_id}`,
    meta: input.path ? { path: input.path } : {},
    updated_at: "2026-08-01T00:00:00Z",
    score: input.score,
  };
}

function respondWith(rows: unknown[]) {
  mockSupabaseFetch.mockResolvedValue({ ok: true, status: 200, json: async () => rows });
}

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const SHA_C = "c".repeat(40);

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.clearAllMocks());

describe("retrieve — parent dedupe", () => {
  it("collapses several parts of one commit into its best-scoring part", async () => {
    // Measured on the real corpus: a query matched parts 1 and 2 of the same
    // commit at ranks 2 and 3, which wastes prompt budget and shows the reader
    // the same citation twice.
    respondWith([
      row({ source: "commit", source_id: SHA_A, score: 2.0 }),
      row({ source: "commit", source_id: `${SHA_A}-2`, score: 1.9 }),
      row({ source: "commit", source_id: `${SHA_A}-3`, score: 1.8 }),
      row({ source: "commit", source_id: SHA_B, score: 1.0 }),
    ]);

    const out = await retrieve("anything", 8);
    expect(out.map((r) => r.sourceId)).toEqual([SHA_A, SHA_B]);
  });

  it("collapses several headings of one document into its best-scoring chunk", async () => {
    respondWith([
      row({ source: "doc", source_id: "CLAUDE.md#a", score: 2.0, path: "CLAUDE.md" }),
      row({ source: "doc", source_id: "CLAUDE.md#b", score: 1.5, path: "CLAUDE.md" }),
      row({ source: "doc", source_id: "docs/api.md#x", score: 1.2, path: "docs/api.md" }),
    ]);

    const out = await retrieve("anything", 8);
    expect(out.map((r) => r.sourceId)).toEqual(["CLAUDE.md#a", "docs/api.md#x"]);
  });

  it("does NOT collapse different months into one parent", async () => {
    // Regression: parentKey stripped a trailing `-<digits>` to undo the `<sha>-2`
    // split suffix, which also ate the `-08` in `monthly:2026-08`. Every month of
    // a year collapsed to one parent and all but the best-scoring month was
    // discarded before it could be returned — which is why "what did we spend in
    // August" got answered from partial weeks.
    respondWith([
      row({ source: "analytics", source_id: "monthly:2026-08", score: 2.0 }),
      row({ source: "analytics", source_id: "monthly:2026-07", score: 1.9 }),
      row({ source: "analytics", source_id: "monthly:2026-06", score: 1.8 }),
    ]);
    const out = await retrieve("anything", 8);
    expect(out.map((r) => r.sourceId).sort()).toEqual([
      "monthly:2026-06",
      "monthly:2026-07",
      "monthly:2026-08",
    ]);
  });

  it("does NOT collapse different days into one parent", async () => {
    respondWith([
      row({ source: "ga4", source_id: "daily:2026-08-05", score: 2.0 }),
      row({ source: "ga4", source_id: "daily:2026-08-12", score: 1.9 }),
    ]);
    const out = await retrieve("anything", 8);
    expect(out).toHaveLength(2);
  });

  it("keeps the higher-scoring part when it is not the first-listed one", async () => {
    respondWith([
      row({ source: "commit", source_id: `${SHA_A}-2`, score: 3.0 }),
      row({ source: "commit", source_id: SHA_A, score: 1.0 }),
    ]);
    const out = await retrieve("anything", 8);
    expect(out).toHaveLength(1);
    expect(out[0]!.score).toBe(3.0);
  });
});

describe("retrieve — source diversity", () => {
  it("stops one source from crowding out an authoritative doc", async () => {
    // The corpus holds 1,475 commit chunks against 454 doc chunks, and commit
    // titles are short subject lines that score well on word-similarity. Without
    // a cap, "why is the data retention purge turned off" put three commits above
    // the CLAUDE.md section that literally answers it.
    const rows = [
      ...Array.from({ length: 10 }, (_, i) =>
        row({ source: "commit", source_id: `${String(i)}${"f".repeat(39)}`, score: 2 - i * 0.01 })
      ),
      row({ source: "doc", source_id: "CLAUDE.md#postponed", score: 1.1, path: "CLAUDE.md" }),
    ];
    respondWith(rows);

    const out = await retrieve("anything", 5);
    // The guarantee is a reserved slot, not a hard ceiling: the cap holds commits
    // back until every other source has had its chance, then spare capacity is
    // filled by score rather than returning a short list. So the doc is present
    // AND the list is full.
    expect(out.some((r) => r.sourceId === "CLAUDE.md#postponed")).toBe(true);
    expect(out).toHaveLength(5);
    expect(out.filter((r) => r.source === "commit").length).toBeLessThan(5);
  });

  it("fills the cap back in when no other source has candidates", async () => {
    // A commit-only result set must still return a full list rather than being
    // truncated to the per-source cap.
    respondWith(
      Array.from({ length: 10 }, (_, i) =>
        row({ source: "commit", source_id: `${String(i)}${"e".repeat(39)}`, score: 2 - i * 0.01 })
      )
    );
    const out = await retrieve("anything", 5);
    expect(out).toHaveLength(5);
  });

  it("reserves a slot for each time grain, so a monthly total is never squeezed out", async () => {
    // The three grains of one period are near-identical text differing only in
    // their numbers (measured ts_rank spread: 0.002), so without a per-grain slot
    // the monthly total loses a coin-flip to a weekly and the answer gets summed
    // from partial periods instead of read whole.
    const rows = [
      row({ source: "analytics", source_id: "weekly:2026-W32", score: 0.85 }),
      row({ source: "analytics", source_id: "weekly:2026-W33", score: 0.845 }),
      row({ source: "analytics", source_id: "daily:2026-08-05", score: 0.797 }),
      row({ source: "analytics", source_id: "daily:2026-08-12", score: 0.793 }),
      row({ source: "analytics", source_id: "monthly:2026-08", score: 0.786 }),
    ].map((r, i) => ({ ...r, meta: { grain: ["week", "week", "day", "day", "month"][i] } }));
    respondWith(rows);

    const out = await retrieve("anything", 8);
    expect(out.some((r) => r.sourceId === "monthly:2026-08")).toBe(true);
  });

  it("respects the requested limit", async () => {
    respondWith([
      row({ source: "doc", source_id: "a.md#1", score: 3, path: "a.md" }),
      row({ source: "doc", source_id: "b.md#1", score: 2, path: "b.md" }),
      row({ source: "commit", source_id: SHA_C, score: 1 }),
    ]);
    const out = await retrieve("anything", 2);
    expect(out).toHaveLength(2);
  });
});

describe("retrieve — failure and edge handling", () => {
  it("returns nothing for a too-short question without calling the database", async () => {
    const out = await retrieve("a", 8);
    expect(out).toEqual([]);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });

  it("asks for candidates PER BUCKET, not just a bigger global slice", async () => {
    // The global slice alone is not enough: measured, the August revenue row
    // ranked 61st overall and a flat over-fetch discarded it.
    respondWith([]);
    await retrieve("a real question", 8);
    const body = JSON.parse(String(mockSupabaseFetch.mock.calls[0]![1].body));
    expect(body.per_source).toBe(3);
    expect(body.k).toBeGreaterThanOrEqual(100);
    expect(body.query_text).toBe("a real question");
  });

  // These two used to assert `[]`, which is what made the brain answer "I
  // couldn't find anything about that" while the database was unreachable. An
  // empty list must mean "asked, found nothing" and nothing else.
  it("throws CorpusUnavailableError — does NOT return [] — when the RPC errors", async () => {
    mockSupabaseFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await expect(retrieve("anything", 8)).rejects.toBeInstanceOf(CorpusUnavailableError);
  });

  it("throws CorpusUnavailableError when supabase is unreachable", async () => {
    mockSupabaseFetch.mockRejectedValue(new Error("network down"));
    await expect(retrieve("anything", 8)).rejects.toBeInstanceOf(CorpusUnavailableError);
  });

  it("still returns [] for a genuine miss, so the two stay distinguishable", async () => {
    mockSupabaseFetch.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    await expect(retrieve("anything", 8)).resolves.toEqual([]);
  });

  it("treats a non-array 200 body as unavailable, not as an empty corpus", async () => {
    // A 200 whose body is an object is a proxy-wrapped error page or a scalar —
    // the RPC did not answer. Resolving to [] here told the asker the corpus
    // contains nothing about their question.
    mockSupabaseFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    await expect(retrieve("anything", 8)).rejects.toBeInstanceOf(CorpusUnavailableError);
  });
});

describe("toSlackMrkdwn", () => {
  it("converts double-asterisk bold to Slack's single asterisk", () => {
    // Slack renders **bold** literally, asterisks and all.
    expect(toSlackMrkdwn("this is **important**")).toBe("this is *important*");
  });

  it("converts markdown links to Slack link syntax", () => {
    expect(toSlackMrkdwn("see [the doc](https://example.com/a)")).toBe(
      "see <https://example.com/a|the doc>"
    );
  });

  it("converts links before bold, so bracketed link text is not corrupted", () => {
    expect(toSlackMrkdwn("**[bold link](https://x.com)**")).toBe("*<https://x.com|bold link>*");
  });

  it("turns headings into bold, since Slack has no headings in mrkdwn", () => {
    expect(toSlackMrkdwn("### Summary")).toBe("*Summary*");
  });

  it("normalises bullets to a character Slack renders", () => {
    expect(toSlackMrkdwn("- one\n- two")).toBe("• one\n• two");
    expect(toSlackMrkdwn("* one\n* two")).toBe("• one\n• two");
  });

  it("converts underscore bold without touching single-underscore italics", () => {
    expect(toSlackMrkdwn("__strong__ and _em_")).toBe("*strong* and _em_");
  });

  it("leaves a plain sentence untouched", () => {
    expect(toSlackMrkdwn("The purge is off on purpose.")).toBe("The purge is off on purpose.");
  });

  it("preserves inline citation markers", () => {
    expect(toSlackMrkdwn("It is off [1] by decision [2].")).toBe("It is off [1] by decision [2].");
  });
});

describe("semantic recall must never break search", () => {
  /**
   * Embedding the question sits on the path of EVERY question the team asks. The
   * edge function that computes it has already been seen to refuse under load
   * (WORKER_RESOURCE_LIMIT), so a failure there must cost recall and nothing else.
   * With a null vector the SQL takes exactly its previous lexical path.
   */
  it("embeds the question outside the retrieval try/catch, and swallows failures", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("features/brain/server/retrieve.ts", "utf8")
    );
    expect(src).toMatch(/could not embed the question, falling back to lexical search/);
    // the vector must be passed to the RPC, or the whole thing is decoration
    expect(src).toMatch(/query_embedding: queryVector/);
    // and it must be computed BEFORE the block that throws CorpusUnavailableError
    expect(src.indexOf("queryVector = await embedQuery")).toBeLessThan(
      src.indexOf("rpc/brain_search")
    );
  });

  it("passes null rather than an empty string when embedding is unavailable", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("features/brain/server/embed.ts", "utf8")
    );
    // An empty string would be cast by Postgres and raise, turning a soft
    // degradation into a hard failure.
    expect(src).toMatch(/return first \? toVectorLiteral\(first\) : null;/);
  });
});
