import { describe, expect, it } from "vitest";

import { surveyQuestions } from "@/data/survey-data";
import {
  advanceDetails,
  detailsComplete,
  fieldDone,
  firstOpenField,
  optInLabels,
} from "@features/survey/survey2/details";

/**
 * The one-page details screen of Survey 2.0 (Mark's boards "Details · 1 · Name", "2a · Email",
 * "3 · Country picked · postal code opens", "alt · Yes/No opt-in"): three fields in turn, then
 * the newsletter question, all written under the ids today's survey asks them by.
 */
const OPT_IN = surveyQuestions.find((q) => q.qId === "16015")!;
const { yes: YES, no: NO } = optInLabels(OPT_IN.options);

const all = {
  "00001": "Sam",
  "00000": "sam.private@example.com",
  "15001": "Germany",
  "15002": "101",
  "16015": NO,
};

describe("the details fields", () => {
  it("are done once they hold a usable answer", () => {
    expect(fieldDone("name", { "00001": "  " })).toBe(false);
    expect(fieldDone("name", { "00001": "Sam" })).toBe(true);
    expect(fieldDone("email", { "00000": "sam@" })).toBe(false);
    expect(fieldDone("email", { "00000": "sam.private@example.com" })).toBe(true);
    expect(fieldDone("country", { "15001": "Germany" })).toBe(false);
    expect(fieldDone("country", { "15001": "Germany", "15002": "101" })).toBe(true);
  });

  it("open on the first one still to fill", () => {
    expect(firstOpenField({})).toBe("name");
    expect(firstOpenField({ "00001": "Sam" })).toBe("email");
    expect(firstOpenField({ "00001": "Sam", "00000": "sam.private@example.com" })).toBe("country");
    expect(firstOpenField(all)).toBeNull();
  });

  it("read the newsletter answer as today's 16015 labels", () => {
    expect(YES.toLowerCase().startsWith("yes")).toBe(true);
    expect(NO.toLowerCase().startsWith("no")).toBe(true);
  });
});

describe("Next on the details screen", () => {
  it("is blocked on the open field until it is filled", () => {
    expect(advanceDetails("name", {})).toEqual({ kind: "blocked", field: "name" });
  });

  it("moves to the next field once the open one is filled", () => {
    expect(advanceDetails("name", { "00001": "Sam" })).toEqual({ kind: "moved", to: "email" });
  });

  it("goes back to a field left empty further up", () => {
    const answers = { "00000": "sam.private@example.com", "15001": "Germany", "15002": "101" };
    expect(advanceDetails("country", answers)).toEqual({ kind: "moved", to: "name" });
  });

  it("asks for the newsletter answer last", () => {
    const { "16015": _, ...noOptIn } = all;
    expect(advanceDetails("country", noOptIn)).toEqual({ kind: "blocked", field: "optIn" });
  });

  it("is done when every field and the newsletter answer are there", () => {
    expect(advanceDetails("country", all)).toEqual({ kind: "done" });
    expect(detailsComplete(all)).toBe(true);
    expect(detailsComplete({ ...all, "16015": YES })).toBe(true);
    expect(detailsComplete({ ...all, "15002": "" })).toBe(false);
  });
});
