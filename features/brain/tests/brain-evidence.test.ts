import { describe, expect, it } from "vitest";
import {
  buildEvidenceRow,
  buildQuery,
  constructsForDay,
  CYCLE_DAYS,
  EXCLUDED_DOMAINS,
  MIN_HITS,
  researchableConstructs,
  toPaper,
  type Paper,
} from "@features/brain/server/ingest/evidence";

const paper = (over: Partial<Paper> = {}): Paper => ({
  title: "Endorphins, Sexuality, and Reproduction",
  journal: "Advances in neurobiology",
  year: "2024",
  doi: "10.1007/978-3-031-45493-6_20",
  citedBy: 1,
  openAccess: false,
  abstract: "Beta-endorphin is secreted from the hypothalamus and pituitary.",
  ...over,
});
const result = (over: { hitCount?: number; papers?: Paper[] } = {}) => ({
  hitCount: over.hitCount ?? 10,
  papers: over.papers ?? [paper()],
});

describe("buildQuery", () => {
  it("restricts the construct to the TITLE, which is what makes a card evidence", () => {
    /**
     * The whole design hangs on this one field. With the construct allowed to match an
     * ABSTRACT, a dry run produced a card for "Being Chosen" citing tubal reanastomosis,
     * a study of The Bachelor and a 1993 patent on antiseptic compositions — every paper
     * real, in our field, and about nothing to do with the construct.
     */
    const q = buildQuery("Attachment Style");
    expect(q).toContain('TITLE:"Attachment Style"');
    expect(q).not.toContain('TITLE_ABS:"Attachment Style"');
  });

  it("keeps the subject clause on title-or-abstract, where it belongs", () => {
    // A paper about attachment style in couples may only say "couples" in its abstract.
    const q = buildQuery("Attachment Style");
    expect(q).toMatch(/AND TITLE_ABS:\(/);
    expect(q).toContain("sexual");
  });

  it("omits the words that leak, and keeps the unambiguous ones", () => {
    /**
     * Bare `relationship` matches "the relationship between variables", `attachment`
     * matches cell adhesion, `partner` matches business partners. With them in, the
     * methodology term "Anonymization" matched 31 papers, topped by a speaker-trait
     * machine-learning study; with them out it matched 2.
     */
    const q = buildQuery("x");
    for (const leaky of ["OR relationship OR", "OR attachment OR", "OR partner OR", "OR desire OR"])
      expect(q, leaky).not.toContain(leaky);
    expect(q).toContain('"romantic relationship"');
    expect(q).toContain('"intimate partner"');
  });

  it("strips quotes rather than escaping them, so the phrase cannot end early", () => {
    // A stray quote would close the phrase and silently widen the search to the remainder.
    // Trimmed after stripping, so no trailing space leaks into the phrase.
    expect(buildQuery('say "yes"')).toContain('TITLE:"say  yes"');
  });
});

describe("buildEvidenceRow", () => {
  it("refuses a construct the literature does not title", () => {
    // "Being Chosen" measured 0 titled papers; "Process-Focused" measured 1, and that one
    // was about seizure risk in transcranial magnetic stimulation.
    expect(buildEvidenceRow("Being Chosen", result({ hitCount: 0, papers: [] }), "t")).toBeNull();
    expect(buildEvidenceRow("Process-Focused", result({ hitCount: 1 }), "t")).toBeNull();
    expect(buildEvidenceRow("x", result({ hitCount: MIN_HITS - 1 }), "t")).toBeNull();
  });

  it("writes a card once the floor is cleared", () => {
    const row = buildEvidenceRow(
      "Endorphins",
      result({ hitCount: MIN_HITS }),
      "2026-09-17T00:00:00Z"
    );
    expect(row).not.toBeNull();
    expect(row!.source).toBe("evidence");
    expect(row!.source_id).toBe("evidence:endorphins");
    expect(row!.title).toContain("Endorphins");
  });

  it("refuses when the count clears the floor but no paper came back", () => {
    // A count with no rows is a broken response, not a thin literature — and a card with
    // a heading and no citations reads as "we looked and found nothing worth listing".
    expect(buildEvidenceRow("x", result({ hitCount: 500, papers: [] }), "t")).toBeNull();
  });

  it("says in the body that this is somebody else's work", () => {
    /**
     * The risk this whole source carries: a paper is not our claim. The same lesson as the
     * bulk-mail demotion and the reference demotion — third-party material has to be
     * visibly third-party or it gets quoted back as ours.
     */
    const body = buildEvidenceRow("Endorphins", result(), "t")!.body;
    expect(body).toContain("NOT LOVEIQ'S");
    expect(body).toContain("never as");
    expect(body).toContain("may disagree");
  });

  it("describes the search truthfully — title, not abstract", () => {
    // `brain:claims` exists because a description that stops being true is invisible.
    const body = buildEvidenceRow("Endorphins", result(), "t")!.body;
    expect(body).toContain("TITLE");
    expect(body).not.toContain("title or abstract");
  });

  it("carries the citation a reader needs to check it", () => {
    const body = buildEvidenceRow("Endorphins", result(), "t")!.body;
    expect(body).toContain("Advances in neurobiology, 2024");
    expect(body).toContain("10.1007/978-3-031-45493-6_20");
    expect(body).toContain("cited 1×");
  });

  it("is undated, so it cannot outrank a dated record on recency", () => {
    // A citation list describes no period. Stamping it with today would put reference
    // material into the recency contest the reference demotion exists to keep it out of.
    expect(buildEvidenceRow("Endorphins", result(), "t")!.period_end).toBeNull();
  });

  it("states the true total, not just what it listed", () => {
    const body = buildEvidenceRow("Endorphins", result({ hitCount: 1051 }), "t")!.body;
    expect(body).toContain("1051 papers match in total");
  });
});

describe("researchableConstructs", () => {
  it("leaves out the vocabulary describing how we measure", () => {
    // There is no literature on our own apparatus. Verified as the only filter tried that
    // had no false negatives — `type` put Privacy and Attachment Style in the same bucket.
    const out = researchableConstructs([
      { term: "Attachment Style", domain: "Emotional & Attachment Patterns" },
      { term: "Likert-Scale Items", domain: "Product & Assessment" },
      { term: "Privacy", domain: "Data, Privacy & Measurement" },
    ]);
    expect(out).toEqual(["Attachment Style"]);
  });

  it("is stable and deduplicated, because the daily slice is taken by index", () => {
    // An unstable order would re-check some constructs every day and starve others.
    const a = researchableConstructs([
      { term: "b", domain: "x" },
      { term: "a", domain: "x" },
      { term: "A", domain: "x" },
    ]);
    expect(a).toEqual(["a", "b"]);
  });

  it("skips entries with no usable term", () => {
    expect(researchableConstructs([{ term: "  ", domain: "x" }, { domain: "x" }])).toEqual([]);
  });
});

describe("constructsForDay", () => {
  it("covers every construct exactly once per cycle", () => {
    const all = Array.from({ length: 287 }, (_, i) => `c${i}`);
    const seen = new Set<string>();
    for (let d = 0; d < CYCLE_DAYS; d++) for (const c of constructsForDay(all, d)) seen.add(c);
    expect(seen.size).toBe(all.length);
  });

  it("never puts the same construct in two days of one cycle", () => {
    const all = Array.from({ length: 287 }, (_, i) => `c${i}`);
    let total = 0;
    for (let d = 0; d < CYCLE_DAYS; d++) total += constructsForDay(all, d).length;
    expect(total).toBe(all.length);
  });

  it("treats a negative day index as its positive slot, not as nothing", () => {
    /**
     * `%` is remainder, not modulo, in JS: `-1 % 30` is -1, and a filter for slot -1
     * matches no index at all, so a run would quietly do no work and report success.
     *
     * Asserted against a full-size list on purpose. A three-element array cannot show
     * this — with a thirty-day cycle most days are legitimately empty at that size, so
     * the first version of this test passed a zero it should have caught.
     */
    const all = Array.from({ length: 287 }, (_, i) => `c${i}`);
    expect(constructsForDay(all, -1)).toEqual(constructsForDay(all, CYCLE_DAYS - 1));
    expect(constructsForDay(all, -1).length).toBeGreaterThan(0);
    expect(constructsForDay(all, -CYCLE_DAYS)).toEqual(constructsForDay(all, 0));
  });
});

describe("toPaper", () => {
  it("keeps only what a citation needs, and drops a row with no title", () => {
    expect(toPaper({ title: "  " })).toBeNull();
    const p = toPaper({
      title: "Endorphins, Sexuality, and Reproduction.",
      journalInfo: { journal: { title: "Advances in neurobiology" } },
      pubYear: "2024",
      doi: "10.1/x",
      citedByCount: 7,
      isOpenAccess: "Y",
      abstractText: "abstract",
    });
    // Europe PMC ends most titles with a full stop; keeping it reads as a typo in a list.
    expect(p!.title).toBe("Endorphins, Sexuality, and Reproduction");
    expect(p!.openAccess).toBe(true);
    expect(p!.citedBy).toBe(7);
  });

  it("does not let a missing citation count become NaN", () => {
    expect(toPaper({ title: "t" })!.citedBy).toBe(0);
  });
});

describe("the excluded domains", () => {
  it("names both measurement domains and nothing else", () => {
    expect([...EXCLUDED_DOMAINS].sort()).toEqual([
      "Data, Privacy & Measurement",
      "Product & Assessment",
    ]);
  });
});
