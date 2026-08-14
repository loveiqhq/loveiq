/**
 * Arousal Style content keyed by `families.arousal`, which covers all 14
 * archetypes across three values matching the three Figma scales name-for-name:
 *   responsive (6)  → BASE 9108:565, card 8427:2196 ("as shown in the report")
 *   spontaneous (3) → VAR  SCALE 2 OF 3, card 9107:1133
 *   contextual (5)  → VAR  SCALE 3 OF 3, card 9107:1301 / card 9107:1220
 *
 * The frames' own footer states the contract: "three arousal families cover all
 * 14. The curve, the three act names and the three act bodies swap."
 *
 * `intro`, `acts` and `notes` DO swap and are Figma verbatim per family.
 *
 * The act BODIES do not — despite the contract. Both variant frames were
 * duplicated from the base and their bodies, condition chips, act-1 note and
 * reframe were left byte-identical to it (the same copy-forgotten-in-a-duplicate
 * artifact as the Energy meter bars and the Power lit-wave). Only one version of
 * that copy was ever written, so it lives here once, as `SHARED_ACT_DETAIL`,
 * rather than being invented three times. If per-family bodies are authored
 * later, move them onto each family entry.
 */

export interface ArousalCondition {
  /** Bold chip label, e.g. "Repair". */
  label: string;
  /** Grey tail, rendered after a "·" separator. */
  note: string;
}

export interface ArousalFamily {
  /** The family's own name, as the Figma heading shows it. */
  name: string;
  /** Centred line under the heading. */
  intro: string;
  /** The three act names (without their "1 · " prefix). */
  acts: [string, string, string];
  /** Captions under the three arc panels. */
  notes: [string, string, string];
}

/** Act-1 conditions + the two later act bodies — one authored version (see above). */
export const SHARED_ACT_DETAIL = {
  conditions: [
    { label: "Repair", note: "nothing unresolved" },
    { label: "Presence", note: "nothing competing" },
    { label: "Sincerity", note: "nothing performed" },
  ] as ArousalCondition[],
  conditionsNote: "Each condition met lets the wave climb — the three dots on the curve.",
  act2Body:
    "A phone, an unspoken tension — one slipped condition pauses the wave. It doesn't end the evening.",
  act3Body:
    'Say what happened — "I lost you for a second" — and the wave resumes where it left off. Unspoken, the dip becomes the ending.',
} as const;

export const AROUSAL_FAMILIES: Record<string, ArousalFamily> = {
  // Card 8427:2196 — the version already built into the report.
  responsive: {
    name: "Responsive",
    intro: "Your desire doesn't switch on — it builds like a wave, in three acts.",
    acts: ["The build", "The dip", "The return"],
    notes: [
      "three conditions met, one by one",
      "a condition slips",
      "named — the wave resumes, higher",
    ],
  },
  // Card 9107:1133.
  spontaneous: {
    name: "Spontaneous",
    intro: "Your desire switches on fast — the work is keeping it lit. In three acts.",
    acts: ["The ignition", "The fade", "The rekindle"],
    notes: [
      "a spark catches — no ramp needed",
      "intensity decays without fuel",
      "novelty or play re-lights it",
    ],
  },
  // Card 9107:1220.
  contextual: {
    name: "Contextual",
    intro: "Your desire opens when the setting is right — context is the switch. In three acts.",
    acts: ["The setting", "The disruption", "The re-entry"],
    notes: [
      "the right context assembles",
      "the setting breaks — desire pauses",
      "context restored — it reopens",
    ],
  },
};

/** Family content for `families.arousal`, falling back to the Figma base. */
export function getArousalFamily(family: string | null | undefined): ArousalFamily {
  return (family && AROUSAL_FAMILIES[family]) || AROUSAL_FAMILIES.responsive!;
}
