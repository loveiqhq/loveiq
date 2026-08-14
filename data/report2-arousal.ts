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
 * `intro`, `acts` and `notes` are Figma verbatim per family.
 *
 * The act DETAIL — the three act-1 condition chips, their note, and the act 2/3
 * bodies — is Figma verbatim for `responsive` only. Both variant frames were
 * duplicated from the base and left byte-identical to it (the same
 * copy-forgotten-in-a-duplicate artifact as the Energy meter bars and the Power
 * lit-wave), so the frames cannot be read as authority for the other two. It
 * used to live here once as a single shared block, which meant a Spontaneous
 * reader was told their wave climbs on "Repair · nothing unresolved" — copy
 * describing a responsive build they do not have.
 *
 * So `spontaneous` and `contextual` now carry their own, written to each family's
 * OWN arc as its `acts`/`notes` already state it: ignition → fade → rekindle is a
 * charge that must be kept lit, and setting → disruption → re-entry is a context
 * that must be restored. Register follows the responsive set exactly: three chips
 * whose tails all begin "nothing …", a note naming the three dots on the curve,
 * and act bodies that end on what happens if the reader does nothing.
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
  /** Act 1's three chips — the three climbing dots on the curve. */
  conditions: ArousalCondition[];
  /** The line under those chips. */
  conditionsNote: string;
  /** Act 2's paragraph — what the dip is. */
  act2Body: string;
  /** Act 3's paragraph — what resolves it, and what happens if nothing does. */
  act3Body: string;
}

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
    // Figma verbatim (card 8427:2196).
    conditions: [
      { label: "Repair", note: "nothing unresolved" },
      { label: "Presence", note: "nothing competing" },
      { label: "Sincerity", note: "nothing performed" },
    ],
    conditionsNote: "Each condition met lets the wave climb — the three dots on the curve.",
    act2Body:
      "A phone, an unspoken tension — one slipped condition pauses the wave. It doesn't end the evening.",
    act3Body:
      'Say what happened — "I lost you for a second" — and the wave resumes where it left off. Unspoken, the dip becomes the ending.',
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
    // Written to this family's own arc: nothing has to be built, so the three
    // dots are what keeps the charge high rather than what lets a wave climb.
    conditions: [
      { label: "Novelty", note: "nothing rehearsed" },
      { label: "Charge", note: "nothing owed" },
      { label: "Freedom", note: "nothing scheduled" },
    ],
    conditionsNote: "Each one present keeps the charge high — the three dots on the curve.",
    act2Body:
      "Nothing went wrong. Repetition simply spent the charge, and the same touch stops registering. That is fuel running out, not feeling running out.",
    act3Body:
      "Change one variable — the room, the hour, who starts it — and it lights again. Waiting for the old spark to come back on its own is what keeps it away.",
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
    // Written to this family's own arc: the switch is the setting, so the three
    // dots are the conditions that assemble it.
    conditions: [
      { label: "Privacy", note: "nothing intruding" },
      { label: "Time", note: "nothing rushed" },
      { label: "Ease", note: "nothing left on the list" },
    ],
    conditionsNote: "Each condition in place opens the setting — the three dots on the curve.",
    act2Body:
      "A door left open, a message that pulls you out — the setting breaks before your body does. The wanting is intact; the context is not.",
    act3Body:
      "Restore what broke — close the door, put the day down — and desire returns without coaxing. Pushing on inside the broken setting is what ends it.",
  },
};

/** Family content for `families.arousal`, falling back to the Figma base. */
export function getArousalFamily(family: string | null | undefined): ArousalFamily {
  return (family && AROUSAL_FAMILIES[family]) || AROUSAL_FAMILIES.responsive!;
}
