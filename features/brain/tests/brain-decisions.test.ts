import { describe, expect, it } from "vitest";

import { buildDecisionRow } from "@features/brain/server/decisions";
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
