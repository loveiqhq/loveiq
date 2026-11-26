import { describe, expect, it } from "vitest";

import { surveyQuestions } from "@/data/survey-data";
import {
  advanceDetails,
  fieldDone,
  firstOpenField,
  firstOpenStep,
  optInLabels,
} from "@features/survey/survey2/details";

/**
 * The one-page details screen of Survey 2.0 (Mark's boards "Details · 1 · Name", "2a · Email",
 * "2b · Email entered · opt-in opens" and "3 · Country picked · postal code opens"): three fields
 * in turn with the newsletter switch under the email, all written under the ids today's survey
 * asks them by.
 */
const OPT_IN = surveyQuestions.find((q) => q.qId === "16015")!;
const { yes: YES, no: NO } = optInLabels(OPT_IN.options);
const EMAIL = "sam.private@example.com";

const all = {
  "00001": "Sam",
  "00000": EMAIL,
  "15001": "Germany",
  "15002": "101",
  "16015": NO,
};

describe("the details fields", () => {
  it("are done once they hold a usable answer", () => {
    expect(fieldDone("name", { "00001": "  " })).toBe(false);
    expect(fieldDone("name", { "00001": "Sam" })).toBe(true);
    expect(fieldDone("email", { "00000": "sam@" })).toBe(false);
    expect(fieldDone("email", { "00000": EMAIL })).toBe(true);
    expect(fieldDone("country", { "15001": "Germany" })).toBe(false);
    expect(fieldDone("country", { "15001": "Germany", "15002": "101" })).toBe(true);
  });

  it("open on the first one still to fill", () => {
    expect(firstOpenField({})).toBe("name");
    expect(firstOpenField({ "00001": "Sam" })).toBe("email");
    expect(firstOpenField({ "00001": "Sam", "00000": EMAIL })).toBe("country");
    expect(firstOpenField(all)).toBeNull();
  });

  it("read the newsletter answer as today's 16015 labels", () => {
    expect(YES.toLowerCase().startsWith("yes")).toBe(true);
    expect(NO.toLowerCase().startsWith("no")).toBe(true);
  });
});

describe("the details steps", () => {
  it("keep the email open until its newsletter switch has been passed", () => {
    expect(firstOpenStep({})).toBe("name");
    expect(firstOpenStep({ "00001": "Sam" })).toBe("email");
    expect(firstOpenStep({ "00001": "Sam", "00000": EMAIL })).toBe("email");
    expect(firstOpenStep({ "00001": "Sam", "00000": EMAIL, "16015": NO })).toBe("country");
    expect(firstOpenStep(all)).toBeNull();
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
    const answers = { "00000": EMAIL, "15001": "Germany", "15002": "101", "16015": NO };
    expect(advanceDetails("country", answers)).toEqual({ kind: "moved", to: "name" });
  });

  it("passes the newsletter switch when it leaves the email, so the country comes next", () => {
    expect(advanceDetails("email", { "00001": "Sam", "00000": EMAIL })).toEqual({
      kind: "moved",
      to: "country",
    });
  });

  it("takes a reader who has not passed the switch back to the email", () => {
    const { "16015": _, ...noOptIn } = all;
    expect(advanceDetails("name", { "00001": "Sam", "00000": EMAIL })).toEqual({
      kind: "moved",
      to: "email",
    });
    expect(advanceDetails("country", noOptIn)).toEqual({ kind: "moved", to: "email" });
  });

  it("is done when every field is in and the switch has been passed", () => {
    expect(advanceDetails("country", all)).toEqual({ kind: "done" });
    expect(advanceDetails("country", { ...all, "16015": YES })).toEqual({ kind: "done" });
    expect(advanceDetails("country", { ...all, "15002": "" })).toEqual({
      kind: "blocked",
      field: "country",
    });
  });
});
