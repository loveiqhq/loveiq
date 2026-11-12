import { OPT_IN_QID } from "@features/survey/ui/questionOrder";

/**
 * The "Sure you want to miss out?" sheet on the marketing opt-in (Q16015), the survey's
 * last question. Mark's Claude Design NGyoLVAex5vSW4voVs7Tcc, board "Opt-in · B · Sample
 * email sheet on Next" (10 Nov 2026), from his ask at the 9 Nov sync: "a little box that
 * opens if you say no", saying what the reader would miss.
 *
 * A No followed by Next opens it once per run instead of submitting. "Yes, I want to keep
 * learning" switches the answer to Yes and submits; "Not now" submits the No. Tapping
 * outside, Esc or a swipe down closes it and the reader stays on the question.
 * SurveyEngine holds the submit; OptInSheet draws it.
 */

/**
 * The sheet's words, in one place: Marcus is suggesting copy (10 Nov sync). Changing any
 * of them changes the consent text a Yes is given under, so bump OPT_IN_SHEET_COPY_VERSION
 * in the same commit.
 *
 * The fine print's figure is measured, not the design's 97%: no newsletter has been sent
 * yet, and nothing invented goes on a LoveIQ page. On 10 Nov 2026, 2,551 addresses outside
 * the team had taken the survey since 24 Mar 2026 and 108 of them had unsubscribed from
 * our emails: 95.8% stayed, rounded down to 95%. Run it again before changing the number:
 *
 *   with emailed as (
 *     select distinct lower(trim(u.email)) as e
 *     from survey_submission s join app_user u on u.id = s.user_id
 *     where u.email is not null and trim(u.email) <> ''
 *   ), outside as (
 *     select e from emailed
 *     where e not like '%@loveiq.org' and e not like '%@appliedpsychometrics.org'
 *   ), unsubscribed as (
 *     select distinct lower(trim(email)) as e from email_suppression
 *     where reason = 'unsubscribed'
 *   )
 *   select count(*) as emailed,
 *     count(*) filter (where e in (select e from unsubscribed)) as unsubscribed
 *   from outside;
 */
export const OPT_IN_SHEET_COPY = {
  titleLead: "Sure you want to ",
  titleEmphasis: "miss out",
  titleEnd: "?",
  benefits: [
    "Practical & scientific insights tailored to you",
    "Small practices to try the same day",
    "First access to new tests & guides",
  ],
  finePrintLead: "No spam, just value. ",
  finePrintFigure: "95%",
  finePrintEnd: " of readers stay subscribed.",
  accept: "Yes, I want to keep learning",
  decline: "Not now",
} as const;

/**
 * Date of the sheet's copy, for the consent record. A Yes given in the sheet is stored as
 * `<Q16015's MARKETING_OPT_IN_TERMS_VERSION>+sheet-<this>` (features/survey/server/
 * server.ts), so the words the reader saw can be found again (GDPR Art. 7(1), T-11).
 */
export const OPT_IN_SHEET_COPY_VERSION = "2026-11-10";

/** Where a Yes came from, sent with the submission. Only the sheet is named. */
export type MarketingOptInVia = "sheet";

/** How the reader closed the sheet without choosing. */
export type OptInSheetDismissVia = "backdrop" | "escape" | "swipe";

/** What the sheet ended in, for analytics. */
export type OptInSheetOutcome = "yes" | "not_now" | "dismissed";

/**
 * The server's own reading of the opt-in answer (app/api/survey/route.ts): any text that
 * starts with "yes" is a Yes. Kept identical, so the sheet opens exactly when the server
 * would store a No.
 */
export function isOptInYes(answer: unknown): boolean {
  return typeof answer === "string" && answer.trim().toLowerCase().startsWith("yes");
}

/**
 * The opt-in's own Yes, word for word: submit_survey matches a single-choice answer to its
 * option text exactly, and stores anything else with no option id.
 */
export function optInYesOption(options: readonly string[] | undefined): string | null {
  return options?.find((option) => isOptInYes(option)) ?? null;
}

/** Whether moving on from this question should open the sheet instead of submitting. */
export function shouldOfferOptInSheet(
  qId: string | undefined,
  answer: unknown,
  alreadyShown: boolean
): boolean {
  if (alreadyShown || qId !== OPT_IN_QID) return false;
  return typeof answer === "string" && answer.trim() !== "" && !isOptInYes(answer);
}

/** A drag down this far closes the sheet. */
export const SHEET_DISMISS_DISTANCE_PX = 96;
/** Or a shorter, quick flick: at least this far, faster than SHEET_FLICK_PX_PER_MS. */
export const SHEET_FLICK_MIN_PX = 24;
export const SHEET_FLICK_PX_PER_MS = 0.5;

/** Whether a drag of `dy` px down, over `ms`, closes the sheet. */
export function shouldDismissOnDrag(dy: number, ms: number): boolean {
  if (!(dy > 0)) return false;
  if (dy >= SHEET_DISMISS_DISTANCE_PX) return true;
  return dy >= SHEET_FLICK_MIN_PX && ms > 0 && dy / ms > SHEET_FLICK_PX_PER_MS;
}

/**
 * Remembers that this run has seen the sheet, so it opens once per run: after a reload,
 * a pause or a Previous it does not ask again. Keyed by the run's start time, which the
 * draft keeps, so the next run (a retake, Start Over) is asked again.
 */
export const OPT_IN_SHEET_STORAGE_KEY = "loveiq-survey-optin-sheet";

export function optInSheetShownFor(startedAt: string): boolean {
  try {
    return localStorage.getItem(OPT_IN_SHEET_STORAGE_KEY) === startedAt;
  } catch {
    // Storage blocked: SurveyEngine still remembers it for this page.
    return false;
  }
}

export function rememberOptInSheetShown(startedAt: string): void {
  try {
    localStorage.setItem(OPT_IN_SHEET_STORAGE_KEY, startedAt);
  } catch {
    // Storage blocked: SurveyEngine still remembers it for this page.
  }
}
