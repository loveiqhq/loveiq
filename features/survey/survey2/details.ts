import { isValidSurveyEmail } from "@features/survey/email";

/**
 * Survey 2.0's one-page details screen (`00010`; Mark's boards "Details · 1 · Name", "2a · Email",
 * "2b · Email entered · opt-in opens" and "3 · Country picked · postal code opens"). Three fields
 * in turn, name, email, then country with its postal code. The newsletter switch opens under the
 * email once there is one, and the country comes only after the Next that passes it (Mark, 24 Nov).
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

/** Whether the newsletter switch has been passed: its Yes or No is stored. */
export function optInAnswered(answers: Answers): boolean {
  return /^(yes|no)\b/i.test(text(answers[OPT_IN_QID]));
}

/**
 * The first step still to take: the first field to fill, or the email again while the newsletter
 * switch under it has not been passed with Next. `passedOptIn` stands in for the stored answer on
 * the Next that leaves the email, which stores the switch as it stands.
 */
export function firstOpenStep(
  answers: Answers,
  passedOptIn: boolean = optInAnswered(answers)
): DetailsField | null {
  const open = firstOpenField(answers);
  if (open === "name" || open === "email") return open;
  return passedOptIn ? open : "email";
}

export type DetailsStep =
  { kind: "moved"; to: DetailsField } | { kind: "blocked"; field: DetailsField } | { kind: "done" };

/**
 * What Next does on the details screen, from the field that is open: stay with an error while it
 * is unfilled, else open the next step still to take (a field further up included, if it was
 * emptied), and only then go on to the submit. Next on the email passes the newsletter switch:
 * the screen stores it as it stands first (today's No while it is off).
 */
export function advanceDetails(active: DetailsField, answers: Answers): DetailsStep {
  if (!fieldDone(active, answers)) return { kind: "blocked", field: active };
  const open = firstOpenStep(answers, active === "email" || optInAnswered(answers));
  return open ? { kind: "moved", to: open } : { kind: "done" };
}

/**
 * The details screen's words, from Mark's boards. The newsletter box is consent text: its words
 * are what MARKETING_OPT_IN_TERMS_VERSION_SURVEY_2 (features/survey/server/server.ts) dates, so a
 * change here bumps that version in the same commit.
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
  /**
   * The newsletter switch under the email (Mark's board "Details · 2b"): his title and three
   * points, then a line his board leaves out, which makes a Yes informed: the emails are free,
   * we see opens and clicks (the line Eman added to 16015 on 14 Oct), and the way out. Off until
   * the reader turns it on: his board draws it on, which its own title marks as not valid
   * consent under GDPR.
   */
  optInLead: "Keep learning",
  optInRest: " after your report",
  optInPoints: [
    "New research on desire and intimacy",
    "Small practices to try the same day",
    "First access to new tests",
  ],
  optInFine: "Free emails. We track opens and clicks to improve them. Unsubscribe any time.",
} as const;
