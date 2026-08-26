/**
 * Energy & Risk readings, keyed by `families.energy`.
 *
 * The designer's four frames state the contract in their own footer: "Reusable
 * across all 14: the curve field never changes — each family lights up its own
 * line, renames the two labels and swaps the three readings."
 *   - wave      → base, as built into the report (Figma 8427:1847, banner 9108:561)
 *   - spike     → VAR-D SCALE 2 OF 4 (Figma 9107:927)
 *   - steady    → VAR-D SCALE 3 OF 4 (Figma 9107:1027)
 *   - conditional → VAR-D SCALE 4 OF 4 (Figma 9107:1127)
 *
 * `families.energy` splits all 14 archetypes across those four values
 * (wave 3 · spike 4 · steady 3 · conditional 4) and matches each frame's
 * `SHOWN FOR (n of 14)` list name-for-name, so these four entries cover every
 * reader. Every string below is verbatim Figma.
 *
 * `energy_readouts` exists in `report2-archetype-config.json` for Spiritual
 * Lover ONLY, so `level` here is the fallback for the other 13 — and the wave
 * entry reproduces that one real config exactly ({ energy 2, risk 1,
 * endurance 3 }) as validation of the shape.
 */

/** One readout row: the meter fill plus the two lines of text beside it. */
export interface EnergyReading {
  /** Level word + qualifier, e.g. "Moderate · slow-opening". Figma verbatim. */
  result: string;
  /** The sentence under the result. Figma verbatim. */
  detail: string;
  /** Filled segments out of 3. */
  level: number;
}

export interface EnergyFamilyProfile {
  energy: EnergyReading;
  risk: EnergyReading;
  endurance: EnergyReading;
  /** The reader's own curve label — the "you — …" text at the line's end. */
  youLabel: string;
  /** The anonymous contrast callout pointing into the pack of 14. */
  contrastLabel: string;
}

/** The contrast callout every family except `spike` points at. */
const SPIKE_CONTRAST = "a high-spike pattern — fast up, fast gone";

/**
 * NOTE ON `level` — the one place this file deliberately departs from the
 * variant frames. All four frames carry byte-identical meter bars ({ 2, 1, 3 }),
 * because the designer duplicated the base frame and swapped only the text.
 * For wave, steady and conditional the text agrees with those bars
 * ("Moderate"/"Steady"/"Low then High" → 2, "Low"/"Low–Medium" → 1, "High" → 3).
 * For spike it contradicts them: the row reads "High · novelty-driven" beside a
 * 1-of-3 meter. Spike therefore takes the levels its own authored text states
 * ({ 3, 3, 2 }), so the meter never disagrees with the label printed next to it.
 */
export const ENERGY_FAMILY_PROFILES: Record<string, EnergyFamilyProfile> = {
  wave: {
    energy: {
      result: "Moderate · slow-opening",
      detail:
        "You rarely arrive already charged — sexual energy builds through presence, meaning, and emotional sincerity. Rushing weakens it rather than speeding it up.",
      level: 2,
    },
    risk: {
      result: "Low–Medium · trust-gated",
      detail:
        "Your nervous system opens through trust and intention, not adrenaline — intense inside sincerity, never chaos-driven.",
      level: 1,
    },
    endurance: {
      result: "High",
      detail:
        "Once open, you last far longer than spike patterns — the reading partners most often miss.",
      level: 3,
    },
    youLabel: "you — the wave keeps building",
    contrastLabel: SPIKE_CONTRAST,
  },

  spike: {
    energy: {
      result: "High · fast-activating",
      detail:
        "Explosive and quickly charged — you can arrive already sparked when there is play and novelty.",
      level: 3,
    },
    risk: {
      result: "High · novelty-driven",
      detail:
        "Uncertainty and variety activate arousal rather than shut it down. Novelty is the doorway, not the risk.",
      level: 3,
    },
    endurance: {
      result: "Moderate · recurring",
      detail:
        "Energy returns again and again through variety rather than lasting through one long build.",
      level: 2,
    },
    youLabel: "you — fast up, fast gone",
    // Spike IS the high-spike line, so its frame contrasts against the wave.
    contrastLabel: "a slow-building wave — late, but lasting",
  },

  steady: {
    energy: {
      result: "Steady · low-variance",
      detail:
        "You neither spike nor stall — energy sits at a level you can reach on most days without a run-up.",
      level: 2,
    },
    risk: {
      result: "Low · comfort-led",
      detail: "Your system opens through the familiar. Novelty is friction, not fuel.",
      level: 1,
    },
    endurance: {
      result: "High",
      detail: "Because nothing has to be summoned, very little runs out.",
      level: 3,
    },
    youLabel: "you — steady, needs no ramp",
    contrastLabel: SPIKE_CONTRAST,
  },

  conditional: {
    energy: {
      result: "Low then High · trust-gated",
      detail:
        "Nothing reads as desire until a threshold is crossed — then energy arrives almost all at once.",
      level: 2,
    },
    risk: {
      result: "Low · safety-first",
      detail:
        "Your system checks for exits before it opens. Risk delays the charge, it never raises it.",
      level: 1,
    },
    endurance: {
      result: "High",
      detail: "Past the threshold you hold far longer than spike patterns.",
      level: 3,
    },
    youLabel: "you — quiet until trust, then all at once",
    contrastLabel: SPIKE_CONTRAST,
  },
};

/**
 * The tinted callout under the three readings (Figma 8427:1894).
 *
 * It was ONE constant for all fourteen, on the grounds that the four family
 * frames carry it identically. They do — but only because the designer duplicated
 * the base frame and swapped the three readings, and the base frame is the WAVE
 * one. So its text is the wave's argument, and on a spike report it reads
 * "what takes longer to start also lasts far longer… more nourishing than fast,
 * high-spike patterns" directly under three readings that say High ·
 * fast-activating and directly above a curve labelled "fast up, fast gone". The
 * callout argued against the reader on the same screen (found 2026-08-26).
 *
 * Now keyed by family. Wave keeps the original words exactly. The other three say
 * the same KIND of thing — "the third reading is the one partners underestimate"
 * — about their own third reading, in the register their own profile already
 * uses above. `emphasis` renders inline at the end of `body` in serif italic.
 */
export const ENERGY_THIRD_READINGS: Record<string, { body: string; emphasis: string }> = {
  wave: {
    body: "The third reading is the one partners underestimate: what takes longer to start also lasts far longer, and often feels more nourishing than fast, high-spike patterns.",
    emphasis: "Depth replaces speed.",
  },
  spike: {
    body: "The third reading is the one partners underestimate: energy that returns again and again through variety is not energy running out, and a fade is not a verdict on the relationship.",
    emphasis: "Recurrence replaces endurance.",
  },
  steady: {
    body: "The third reading is the one partners underestimate: energy you can reach on most days without a run-up asks for no occasion, and needs no build to be real.",
    emphasis: "Availability replaces intensity.",
  },
  conditional: {
    body: "The third reading is the one partners underestimate: once the conditions are met you hold far longer than spike patterns, so what looks like reluctance is a threshold, not a limit.",
    emphasis: "Threshold replaces reluctance.",
  },
};

/** The callout for a `families.energy` value, falling back to the Figma base. */
export function getEnergyThirdReading(family: string | null | undefined) {
  return (family && ENERGY_THIRD_READINGS[family]) || ENERGY_THIRD_READINGS.wave!;
}

/** Family profile for `families.energy`, falling back to the Figma base (wave). */
export function getEnergyFamilyProfile(family: string | null | undefined): EnergyFamilyProfile {
  return (family && ENERGY_FAMILY_PROFILES[family]) || ENERGY_FAMILY_PROFILES.wave!;
}
