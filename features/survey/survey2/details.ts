import { isValidSurveyEmail } from "@features/survey/email";

/**
 * Survey 2.0's one-page details screen (`00010`; Mark's boards "Details · 1 · Name", "2a · Email",
 * "3 · Country picked · postal code opens" and "alt · Yes/No opt-in"). Three fields in turn, name,
 * email, then country with its postal code, and the newsletter question once there is an email.
 *
 * Every answer is written under the id today's survey asks it by (00001, 00000, 15001, 15002,
 * 16015), so the report's name, the emails, the price tier, Slack, AP and the data export read
 * them as they always have.
 */

export type DetailsField = "name" | "email" | "country";

export const DETAILS_FIELDS: readonly DetailsField[] = ["name", "email", "country"];

export const NAME_QID = "00001";
export const EMAIL_QID = "00000";
export const COUNTRY_QID = "15001";
export const POSTAL_QID = "15002";
export const OPT_IN_QID = "16015";

/** A name or nickname: the classic question's limit (OpenResponseQuestion, the route). */
export const NAME_MAX_LENGTH = 80;

type Answers = Readonly<Record<string, unknown>>;

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export function fieldDone(field: DetailsField, answers: Answers): boolean {
  switch (field) {
    case "name":
      return text(answers[NAME_QID]).length > 0;
    case "email":
      return isValidSurveyEmail(text(answers[EMAIL_QID]));
    case "country":
      return text(answers[COUNTRY_QID]).length > 0 && text(answers[POSTAL_QID]).length > 0;
  }
}

/** The first field still to fill, or null when all three are. */
export function firstOpenField(answers: Answers): DetailsField | null {
  return DETAILS_FIELDS.find((field) => !fieldDone(field, answers)) ?? null;
}

/**
 * The newsletter answer's two stored values: 16015's own options, word for word (submit_survey
 * matches a single choice to its option text, and the route reads a Yes by its first word).
 */
export function optInLabels(options: readonly string[]): { yes: string; no: string } {
  const yes = options.find((o) => /^yes\b/i.test(o.trim())) ?? "Yes";
  const no = options.find((o) => /^no\b/i.test(o.trim())) ?? "No";
  return { yes, no };
}

/** Whether the newsletter question has a Yes or a No. */
export function optInAnswered(answers: Answers): boolean {
  return /^(yes|no)\b/i.test(text(answers[OPT_IN_QID]));
}

export function detailsComplete(answers: Answers): boolean {
  return firstOpenField(answers) === null && optInAnswered(answers);
}

export type DetailsStep =
  | { kind: "moved"; to: DetailsField }
  | { kind: "blocked"; field: DetailsField | "optIn" }
  | { kind: "done" };

/**
 * What Next does on the details screen, from the field that is open: stay with an error while it
 * is unfilled, open the next field still to fill (one further up included, if it was emptied),
 * ask for the newsletter answer last, and only then go on (the survey's own last-step path: the
 * miss-out sheet, then the submit).
 */
export function advanceDetails(active: DetailsField, answers: Answers): DetailsStep {
  if (!fieldDone(active, answers)) return { kind: "blocked", field: active };
  const open = firstOpenField(answers);
  if (open) return { kind: "moved", to: open };
  if (!optInAnswered(answers)) return { kind: "blocked", field: "optIn" };
  return { kind: "done" };
}

/**
 * The details screen's words, from Mark's boards. The newsletter box is consent text: its words
 * are what MARKETING_OPT_IN_TERMS_VERSION_SURVEY_2 (features/survey/server/server.ts) dates, so a
 * change here bumps that version in the same commit. It keeps the line Eman added to 16015 on
 * 14 Oct: that we see whether our emails are opened and which links are clicked.
 */
export const DETAILS_COPY = {
  titleLead: "Last step to your report to become a ",
  titleEmphasis: "more intelligent lover",
  sub: "We use these to personalise your report and send it to you.",
  archetypeLabel: "Your Core Archetype",
  /** Drawn blurred and hidden from screen readers: the archetype is worked out after submit. */
  archetypePlaceholder: "Spark Seeker",
  note: "A nickname and an anonymous email are fine",
  fields: {
    name: {
      row: "Name",
      prompt: "What should we call you?",
      label: "Name or nickname",
      placeholder: "e.g. Banana Bandit",
      missing: "Add a name or nickname to continue.",
    },
    email: {
      row: "Email",
      prompt: "Where should we send your report?",
      label: "Email",
      placeholder: "e.g. nickname@example.com",
      missing: "Add an email address we can send your report to.",
    },
    country: {
      row: "Country",
      prompt: "Where do you live?",
      label: "Country",
      placeholder: "",
      missing: "Pick your country and add your postal code.",
    },
  },
  privacyTipLead: "Prefer privacy?",
  privacyTip: "Use an anonymous email, which isn't linked to your name.",
  postalLabel: (country: string) => `Postal code in ${country}`,
  /** Mark's example is a German one; other countries get no example. */
  postalExample: { Germany: "e.g. 10115" } as Readonly<Record<string, string>>,
  postalHelper: "The first 3 digits are enough",
  optInTitle: "Free LoveIQ hints and insights by email?",
  optInSub:
    "Research, small practices, first access to new tests. We track opens and clicks to improve them. Unsubscribe any time.",
  optInYes: "Yes, keep learning",
  optInNo: "No, thanks",
  optInMissing: "Choose yes or no to finish.",
} as const;
