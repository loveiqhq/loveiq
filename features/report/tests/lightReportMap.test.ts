import { describe, expect, it } from "vitest";
import {
  offerForGateArm,
  tourFirstNavAccess,
  tourMenuOffer,
} from "@features/report/logic/lightReportMap";
import type { ReportNavAccess } from "@features/report/ui/ReportNavBadge";
import { REPORT_V4_NAV_IDS } from "@features/report/ui/v3/reportV3Nav";
import { mapRowKind } from "@features/survey/ui/sheets/ReportMapScreen";

/**
 * Mark, 13 Nov, touring before his new EUR 1.99 page: the chapter menu still said IN FULL on
 * the welcome and locked the Core Archetype, "this needs to be adapted according to what we
 * are showing after Q59". Before that page the menu names the offer as the survey's report
 * map does; before today's page it says what the page under the tour opens, as since 30 Oct.
 */
describe("the chapter menu while the tour runs before the EUR 1.99 page", () => {
  const ids = REPORT_V4_NAV_IDS;
  const withAccess = (offer: "today" | "light" | "price", access: ReportNavAccess) =>
    ids.filter((id) => tourFirstNavAccess(id, offer) === access);
  const asTheMap = {
    free: "free_pill",
    priced: "price_pill",
    featured: "unlocked",
    locked: "locked",
  } as const;

  it("before today's page: the welcome in full, Typical Beliefs partly open, the rest locked", () => {
    expect(withAccess("today", "free")).toEqual(["introduction", "what_shaped_this_report"]);
    expect(withAccess("today", "unlocked")).toEqual(["typical_beliefs"]);
    expect(withAccess("today", "locked")).toHaveLength(ids.length - 3);
  });

  it("before Mark's new page: the Core Archetype free, the Light Report at its price, four featured partly open", () => {
    expect(withAccess("light", "free_pill")).toEqual(["core_archetype"]);
    expect(withAccess("light", "price_pill")).toEqual([
      "introduction",
      "what_shaped_this_report",
      "top_archetypes",
    ]);
    expect(withAccess("light", "unlocked")).toEqual([
      "typical_beliefs",
      "typical_arousal_accelerators_turn_ons_of_the_core_archetype",
      "challenges_in_partnership",
      "typical_sexual_fantasy_amp_practice_tendencies",
    ]);
    expect(withAccess("light", "free")).toEqual([]);
  });

  it("row for row as the survey's report map (Q59) draws it", () => {
    for (const id of ids)
      expect(tourFirstNavAccess(id, "light"), id).toBe(asTheMap[mapRowKind(id)]);
  });

  // Mark's write-up of the 50/50 (16 Nov): the half that meets today's EUR 1.99 page sees the
  // sheets too, in his versions that put the Core Archetype in the EUR 1.99 instead of free.
  it("before today's page in Mark's 50/50: the Core Archetype at the price, with the Light Report", () => {
    const priced = ["introduction", "what_shaped_this_report", "core_archetype", "top_archetypes"];
    expect(withAccess("price", "free_pill")).toEqual([]);
    expect(withAccess("price", "free")).toEqual([]);
    expect(withAccess("price", "price_pill")).toEqual(ids.filter((id) => priced.includes(id)));
    expect(withAccess("price", "unlocked")).toEqual(withAccess("light", "unlocked"));
    expect(withAccess("price", "locked")).toEqual(withAccess("light", "locked"));
  });

  it("row for row as that half's report map draws it", () => {
    for (const id of ids)
      expect(tourFirstNavAccess(id, "price"), id).toBe(asTheMap[mapRowKind(id, "price")]);
  });
});

// The pre-report wizard's map and the report's menu say what the survey's map said: the
// reader's half of Mark's 50/50 decides it, and with no test running they keep today's map.
describe("which offer the maps after the survey tell", () => {
  it("the new page's half: the Core Archetype free; today's half: in the EUR 1.99", () => {
    expect(offerForGateArm("reveal")).toBe("light");
    expect(offerForGateArm("control")).toBe("price");
  });

  it("no test running: today's map, as before the 50/50", () => {
    expect(offerForGateArm(null)).toBe("today");
    expect(offerForGateArm(undefined)).toBe("today");
  });
});

// The report's server tells the page which half the reader is in (`revealArm`) and draws
// Mark's new page only for its half (`reveal`); the menu during the tour says what that gate
// will sell.
describe("the report menu's offer during the tour", () => {
  it("Mark's new page drawn: the Core Archetype free", () => {
    expect(tourMenuOffer(true, "reveal")).toBe("light");
  });

  it("today's page in the test: the Core Archetype in the EUR 1.99", () => {
    expect(tourMenuOffer(false, "control")).toBe("price");
  });

  it("a new-page reader whose page could not be drawn meets today's, and is told so", () => {
    expect(tourMenuOffer(false, "reveal")).toBe("price");
  });

  it("no test running: today's menu", () => {
    expect(tourMenuOffer(false, undefined)).toBe("today");
    expect(tourMenuOffer(false, "nonsense")).toBe("today");
  });

  // The price test that replaced the 50/50 (24 Nov 2026): today's page's half is told its
  // EUR 1.99, as its survey's sheets told it; the half that chooses its price is told none.
  it("in the price test: EUR 1.99 for today's page's half, no price for the half that chooses", () => {
    expect(tourMenuOffer(false, undefined, "fixed")).toBe("price");
    expect(tourMenuOffer(false, undefined, "choose")).toBe("today");
    // It retired the reveal: its half wins over a reveal or a 50/50 half.
    expect(tourMenuOffer(true, "reveal", "choose")).toBe("today");
    expect(tourMenuOffer(false, "control", "nonsense")).toBe("price");
  });
});
