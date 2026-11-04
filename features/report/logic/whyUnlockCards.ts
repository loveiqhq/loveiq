/**
 * "Why unlock your Report?": the plan picker's four cards (842:658 / 963:86), shared since
 * 30.10 with the pay-to-start pages' Landing V2 (Mark), which draws the same four. `lead`, then
 * `emph` in the brand gradient. Every heading is in the report's 02.10 heading case
 * (logic/titleCase.ts); the frames still carry the sentence case they were drawn in.
 */
export const WHY_UNLOCK_CARDS: ReadonlyArray<{
  body: string;
  emph: string;
  /** 842:660 sets "Money-back guarantee." in the guarantee's green, bold. */
  green?: string;
  lead?: string;
  tail?: string;
}> = [
  {
    green: "Money-Back Guarantee.",
    emph: "Zero Risk.",
    body: "Read the full report. If it doesn’t land, every cent back, no questions asked.",
  },
  {
    emph: "Insights From Hundreds of Research Papers and Books.",
    body: "Your report is based on insights from hundreds of scientific papers and leading books on sexuality.",
  },
  {
    // 963:94 drew "50+ Pages"; the report is counted in chapters since 27.10 (Eman).
    emph: "17 Chapters",
    tail: " That Can Change Your Life",
    body: "Most of us were never taught any of this. Your report finally puts language to it.",
  },
  {
    lead: "Become ",
    emph: "an Expert Around Your Sexuality",
    body: "Learn the essential concepts and language to better understand and improve your sexuality grounded in the latest science and practical wisdom.",
  },
];
