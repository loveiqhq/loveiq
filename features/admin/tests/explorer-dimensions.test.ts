import { describe, expect, it } from "vitest";
import { surveyQuestions } from "@/data/survey-data";
import {
  SCALE_GROUP_OPTIONS,
  SCALE_QUESTIONS,
  decodeArchMatch,
  encodeArchMatch,
  isMultiToken,
  isScaleToken,
  tokenLabel,
} from "@features/admin/ui/explorer/dimensions";

const SCALE_QID = surveyQuestions.find((q) => q.answerType === "scale")!.qId;
const MULTI_QID = surveyQuestions.find(
  (q) =>
    q.answerType === "multiple" && !["15001", "15003", "15004", "15010", "15011"].includes(q.qId)
)!.qId;

describe("scale group-by options", () => {
  it("includes every 1-7 scale question as a q: token", () => {
    const scaleCount = surveyQuestions.filter((q) => q.answerType === "scale").length;
    expect(SCALE_QUESTIONS).toHaveLength(scaleCount);
    expect(SCALE_GROUP_OPTIONS.every((o) => o.value.startsWith("q:"))).toBe(true);
    expect(SCALE_GROUP_OPTIONS).toContainEqual(
      expect.objectContaining({ value: `q:${SCALE_QID}` })
    );
  });

  it("isScaleToken recognizes scale tokens only", () => {
    expect(isScaleToken(`q:${SCALE_QID}`)).toBe(true);
    expect(isScaleToken("q:99999")).toBe(false);
    expect(isScaleToken("country")).toBe(false);
  });

  it("isMultiToken recognizes multiple-choice tokens only", () => {
    expect(isMultiToken(`q:${MULTI_QID}`)).toBe(true);
    expect(isMultiToken(`q:${SCALE_QID}`)).toBe(false);
    expect(isMultiToken("q:99999")).toBe(false);
    expect(isMultiToken("country")).toBe(false);
  });

  it("tokenLabel resolves dimension, answer, and scale tokens", () => {
    expect(tokenLabel("country")).toBe("Country");
    const scaleQ = surveyQuestions.find((q) => q.qId === SCALE_QID)!;
    expect(tokenLabel(`q:${SCALE_QID}`)).toBe(scaleQ.question);
  });
});

describe("archMatch encode/decode", () => {
  it("round-trips clauses and drops zero thresholds", () => {
    const encoded = encodeArchMatch([
      { archetype: "Emotional Voyeur", min: 50 },
      { archetype: "Relational Nurturer", min: 0 }, // dropped
    ]);
    expect(encoded).toBe("Emotional%20Voyeur:50");
    expect(decodeArchMatch(encoded)).toEqual([{ archetype: "Emotional Voyeur", min: 50 }]);
  });

  it("clamps min to 0-100 and ignores malformed clauses", () => {
    expect(decodeArchMatch("Foo:140")).toEqual([{ archetype: "Foo", min: 100 }]);
    expect(decodeArchMatch("Foo:-5")).toEqual([{ archetype: "Foo", min: 0 }]);
    expect(decodeArchMatch("nocolon")).toEqual([]);
    expect(decodeArchMatch(null)).toEqual([]);
  });

  it("encodeArchMatch returns null when nothing is active", () => {
    expect(encodeArchMatch([])).toBeNull();
    expect(encodeArchMatch([{ archetype: "Foo", min: 0 }])).toBeNull();
  });
});
