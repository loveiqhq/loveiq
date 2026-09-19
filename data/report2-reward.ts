/**
 * Reward System — the four neurochemical rows per archetype. Figma `9157:513`
 * (BASE, SCALE 1 OF 2) and `9114:881` (VAR-D, SCALE 2 OF 2).
 *
 * The designer's notes fix the model: *"ALL 14 use this one layout; order, role
 * words and meters change"* and *"the same four currency rows serve all 14. Each
 * archetype reorders them, renames the role word and moves the meter. No new
 * design."*
 *
 * WHY THIS FILE EXISTS: in `report2-archetype-config.json`, `reward_order` is set
 * for 3 of 14 archetypes, `reward_roles` for 2 and `reward_meters` for 1, so
 * `normalizeRewardConfig` returned null and the section rendered NO rows at all
 * for 11 of 14. STATS-AUDIT.md separately records `reward.stat1` as
 * **OMITTED — not computable**, so that stat is deliberately NOT resurrected here.
 *
 * DERIVATION, and how it is validated: the order comes from each archetype's own
 * `reward_system` prose in `data/report-archetypes.ts`, which states the hierarchy
 * in plain words (Relational Nurturer: "primarily oxytocin-oriented, with
 * endorphins playing a strong supporting role and dopamine functioning as
 * secondary … rather than primarily adrenaline-driven"). Ranking by first mention,
 * then appending any chemical the prose does not name, **reproduces all three
 * existing configs exactly** — including Spark Seeker, where endorphins go unnamed
 * and land last just as its config has them. That is the check that makes this
 * safe rather than a guess.
 *
 * ROLE WORDS come from the designer: ranks 1-3 are always lead / support /
 * amplifier, and rank 4 depends on the chemical sitting there — `adrenaline` →
 * "disruptor" (Spiritual Lover's config) and anything else → "settler" (Spark
 * Seeker's config, and the "Endorphins — the settler" row in Figma 9114:828).
 *
 * METERS are the ladder from the one config that has them ([88, 56, 30, 12]),
 * applied BY RANK — which is exactly what "each archetype reorders them … and
 * moves the meter" describes: the ladder is fixed, the chemicals move through it.
 */

export interface RewardProfile {
  /** The four chemicals, strongest first. */
  order: string[];
  /** Role word per rank: lead / support / amplifier / (disruptor|settler). */
  roles: string[];
  /** Meter fill percentage per rank. */
  meters: number[];
}

export const REWARD_BY_SLUG: Record<string, RewardProfile> = {
  "spiritual-lover": {
    order: ["oxytocin", "endorphins", "dopamine", "adrenaline"],
    roles: ["lead", "support", "amplifier", "disruptor"],
    meters: [88, 56, 30, 12],
  },
  "spark-seeker": {
    order: ["dopamine", "adrenaline", "oxytocin", "endorphins"],
    roles: ["lead", "support", "amplifier", "settler"],
    meters: [88, 56, 30, 12],
  },
  "sensual-connector": {
    order: ["oxytocin", "endorphins", "dopamine", "adrenaline"],
    roles: ["lead", "support", "amplifier", "disruptor"],
    meters: [88, 56, 30, 12],
  },
  "relational-nurturer": {
    order: ["oxytocin", "endorphins", "dopamine", "adrenaline"],
    roles: ["lead", "support", "amplifier", "disruptor"],
    meters: [88, 56, 30, 12],
  },
  "radiant-performer": {
    order: ["dopamine", "oxytocin", "endorphins", "adrenaline"],
    roles: ["lead", "support", "amplifier", "disruptor"],
    meters: [88, 56, 30, 12],
  },
  "explorer-of-edges": {
    order: ["dopamine", "adrenaline", "endorphins", "oxytocin"],
    roles: ["lead", "support", "amplifier", "settler"],
    meters: [88, 56, 30, 12],
  },
  "curious-apprentice": {
    order: ["dopamine", "oxytocin", "endorphins", "adrenaline"],
    roles: ["lead", "support", "amplifier", "disruptor"],
    meters: [88, 56, 30, 12],
  },
  "tender-devotee": {
    order: ["oxytocin", "dopamine", "endorphins", "adrenaline"],
    roles: ["lead", "support", "amplifier", "disruptor"],
    meters: [88, 56, 30, 12],
  },
  "authority-conductor": {
    order: ["dopamine", "adrenaline", "oxytocin", "endorphins"],
    roles: ["lead", "support", "amplifier", "settler"],
    meters: [88, 56, 30, 12],
  },
  "analytical-sexualist": {
    order: ["dopamine", "oxytocin", "endorphins", "adrenaline"],
    roles: ["lead", "support", "amplifier", "disruptor"],
    meters: [88, 56, 30, 12],
  },
  "emotional-voyeur": {
    order: ["dopamine", "endorphins", "oxytocin", "adrenaline"],
    roles: ["lead", "support", "amplifier", "disruptor"],
    meters: [88, 56, 30, 12],
  },
  "loyal-ritualist": {
    order: ["oxytocin", "endorphins", "dopamine", "adrenaline"],
    roles: ["lead", "support", "amplifier", "disruptor"],
    meters: [88, 56, 30, 12],
  },
  "minimalist-companion": {
    order: ["endorphins", "oxytocin", "dopamine", "adrenaline"],
    roles: ["lead", "support", "amplifier", "disruptor"],
    meters: [88, 56, 30, 12],
  },
  "quiet-withdrawer": {
    order: ["endorphins", "oxytocin", "dopamine", "adrenaline"],
    roles: ["lead", "support", "amplifier", "disruptor"],
    meters: [88, 56, 30, 12],
  },
};

export function getRewardProfile(slug: string | null | undefined): RewardProfile | null {
  if (!slug) return null;
  return Object.prototype.hasOwnProperty.call(REWARD_BY_SLUG, slug)
    ? (REWARD_BY_SLUG[slug] ?? null)
    : null;
}
