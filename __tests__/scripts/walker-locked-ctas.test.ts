// @vitest-environment jsdom
/**
 * The walk's own watch on the locked chapters' unlock offers (scripts/walkers/walk.ts) must
 * cover exactly what the report counts as one: cta_seen { cta: "locked_chapter" } from
 * useCtaSeen. Report 3.0 replaced the default report's card on 6 Oct, and a watch on the old
 * card alone left "CTA visibility" with no truth on every walk after that.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { LOCKED_CHAPTER_CTAS, LOCKED_CHAPTERS } from "../../scripts/walkers/walk";

const OFFERS: [file: string, cls: string][] = [
  ["features/report/ui/v1/sections/PremiumOverlay.tsx", "report-premium-overlay__cta"],
  ["features/report/ui/v3/V4PremiumCard.tsx", "rv4-premium__cta"],
  ["features/report/ui/v3/V4LockBadge.tsx", "rv4-lockbadge"],
  ["features/report/ui/v3/V4ChapterHead.tsx", "rv4-chapter__lock"],
];

describe("the walk's watch on locked chapters' unlock offers", () => {
  it.each(OFFERS)("%s still counts its %s as a locked chapter's offer", (file, cls) => {
    const src = readFileSync(file, "utf8");
    expect(src).toMatch(/useCtaSeen\([^)]*"locked_chapter"/);
    expect(src).toMatch(new RegExp(`className=\\{?[\`"'][^\`"']*\\b${cls}\\b`));
    expect(LOCKED_CHAPTER_CTAS).toContain(`.${cls}`);
  });

  it("finds each offer and not the summary gate's, which the report counts apart", () => {
    document.body.innerHTML = `
      <div class="report-premium-overlay"><button class="report-premium-overlay__cta" id="card"></button></div>
      <div class="rv4-premium"><button class="rv4-premium__cta" id="v4card"></button></div>
      <div class="rv4-premium rv4-premium--summary"><button class="rv4-premium__cta" id="gate"></button></div>
      <button class="rv4-lockbadge" id="tile"></button>
      <span class="rv4-chapter__lock" id="chapter"></span>`;
    expect([...document.querySelectorAll(LOCKED_CHAPTER_CTAS)].map((e) => e.id)).toEqual([
      "card",
      "v4card",
      "tile",
      "chapter",
    ]);
    expect(document.querySelectorAll(LOCKED_CHAPTERS)).toHaveLength(4);
  });

  it("does not call a report with only the summary gate one with locked chapters", () => {
    document.body.innerHTML = `<div class="rv4-premium rv4-premium--summary"><button class="rv4-premium__cta"></button></div>`;
    expect(document.querySelectorAll(LOCKED_CHAPTERS)).toHaveLength(0);
    expect(document.querySelectorAll(LOCKED_CHAPTER_CTAS)).toHaveLength(0);
  });
});
