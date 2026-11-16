// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { surveyQuestions } from "@/data/survey-data";
import {
  OPT_IN_SHEET_COPY,
  OPT_IN_SHEET_COPY_VERSION,
  OPT_IN_SHEET_STORAGE_KEY,
  SHEET_DISMISS_DISTANCE_PX,
  isOptInYes,
  optInSheetShownFor,
  optInYesOption,
  rememberOptInSheetShown,
  shouldDismissOnDrag,
  shouldOfferOptInSheet,
} from "@features/survey/optInSheet";

/**
 * The opt-in's "Sure you want to miss out?" sheet (Mark, 10 Nov 2026): when it opens, what
 * its Yes writes, how a swipe closes it, and that it asks once per run.
 */
const optIn = surveyQuestions.find((q) => q.qId === "16015");
const YES = "Yes, I want to keep learning about myself.";
const NO = "No, I am not interested in this growth opportunity.";

/** app/api/survey/route.ts's reading of the answer, word for word. */
const serverReading = (answer: unknown): boolean | null =>
  typeof answer === "string" ? answer.trim().toLowerCase().startsWith("yes") : null;

// Every test gets fresh storage from __tests__/setup.ts.
afterEach(() => {
  vi.restoreAllMocks();
});

describe("the opt-in's answers", () => {
  it("are the two the survey asks, Yes first", () => {
    expect(optIn?.options).toEqual([YES, NO]);
  });

  it("are read as the server reads them, so the sheet opens exactly on a stored No", () => {
    for (const answer of [YES, NO, "  YES please", "yes", "No", "Nope", ""]) {
      expect(isOptInYes(answer)).toBe(serverReading(answer) === true);
    }
    expect(isOptInYes(null)).toBe(false);
    expect(isOptInYes(3)).toBe(false);
  });

  it("give the sheet the question's own Yes, word for word (submit_survey matches it)", () => {
    expect(optInYesOption(optIn?.options)).toBe(YES);
  });

  it("give no Yes for a question without one, so the sheet never opens there", () => {
    expect(optInYesOption(["A", "B"])).toBeNull();
    expect(optInYesOption(undefined)).toBeNull();
  });
});

describe("shouldOfferOptInSheet", () => {
  it("opens on a No to the opt-in", () => {
    expect(shouldOfferOptInSheet("16015", NO, false)).toBe(true);
  });

  it("never opens on a Yes, an empty answer or no answer", () => {
    expect(shouldOfferOptInSheet("16015", YES, false)).toBe(false);
    expect(shouldOfferOptInSheet("16015", "", false)).toBe(false);
    expect(shouldOfferOptInSheet("16015", "   ", false)).toBe(false);
    expect(shouldOfferOptInSheet("16015", null, false)).toBe(false);
  });

  it("never opens on any other question", () => {
    expect(shouldOfferOptInSheet("16018", "No thanks", false)).toBe(false);
    expect(shouldOfferOptInSheet(undefined, NO, false)).toBe(false);
  });

  it("asks once: a run that has seen it is not asked again", () => {
    expect(shouldOfferOptInSheet("16015", NO, true)).toBe(false);
  });
});

describe("shouldDismissOnDrag", () => {
  it("closes on a drag down as far as the threshold, however slow", () => {
    expect(shouldDismissOnDrag(SHEET_DISMISS_DISTANCE_PX, 2000)).toBe(true);
    expect(shouldDismissOnDrag(SHEET_DISMISS_DISTANCE_PX - 1, 2000)).toBe(false);
  });

  it("closes on a quick, shorter flick", () => {
    expect(shouldDismissOnDrag(30, 40)).toBe(true); // 0.75 px/ms
    expect(shouldDismissOnDrag(30, 100)).toBe(false); // 0.3 px/ms
  });

  it("never closes on a twitch, a drag up or no drag", () => {
    expect(shouldDismissOnDrag(20, 5)).toBe(false);
    expect(shouldDismissOnDrag(-150, 100)).toBe(false);
    expect(shouldDismissOnDrag(0, 100)).toBe(false);
    expect(shouldDismissOnDrag(Number.NaN, 100)).toBe(false);
  });
});

describe("once per run", () => {
  const RUN = "2026-11-10T09:00:00.000Z";

  it("remembers the run that saw it, and only that run", () => {
    expect(optInSheetShownFor(RUN)).toBe(false);
    rememberOptInSheetShown(RUN);
    expect(localStorage.getItem(OPT_IN_SHEET_STORAGE_KEY)).toBe(RUN);
    expect(optInSheetShownFor(RUN)).toBe(true);
    // A retake or Start Over is a new run, with its own start.
    expect(optInSheetShownFor("2026-11-11T09:00:00.000Z")).toBe(false);
  });

  it("does not break when storage is blocked", () => {
    const blocked = () => {
      throw new Error("blocked");
    };
    vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked });
    expect(() => rememberOptInSheetShown(RUN)).not.toThrow();
    expect(optInSheetShownFor(RUN)).toBe(false);
  });
});

describe("the sheet's copy", () => {
  it("is Mark's board word for word, with the measured figure (bump the version with any change)", () => {
    // A change here changes the consent text a Yes is given under: bump
    // OPT_IN_SHEET_COPY_VERSION in the same commit, then update this test.
    expect(OPT_IN_SHEET_COPY).toEqual({
      titleLead: "Sure you want to ",
      titleEmphasis: "miss out",
      titleEnd: "?",
      benefits: [
        "Practical & scientific insights tailored to you",
        "Small practices to try the same day",
        "First access to new tests & guides",
      ],
      finePrintLead: "No spam, just value. ",
      finePrintFigure: "95%",
      finePrintEnd: " of readers stay subscribed.",
      accept: "Yes, I want to keep learning",
      decline: "Not now",
    });
    expect(OPT_IN_SHEET_COPY_VERSION).toBe("2026-11-10");
  });

  it("has no em or en dash (copy rule)", () => {
    const words = JSON.stringify(OPT_IN_SHEET_COPY);
    expect(words).not.toMatch(/[\u2013\u2014]/);
  });
});
