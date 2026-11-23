import { describe, expect, it } from "vitest";

import { surveyQuestions, type SurveyQuestion } from "@/data/survey-data";
import { OPTION_GROUPS } from "@features/survey/optionGroups";
import { askedScreens, orderAskedQuestions } from "@features/survey/ui/questionOrder";

/**
 * Survey 2.0's screens: Mark's new order (Survey Review, 19 Nov 2026, "Working copy · new
 * question order" board), with 16016 asked in two screens (his to-do 5): the areas first
 * (`16016a`), then the topics inside them (16016). The details page (`00010`) collects name,
 * email, opt-in, country and postal code on one screen, in place of five.
 */
const MARK_ORDER = "10003 11003 11002 11001 03013 10004 02003 10005 10002 11004 01002 02002 02004 03003 03004 03005 03006 03008 03009 03010 03011 03012 08002 08003 08004 08005 08006 08012 09013 14020 14021 01005 02001 01006 15003 15004 15005 15006 15007 15008 15009 15010 16001 16002 16005 16006 16007 16016 16017 16018 16011 16012 16013 16014 16019 16020 17001 17002 17003 00010".split(" "); // prettier-ignore

const ids = (qs: SurveyQuestion[]) => qs.map((q) => q.qId);
const screens = () => orderAskedQuestions(surveyQuestions, "survey2");

describe("Survey 2.0's screens", () => {
  it("are Mark's order, with the 16016 areas on their own screen before the topics", () => {
    const expected = [...MARK_ORDER];
    expected.splice(expected.indexOf("16016"), 0, "16016a");
    expect(ids(screens())).toEqual(expected);
  });

  it("number 61", () => {
    expect(screens()).toHaveLength(61);
  });

  it("never ask 16009, nor the five details as screens of their own", () => {
    for (const qId of ["16009", "00001", "00000", "15001", "15002", "16015", "15011"]) {
      expect(ids(screens()), qId).not.toContain(qId);
    }
  });

  it("end with the three closing questions and then the details page", () => {
    expect(ids(screens()).slice(-4)).toEqual(["17001", "17002", "17003", "00010"]);
  });

  it("give every screen something to ask", () => {
    for (const q of screens()) {
      expect(q.question.trim(), q.qId).not.toBe("");
      expect(q.answerType, q.qId).toBeTruthy();
    }
  });

  it("ask the areas as a pick of up to two of the 13 categories", () => {
    const areas = screens().find((q) => q.qId === "16016a")!;
    expect(areas.answerType).toBe("multiple");
    expect(areas.maxSelections).toBe(2);
    expect(areas.options).toEqual(OPTION_GROUPS.get("16016")!.map((g) => g.label));
    expect(areas.options).toHaveLength(13);
  });

  it("show the details page as one required screen", () => {
    expect(screens().find((q) => q.qId === "00010")).toMatchObject({
      answerType: "details",
      required: true,
    });
  });

  it("drops the prefilled landing question from the 2.0 screens", () => {
    // A landing card's answer (01002) is asked on the landing page, so the run skips it; the
    // sheets hang on question ids, so the ones around it still open.
    const asked = askedScreens(surveyQuestions, "survey2", ["01002"]);
    expect(ids(asked)).not.toContain("01002");
    expect(asked).toHaveLength(60);
    expect(ids(asked)).toContain("03013");
    expect(ids(asked)).toContain("02004");
  });
});

describe("the classic screens", () => {
  it("still drop hidden and prefilled questions", () => {
    const asked = askedScreens(surveyQuestions, "variant", ["01002"]);
    expect(ids(asked)).not.toContain("15011");
    expect(ids(asked)).not.toContain("01002");
    expect(asked).toHaveLength(61);
  });
});
