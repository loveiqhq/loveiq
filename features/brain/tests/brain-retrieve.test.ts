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
  period_end?: string | null;
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
    period_end: input.period_end === undefined ? "2026-08-22" : input.period_end,
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

  it("carries period_end and score out of the RPC, which the mapper used to drop", async () => {
    /**
     * `brain_search` has always returned `period_end`, and this mapper silently
     * discarded it along with `id` and `updated_at`. Every consumer downstream was
     * therefore date-blind, and "the call two days ago beats the commit from March"
     * is not a judgement anything can make without the dates.
     *
     * Asserted HERE rather than through the MCP door, because every test there
     * supplies `periodEnd` by hand through a mocked `retrieve` -- so deleting this
     * one line left the entire 553-test suite green. Found by mutation, not review.
     */
    respondWith([
      row({ source: "drive", source_id: "doc:1AbC", score: 2.5, period_end: "2026-09-04" }),
      // `doc` genuinely carries no period; null must survive as null.
      row({
        source: "doc",
        source_id: "CLAUDE.md#x",
        score: 1.0,
        period_end: null,
        path: "CLAUDE.md",
      }),
    ]);
    const out = await retrieve("anything", 5);
    expect(out[0]!.periodEnd).toBe("2026-09-04");
    expect(out[0]!.score).toBe(2.5);
    expect(out[1]!.periodEnd).toBeNull();
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
  it("sends only the filters the caller actually set", async () => {
    // Every filter defaults to NULL in the function and NULL means "no filter", so
    // an omitted key and an explicit null behave identically — but sending only
    // what was asked for keeps the arguments recorded in `brain_query` readable as
    // the caller's intent rather than as a wall of nulls.
    respondWith([]);
    await retrieve("a question", 5, { sources: ["notion"], meta: { status: "WIP" } });
    const body = JSON.parse(String(mockSupabaseFetch.mock.calls.at(-1)?.[1]?.body));
    expect(body.sources).toEqual(["notion"]);
    expect(body.meta_filter).toEqual({ status: "WIP" });
    expect(body).not.toHaveProperty("since");
    expect(body).not.toHaveProperty("until");
    expect(body).not.toHaveProperty("exclude_sources");
  });

  it("sends no filter keys at all when the caller passes none", async () => {
    respondWith([]);
    await retrieve("a question", 5);
    const body = JSON.parse(String(mockSupabaseFetch.mock.calls.at(-1)?.[1]?.body));
    for (const key of ["sources", "exclude_sources", "since", "until", "meta_filter"]) {
      expect(body, key).not.toHaveProperty(key);
    }
    // and the unfiltered contract is unchanged
    expect(body.per_source).toBe(3);
  });

  it("lifts the per-bucket cap when the caller has NARROWED, so a filter is not also a truncation", async () => {
    /**
     * `per_source` is a DIVERSITY rule — it stops one source taking every slot on an
     * open question. When the caller names the source, or filters on metadata only one
     * source carries, there is nothing left to diversify against and the cap silently
     * truncates exactly what was asked for.
     *
     * MEASURED 2026-09-06 against production, `sources:['notion'] meta:{status:'WIP'}`:
     * 3 rows back at per_source 3, 12 at 12, out of 49 WIP tasks on the board. The
     * caller asked for six and got three with nothing saying so. It capped the decision
     * browse the same way, quietly undercutting the filter documented one commit
     * earlier as the way to ask what the team had decided.
     */
    respondWith([]);
    await retrieve("which tasks are in progress", 12, {
      sources: ["notion"],
      meta: { status: "WIP" },
    });
    expect(JSON.parse(String(mockSupabaseFetch.mock.calls.at(-1)?.[1]?.body)).per_source).toBe(12);

    // `meta` alone collapses the buckets too — its keys are source-specific.
    mockSupabaseFetch.mockClear();
    respondWith([]);
    await retrieve("what did we decide", 6, { meta: { section: "summary" } });
    expect(JSON.parse(String(mockSupabaseFetch.mock.calls.at(-1)?.[1]?.body)).per_source).toBe(6);
  });

  it("leaves the cap alone for filters that do NOT collapse the buckets", async () => {
    /**
     * The positive control, and the reason this is not simply "raise it whenever any
     * filter is set". A date range or an exclusion still leaves candidates spread
     * across ten sources, so diversity still does real work there and the current
     * behaviour is measured. Raising it for those would change ranking on the common
     * case to fix a problem they do not have.
     */
    respondWith([]);
    await retrieve("what happened recently", 12, {
      since: "2026-01-01",
      excludeSources: ["commit"],
    });
    expect(JSON.parse(String(mockSupabaseFetch.mock.calls.at(-1)?.[1]?.body)).per_source).toBe(3);
  });

  it("never lowers the cap below the diversity floor, however small the limit", async () => {
    // `Math.max`, not a plain assignment: a caller asking for one hit must not shrink
    // the candidate pool to one and lose the ranking that picks the right one.
    respondWith([]);
    await retrieve("a narrow question", 1, { sources: ["slack"] });
    expect(JSON.parse(String(mockSupabaseFetch.mock.calls.at(-1)?.[1]?.body)).per_source).toBe(3);
  });

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

describe("the embedding window must cover the whole chunk", () => {
  /**
   * THE BUG THIS PREVENTS. Chunks are built up to BODY_LIMIT (2,400 characters) but
   * `embedText` sliced at 1,500 — so the tail of every long chunk was invisible to
   * semantic search. Measured on the live corpus before the fix: 17,859 of 25,015
   * chunks (71%) were longer than the window, and 12.1 million characters — roughly
   * a third of everything the brain holds — could not be matched by meaning at all.
   *
   * The two constants live in different files and drifted silently. This ties them
   * together so the next person who changes one is told about the other.
   */
  it("embeds at least as many characters as a chunk can contain", async () => {
    const { EMBED_CHARS } = await import("@features/brain/server/embed");
    const { BODY_LIMIT } = await import("@features/brain/server/ingest/notion");
    expect(EMBED_CHARS).toBeGreaterThanOrEqual(BODY_LIMIT);
  });

  it("keeps the batch small enough for the longer texts", async () => {
    // Measured: at 2,400 chars, 5-per-batch failed 0/3 and 3-per-batch passed 3/4.
    // Cost is per-TEXT length, not payload bytes — attention is quadratic.
    const { EMBED_BATCH } = await import("@features/brain/server/embed");
    expect(EMBED_BATCH).toBeLessThanOrEqual(4);
  });
});
