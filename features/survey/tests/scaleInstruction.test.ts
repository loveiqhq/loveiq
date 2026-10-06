import { describe, it, expect } from "vitest";
import { surveyQuestions } from "@/data/survey-data";

/**
 * Figma 11303:174 (ready for dev 2026-10-06) shows the scale question's answer
 * instruction in purple under the guide: "Select how true this statement is for you."
 * It comes from the source's "Answer format guidance" column, like every other type's.
 */
const scale = surveyQuestions.filter((q) => q.answerType === "scale");

describe("the 1-7 scale questions' answer instruction", () => {
  it("is there on every scale question", () => {
    expect(scale.length).toBeGreaterThan(0);
    for (const q of scale) expect(q.formatGuidance, q.qId).toBeTruthy();
  });

  it("asks how true the statement is where the ends read 'true'", () => {
    const truthScales = scale.filter((q) => q.scaleLabels?.high === "Completely true");
    expect(truthScales.length).toBeGreaterThan(0);
    for (const q of truthScales) {
      expect(q.formatGuidance, q.qId).toBe("Select how true this statement is for you.");
    }
  });

  it("asks how comfortable where the ends speak of comfort (10004)", () => {
    const comfortScales = scale.filter((q) => /comfortable/i.test(q.scaleLabels?.high ?? ""));
    expect(comfortScales.map((q) => q.qId)).toEqual(["10004"]);
    for (const q of comfortScales) {
      expect(q.formatGuidance, q.qId).toBe("Select how comfortable you are with this.");
    }
  });

  it("does not change how a scale question behaves", () => {
    // The generator reads a selection cap ("Select up to three options.") and an
    // optional flag ("Optional. …") out of this same column.
    for (const q of scale) {
      expect(q.required, q.qId).toBe(true);
      expect(q.maxSelections, q.qId).toBeUndefined();
    }
  });
});
