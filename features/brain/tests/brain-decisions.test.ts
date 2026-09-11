import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...a: unknown[]) => mockSupabaseFetch(...(a as [])),
}));
const mockUpsertChunks = vi.fn(async () => 1);
vi.mock("@features/brain/server/ingest/upsert", () => ({
  upsertChunks: (...a: unknown[]) => mockUpsertChunks(...(a as [])),
}));
vi.mock("@shared/observability/slack", () => ({ notifySlack: vi.fn(async () => undefined) }));

import {
  buildDecisionRow,
  priorDecisions,
  recordDecision,
  proposesSomething,
  renderPriorDecisions,
} from "@features/brain/server/decisions";
import { peopleIn, type Person } from "@features/brain/server/people";

const NOW = new Date("2026-09-09T14:30:00Z");
const base = { decision: "Move report pricing to flat tiers", actor: "Eman Cickusic" };

describe("buildDecisionRow", () => {
  /**
   * THE ID IS A CONTENT HASH, AND THAT IS THE WHOLE IDEMPOTENCY STORY.
   *
   * Two people leaving the same call, or one agent retrying after a timeout, must not
   * produce two records of one decision — a corpus that answers "what did we decide"
   * with the same thing twice is worse than one that answers once, because the reader
   * cannot tell whether they are duplicates or a decision that was re-taken.
   */
  it("gives the same decision on the same day the same id", () => {
    const a = buildDecisionRow(base, NOW);
    const b = buildDecisionRow({ ...base, why: "added later" }, NOW);
    expect(b.source_id).toBe(a.source_id);
  });

  it("ignores case and surrounding space when deciding they are the same", () => {
    expect(
      buildDecisionRow({ ...base, decision: "  MOVE REPORT PRICING TO FLAT TIERS " }, NOW).source_id
    ).toBe(buildDecisionRow(base, NOW).source_id);
  });

  it("separates a different decision, and the same decision re-taken on another day", () => {
    const a = buildDecisionRow(base, NOW);
    expect(
      buildDecisionRow({ ...base, decision: "Keep per-user pricing" }, NOW).source_id
    ).not.toBe(a.source_id);
    // A decision re-taken later is a NEW record, not an overwrite: it is how the corpus
    // shows that a question was revisited.
    expect(buildDecisionRow({ ...base, decidedOn: "2026-10-01" }, NOW).source_id).not.toBe(
      a.source_id
    );
  });

  /**
   * THE TITLE CARRIES THE DECISION, NOT A LABEL.
   *
   * Titles are weighted double in ranking. The lesson is already paid for in this
   * corpus: the 22 Aug consumer-pivot decision ranked 135th because its chunk was
   * titled "Meeting notes: 60 min with Mark - 2026/08/22", which shares no word with
   * the question it answers. A title of "Decision" alone would repeat that exactly.
   */
  it("puts the decision text in the title, where ranking weights it double", () => {
    expect(buildDecisionRow(base, NOW).title).toContain("Move report pricing to flat tiers");
  });

  it("dates it today by default, and honours an explicit date for one recorded late", () => {
    expect(buildDecisionRow(base, NOW).period_end).toBe("2026-09-09");
    expect(buildDecisionRow({ ...base, decidedOn: "2026-08-22" }, NOW).period_end).toBe(
      "2026-08-22"
    );
  });

  /** `period_end` is what `since`/`until` filter on; without it a decision is undated
   *  to every time-bounded question, which is most of them. */
  it("dates the record by when it was DECIDED, not when it was typed", () => {
    const row = buildDecisionRow({ ...base, decidedOn: "2026-08-22" }, NOW);
    expect(row.period_end).toBe("2026-08-22");
    expect(row.updated_at.slice(0, 10)).toBe("2026-09-09");
  });

  it("writes down what was rejected and what it supersedes", () => {
    const row = buildDecisionRow(
      { ...base, rejected: "Keeping the discount ladder", supersedes: "decision:2026-08-22-abc" },
      NOW
    );
    expect(row.body).toContain("Rejected: Keeping the discount ladder");
    expect(row.body).toContain("Supersedes: decision:2026-08-22-abc");
  });

  it("omits the optional lines rather than printing empty labels", () => {
    const body = buildDecisionRow(base, NOW).body;
    expect(body).not.toMatch(/Rejected:/);
    expect(body).not.toMatch(/Supersedes:/);
    expect(body).not.toMatch(/Topic:/);
  });

  /**
   * `actor` IS AN IDENTITY FIELD, so a decision joins the person spine through the
   * shared upsert path and "what has X decided" filters to it. Asserted against the
   * real resolver rather than by reading the key back, because the join is the point.
   */
  it("attributes the decision so the person spine picks it up", () => {
    const eman: Person = { canonical: "Eman Cickusic", kind: "person" };
    const registry = new Map([["eman cickusic", eman]]);
    expect(peopleIn(buildDecisionRow(base, NOW).meta, registry)).toEqual(["Eman Cickusic"]);
  });

  it("normalises the topic so 'Pricing' and 'pricing' filter as one", () => {
    expect(buildDecisionRow({ ...base, topic: " Pricing " }, NOW).meta.topic).toBe("pricing");
  });

  /** Postgres would take a 4KB title; the result renderer and every prompt would not. */
  it("bounds a runaway title", () => {
    const row = buildDecisionRow({ ...base, decision: "x".repeat(5000) }, NOW);
    expect(row.title.length).toBeLessThanOrEqual(300);
    // The full text still survives in the body — the cap trims the title, not the record.
    expect(row.body).toContain("x".repeat(5000));
  });

  it("falls back to today when the date is not a date", () => {
    expect(buildDecisionRow({ ...base, decidedOn: "last tuesday" }, NOW).period_end).toBe(
      "2026-09-09"
    );
  });
});

describe("noticing that something was already decided", () => {
  /**
   * THE GATE IS A COST CONTROL, NOT A CORRECTNESS CONTROL.
   *
   * The rule is "before PROPOSING a change of direction, check whether it was already
   * decided", so only a proposal can contradict a decision — "how many people signed up
   * last month" cannot. The lookup behind this gate costs 164-200ms against a search that
   * averages about a second, and in measurement it caught no proposal that the free path
   * (a decision that ranked into the ordinary results) had not already caught. So the
   * gate keeps a piece of insurance from being billed to every question that will never
   * claim on it.
   */
  it.each([
    "should we index the survey answers",
    "let's add a github ingester",
    "can we give each person their own token",
    "I think we should switch to per-person tokens",
    "why don't we reconsider the pricing",
    "instead of one token, propose a per-user scheme",
    "Should the brain ask before writing?",
  ])("treats %j as a proposal", (q) => {
    expect(proposesSomething(q)).toBe(true);
  });

  it.each([
    "how many people signed up last month",
    "what is our current report pricing",
    "summarise the last team meeting",
    "what did we discuss yesterday",
    "what does STRIPE_COUPON_100 do",
    "why did checkout starts collapse in august",
  ])("does not treat %j as a proposal", (q) => {
    expect(proposesSomething(q)).toBe(false);
  });

  it("says nothing when there is nothing to say", () => {
    expect(renderPriorDecisions([])).toBe("");
  });

  /**
   * THE WORDING HAS TO SURVIVE BEING WRONG, which matters more than any threshold.
   *
   * A vague enough question — "how is the company doing" — puts a decision at rank 1 with
   * a ratio of 1.00, because decisions are the newest rows in the corpus and recency
   * decides a query with no content in it. No score rule separates that case, and
   * inventing one against four decision records would be fitting noise. So the block
   * claims only that a decision MAY bear on the question, and says to ignore it if not.
   */
  it("offers the decision rather than asserting the question is closed", () => {
    const out = renderPriorDecisions([
      {
        sourceId: "decision:2026-09-09-abc",
        title: "Decision: Keep one shared credential",
        decidedOn: "2026-09-09",
      },
    ]);
    expect(out).toMatch(/may already be settled/);
    expect(out).toMatch(/ignore this block/);
    expect(out).toMatch(/matched by wording, not judgement/);
    // Never a flat assertion that it IS settled.
    expect(out).not.toMatch(/this is settled|has been decided already, do not/i);
  });

  it("strips the stored title prefix, which the heading already says", () => {
    const out = renderPriorDecisions([
      {
        sourceId: "decision:2026-09-09-abc",
        title: "Decision: Keep one shared credential",
        decidedOn: "2026-09-09",
      },
    ]);
    expect(out).toContain("• Keep one shared credential");
    expect(out).not.toContain("• Decision: Keep");
  });

  /** The id has to be the form `fetch_document` accepts, since the block says to use it. */
  it("prints an id the reader can actually fetch", () => {
    const out = renderPriorDecisions([
      { sourceId: "decision:2026-09-09-abc", title: null, decidedOn: null },
    ]);
    expect(out).toContain("id: decision/decision:2026-09-09-abc");
    expect(out).toContain("(untitled)");
  });

  it("pluralises when it found more than one", () => {
    const two = renderPriorDecisions([
      { sourceId: "a", title: "Decision: one", decidedOn: "2026-09-09" },
      { sourceId: "b", title: "Decision: two", decidedOn: "2026-09-08" },
    ]);
    expect(two).toMatch(/PRIOR DECISIONS ON RECORD/);
    expect(two).toMatch(/Read them with/);
  });
});

describe("priorDecisions — the lookup behind the gate", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    source_id: "decision:2026-09-09-abc",
    title: "Decision: Keep one shared credential",
    period_end: "2026-09-09",
    score: 2.4,
    ...over,
  });

  beforeEach(() => {
    mockSupabaseFetch.mockReset();
    mockSupabaseFetch.mockResolvedValue({ ok: true, json: async () => [row()] });
  });

  /** The gate is the whole cost saving: 164-200ms not spent on a question that could
   *  not contradict a decision even in principle. */
  it("does not even ask the database about a question that proposes nothing", async () => {
    expect(await priorDecisions("how many people signed up last month")).toEqual([]);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });

  it("asks about a proposal", async () => {
    const found = await priorDecisions("should we switch to per-person tokens");
    expect(found).toHaveLength(1);
    expect(found[0]!.sourceId).toBe("decision:2026-09-09-abc");
  });

  /**
   * NO EMBEDDING, DELIBERATELY. This runs on the path of every proposal, and embedding
   * the question a second time would add 229-411ms. Decisions are titled with the
   * decision text itself, so the lexical arms are the right instrument: six phrasings
   * that should match scored 1.69-2.91 with no vector involved.
   */
  it("runs lexically, without paying to embed the question again", async () => {
    await priorDecisions("should we switch to per-person tokens");
    const sent = JSON.parse(String((mockSupabaseFetch.mock.calls[0]![1] as { body: string }).body));
    expect(sent.query_embedding).toBeNull();
    expect(sent.sources).toEqual(["decision"]);
  });

  /**
   * A FLOOR, WHICH THE RANKED SEARCH DELIBERATELY HAS NOT GOT.
   *
   * An unsolicited claim needs more confidence than a list someone asked for: telling a
   * reader "this was already decided" about something unrelated is a confident wrong
   * answer they did not request. Measured over sixteen questions, the six that should
   * match scored 1.69 and up while the ten that should not topped out at 1.18.
   */
  it("drops a weak match rather than interrupting on it", async () => {
    mockSupabaseFetch.mockResolvedValue({ ok: true, json: async () => [row({ score: 1.18 })] });
    expect(await priorDecisions("should we do something entirely unrelated")).toEqual([]);
  });

  it("keeps a match that clears the floor", async () => {
    mockSupabaseFetch.mockResolvedValue({ ok: true, json: async () => [row({ score: 1.69 })] });
    expect(await priorDecisions("should we give everyone their own token")).toHaveLength(1);
  });

  /** Additive: this decorates an answer that is already complete without it. */
  it("stays quiet when the lookup fails, rather than failing the search", async () => {
    mockSupabaseFetch.mockRejectedValue(new Error("down"));
    expect(await priorDecisions("should we switch to per-person tokens")).toEqual([]);
    mockSupabaseFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    expect(await priorDecisions("should we switch to per-person tokens")).toEqual([]);
  });
});

describe("superseding is history a reader can see, not just metadata", () => {
  beforeEach(() => {
    mockSupabaseFetch.mockReset();
    mockUpsertChunks.mockReset();
    mockUpsertChunks.mockResolvedValue(1);
  });

  it("marks the REPLACED decision, because that is the record a reader lands on", async () => {
    /**
     * `supersedes` was written into the NEW decision's metadata, body and Slack
     * mirror — and read back by nothing. The replaced decision carried no trace of
     * having been replaced, so a reader who searched their way onto it got only the
     * generic "prefer the later date", which is useless unless they already know a
     * later one exists.
     */
    const seen: Array<{ path: string; body?: Record<string, unknown> }> = [];
    mockSupabaseFetch.mockImplementation(async (path: string, init?: { body?: string }) => {
      seen.push({ path, body: init?.body ? JSON.parse(init.body) : undefined });
      if (init?.body) return { ok: true, json: async () => [] };
      return { ok: true, json: async () => [{ id: 7, meta: { kind: "decision" } }] };
    });

    await recordDecision({
      decision: "the new way",
      actor: "A Person",
      supersedes: "decision/decision:2026-01-01-aaaaaaaaaa",
    });

    const patch = seen.find((x) => x.path.includes("id=eq.7"));
    expect(patch, "the older decision must be patched").toBeTruthy();
    const meta = (patch!.body as { meta: Record<string, unknown> }).meta;
    expect(String(meta.superseded_by)).toMatch(/^decision:/);
    // Superseding is history, not deletion: the old row keeps what it already had.
    expect(meta.kind).toBe("decision");
  });

  it("strips a `decision/` prefix, because that is how the id is printed", async () => {
    const reads: string[] = [];
    mockSupabaseFetch.mockImplementation(async (path: string, init?: { body?: string }) => {
      if (!init?.body) reads.push(path);
      return { ok: true, json: async () => [] };
    });
    await recordDecision({
      decision: "x",
      actor: "A Person",
      supersedes: "decision/decision:2026-01-01-bbbbbbbbbb",
    });
    expect(reads.some((r) => r.includes("decision%3A2026-01-01-bbbbbbbbbb"))).toBe(true);
    expect(reads.some((r) => r.includes("decision%2Fdecision"))).toBe(false);
  });

  it("still records the decision when the older one cannot be marked", async () => {
    // The new decision is the thing being recorded. Losing it because a
    // back-reference could not be stamped would be the worse trade.
    mockSupabaseFetch.mockRejectedValue(new Error("brain_chunk is down"));
    await expect(
      recordDecision({ decision: "still recorded", actor: "A Person", supersedes: "decision:x" })
    ).resolves.toMatchObject({ id: expect.stringContaining("decision:") });
  });
});
