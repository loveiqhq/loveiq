import { describe, expect, it } from "vitest";

import { copyParagraphs } from "@features/report/ui/sections/copyParagraphs";

/**
 * MO, 2026-08-21: "I feel we need line breaks here and there to structure the texts
 * better… Here it is one blob of text that might be better structured into 2
 * paragraphs. How do I best give you this?" — the answer is "type the break in the copy
 * sheet", so one typed break has to read as a paragraph break.
 */
describe("copyParagraphs", () => {
  it("turns a single typed break into a paragraph break", () => {
    expect(copyParagraphs("First paragraph.\nSecond paragraph.")).toBe(
      "First paragraph.\n\nSecond paragraph."
    );
  });

  it("treats a blank line the same way, however many newlines it arrives as", () => {
    // A cell typed in a spreadsheet can arrive as \n, \n\n, or \r\n-normalised runs
    // depending on the export; all of them mean one break.
    for (const raw of ["A\n\nB", "A\n\n\nB", "A\n\n\n\nB"]) {
      expect(copyParagraphs(raw)).toBe("A\n\nB");
    }
  });

  it("leaves copy without breaks untouched", () => {
    const one = "One blob of text, no breaks, nothing to do.";
    expect(copyParagraphs(one)).toBe(one);
  });

  it("keeps every word and their order", () => {
    const raw = "One.\nTwo.\n\nThree.";
    expect(copyParagraphs(raw).split(/\s+/).filter(Boolean)).toEqual(["One.", "Two.", "Three."]);
  });
});
