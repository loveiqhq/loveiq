/**
 * Mark's redesigned EUR 1.99 page ("€1.99 Pre-Paywall · mobile", Claude Design
 * HcHeTUFfEgmg62qqktHSMU, artboard 29119cb1f6ae, 12 Nov 2026): the gate opens on the reader's
 * Core Archetype, its match and a carousel of five aspect cards, the first two open and three
 * locked, before the plan. This is what the gate's payload carries for it (`reveal`).
 *
 * Behind its own switch (`report_gate_archetype_reveal`, off): it shows the Core Archetype
 * before payment, which today's EUR 1.99 sells. It goes on with the change that makes the
 * archetype free (the Light Report, Roadmap "Show archetype + survey nudge cards").
 */

/** The five cards, in the board's order: core motivation first, then the report's deck. */
export type GateRevealAspectKey =
  "motivation" | "communication" | "initiation" | "attachment" | "power";

/** The board opens the first two cards and locks the last three. */
export const GATE_REVEAL_OPEN_KEYS: ReadonlySet<GateRevealAspectKey> = new Set([
  "motivation",
  "communication",
]);

export interface GateRevealAspect {
  key: GateRevealAspectKey;
  /** "Core motivation". */
  title: string;
  /** "What drives your desire". */
  subtitle: string;
  /** The verdict, in Lora: "Pleasure & play". Shown on locked cards too, as on the board. */
  value: string;
  /**
   * The card's sentence. On a locked card it is a same-shape stand-in, drawn only under the
   * blur: the gate withholds the report, so no locked words travel to the page.
   */
  body: string;
  locked: boolean;
}

export interface GateReveal {
  archetype: string;
  /** 0–100, whole: the ring and its "43% match". */
  matchStrength: number;
  /** The archetype's one line (report4ArchetypeBlurbs): the same for every reader of it. */
  blurb: string | null;
  aspects: readonly GateRevealAspect[];
}

export function isGateReveal(value: unknown): value is GateReveal {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.archetype === "string" &&
    typeof v.matchStrength === "number" &&
    Array.isArray(v.aspects) &&
    v.aspects.length > 0
  );
}
