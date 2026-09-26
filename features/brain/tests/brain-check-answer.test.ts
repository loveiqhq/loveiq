import { describe, expect, it } from "vitest";

import { atomsIn, checkAnswer } from "@features/brain/server/check-answer";

const analytics = {
  id: "analytics/monthly:2026-09",
  text: "LoveIQ numbers, September 2026: 13245 visitors, 434 finished the survey, 3.28% of visitors started, revenue EUR 70, last sale on 14 September.",
};
const decision = {
  id: "decision/decision:2026-09-26-bfc66b0fe8",
  text: "Decision: Drop the subscription business model. Why: checkout takes one-off payments only. Quoted: “it was never built and is dead”.",
};

describe("check_answer: what a source confirms", () => {
  it("confirms a figure however it is written: separators, rounding, trailing zeros, a spelled-out day", () => {
    const r = checkAnswer(
      "September had 13,245 visitors. About 3.3% of them started. Revenue was EUR 70.00, and the last sale was on 2026-09-14.",
      [analytics]
    );
    expect(r.missing).toBe(0);
    expect(r.confirmed).toBe(3);
    expect(r.text).toContain("13,245 in analytics/monthly:2026-09");
    expect(r.text).toContain("Every figure and quote checked is in a cited source.");
  });

  it("names a figure the source does not hold, with the nearest one it does", () => {
    const r = checkAnswer("Revenue covered 5.9% of the spend, and 434 people finished.", [
      { id: "analytics/x", text: "Revenue covered 5.8% of the spend; 434 finished." },
    ]);
    expect(r.missing).toBe(1);
    expect(r.text).toContain("NOT IN THE CITED SOURCES");
    expect(r.text).toMatch(/5\.9% \(nearest there: 5\.8\) is not in analytics\/x/);
  });

  it("confirms a quote word for word, curly or straight, and flags one the source never said", () => {
    const good = checkAnswer('The record says "It was never built and is dead".', [decision]);
    expect(good.missing).toBe(0);
    expect(good.confirmed).toBe(1);
    const bad = checkAnswer('The record says "we will revisit subscriptions in 2027".', [decision]);
    expect(bad.missing).toBe(1);
    expect(bad.text).toMatch(/the quote .*we will revisit subscriptions in 2027.* is not in/);
  });

  it("checks a sentence that names an id against that document alone", () => {
    const r = checkAnswer(
      "The decision/decision:2026-09-26-bfc66b0fe8 record puts September at 13,245 visitors.",
      [analytics, decision]
    );
    expect(r.missing).toBe(1);
    expect(r.text).toContain("13,245 is not in decision/decision:2026-09-26-bfc66b0fe8");
  });
});

describe("check_answer: what it does not pretend to check", () => {
  it("leaves bare single digits and sentences without figures unchecked, and says so", () => {
    const r = checkAnswer("We had 2 sales. The paywall is clear.\n- It works on phones.", [
      analytics,
    ]);
    expect(r.confirmed + r.missing).toBe(0);
    expect(r.text).toContain("Checked 0 figures and 0 quotes against 1 source.");
    expect(r.text).toContain("3 sentences have no figure or quote, so this cannot check them");
    expect(r.text).not.toContain("Every figure and quote checked");
  });

  it("does not read a brain id's digits as figures, but does read a fraction", () => {
    expect(atomsIn("See decision/decision:2026-09-09-3d275f5327 for why.")).toEqual([]);
    expect(atomsIn("It scored 7/10.").map((a) => a.raw)).toEqual(["10"]);
  });

  it("treats a word or two in quotes as a term, not a quotation", () => {
    expect(atomsIn('We call it the "postponed list" internally.')).toEqual([]);
    expect(atomsIn('He said "ship it on Monday".').map((a) => a.kind)).toEqual(["quote"]);
  });

  it("calls figures with no source given uncited", () => {
    const r = checkAnswer("We spent EUR 1,196.96 on ads.", []);
    expect(r.uncited).toBe(1);
    expect(r.text).toContain("NO SOURCE GIVEN");
  });
});
