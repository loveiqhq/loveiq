import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Which sheets between questions a visit to /survey gets: the switches that are on, plus the
 * `?sheets=` preview, which production never honours (only dev, previews, staging and the
 * e2e server). A failure reading the switches shows none.
 */
const env = vi.hoisted(() => ({ nonProd: false, on: new Set<string>(), fail: false }));
vi.mock("@shared/env/is-non-prod-deploy", () => ({ isNonProdDeploy: () => env.nonProd }));
vi.mock("@shared/flags/system-flags", () => ({
  isFeatureEnabled: async (key: string, fallback: boolean) => {
    if (env.fail) throw new Error("supabase down");
    return env.on.has(key) ? true : fallback;
  },
}));

import { surveySheetsForVisit, surveySheetsOffer } from "@features/survey/server/sheetSwitches";
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
    expect(await surveySheetsForVisit("all")).toEqual([...SURVEY_SHEET_IDS]);
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

  // Fatih, 14 Nov: the halfway sheet and the report map promise the archetype for free, which
  // only Mark's new EUR 1.99 page gives. While its switch is off they stay off, whatever theirs
  // say; with it on, the survey shows them only to that page's half (sheetsForRevealArm).
  it("keeps the two sheets that promise a free archetype off while Mark's page is off", async () => {
    env.on = new Set(["survey_sheet_report_map", "survey_sheet_halfway", "survey_sheet_science"]);
    expect(await surveySheetsForVisit(undefined)).toEqual(["science"]);
    env.on.add("report_gate_archetype_reveal");
    expect(await surveySheetsForVisit(undefined)).toEqual(["science", "halfway", "reportMap"]);
  });

  it("still previews them on staging, Mark's page on or off", async () => {
    env.nonProd = true;
    expect(await surveySheetsForVisit("halfway,reportMap")).toEqual(["halfway", "reportMap"]);
  });

  // A reviewer's ?sheets= link shows what it names, whichever half their own session is in.
  it("says which sheets came from the preview, so no half of the 50/50 holds them back", async () => {
    env.nonProd = true;
    env.on = new Set(["survey_sheet_science"]);
    expect(await surveySheetsOffer("halfway")).toEqual({
      sheets: ["science", "halfway"],
      previewed: ["halfway"],
    });
    env.nonProd = false;
    expect(await surveySheetsOffer("halfway")).toEqual({ sheets: ["science"], previewed: [] });
  });

  it("none when the switches cannot be read", async () => {
    env.fail = true;
    expect(await surveySheetsForVisit(undefined)).toEqual([]);
  });
});
