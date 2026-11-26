import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Which sheets between questions a visit to /survey gets: the switches that are on, plus the
 * `?sheets=` preview, which production never honours (only dev, previews, staging and the
 * e2e server). A failure reading the switches shows none.
 */
const env = vi.hoisted(() => ({ nonProd: false, on: new Set<string>(), fail: false }));
vi.mock("@shared/env/is-non-prod-deploy", () => ({ isNonProdDeploy: () => env.nonProd }));
vi.mock("@shared/flags/system-flags", () => ({
  areFeaturesEnabled: async (keys: string[], fallback: boolean) => {
    if (env.fail) throw new Error("supabase down");
    return keys.map((key) => (env.on.has(key) ? true : fallback));
  },
  isFeatureEnabled: async (key: string, fallback: boolean) => {
    if (env.fail) throw new Error("supabase down");
    return env.on.has(key) ? true : fallback;
  },
}));

import { gatePriceTestForVisit, surveySheetsForVisit } from "@features/survey/server/sheetSwitches";
import { SURVEY_SHEET_IDS } from "@features/survey/surveySheets";

beforeEach(() => {
  env.nonProd = false;
  env.on = new Set();
  env.fail = false;
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the sheets a visit to /survey gets", () => {
  it("none in production, whatever the URL says", async () => {
    expect(await surveySheetsForVisit("all")).toEqual([]);
  });

  it("the previewed ones on dev, previews and staging", async () => {
    env.nonProd = true;
    expect(await surveySheetsForVisit("all")).toEqual(
      SURVEY_SHEET_IDS.filter((id) => id !== "halfway")
    );
    expect(await surveySheetsForVisit("halfway,science")).toEqual(["science", "halfway"]);
    expect(await surveySheetsForVisit(undefined)).toEqual([]);
  });

  it("the previewed ones on the e2e server, which sets SURVEY_SHEETS_PREVIEW=1", async () => {
    vi.stubEnv("SURVEY_SHEETS_PREVIEW", "1");
    expect(await surveySheetsForVisit("desire")).toEqual(["desire"]);
  });

  it("those whose switch is on, in production too, in Mark's order", async () => {
    env.on = new Set(["survey_sheet_desire", "survey_sheet_science"]);
    expect(await surveySheetsForVisit(undefined)).toEqual(["science", "desire"]);
  });

  // The halfway sheet and the report map are the survey's half of Mark's 50/50 of his new EUR
  // 1.99 page: both halves meet them, each in its page's words (Mark, 16 Nov). While the test's
  // switch is off they stay off, whatever theirs say.
  it("keeps the map off while Mark's 50/50 is off", async () => {
    env.on = new Set(["survey_sheet_report_map", "survey_sheet_science"]);
    expect(await surveySheetsForVisit(undefined)).toEqual(["science"]);
    env.on.add("report_gate_archetype_reveal");
    expect(await surveySheetsForVisit(undefined)).toEqual(["science", "reportMap"]);
  });

  // Sheet 4, the halfway sheet ("Preliminary Results"), is out of the survey since 26 Nov 2026 (Mark's ask of 25 Nov)
  // (Mark, #all-loveiq): no reader meets it, whatever its switch says.
  it("never shows the halfway sheet from its switch, even with Mark's 50/50 on", async () => {
    env.on = new Set([
      "survey_sheet_halfway",
      "survey_sheet_report_map",
      "survey_sheet_science",
      "report_gate_archetype_reveal",
    ]);
    expect(await surveySheetsForVisit(undefined)).toEqual(["science", "reportMap"]);
    expect(await surveySheetsForVisit("all")).toEqual(["science", "reportMap"]);
  });

  // The price test that replaced the 50/50 (24 Nov 2026): today's page's half keeps the report
  // map, so it runs with its switch too, whatever the reveal's says. Sheet 4 (halfway) stays out
  // for everyone since 26 Nov (RETIRED_SHEETS), its switch on or not.
  it("runs the map with the price test's switch alone, never sheet 4", async () => {
    env.on = new Set([
      "survey_sheet_report_map",
      "survey_sheet_halfway",
      "report_gate_choose_price",
    ]);
    expect(await surveySheetsForVisit(undefined)).toEqual(["reportMap"]);
  });

  it("still previews them on staging, Mark's page on or off", async () => {
    env.nonProd = true;
    expect(await surveySheetsForVisit("halfway,reportMap")).toEqual(["halfway", "reportMap"]);
  });

  it("none when the switches cannot be read", async () => {
    env.fail = true;
    expect(await surveySheetsForVisit(undefined)).toEqual([]);
  });
});

describe("whether a visit's survey runs in the EUR 1.99 page's price test", () => {
  it("follows its switch", async () => {
    expect(await gatePriceTestForVisit(undefined)).toBe(false);
    env.on.add("report_gate_choose_price");
    expect(await gatePriceTestForVisit(undefined)).toBe(true);
  });

  it("is off when its switch can't be read", async () => {
    env.fail = true;
    expect(await gatePriceTestForVisit(undefined)).toBe(false);
  });

  it("is previewed with ?price=1 on staging, never on production", async () => {
    expect(await gatePriceTestForVisit("1")).toBe(false);
    env.nonProd = true;
    expect(await gatePriceTestForVisit("1")).toBe(true);
    expect(await gatePriceTestForVisit(["1"])).toBe(true);
    expect(await gatePriceTestForVisit("0")).toBe(false);
  });
});
