import { assignGateRevealArm, type GateRevealArm } from "@shared/experiments/gateRevealArm";
import { assignGatePriceArm, type GatePriceArm } from "@shared/experiments/gatePriceArm";
import { isFeatureEnabled } from "@shared/flags/system-flags";

/**
 * The switches of the EUR 1.99 page's two tests and the reader's half of each, apart from the
 * page itself (gateReveal.ts), so the survey's route can ask without loading the report's
 * archetype copy: Mark's 50/50 of his new page (the Core Archetype shown) and the price test
 * that replaced it (Choose your price, shared/experiments/gatePriceArm.ts).
 */

/** The reveal's switch, off on any error: it shows the archetype before payment. */
export function isGateRevealEnabled(): Promise<boolean> {
  return isFeatureEnabled("report_gate_archetype_reveal", false).catch(() => false);
}

/** The price test's switch, off on any error: it sells the pre-unlock at a chosen price. */
export function isGatePriceEnabled(): Promise<boolean> {
  return isFeatureEnabled("report_gate_choose_price", false).catch(() => false);
}

/**
 * The reader's half of Mark's 50/50 (shared/experiments/gateRevealArm.ts), from the session the
 * survey ran under, or null while the switch is off and no test runs. Only `reveal` gets the
 * new page; the survey's sheets, the wizard and the tour's menu follow the same arm.
 *
 * Null too while the price test runs: it replaced and retired the new page (Marcus, 24 Nov
 * 2026), whatever the reveal's own switch says.
 */
export async function gateRevealArmFor(
  sessionId: string | null | undefined
): Promise<GateRevealArm | null> {
  const [revealOn, priceOn] = await Promise.all([isGateRevealEnabled(), isGatePriceEnabled()]);
  if (!revealOn || priceOn) return null;
  return assignGateRevealArm(sessionId);
}

/**
 * The reader's half of the price test (gatePriceArm.ts), from the session the survey ran under,
 * or null while its switch is off. Only `choose` picks the price; `fixed` meets today's page.
 */
export async function gatePriceArmFor(
  sessionId: string | null | undefined
): Promise<GatePriceArm | null> {
  if (!(await isGatePriceEnabled())) return null;
  return assignGatePriceArm(sessionId);
}
