import { describe, expect, it } from "vitest";
import { PTS_INITIAL } from "@features/pay-to-start/ui/landing/payToStartContent";
import { initialUnlockEmail } from "@features/report/server/emails/initial-unlock";
import { initialUnlockGiftEmail } from "@features/report/server/emails/initial-unlock-gift";
import { GATE_CHAPTER_PARTS } from "@features/report/ui/gate/gateChapters";
import { GATE_COPY } from "@features/report/ui/gate/gateContent";
import { wizardDrawer } from "@features/survey/ui/wizard/wizardContent";

/**
 * Sync 26.10: the EUR 1.99 card said "4x full chapters" while its own map marked five rows IN
 * FULL (Other Archetypes, free in the report too, was the fifth). Fatih: say five, everywhere.
 * Eman, 27.10: count chapters as the rest of the report does, from Part 2 on ("6 Parts, 17
 * Chapters"; Part 1 is the welcome), so three in full. Every place that counts what the EUR
 * 1.99 opens reads its numbers off the gate's map, which is drawn from the live V4 nav, so a
 * chapter added or cut fails here, not on a reader. The maps compare row for row, Part 1 too.
 */
const rows = GATE_CHAPTER_PARTS.flatMap((part) => part.rows);
const inFull = rows.filter((row) => row.access === "in_full");
const partlyOpen = rows.filter((row) => row.access === "partly_open");
const chapters = GATE_CHAPTER_PARTS.slice(1).flatMap((part) => part.rows);
const chaptersInFull = chapters.filter((row) => row.access === "in_full");
const chaptersPartlyOpen = chapters.filter((row) => row.access === "partly_open");

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const word = (n: number) => WORDS[n];
const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const cardLine = `${chaptersInFull.length}x full chapters + ${chaptersPartlyOpen.length}x partly open`;
const emailCount = `${word(chaptersInFull.length)} chapters in full. ${capitalised(word(chaptersPartlyOpen.length))} featured chapters are partly open:`;

const params = {
  firstName: "Ana",
  reportUrl: "https://www.loveiq.org/report/rpt_abcdefghij0123456789",
  siteUrl: "https://www.loveiq.org",
};

describe("what the EUR 1.99 opens, counted the same everywhere", () => {
  it("reads three chapters in full and four partly open off the gate's map, from Part 2", () => {
    expect(GATE_CHAPTER_PARTS[0]?.rows.map((row) => row.id)).toEqual([
      "introduction",
      "what_shaped_this_report",
    ]);
    expect([chaptersInFull.length, chaptersPartlyOpen.length]).toEqual([3, 4]);
    // The map itself still marks the welcome's two rows IN FULL.
    expect([inFull.length, partlyOpen.length]).toEqual([5, 4]);
  });

  it("on the gate's card", () => {
    expect(GATE_COPY.card.features(1000).map((feature) => feature.text)).toContain(cardLine);
  });

  it("on the EUR 1.99 pay-to-start page's price card", () => {
    expect(PTS_INITIAL.priceCard.includes).toContain(cardLine);
  });

  it("in the email after the EUR 1.99 (E06) and in the day-4 gift (E07)", () => {
    expect(initialUnlockEmail(params).text).toContain(`You can read ${emailCount}`);
    expect(initialUnlockGiftEmail(params).text).toContain(`You can also read ${emailCount}`);
  });

  it("on a EUR 1.99 buyer's pre-report map, row for row", () => {
    const wizardRows = wizardDrawer("pay_to_start_initial").flatMap((part) => part.rows);
    const ids = (badge: string) => wizardRows.filter((r) => r.badge === badge).map((r) => r.id);
    expect(ids("free")).toEqual(inFull.map((row) => row.id));
    expect(ids("open")).toEqual(partlyOpen.map((row) => row.id));
  });

  // Review 26.10: before the EUR 1.99 the Core Archetype is half veiled, gate on or off.
  it("on a free reader's map, all but the Core Archetype, which is partly open there", () => {
    const wizardRows = wizardDrawer("standard").flatMap((part) => part.rows);
    const ids = (badge: string) => wizardRows.filter((r) => r.badge === badge).map((r) => r.id);
    expect(ids("free")).toEqual(
      inFull.map((row) => row.id).filter((id) => id !== "core_archetype")
    );
    expect(ids("open")).toEqual(["core_archetype", ...partlyOpen.map((row) => row.id)]);
  });
});
