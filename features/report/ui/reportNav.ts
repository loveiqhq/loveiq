// Curated Report 2.0 sidebar navigation (Figma 8719:9326 "Aside").
//
// The nav is a fixed, editorially-grouped structure — four "Parts", each with a
// gradient header and a short list of items. It intentionally combines,
// renames, and omits sections relative to the raw report section list
// (`data/report-general.ts`): e.g. "Energy & Risk" → `energy_level`,
// "Curiosity & Relationship Form" → `curiosity_level`, and intro sections
// (Welcome, LoveIQ Concept, Core Motivation) are not listed. So it is defined
// explicitly here rather than derived from the dynamic list, and is shared by
// both the desktop sidebar and the mobile drawer so they never drift.
//
// Each `id` is a live DOM anchor on the report page (`#<id>`), verified against
// the rendered report — including the redesign-added anchors `snapshot`, `map`,
// and `constellation`.

/**
 * Sections carried over from the pre-2.0 report that the Report 2.0 Figma
 * (unlocked `8427:651` / locked `8988:15822`) does not contain. The redesigned
 * page starts at the Part I divider, so these no longer render.
 *
 * They stay in `data/report-general.ts` on purpose — that list is also the
 * section contract for the copy pipeline and for historical reports — so this
 * is a render-time filter, not a data deletion.
 *
 * Each entry is either an intro the redesign dropped, or content it folded into
 * a combined section:
 *   welcome, the_loveiq_concept, core_motivation, communication_style
 *                                   → dropped outright
 *   background_know_how…            → REINSTATED 2026-08-26 as "Arousal, Desire
 *                                     & Pleasure" (Part III, free, universal);
 *                                     rendered by `KnowHowSection`, not by its
 *                                     `generalContent` HTML
 *   probability_of_other_archetypes → "Other Archetypes" (constellation)
 *   risk_orientation                → "Energy & Risk"
 *   relationship_form_preference    → "Curiosity & Relationship Form"
 *   typical_arousal_brakes…         → "Accelerators & Brakes"
 *   about_fantasies…, about_living… → "Fantasy vs. Reality"
 */
export const RETIRED_REPORT_SECTION_IDS: ReadonlySet<string> = new Set([
  "welcome",
  "the_loveiq_concept",
  "probability_of_other_archetypes",
  "core_motivation",
  "risk_orientation",
  "relationship_form_preference",
  "communication_style",
  "typical_arousal_brakes_turn_offs_of_the_core_archetype",
  "about_fantasies_desire_amp_pleasure_per_context",
  "about_living_or_not_living_fantasies",
  // Superseded by the Report 2.0 Partnership section, which renders at the
  // `challenges_in_partnership` anchor. Both were rendering — the redesigned
  // one plus this legacy duplicate below it.
  "typical_challenges_to_sustain_partner_for_the_core_archetype",
  /*
   * The legacy "Summary of the {{CORE_ARCHETYPE}}" chapter. Not in the Report 2.0
   * Figma at all, and its copy (`data/report-summary.ts`) is the pre-2.0 THIRD
   * PERSON voice ("Experiences sexuality primarily as a space for…"), which reads
   * wrong in a report that speaks to the reader throughout. Figma's own summary is
   * "What this means for you" under the Hero (8719:8865) — a different block.
   */
  "summary",
  /*
   * "Typical Challenges to Enjoy Sex". Absent from the newest Report 2.0 Figma —
   * the Part IV flow goes Libido Challenges → Challenges in Partnership → Growth
   * Potentials. It had been kept on the grounds that its copy exists for all 14,
   * but the current design is the source of truth: had it belonged, it would be
   * in the frames. Its copy stays in `report2-copy.ts` under `enjoy` if it is
   * ever reinstated.
   */
  "typical_challenges_to_enjoy_sex_for_the_core_archetype",
]);

/**
 * Canonical BODY order, taken from the Figma part containers on the unlocked
 * page `8427:651` (Part I `8427:800`, II `8427:1446`, III `8427:1757` +
 * `8427:2346`, IV `8427:2560`).
 *
 * The report used to render in `sectionNumber` order, which does NOT match the
 * design: Beliefs came LAST in Part II instead of first, and Accelerators &
 * Brakes rendered in Part III entirely — two parts away from where it belongs.
 * The nav (`REPORT_NAV_PARTS`) was already correct because it was built from
 * Figma directly, so nav and body disagreed with each other as well.
 *
 * Ids not listed here keep their relative `sectionNumber` order and sort after
 * everything listed, so adding a section can never silently vanish.
 *
 * Sections that render INLINE inside another section's branch are absent on
 * purpose — they follow their host: `snapshot` / `means_for_you` / `findings` /
 * `map` ride Core Archetype, and `challenges_in_partnership` rides Libido.
 */
export const REPORT_SECTION_ORDER: readonly string[] = [
  // Part I — Your core archetype
  "core_archetype",
  // Importance moved AHEAD of Sexual Stage on 2026-08-24: it is the chapter that
  // says how much weight sex carries for this reader at all, so it frames the
  // stage rather than trailing it.
  "the_importance_of_sexuality",
  "sexual_stage",
  "constellation",
  // Part II — How you work
  "typical_beliefs",
  "typical_arousal_accelerators_turn_ons_of_the_core_archetype",
  "attachment_style",
  "core_insecurities",
  "confidence_level",
  // Part III — Your erotic engine
  "biochemical_reward_system_dynamics",
  "energy_level",
  "power_orientation",
  "curiosity_level",
  "love_language",
  // Chapter 20, reinstated 2026-08-26. Placed where the source document has it:
  // after Love Language and immediately before Arousal Style, so the three
  // systems are named before the chapter that describes how the reader's own
  // arousal comes online.
  "background_know_how_arousal_desire_and_pleasure",
  "arousal_style",
  "initiation_style",
  "typical_sexual_fantasy_amp_practice_tendencies",
  // Part IV — Your growth edges
  "libido_challenges_in_relationships",
  "typical_growth_potentials_for_the_core_archetype",
  "recommendations",
  // "summary" retired — see RETIRED_REPORT_SECTION_IDS above.
];

/** Section id that each part divider is rendered BEFORE. */
export const REPORT_PART_FIRST_SECTION = {
  partI: "core_archetype",
  partII: "typical_beliefs",
  partIII: "biochemical_reward_system_dynamics",
  partIV: "libido_challenges_in_relationships",
} as const;

export interface ReportNavItem {
  label: string;
  /** The live DOM anchor scrolled to (`#<id>`). */
  id: string;
  /**
   * Section id whose access gate governs this item, when the anchor itself has
   * no row in `data/report-general.ts`. Report 2.0 added anchors that render
   * inline inside another section's branch and share its gate — without this
   * they'd resolve to no section and fall back to a `FREE` badge, mislabelling
   * a paid chapter. Defaults to `id`.
   */
  gateId?: string;
}

export interface ReportNavPart {
  /** "Part I" … "Part IV" — rendered before the middot. */
  part: string;
  /** The part's name — rendered after the middot (uppercased via CSS). */
  label: string;
  items: ReportNavItem[];
}

export const REPORT_NAV_PARTS: readonly ReportNavPart[] = [
  {
    part: "Part I",
    label: "Your core archetype",
    items: [
      { label: "Core Archetype", id: "core_archetype" },
      { label: "Your Snapshot", id: "snapshot" },
      { label: "Your Insight Map", id: "map" },
      { label: "Importance of Sexuality", id: "the_importance_of_sexuality" },
      { label: "Sexual Stage", id: "sexual_stage" },
      { label: "Other Archetypes", id: "constellation" },
    ],
  },
  {
    part: "Part II",
    label: "How you work",
    items: [
      { label: "Typical Beliefs", id: "typical_beliefs" },
      {
        label: "Accelerators & Brakes",
        id: "typical_arousal_accelerators_turn_ons_of_the_core_archetype",
      },
      { label: "Attachment Style", id: "attachment_style" },
      { label: "Core Insecurities", id: "core_insecurities" },
      { label: "Confidence Level", id: "confidence_level" },
    ],
  },
  {
    part: "Part III",
    label: "Your erotic engine",
    items: [
      { label: "Reward System", id: "biochemical_reward_system_dynamics" },
      { label: "Energy & Risk", id: "energy_level" },
      { label: "Power Orientation", id: "power_orientation" },
      { label: "Curiosity & Relationship Form", id: "curiosity_level" },
      { label: "Love Language", id: "love_language" },
      {
        label: "Arousal, Desire & Pleasure",
        id: "background_know_how_arousal_desire_and_pleasure",
      },
      { label: "Arousal Style", id: "arousal_style" },
      { label: "Initiation Style", id: "initiation_style" },
      { label: "Fantasy vs. Reality", id: "typical_sexual_fantasy_amp_practice_tendencies" },
    ],
  },
  {
    part: "Part IV",
    label: "Your growth edges",
    items: [
      { label: "Libido Challenges", id: "libido_challenges_in_relationships" },
      {
        // Report 2.0 Partnership (Figma 8427:2619). Renders inline after Libido
        // and shares its full_report gate — the pre-2.0
        // `typical_challenges_to_sustain_partner_…` section it replaces is
        // retired below, so this must point at the new anchor or the nav links
        // to a section that no longer exists.
        label: "Challenges in Partnership",
        id: "challenges_in_partnership",
        gateId: "libido_challenges_in_relationships",
      },
      { label: "Growth Potentials", id: "typical_growth_potentials_for_the_core_archetype" },
      { label: "Reading Recommendations", id: "recommendations" },
    ],
  },
];

/**
 * Every nav anchor, in nav order — the flat form of {@link REPORT_NAV_PARTS}.
 *
 * This is what the scroll-spy walks. It used to walk the SECTION list from
 * `data/report-general.ts`, which contains none of the Report 2.0 anchors the nav
 * actually lists (`snapshot`, `map`, `constellation`, and the inline
 * `means_for_you` / `findings` / `challenges_in_partnership`). So through the whole
 * of Part I the highlight lagged: the sidebar said "Core Archetype" while the
 * reader was on Your Snapshot, Five Things or the Insight Map (225px to 3787px of
 * page), and said "Importance of Sexuality" while they were on Other Archetypes.
 * Spying on the nav's own ids means the active id is always a row the nav can
 * actually highlight.
 */
export const REPORT_NAV_IDS: readonly string[] = REPORT_NAV_PARTS.flatMap((part) =>
  part.items.map((item) => item.id)
);
