import type { ReportSection } from "@/data/report-general";

const TITLE_OVERRIDES: Record<string, string> = {
  summary: "Summary of the {{CORE_ARCHETYPE}}",
  about_fantasies_desire_amp_pleasure_per_context: "About Fantasies, Desire & Pleasure by Context",
  typical_challenges_to_sustain_partner_for_the_core_archetype:
    "Typical Challenges in Sustaining Partnership for the {{CORE_ARCHETYPE}}",
};

// Keys MUST match the section.id slugs in `data/report-general.ts` exactly —
// previous long-form keys silently fell through to `section.title` for any
// section whose generated id was shorter than the override key, so the
// sidebar showed full long titles for the affected chapters.
const NAV_TITLE_OVERRIDES: Record<string, string> = {
  summary: "Summary",
  the_loveiq_concept: "LoveIQ Concept",
  probability_of_other_archetypes: "Other Archetypes",
  the_importance_of_sexuality: "Importance of Sexuality",
  attachment_style: "Attachment Style",
  core_insecurities: "Core Insecurities",
  confidence_level: "Confidence Level",
  typical_beliefs: "Typical Beliefs",
  biochemical_reward_system_dynamics: "Reward System",
  energy_level: "Energy Level",
  risk_orientation: "Risk Orientation",
  power_orientation: "Power Orientation",
  curiosity_level: "Curiosity Level",
  relationship_form_preference: "Relationship Form",
  communication_style: "Communication Style",
  love_language: "Love Language",
  background_know_how_arousal_desire_and_pleasure: "Arousal, Desire & Pleasure",
  arousal_style: "Arousal Style",
  initiation_style: "Initiation Style",
  typical_arousal_accelerators_turn_ons_of_the_core_archetype: "Arousal Accelerators",
  typical_arousal_brakes_turn_offs_of_the_core_archetype: "Arousal Brakes",
  about_fantasies_desire_amp_pleasure_per_context: "Fantasies by Context",
  about_living_or_not_living_fantasies: "Living Fantasies",
  typical_sexual_fantasy_amp_practice_tendencies: "Fantasy & Practice",
  libido_challenges_in_relationships: "Libido Challenges",
  typical_challenges_to_enjoy_sex_for_the_core_archetype: "Challenges to Enjoy Sex",
  typical_challenges_to_sustain_partner_for_the_core_archetype: "Challenges in Partnership",
  typical_growth_potentials_for_the_core_archetype: "Growth Potentials",
};

function decodeTitleEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function injectArchetype(value: string, primaryArchetype: string) {
  return value.replace(/\{\{CORE_ARCHETYPE\}\}/g, primaryArchetype);
}

export function resolveReportSectionTitle(section: ReportSection, primaryArchetype: string) {
  const template = TITLE_OVERRIDES[section.id] ?? section.title;
  return decodeTitleEntities(injectArchetype(template, primaryArchetype));
}

export function resolveReportNavTitle(section: ReportSection, primaryArchetype: string) {
  const template = NAV_TITLE_OVERRIDES[section.id] ?? TITLE_OVERRIDES[section.id] ?? section.title;
  return decodeTitleEntities(injectArchetype(template, primaryArchetype));
}
