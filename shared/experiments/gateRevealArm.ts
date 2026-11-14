/**
 * Mark's new EUR 1.99 page, as a 50/50 test (Mark, 13 Nov 2026: "Lets do a 50/50 split of only
 * the paywall change (where we show the archetype)"). Half the free finishers meet his page,
 * which shows their Core Archetype, its match and five aspect cards before payment
 * (features/report/logic/gateReveal.ts); half meet today's page. The price, the guarantee and
 * what EUR 1.99 opens stay the same in both (his answers 1, 2, 4 and 5).
 *
 * ONE ARM FOR THE WHOLE RUN, decided before the survey ends (Fatih, 14 Nov). Two of Mark's
 * sheets promise the page's free archetype (the halfway sheet and the report map), and so do
 * the pre-report wizard's map and the report's menu during the tour once they follow it. A
 * reader on today's page must never be told the archetype is free, so all of it follows
 * this one arm: the survey's sheets, the wizard, the tour's menu and the gate itself.
 *
 * WHY THE ARM IS DERIVED FROM THE SESSION ID. As C13's (questionOrderArm.ts): it is known in
 * the browser from the first question, survives a reload, and is stored on the submission
 * (`survey_submission.session_id`), so the report's server recomputes the same arm when it
 * builds the gate. Nothing is minted that has to be retired; the `gate_reveal_arm` stamp in
 * utm_tracker is a convenience for grouping, never the record.
 *
 * NO SESSION ID MEANS TODAY'S PAGE. Where storage is blocked the survey has no session id;
 * that reader stays in control rather than in an arm nobody can attribute.
 *
 * THE SWITCH STILL DECIDES. `report_gate_archetype_reveal` off means nobody gets the new
 * page, whatever their arm (gateReveal.ts). Read the result from the day it went on, and
 * leave out readers who paid before the survey: they never meet a EUR 1.99 page.
 */

import { isNonProdDeploy } from "@shared/env/is-non-prod-deploy";
import { sessionArmHash } from "@shared/experiments/sessionHash";

export type GateRevealArm = "control" | "reveal";

/** The salt, and the `experiment` name on every exposure event. */
export const GATE_REVEAL_EXPERIMENT = "gate_reveal_2026_11";

/** The arm's key in `survey_submission.utm_tracker`. */
export const GATE_REVEAL_ARM_KEY = "gate_reveal_arm";

export function isGateRevealArm(value: unknown): value is GateRevealArm {
  return value === "control" || value === "reveal";
}

/**
 * Preview override, `reveal=1` or `reveal=0` (the report's own preview parameter), so
 * either arm can be walked on dev and staging. Null on production, where it must never move
 * a real reader's bucket.
 */
export function resolveGateRevealOverride(param: string | null | undefined): GateRevealArm | null {
  if (!isNonProdDeploy()) return null;
  if (param === "1") return "reveal";
  if (param === "0") return "control";
  return null;
}

/**
 * This session's arm. Pure, deterministic and total: the same session id always returns the
 * same arm, and an absent one always returns control.
 */
export function assignGateRevealArm(sessionId: string | null | undefined): GateRevealArm {
  if (!sessionId?.trim()) return "control";
  return sessionArmHash(`${GATE_REVEAL_EXPERIMENT}:${sessionId}`) % 2 === 0 ? "control" : "reveal";
}
