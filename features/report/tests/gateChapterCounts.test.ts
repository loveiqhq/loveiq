import { describe, expect, it } from "vitest";
import { PTS_INITIAL } from "@features/pay-to-start/ui/landing/payToStartContent";
import { initialUnlockEmail } from "@features/report/server/emails/initial-unlock";
import { initialUnlockGiftEmail } from "@features/report/server/emails/initial-unlock-gift";
import { GATE_CHAPTER_PARTS } from "@features/report/ui/gate/gateChapters";
import { GATE_COPY } from "@features/report/ui/gate/gateContent";
import { WIZARD_DRAWER } from "@features/survey/ui/wizard/wizardContent";

/**
 * Sync 26.10: the EUR 1.99 card said "4x full chapters" while its own map marked five rows IN
 * FULL (Other Archetypes, free in the report too, was the fifth). Fatih: say five, everywhere.
 * Every place that counts what the EUR 1.99 opens reads its numbers off the gate's map, which
 * is drawn from the live V4 nav, so a chapter added or cut fails here, not on a reader.
 */
const rows = GATE_CHAPTER_PARTS.flatMap((part) => part.rows);
const inFull = rows.filter((row) => row.access === "in_full");
const partlyOpen = rows.filter((row) => row.access === "partly_open");

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const word = (n: number) => WORDS[n];
const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const cardLine = `${inFull.length}x full chapters + ${partlyOpen.length}x partly open`;
const emailCount = `${word(inFull.length)} chapters in full. ${capitalised(word(partlyOpen.length))} featured chapters are partly open:`;

const params = {
  firstName: "Ana",
  reportUrl: "https://www.loveiq.org/report/rpt_abcdefghij0123456789",
  siteUrl: "https://www.loveiq.org",
};

describe("what the EUR 1.99 opens, counted the same everywhere", () => {
  it("reads five chapters in full and four partly open off the gate's map", () => {
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

  it("on the pre-report map, row for row", () => {
    const wizardRows = WIZARD_DRAWER.flatMap((part) => part.rows);
    const ids = (badge: string) => wizardRows.filter((r) => r.badge === badge).map((r) => r.id);
    expect(ids("free")).toEqual(inFull.map((row) => row.id));
    expect(ids("open")).toEqual(partlyOpen.map((row) => row.id));
  });
});
