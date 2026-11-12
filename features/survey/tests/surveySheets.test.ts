// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { surveyQuestions } from "@/data/survey-data";
import { isHidden } from "@features/survey/questionFlags";
import { orderAskedQuestions } from "@features/survey/ui/questionOrder";
import {
  parseSheetsPreview,
  rememberSheetShown,
  sheetAfterQuestion,
  sheetBeforeQuestion,
  sheetsShownFor,
  SCIENCE_QID,
  SURVEY_SHEET_IDS,
  SURVEY_SHEETS_STORAGE_KEY,
  type SheetContext,
  type SurveySheetId,
} from "@features/survey/surveySheets";
import {
  SCIENCE_FALLBACK,
  SCIENCE_SHARES,
  SCIENCE_VARIANTS,
  scienceVariantFor,
} from "@features/survey/surveySheetsCopy";

/**
 * The sheets between questions (Mark, 11 Nov 2026): where each opens in the survey as it is
 * really asked, in both of C13's orders, and the rules around it.
 */
const all: SheetContext = { enabled: SURVEY_SHEET_IDS, shown: new Set(), payToStart: false };

function asked(arm: "control" | "variant") {
  return orderAskedQuestions(surveyQuestions, arm).filter((q) => !isHidden(q.qId));
}

/** Every sheet a full run opens, walking forward question by question. */
function walk(arm: "control" | "variant", ctx: SheetContext = all) {
  const order = asked(arm);
  const opened: Array<{ sheet: SurveySheetId; at: number; qId: string; kind: string }> = [];
  const shown = new Set<SurveySheetId>(ctx.shown);
  for (let i = 0; i < order.length; i++) {
    const after = sheetAfterQuestion(order[i]!.qId, i, order.length, { ...ctx, shown });
    if (after) {
      shown.add(after);
      opened.push({ sheet: after, at: i, qId: order[i]!.qId, kind: "after" });
    }
    const target = order[i + 1];
    const before = target ? sheetBeforeQuestion(target.qId, i + 1, { ...ctx, shown }) : null;
    if (before) {
      shown.add(before);
      opened.push({ sheet: before, at: i + 1, qId: target!.qId, kind: "before" });
    }
  }
  return { order, opened };
}

describe("where the sheets open", () => {
  it("in the C13 test order (Mark's numbers), all six, at his placements", () => {
    const { order, opened } = walk("variant");
    expect(opened.map((o) => o.sheet)).toEqual([
      "science",
      "trustpilot",
      "expert",
      "halfway",
      "desire",
      "reportMap",
    ]);
    const byId = Object.fromEntries(opened.map((o) => [o.sheet, o]));
    expect(byId.science!.qId).toBe("02004");
    expect(byId.trustpilot!.qId).toBe("03008");
    expect(byId.expert).toMatchObject({ qId: "01005", kind: "before" });
    expect(byId.halfway!.qId).toBe("11003");
    expect(byId.desire!.qId).toBe("16005");
    // "Only 3 questions left": three questions follow the one it opens after.
    expect(order.length - 1 - byId.reportMap!.at).toBe(3);
  });

  it("in today's control order the expert's question comes too early, so it stays shut", () => {
    const { order, opened } = walk("control");
    expect(order.findIndex((q) => q.qId === "01005")).toBeLessThan(10);
    expect(opened.map((o) => o.sheet)).not.toContain("expert");
    expect(opened.map((o) => o.sheet)).toEqual([
      "science",
      "trustpilot",
      "halfway",
      "desire",
      "reportMap",
    ]);
  });

  it("opens each once per run", () => {
    const order = asked("variant");
    const i = order.findIndex((q) => q.qId === SCIENCE_QID);
    const ctx = { ...all, shown: new Set<SurveySheetId>(["science"]) };
    expect(sheetAfterQuestion(SCIENCE_QID, i, order.length, ctx)).toBeNull();
  });

  it("opens only those switched on", () => {
    const { opened } = walk("variant", { ...all, enabled: ["halfway"] });
    expect(opened.map((o) => o.sheet)).toEqual(["halfway"]);
  });

  it("never shows a price to a reader who paid before the survey", () => {
    const { opened } = walk("variant", { ...all, payToStart: true });
    expect(opened.map((o) => o.sheet)).toEqual(["science", "trustpilot", "expert"]);
  });
});

describe("the staging preview, ?sheets=", () => {
  it("reads all, a list, or nothing", () => {
    expect(parseSheetsPreview("all")).toEqual([...SURVEY_SHEET_IDS]);
    expect(parseSheetsPreview("halfway, science")).toEqual(["science", "halfway"]);
    expect(parseSheetsPreview(["desire", "nonsense"])).toEqual(["desire"]);
    expect(parseSheetsPreview("nonsense")).toEqual([]);
    expect(parseSheetsPreview(undefined)).toEqual([]);
  });
});

describe("once per run, across a reload", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("remembers shown sheets for this run, and forgets them for the next", () => {
    rememberSheetShown("run-1", "science");
    rememberSheetShown("run-1", "halfway");
    expect([...sheetsShownFor("run-1")].sort()).toEqual(["halfway", "science"]);
    expect(sheetsShownFor("run-2").size).toBe(0);
    rememberSheetShown("run-2", "desire");
    expect([...sheetsShownFor("run-2")]).toEqual(["desire"]);
    expect(sheetsShownFor("run-1").size).toBe(0);
  });

  it("survives storage that refuses or holds nonsense", () => {
    localStorage.setItem(SURVEY_SHEETS_STORAGE_KEY, "{not json");
    expect(sheetsShownFor("run-1").size).toBe(0);
    const blocked = () => {
      throw new Error("blocked");
    };
    vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked, clear: () => {} });
    expect(() => rememberSheetShown("run-1", "science")).not.toThrow();
    expect(sheetsShownFor("run-1").size).toBe(0);
  });
});

describe("sheet 1's words", () => {
  const question = surveyQuestions.find((q) => q.qId === SCIENCE_QID)!;

  it("has one line for every answer to 02004, word for word", () => {
    expect(Object.keys(SCIENCE_VARIANTS).sort()).toEqual([...(question.options ?? [])].sort());
  });

  it("uses the measured shares, which add up to at most 100", () => {
    const shares = Object.values(SCIENCE_SHARES);
    expect(shares.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(100);
    for (const v of Object.values(SCIENCE_VARIANTS)) {
      expect(shares).toContain(v.share);
      expect(shares).toContain(v.contrastShare);
      expect(v.headLead).toContain(`${v.share}%`);
    }
  });

  it("falls back to the same words for everyone when the answer is unknown", () => {
    expect(scienceVariantFor(undefined)).toBe(SCIENCE_FALLBACK);
    expect(scienceVariantFor("a renamed option")).toBe(SCIENCE_FALLBACK);
    expect(scienceVariantFor(question.options![1])).toBe(SCIENCE_VARIANTS[question.options![1]!]);
  });
});
