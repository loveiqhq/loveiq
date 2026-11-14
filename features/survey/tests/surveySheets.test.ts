// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { surveyQuestions } from "@/data/survey-data";
import { isHidden } from "@features/survey/questionFlags";
import { orderAskedQuestions } from "@features/survey/ui/questionOrder";
import {
  desireTickedFor,
  parseSheetsPreview,
  rememberDesireTick,
  rememberSheetShown,
  sheetAfterQuestion,
  sheetBeforeQuestion,
  sheetsShownFor,
  SCIENCE_QID,
  sheetsForRevealArm,
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

// Fatih, 14 Nov: the halfway sheet and the report map promise the Core Archetype for free,
// which only Mark's new EUR 1.99 page gives; his 50/50 shows that page to half the readers.
describe("the two sheets that promise a free archetype", () => {
  const all = [...SURVEY_SHEET_IDS];

  it("open only for the half that meets Mark's new EUR 1.99 page", () => {
    expect(sheetsForRevealArm(all, "reveal", [])).toEqual(all);
    expect(sheetsForRevealArm(all, "control", [])).toEqual([
      "science",
      "trustpilot",
      "expert",
      "desire",
    ]);
  });

  it("open on a staging preview, whatever the half", () => {
    expect(
      sheetsForRevealArm(["halfway", "reportMap"], "control", ["halfway", "reportMap"])
    ).toEqual(["halfway", "reportMap"]);
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
