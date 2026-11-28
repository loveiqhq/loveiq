/**
 * Survey 2.0's expert question (17004; Mark's board "Q-new-expert", placed on 24 Nov 2026 right
 * after the price question): would the reader like a free talk with one of our experts? On a Yes
 * the board asks for the phone number the expert calls (Marcus): a country code and the number.
 *
 * The number travels as the question's text box, the way an "Other" box's words do: under
 * `17004_other`, which submit_survey files as the Yes answer's answer_text. The server keeps it
 * only with a Yes (features/survey/server/answersSchema.ts). It is personal: the team copy and
 * AP's explorer mask it (features/admin/server/team-export.ts), and the field is kept out of
 * session recordings.
 */

export const EXPERT_QID = "17004";

/** Where the number is kept: the question's text box, an "Other" box's slot. */
export const EXPERT_PHONE_KEY = `${EXPERT_QID}_other`;

/** Mark's board turns Next solid once the number has at least six digits. */
export const EXPERT_PHONE_MIN_DIGITS = 6;

/** The longest number the field takes: E.164 allows 15 digits, with room for spaces. */
export const EXPERT_PHONE_MAX_LENGTH = 24;

/** Mark's board's codes, Germany first. */
export const EXPERT_COUNTRY_CODES: ReadonlyArray<{ code: string; label: string }> = [
  ["+49", "DE +49"],
  ["+43", "AT +43"],
  ["+41", "CH +41"],
  ["+31", "NL +31"],
  ["+32", "BE +32"],
  ["+33", "FR +33"],
  ["+34", "ES +34"],
  ["+39", "IT +39"],
  ["+44", "UK +44"],
  ["+45", "DK +45"],
  ["+46", "SE +46"],
  ["+47", "NO +47"],
  ["+48", "PL +48"],
  ["+351", "PT +351"],
  ["+353", "IE +353"],
  ["+1", "US/CA +1"],
  ["+61", "AU +61"],
].map(([code, label]) => ({ code: code!, label: label! }));

export const EXPERT_DEFAULT_CODE = "+49";

/** A Yes: the answer the phone number goes with. */
export function isExpertYes(answer: unknown): boolean {
  return typeof answer === "string" && /^yes\b/i.test(answer.trim());
}

/** The code and the number as typed, as one string: "+49 151 2345678". */
export function joinExpertPhone(code: string, number: string): string {
  return `${code} ${number}`;
}

/** The stored string back into its code and number; nothing stored yet reads as Germany's code. */
export function splitExpertPhone(value: unknown): { code: string; number: string } {
  const text = typeof value === "string" ? value : "";
  const match = /^(\+\d{1,4}) (.*)$/.exec(text);
  if (!match) return { code: EXPERT_DEFAULT_CODE, number: text };
  return { code: match[1]!, number: match[2]! };
}

/** Whether the number has enough digits for a call (the country code not counted). */
export function expertPhoneValid(value: unknown): boolean {
  return splitExpertPhone(value).number.replace(/\D/g, "").length >= EXPERT_PHONE_MIN_DIGITS;
}

/** The screen's words: Mark's board, and our line for a number that is missing. */
export const EXPERT_COPY = {
  /** The helper's first words, bold on the board. */
  guideLead: "It's free.",
  freeTag: "Free",
  phoneLabel: "Your phone number",
  codeLabel: "Country code",
  phonePlaceholder: "Phone number",
  /** The board's line, then how to take the number back (DPO, 28 Nov 2026; privacy policy §3.6). */
  phoneHelper:
    "So one of our experts can call you to set up your free talk. You can ask us to delete your number any time at hello@loveiq.org.",
  phoneMissing: "Add your phone number so an expert can call you.",
} as const;
