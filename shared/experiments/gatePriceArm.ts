/**
 * The EUR 1.99 page's price test (Marcus, #all-loveiq, 24 Nov 2026: "Replace & Retire the 'Core
 * Archetype shown' pre-payment wall / funnel with the new 'Choose your price' … two version
 * a) 1.99 to pre-unlock b) choose your price to pre-unlock"). Half the free finishers meet
 * today's EUR 1.99 page (`fixed`); half meet his "Choose your price" page (`choose`, Claude
 * Design "Paygate exit pages", board "Paygate · €1,99 (Figma recreation) copy 2"), where they
 * pick EUR 0, 6.99, 19.99 or their own amount for the same pre-unlock.
 *
 * THE SAME SPLIT AS MARK'S 50/50 (gateRevealArm.ts), on purpose: `choose` is the half that met
 * his "Core Archetype shown" page, so a reader whose survey sheets promised the archetype free
 * lands on a page that can give it for EUR 0, and today's page's half keeps its EUR 1.99. Its
 * own switch, `report_gate_choose_price`, retires that page: while it is on, nobody meets the
 * archetype reveal (gateRevealSwitch.ts).
 *
 * ITS OWN VALUES UNDER THE SAME KEY. The survey's server stamps `fixed` or `choose` in
 * `utm_tracker.gate_reveal_arm` while this test runs (never `control`/`reveal`), so the record
 * says which test a reader was in without a date, and no other key enters the tracker: the
 * funnel digest's channel sparklines leave that key out by name (20261124090000).
 */

import { assignGateRevealArm, isGateRevealArm, type GateRevealArm } from "./gateRevealArm";

export type GatePriceArm = "fixed" | "choose";

/** Either test's half, as `utm_tracker.gate_reveal_arm` and `payment.metadata.gateRevealArm` hold it. */
export type GateArmStamp = GateRevealArm | GatePriceArm;

/** The `experiment` name on the gate's exposure events while this test runs. */
export const GATE_PRICE_EXPERIMENT = "gate_price_2026_11";

export function isGatePriceArm(value: unknown): value is GatePriceArm {
  return value === "fixed" || value === "choose";
}

export function isGateArmStamp(value: unknown): value is GateArmStamp {
  return isGateRevealArm(value) || isGatePriceArm(value);
}

/**
 * This session's half: the half of Mark's 50/50 that met his new page chooses its price.
 * Pure and total, as assignGateRevealArm: no session id means today's page.
 */
export function assignGatePriceArm(sessionId: string | null | undefined): GatePriceArm {
  return assignGateRevealArm(sessionId) === "reveal" ? "choose" : "fixed";
}
