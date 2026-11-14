import { describe, expect, it } from "vitest";
import { tourFirstNavAccess } from "@features/report/logic/lightReportMap";
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
  const withAccess = (offer: "today" | "light", access: ReportNavAccess) =>
    ids.filter((id) => tourFirstNavAccess(id, offer) === access);

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
    const asTheMap = {
      free: "free_pill",
      priced: "price_pill",
      featured: "unlocked",
      locked: "locked",
    } as const;
    for (const id of ids)
      expect(tourFirstNavAccess(id, "light"), id).toBe(asTheMap[mapRowKind(id)]);
  });
});
