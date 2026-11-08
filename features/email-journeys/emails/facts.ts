/**
 * What the emails state as fact, each from the code that makes it true, so a price or a count
 * that changes changes the emails with it (the canvas writes them in brackets: [€1.99], [62]).
 */

import { INITIAL_UNLOCK_CREDIT_CENTS } from "@features/report/logic/initialUnlock";
import {
  INITIAL_UNLOCK_GUARANTEE_DAYS,
  INITIAL_UNLOCK_PRICE_CENTS,
} from "@features/report/logic/initialUnlockGate";
import { ARCHETYPES_COMPARED, QUESTIONS_ASKED } from "@features/report/logic/reportFacts";

/** "€1.99", "€10": whole euros without decimals. */
export function eur(cents: number): string {
  return `€${cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2)}`;
}

/** The initial report's price (the Core Archetype), as the gate and pay to start sell it. */
export const PRICE = eur(INITIAL_UNLOCK_PRICE_CENTS);
/** Off the full report once the initial report is held (price arm A3, every holder). */
export const CREDIT = eur(INITIAL_UNLOCK_CREDIT_CENTS);
export const GUARANTEE_DAYS = INITIAL_UNLOCK_GUARANTEE_DAYS;
export const QUESTIONS = QUESTIONS_ASKED;
export const ARCHETYPES = ARCHETYPES_COMPARED;
/**
 * The survey's length as the survey itself tells it (SurveyProgress' TOTAL_MINUTES, a UI
 * module the server must not load): its minutes-left share 15 minutes over the questions.
 */
export const SURVEY_MINUTES = 15;

/** Minutes left for the questions still unanswered, at the survey's own pace, at least 1. */
export function minutesLeft(answered: number, total = QUESTIONS): number {
  const left = Math.max(0, total - Math.max(0, answered));
  return Math.max(1, Math.ceil((left / total) * SURVEY_MINUTES));
}
