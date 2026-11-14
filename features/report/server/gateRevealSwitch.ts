import { assignGateRevealArm, type GateRevealArm } from "@shared/experiments/gateRevealArm";
import { isFeatureEnabled } from "@shared/flags/system-flags";

/**
 * The switch of Mark's new EUR 1.99 page and the reader's half of his 50/50, apart from the page
 * itself (gateReveal.ts), so the survey's route can ask without loading the report's archetype
 * copy.
 */

/** The reveal's switch, off on any error: it shows the archetype before payment. */
export function isGateRevealEnabled(): Promise<boolean> {
  return isFeatureEnabled("report_gate_archetype_reveal", false).catch(() => false);
}

/**
 * The reader's half of Mark's 50/50 (shared/experiments/gateRevealArm.ts), from the session the
 * survey ran under, or null while the switch is off and no test runs. Only `reveal` gets the
 * new page; the survey's sheets, the wizard and the tour's menu follow the same arm.
 */
export async function gateRevealArmFor(
  sessionId: string | null | undefined
): Promise<GateRevealArm | null> {
  if (!(await isGateRevealEnabled())) return null;
  return assignGateRevealArm(sessionId);
}
