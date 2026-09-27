import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { renderEduPara, splitEduLabel } from "@features/report/ui/sections/eduPara";

/**
 * The "Label: explanation" rule Report 2.0's "Learn:" paragraphs are set by (Figma
 * 8880:423) — shared since review 27.09 with the V4 "Go deeper & learn more" cards
 * those paragraphs now also fill, so the two can never bold different words.
 */
describe("splitEduLabel — the label before a paragraph's first colon", () => {
  it("splits a short label from the rest, the colon staying with the rest", () => {
    expect(splitEduLabel("Secure: closeness and autonomy both feel safe.")).toEqual({
      label: "Secure",
      rest: ": closeness and autonomy both feel safe.",
    });
  });

  it("leaves a label over 34 characters alone: that is prose, not a label", () => {
    expect(splitEduLabel(`${"x".repeat(35)}: then the rest`)).toBeNull();
    expect(splitEduLabel(`${"x".repeat(34)}: then the rest`)).not.toBeNull();
  });

  it("leaves a sentence that happens to hold a colon alone", () => {
    expect(splitEduLabel("It works. Then: more")).toBeNull();
    expect(splitEduLabel("Really? Yes: more")).toBeNull();
    expect(splitEduLabel("Stop! Now: more")).toBeNull();
  });

  it("needs a label before the colon and words after it", () => {
    expect(splitEduLabel(": no label")).toBeNull();
    expect(splitEduLabel("Label:   ")).toBeNull();
    expect(splitEduLabel("No colon at all")).toBeNull();
  });
});

describe("renderEduPara — unchanged by the split", () => {
  it("wraps the label in Report 2.0's label span", () => {
    expect(renderToStaticMarkup(<>{renderEduPara("Secure: both feel safe.")}</>)).toBe(
      '<span class="report-learn-para-label">Secure</span>: both feel safe.'
    );
  });

  it("returns any other paragraph as it came", () => {
    expect(renderEduPara("It works. Then: more")).toBe("It works. Then: more");
  });
});
