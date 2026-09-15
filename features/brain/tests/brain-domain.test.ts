import { describe, expect, it } from "vitest";
import { buildDomainRows } from "@features/brain/server/ingest/domain";

describe("domain vocabulary — terms, questions and how a score is built", () => {
  const rows = buildDomainRows("2026-09-15T00:00:00Z");
  const of = (kind: string) => rows.filter((r) => r.meta.kind === kind);

  it("indexes the vocabulary that was missing while the voice was present", () => {
    // Measured before this existed: 2 glossary chunks against 323 defined terms, 1 survey
    // chunk against 58 questions. The brain could write in our register and still be
    // guessing at what the words meant.
    expect(of("glossary").length).toBeGreaterThan(300);
    expect(of("survey").length).toBeGreaterThanOrEqual(10);
    expect(of("scoring").length).toBeGreaterThan(0);
  });

  it("gives each TERM its own chunk, because that is the unit people ask about", () => {
    // Pooling them would answer "what is responsive desire" with whichever neighbour
    // ranked highest.
    const terms = new Set(of("glossary").map((r) => String(r.meta.term)));
    expect(terms.size).toBeGreaterThan(300);
    for (const r of of("glossary").slice(0, 20)) {
      expect(r.title).toMatch(/^What we mean by "/);
    }
  });

  it("keeps what people get WRONG next to what is true", () => {
    // The most useful half of a glossary, and the part a model most needs.
    const withReality = of("glossary").filter((r) => /In reality:/.test(r.body));
    expect(withReality.length).toBeGreaterThan(50);
    const withMisread = of("glossary").filter((r) => /Commonly mistaken for:/.test(r.body));
    expect(withMisread.length).toBeGreaterThan(50);
  });

  it("groups survey questions by CHAPTER, not one chunk per question", () => {
    // "What do we ask about attachment" wants the whole chapter in view.
    const survey = of("survey");
    expect(survey.every((r) => /What the survey asks in/.test(r.title))).toBe(true);
    const totalQuestions = survey.reduce((t, r) => t + Number(r.meta.questions ?? 0), 0);
    expect(totalQuestions).toBeGreaterThanOrEqual(58);
  });

  it("says which question feeds each scoring dimension", () => {
    const dims = rows.find((r) => r.source_id === "scoring:dimensions");
    expect(dims, "the dimensions chunk must exist").toBeDefined();
    expect(dims!.body).toMatch(/from question/);
    expect(dims!.body).toMatch(/transform/);
  });

  it("carries no HTML and no period", () => {
    expect(rows.every((r) => !/<[a-z][^>]*>/i.test(r.body))).toBe(true);
    expect(rows.every((r) => r.period_end === null)).toBe(true);
  });

  it("gives every row a distinct id and title, or an upsert drops content silently", () => {
    const ids = rows.map((r) => r.source_id);
    expect(new Set(ids).size).toBe(ids.length);
    const titles = rows.map((r) => r.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("labels split parts instead of repeating one title twice", () => {
    for (const r of rows.filter((x) => /part \d+ of \d+/.test(x.title))) {
      const n = Number(/part (\d+) of/.exec(r.title)![1]);
      if (n === 1) expect(r.source_id).not.toMatch(/#\d+$/);
      else expect(r.source_id).toMatch(new RegExp(`#${n}$`));
    }
  });
});
