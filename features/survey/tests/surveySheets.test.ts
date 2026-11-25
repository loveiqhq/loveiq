// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { surveyQuestions } from "@/data/survey-data";
import { isHidden } from "@features/survey/questionFlags";
import { orderAskedQuestions } from "@features/survey/ui/questionOrder";
import {
  desireTickedFor,
  forgetSheetsShown,
  parseSheetsPreview,
  rememberDesireTick,
  rememberSheetShown,
  RETIRED_SHEETS,
  sheetAfterQuestion,
  sheetBeforeQuestion,
  sheetsShownFor,
  SCIENCE_QID,
  GATE_TEST_SHEETS,
  SURVEY_SHEETS,
  SURVEY_SHEET_IDS,
  SURVEY_SHEETS_STORAGE_KEY,
  type SheetContext,
  type SurveySheetId,
} from "@features/survey/surveySheets";
import { SCIENCE_SHARES, SCIENCE_SHEET_COPY } from "@features/survey/surveySheetsCopy";

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

// Mark's 50/50 of his new EUR 1.99 page (16 Nov): two sheets tell what EUR 1.99 opens, each
// half in its page's words (SurveyEngine.sheets.test.tsx), and they run only with the test.
describe("the sheets that belong to Mark's 50/50", () => {
  it("are the halfway sheet and the report map, both priced", () => {
    expect([...GATE_TEST_SHEETS]).toEqual(["halfway", "reportMap"]);
    for (const id of GATE_TEST_SHEETS)
      expect(SURVEY_SHEETS.find((s) => s.id === id)!.priced, id).toBe(true);
  });
});

// Mark, 13 Nov: "lets just record the tick". It is given at Q48 and sent with the answers at
// the end, so it is kept for its run across a reload, and never carried into the next run.
describe("the State of Desire tick, kept for its run", () => {
  it("remembers a tick for this run, and forgets it for the next or when unticked", () => {
    rememberDesireTick("run-1", true);
    expect(desireTickedFor("run-1")).toBe(true);
    expect(desireTickedFor("run-2")).toBe(false);
    rememberDesireTick("run-1", false);
    expect(desireTickedFor("run-1")).toBe(false);
  });
});

describe("the staging preview, ?sheets=", () => {
  it("reads all, a list, or nothing", () => {
    expect(parseSheetsPreview("all")).toEqual(SURVEY_SHEET_IDS.filter((id) => id !== "halfway"));
    expect(parseSheetsPreview("halfway, science")).toEqual(["science", "halfway"]);
    expect(parseSheetsPreview(["desire", "nonsense"])).toEqual(["desire"]);
    expect(parseSheetsPreview("nonsense")).toEqual([]);
    expect(parseSheetsPreview(undefined)).toEqual([]);
  });

  // Sheet 4 is out of the survey since 25 Nov 2026 (Mark): "all" is what production can show,
  // and naming it still previews it, for its redesign.
  it("leaves the halfway sheet out of all, unless it is named too", () => {
    expect([...RETIRED_SHEETS]).toEqual(["halfway"]);
    expect(parseSheetsPreview("all")).not.toContain("halfway");
    expect(parseSheetsPreview("all,halfway")).toEqual([...SURVEY_SHEET_IDS]);
    expect(parseSheetsPreview("halfway")).toEqual(["halfway"]);
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

  it("forgets every sheet this run has seen, for the staging jump menu's replay", () => {
    rememberSheetShown("run-1", "science");
    rememberSheetShown("run-1", "trustpilot");
    forgetSheetsShown();
    expect(sheetsShownFor("run-1").size).toBe(0);
    vi.stubGlobal("localStorage", {
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => forgetSheetsShown()).not.toThrow();
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
  it("uses the measured shares, which add up to at most 100", () => {
    const shares = Object.values(SCIENCE_SHARES);
    expect(shares.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(100);
    expect(SCIENCE_SHEET_COPY.share).toBe(SCIENCE_SHARES.respond);
    expect(SCIENCE_SHEET_COPY.contrastShare).toBe(SCIENCE_SHARES.start);
  });

  it("never says 'most' of a share that is not the largest (Mark's board did)", () => {
    const largest = Math.max(...Object.values(SCIENCE_SHARES));
    const head = `${SCIENCE_SHEET_COPY.headLead}${SCIENCE_SHEET_COPY.headEmphasis}`;
    if (SCIENCE_SHEET_COPY.share < largest) expect(head).not.toMatch(/most/i);
    expect(SCIENCE_SHEET_COPY.share).toBeGreaterThan(SCIENCE_SHEET_COPY.contrastShare);
  });
});

/**
 * Survey 2.0's spots (Mark's Survey Review, the Working-order board's SHEETS): Trustpilot after
 * 03013, science after 02004, the expert after 03012, halfway after 14021, State of Desire after
 * 16005, and the report map after 17002, just before the price question and the details page.
 */
describe("Survey 2.0's sheet spots", () => {
  const screens2 = orderAskedQuestions(surveyQuestions, "survey2");
  const ctx2: SheetContext = { ...all, arm: "survey2" };
  const index = (qId: string) => screens2.findIndex((q) => q.qId === qId);
  const after = (qId: string) => sheetAfterQuestion(qId, index(qId), screens2.length, ctx2);
  const ANCHORS: Record<string, string> = {
    "03013": "trustpilot",
    "02004": "science",
    "03012": "expert",
    "14021": "halfway",
    "16005": "desire",
    "17002": "reportMap",
  };

  it("opens each sheet after Mark's question for it", () => {
    for (const [qId, sheet] of Object.entries(ANCHORS)) expect(after(qId), qId).toBe(sheet);
  });

  it("opens nothing anywhere else, and nothing before a question", () => {
    screens2.forEach((q, i) => {
      if (!(q.qId in ANCHORS)) {
        expect(sheetAfterQuestion(q.qId, i, screens2.length, ctx2), q.qId).toBeNull();
      }
      expect(sheetBeforeQuestion(q.qId, i, ctx2), q.qId).toBeNull();
    });
  });

  it("puts the halfway sheet halfway: after screen 31 of 62", () => {
    expect(index("14021") + 1).toBe(31);
    expect(screens2).toHaveLength(62);
  });

  it("leaves the classic spots as they were", () => {
    const variant = orderAskedQuestions(surveyQuestions, "variant").filter((q) => !isHidden(q.qId));
    const at = (qId: string) => variant.findIndex((q) => q.qId === qId);
    const classic = (qId: string) => sheetAfterQuestion(qId, at(qId), variant.length, all);
    expect(classic("02004")).toBe("science");
    expect(classic("03008")).toBe("trustpilot");
    expect(classic("11003")).toBe("halfway");
    expect(classic("03013")).toBeNull();
    expect(sheetBeforeQuestion("01005", at("01005"), all)).toBe("expert");
  });
});
