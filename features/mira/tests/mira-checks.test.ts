import { describe, expect, it } from "vitest";
import {
  CHECKS,
  bandOf,
  changeSince,
  checkById,
  isValidAnswers,
  nextTakeAt,
  scoreOf,
  supportNow,
  type Check,
} from "@features/mira/content/checks";
import { safeNext } from "@features/mira/server/session";

/**
 * The self-checks' content and maths (features/mira/content/checks.ts). Expected values come
 * from the published sources, not from the code: the official English forms at phqscreeners.com
 * (GAD-7, PHQ-9), Hughes et al. 2004 Table 1 (loneliness), the PHQ/GAD-7 instruction manual's
 * cut-points, and the NHS Talking Therapies manual v8, Table 9 (reliable change).
 */

const anxiety = checkById("anxiety")!;
const mood = checkById("mood")!;
const loneliness = checkById("loneliness")!;

const bandAt = (check: Check, score: number) => bandOf(check, score).id;

describe("the three checks", () => {
  it("are anxiety (GAD-7), mood (PHQ-9) and loneliness (three-item scale), in that order", () => {
    expect(CHECKS.map((c) => [c.id, c.scale])).toEqual([
      ["anxiety", "gad7"],
      ["mood", "phq9"],
      ["loneliness", "ucla3"],
    ]);
    expect(checkById("body")).toBeUndefined();
  });

  it("asks the GAD-7 word for word, with its answers scored 0 to 3", () => {
    expect(anxiety.instructions).toBe(
      "Over the last 2 weeks, how often have you been bothered by the following problems?"
    );
    expect(anxiety.items).toEqual([
      "Feeling nervous, anxious or on edge",
      "Not being able to stop or control worrying",
      "Worrying too much about different things",
      "Trouble relaxing",
      "Being so restless that it is hard to sit still",
      "Becoming easily annoyed or irritable",
      "Feeling afraid as if something awful might happen",
    ]);
    expect(anxiety.options).toEqual([
      { label: "Not at all", value: 0 },
      { label: "Several days", value: 1 },
      { label: "More than half the days", value: 2 },
      { label: "Nearly every day", value: 3 },
    ]);
  });

  it("asks the PHQ-9 word for word, with its answers scored 0 to 3", () => {
    expect(mood.instructions).toBe(
      "Over the last 2 weeks, how often have you been bothered by any of the following problems?"
    );
    expect(mood.items).toEqual([
      "Little interest or pleasure in doing things",
      "Feeling down, depressed, or hopeless",
      "Trouble falling or staying asleep, or sleeping too much",
      "Feeling tired or having little energy",
      "Poor appetite or overeating",
      "Feeling bad about yourself — or that you are a failure or have let yourself or your family down",
      "Trouble concentrating on things, such as reading the newspaper or watching television",
      "Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual",
      "Thoughts that you would be better off dead or of hurting yourself in some way",
    ]);
    expect(mood.options).toEqual(anxiety.options);
  });

  it("asks the three loneliness questions as Hughes et al. wrote them, scored 1 to 3", () => {
    expect(loneliness.instructions).toBe(
      "The next questions are about how you feel about different aspects of your life. For each one, tell me how often you feel that way."
    );
    expect(loneliness.items).toEqual([
      "How often do you feel that you lack companionship?",
      "How often do you feel left out?",
      "How often do you feel isolated from others?",
    ]);
    expect(loneliness.options).toEqual([
      { label: "Hardly ever", value: 1 },
      { label: "Some of the time", value: 2 },
      { label: "Often", value: 3 },
    ]);
  });

  it("each name their source and citation", () => {
    for (const c of CHECKS) {
      expect(c.source.length, c.id).toBeGreaterThan(20);
      expect(c.citation, c.id).toMatch(/\b(19|20)\d\d\b/);
    }
  });
});

describe("scores", () => {
  it("are the sum of the answers", () => {
    expect(scoreOf(anxiety, [0, 1, 2, 3, 0, 1, 2])).toBe(9);
    expect(scoreOf(mood, [3, 3, 3, 3, 3, 3, 3, 3, 3])).toBe(27);
    expect(scoreOf(loneliness, [1, 2, 3])).toBe(6);
  });

  it("are only taken from whole answers of the scale's own values, one per question", () => {
    expect(isValidAnswers(anxiety, [0, 1, 2, 3, 0, 1, 2])).toBe(true);
    expect(isValidAnswers(anxiety, [0, 1, 2, 3, 0, 1])).toBe(false); // one missing
    expect(isValidAnswers(anxiety, [0, 1, 2, 3, 0, 1, 2, 3])).toBe(false); // one too many
    expect(isValidAnswers(anxiety, [0, 1, 2, 4, 0, 1, 2])).toBe(false); // above the scale
    expect(isValidAnswers(anxiety, [0, 1, 2, -1, 0, 1, 2])).toBe(false);
    expect(isValidAnswers(anxiety, [0, 1, 2, 1.5, 0, 1, 2])).toBe(false);
    expect(isValidAnswers(loneliness, [0, 1, 2])).toBe(false); // the loneliness scale starts at 1
    expect(isValidAnswers(loneliness, [1, 2, 3])).toBe(true);
    expect(isValidAnswers(mood, [0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(true);
  });
});

describe("bands, at every boundary", () => {
  it("GAD-7: 0–4 minimal, 5–9 mild, 10–14 moderate, 15–21 severe", () => {
    const at = (s: number) => bandAt(anxiety, s);
    expect([at(0), at(4)]).toEqual(["minimal", "minimal"]);
    expect([at(5), at(9)]).toEqual(["mild", "mild"]);
    expect([at(10), at(14)]).toEqual(["moderate", "moderate"]);
    expect([at(15), at(21)]).toEqual(["severe", "severe"]);
  });

  it("PHQ-9: 0–4 minimal, 5–9 mild, 10–14 moderate, 15–19 moderately severe, 20–27 severe", () => {
    const at = (s: number) => bandAt(mood, s);
    expect([at(0), at(4)]).toEqual(["minimal", "minimal"]);
    expect([at(5), at(9)]).toEqual(["mild", "mild"]);
    expect([at(10), at(14)]).toEqual(["moderate", "moderate"]);
    expect([at(15), at(19)]).toEqual(["moderately-severe", "moderately-severe"]);
    expect([at(20), at(27)]).toEqual(["severe", "severe"]);
  });

  it("loneliness: 3–5 low, 6–9 high (the grouping researchers have used; no official cut-off)", () => {
    const at = (s: number) => bandAt(loneliness, s);
    expect([at(3), at(5)]).toEqual(["low", "low"]);
    expect([at(6), at(9)]).toEqual(["high", "high"]);
  });

  it("suggest a professional from the published 'further evaluation' point: GAD-7 and PHQ-9 at 10, loneliness when high", () => {
    const pro = (c: Check, s: number) => Boolean(bandOf(c, s).professional);
    expect([pro(anxiety, 9), pro(anxiety, 10), pro(anxiety, 21)]).toEqual([false, true, true]);
    expect([pro(mood, 9), pro(mood, 10), pro(mood, 27)]).toEqual([false, true, true]);
    expect([pro(loneliness, 5), pro(loneliness, 6)]).toEqual([false, true]);
  });

  it("say the band in words that describe the answers, never a diagnosis", () => {
    for (const c of CHECKS) {
      for (const b of c.bands) {
        expect(b.headline, `${c.id} ${b.id}`).toMatch(/^Your answers suggest /);
        expect(`${b.headline} ${b.daily} ${b.intimacy}`, `${c.id} ${b.id}`).not.toMatch(
          /\b(you have|you are|diagnos\w*|disorders?)\b/i
        );
      }
    }
  });
});

describe("the mood check's question 9", () => {
  const all = (v: number, item9: number) => [v, v, v, v, v, v, v, v, item9];

  it("opens the support lines for any answer above 'Not at all', whatever the total", () => {
    expect(supportNow(mood, all(0, 1))).toBe(true); // a total of 1: minimal, still support
    expect(supportNow(mood, all(0, 2))).toBe(true);
    expect(supportNow(mood, all(3, 3))).toBe(true);
    expect(supportNow(mood, all(0, 0))).toBe(false);
    expect(supportNow(mood, all(3, 0))).toBe(false); // a high total alone is the professional step
  });

  it("is the PHQ-9's 9th question and no other check has one", () => {
    expect(mood.items[mood.crisisItem!]).toMatch(/^Thoughts that you would be better off dead/);
    expect(supportNow(anxiety, [3, 3, 3, 3, 3, 3, 3])).toBe(false);
    expect(supportNow(loneliness, [3, 3, 3])).toBe(false);
  });
});

describe("change between two results", () => {
  it("is reliable from 4 points on the GAD-7 and 6 on the PHQ-9 (NHS Talking Therapies)", () => {
    expect(changeSince(anxiety, 12, 8)).toEqual({ diff: -4, reliable: true });
    expect(changeSince(anxiety, 12, 9)).toEqual({ diff: -3, reliable: false });
    expect(changeSince(anxiety, 8, 12)).toEqual({ diff: 4, reliable: true });
    expect(changeSince(mood, 16, 10)).toEqual({ diff: -6, reliable: true });
    expect(changeSince(mood, 16, 11)).toEqual({ diff: -5, reliable: false });
  });

  it("makes no reliability claim for the loneliness scale, which has no published threshold", () => {
    expect(changeSince(loneliness, 8, 4)).toEqual({ diff: -4, reliable: null });
  });
});

describe("retakes", () => {
  it("open two weeks after an anxiety or mood check (they ask about two weeks), four for loneliness", () => {
    const at = "2026-11-01T10:00:00.000Z";
    expect(nextTakeAt(anxiety, at).toISOString()).toBe("2026-11-15T10:00:00.000Z");
    expect(nextTakeAt(mood, at).toISOString()).toBe("2026-11-15T10:00:00.000Z");
    expect(nextTakeAt(loneliness, at).toISOString()).toBe("2026-11-29T10:00:00.000Z");
  });
});

describe("signing in from a check's page", () => {
  it("comes back to that page, and only to Mira's own check pages, spelt exactly", () => {
    for (const ok of [
      "/mira/assessments",
      "/mira/assessments/anxiety",
      "/mira/assessments/mood",
      "/mira/assessments/loneliness",
      "/mira/assessments/body",
    ]) {
      expect(safeNext(ok)).toBe(ok);
    }
    for (const bad of [
      "/mira/assessments/other",
      "/mira/assessments/../../admin",
      "/mira/assessments/mood?x=1",
      "/mira/assessments/",
    ]) {
      expect(safeNext(bad)).toBeNull();
    }
  });
});
