// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { surveyQuestions, type SurveyQuestion } from "@/data/survey-data";
import { SURVEY_2_COPY } from "@features/survey/survey2/copy";
import MultipleChoiceQuestion from "@features/survey/ui/questions/MultipleChoiceQuestion";
import SingleChoiceQuestion from "@features/survey/ui/questions/SingleChoiceQuestion";
import { orderAskedQuestions } from "@features/survey/ui/questionOrder";

/**
 * Mark's simpler wording for Survey 2.0 (Survey Review, the orange-dashed boards). A reworded
 * option SHOWS the new words but STORES the old ones (his to-do 3: "keep the stored answer values
 * the same, so scoring, boosts and the 'fantasy' pricing rule still match"). The classic survey
 * keeps every word it has.
 */
afterEach(cleanup);

const screens = () => orderAskedQuestions(surveyQuestions, "survey2");
const classic = () => orderAskedQuestions(surveyQuestions, "variant");
const on = (list: SurveyQuestion[], qId: string) => list.find((q) => q.qId === qId)!;
const base = (qId: string) => on(surveyQuestions, qId);
const shown = (q: SurveyQuestion) => q.options.map((o) => q.optionLabels?.[o] ?? o);

describe("Mark's wording in Survey 2.0", () => {
  it("relabels only options that exist, so every stored answer keeps its value", () => {
    for (const [qId, copy] of Object.entries(SURVEY_2_COPY)) {
      for (const stored of Object.keys(copy.optionLabels ?? {})) {
        expect(base(qId).options, `${qId}: ${stored}`).toContain(stored);
      }
    }
  });

  it("keeps every option, in its place", () => {
    for (const qId of ["02001", "02004", "03003", "03005", "16014"]) {
      expect(on(screens(), qId).options, qId).toEqual(base(qId).options);
    }
  });

  it.each([
    ["02002", "I usually need touch or closeness before I feel desire."],
    ["02004", "The best sex usually starts when…"],
    ["03003", "Which kinds of settings most reliably turn you on?"],
    ["03005", "When you're not in the mood, what usually changes that?"],
    ["03006", "How do you like to learn what works for you in sex?"],
    ["08006", "When I feel pressured during sex, my arousal drops and I pull away."],
    [
      "16007",
      "When you want to improve something important (health, relationships, confidence, your sex life), what's usually your first move?",
    ],
    ["16013", "Knowing more about how I work sexually matters to me."],
    ["16014", "What's in the way of better sex right now?"],
    ["16016", "In the areas you picked, which of these matter most to you right now?"],
  ])("asks %s in Mark's words", (qId, question) => {
    expect(on(screens(), qId).question).toBe(question);
  });

  it("finishes Mark's 02004 sentence with its four endings", () => {
    expect(shown(on(screens(), "02004"))).toEqual([
      "I make the first move",
      "they make the first move",
      "we planned it ahead",
      "it just happens, no one has to start",
    ]);
  });

  it("shows Mark's seven 03005 options", () => {
    expect(shown(on(screens(), "03005"))).toEqual([
      "Touch and physical build-up",
      "A calm, private moment with time",
      "Feeling emotionally close to them",
      "Something new or surprising",
      "When one of us really knows what to do in bed",
      "Fantasies in my head, or erotic content",
      "It varies",
    ]);
  });

  it("relabels one option each in 02001 and 03003", () => {
    expect(shown(on(screens(), "02001"))[1]).toBe(
      "Once something gets me in the mood, like touch or closeness"
    );
    expect(shown(on(screens(), "03003"))[2]).toBe(
      "Creating the mood on purpose: lights, music, taking our time"
    );
  });

  it("gives 16014 Mark's helper line and options, keeping its last two", () => {
    const q = on(screens(), "16014");
    expect(q.guide).toBe("Pick the one thing that holds you back most right now.");
    expect(shown(q)).toEqual([
      "I don't know what would help",
      "I don't have enough time or energy",
      "The person I'm with won't talk about it or work on it",
      "I don't yet feel safe or trusting enough",
      "Shame, or being hard on myself",
      "Pain or other physical problems",
      "Good help is too expensive or hard to find",
      "I try things, but lose motivation over time",
      "Nothing major is in the way right now",
      "Something else",
    ]);
  });

  it("asks the 16016 topics as up to three", () => {
    expect(on(screens(), "16016")).toMatchObject({
      maxSelections: 3,
      formatGuidance: "Pick up to 3.",
    });
  });

  // Mark chose it on his Survey review board (16 Nov: "Lets go with 'I'm drawn to trying new
  // things in sex.'"); Eman, 28 Nov: "fix it". The stored answer and its scoring stay as they are.
  it("asks 01005 in Mark's words, with his helper line", () => {
    const q = on(screens(), "01005");
    expect(q.question).toBe("I'm drawn to trying new things in sex.");
    expect(q.guide).toBe(
      "This is about what you tend to enjoy, not what you're getting right now. New can mean positions, places, fantasies or roles."
    );
    expect(q.answerType).toBe(base("01005").answerType);
    expect(q.scaleLabels).toEqual(base("01005").scaleLabels);
  });

  it("leaves the classic survey's words alone", () => {
    for (const qId of Object.keys(SURVEY_2_COPY)) {
      const q = on(classic(), qId);
      expect(q.question, qId).toBe(base(qId).question);
      expect(q.optionLabels, qId).toBeUndefined();
    }
  });
});

describe("a relabelled option on screen", () => {
  it("shows the new words and records the stored value (single choice)", async () => {
    const q = on(screens(), "02004");
    const onChange = vi.fn();
    render(<SingleChoiceQuestion question={q} value={null} onChange={onChange} />);
    await userEvent.click(screen.getByText("they make the first move"));
    expect(onChange).toHaveBeenCalledWith("The other person starts things — I respond to them");
    expect(screen.queryByText("The other person starts things — I respond to them")).toBeNull();
  });

  it("shows the new words and records the stored value (multiple choice)", async () => {
    const q = on(screens(), "03003");
    const onChange = vi.fn();
    render(<MultipleChoiceQuestion question={q} value={[]} onChange={onChange} />);
    await userEvent.click(
      screen.getByText("Creating the mood on purpose: lights, music, taking our time")
    );
    expect(onChange).toHaveBeenCalledWith(["Slow, intentional, almost ritual-like"]);
  });
});
