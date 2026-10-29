import { getOfferDefinition } from "@features/pay-to-start/logic/offer";
import { INITIAL_UNLOCK_CREDIT_CENTS } from "@features/report/logic/initialUnlock";

/**
 * The forced EUR 1.99 gate after the survey (Notion "RFD > Pre-Unlock", Figma Report-3.0
 * 1604:2328): who meets it, and what the report API sends them instead of the report.
 * Pure; features/report/server/initialUnlockGate.ts and the report route gather the inputs.
 */

/** One price for the Core Archetype however it is bought: pay to start's offer and this gate. */
export const INITIAL_UNLOCK_PRICE_CENTS = getOfferDefinition("pre").defaultPriceCents;

/** The initial unlock as the receipt, #payments, the purchase events and the return page name it. */
export const INITIAL_UNLOCK_TITLE = "Your Core Archetype";

/** "14-day money-back guarantee": Figma draws 7, 14 is the standing rule (Fatih, 02.10). */
export const INITIAL_UNLOCK_GUARANTEE_DAYS = 14;

/**
 * `payment.metadata.gifted` on the EUR 0 `initial` row E07 grants on day 1: the gift opens
 * what the EUR 1.99 does and carries its EUR 10 credit (`getReportCredits`).
 */
export const INITIAL_UNLOCK_GIFT = "e07";

export interface InitialUnlockGateInput {
  /** report_initial_unlock_gate. */
  gateEnabled: boolean;
  /** report_paywall_enforced: off opens every report in full, this gate included. */
  paywallEnforced: boolean;
  viewMode: "owner" | "shared";
  /** The survey was submitted while the gate was on (initial_gate_cohort_at). */
  inCohort: boolean;
  accessPlan: string | null;
  purchasedPlan: string | null;
  /** A succeeded `initial` payment for this report, paid or gifted. */
  initialUnlock: boolean;
  /** A pay-to-start entitlement on this survey that is settling or paid; null when unknown. */
  livePayToStart: boolean | null;
  /** The access lookup threw, so what the reader bought is unknown. */
  accessLookupFailed: boolean;
}

/**
 * Only an owner in the gate's cohort who bought nothing meets it, and only while both
 * switches are on. Every unknown stands the gate aside: a reader who paid must never be
 * asked to pay again because a lookup failed.
 */
export function needsInitialUnlockGate(input: InitialUnlockGateInput): boolean {
  return (
    input.gateEnabled &&
    input.paywallEnforced &&
    input.viewMode === "owner" &&
    input.inCohort &&
    input.accessPlan === null &&
    input.purchasedPlan === null &&
    !input.initialUnlock &&
    input.livePayToStart === false &&
    !input.accessLookupFailed
  );
}

/**
 * What /api/report answers a gated reader with, in place of the report. Nothing in it comes
 * from the report: the free payload carries real copy under the blur, so the gate has to
 * withhold the report, not cover it.
 */
export interface InitialUnlockGatePayload {
  gate: "initial_unlock";
  priceCents: number;
  currency: "EUR";
  creditCents: number;
  guaranteeDays: number;
  reportToken: string | null;
  submissionId: number | null;
  viewMode: "owner";
  /**
   * The minutes the reader spent on the survey, for the exit page's "You invested 14 minutes
   * into your answers" (Marcus's canvas, 29.10); null when it would not be true of them
   * (surveyMinutesFromDuration). Absent from a payload older than it.
   */
  surveyMinutes?: number | null;
}

/** Below this a run is a skim, above it the survey was left open: neither is time "invested". */
const SURVEY_MINUTES_MIN = 3;
const SURVEY_MINUTES_MAX = 90;

/**
 * The survey's own clock (survey_submission.duration_ms, start to submit) in whole minutes, or
 * null when it says nothing a reader would recognise as the time they put in.
 */
export function surveyMinutesFromDuration(durationMs: number | null | undefined): number | null {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs)) return null;
  const minutes = Math.round(durationMs / 60_000);
  return minutes >= SURVEY_MINUTES_MIN && minutes <= SURVEY_MINUTES_MAX ? minutes : null;
}

export function buildInitialUnlockGatePayload({
  reportToken,
  submissionId,
  surveyMinutes = null,
}: {
  reportToken: string | null;
  submissionId: number | null;
  surveyMinutes?: number | null;
}): InitialUnlockGatePayload {
  return {
    gate: "initial_unlock",
    priceCents: INITIAL_UNLOCK_PRICE_CENTS,
    currency: "EUR",
    creditCents: INITIAL_UNLOCK_CREDIT_CENTS,
    guaranteeDays: INITIAL_UNLOCK_GUARANTEE_DAYS,
    reportToken,
    submissionId,
    viewMode: "owner",
    surveyMinutes,
  };
}

export function isInitialUnlockGatePayload(json: unknown): json is InitialUnlockGatePayload {
  if (typeof json !== "object" || json === null) return false;
  const value = json as Record<string, unknown>;
  return (
    value.gate === "initial_unlock" &&
    typeof value.priceCents === "number" &&
    typeof value.creditCents === "number" &&
    typeof value.guaranteeDays === "number"
  );
}
