import { reportSections } from "@/data/report-general";

/**
 * The sections a reader can rate ("Does this resonate?"), as /api/report-feedback
 * whitelists them.
 *
 * Most are rows of report-general.ts. These five are panels the page rates that have no
 * row there: V4's Challenges in Partnerships, and V2's Other Archetypes, findings,
 * insight map and "What this means for you". Until review 01.10 the route refused them
 * with a 400 while the widget said "Feedback sent!". The names are for the Slack line,
 * which otherwise prints the id.
 */
export const PAGE_ONLY_FEEDBACK_SECTIONS: Readonly<Record<string, string>> = {
  challenges_in_partnership: "Challenges in Partnerships",
  constellation: "Other Archetypes",
  findings: "Five things this report found",
  map: "Your insight map",
  means_for_you: "What this means for you",
};

export const REPORT_FEEDBACK_SECTION_IDS: ReadonlySet<string> = new Set([
  ...reportSections.map((section) => section.id),
  ...Object.keys(PAGE_ONLY_FEEDBACK_SECTIONS),
]);
