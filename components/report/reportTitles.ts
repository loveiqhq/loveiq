import type { ReportSection } from "@/data/report-general";

export type AccessTier = "free" | "essentials" | "full_report";
export type NavType = "link" | "subheading";

export interface DisplayReportSection extends ReportSection {
  displayTitle: string;
  navTitle: string;
  accessTier: AccessTier;
  navType: NavType;
}

const TITLE_OVERRIDES: Record<string, string> = {
  about_fantasies_desire_amp_pleasure_per_context: "About Fantasies, Desire & Pleasure by Context",
  typical_challenges_to_sustain_partner_for_the_core_archetype:
    "Typical Challenges in Sustaining Partnership for the {{CORE_ARCHETYPE}}",
};

const NAV_TITLE_OVERRIDES: Record<string, string> = {
  the_loveiq_concept: "LoveIQ Concept",
  probability_of_other_archetypes: "Other Archetypes",
  the_importance_of_sexuality: "Importance of Sexuality",
  attachment_style_how_safety_closeness_and_distance_shape_desire: "Attachment Style",
  core_insecurities_the_hidden_fears_that_shape_desire_protection_and_erotic_expression:
    "Core Insecurities",
  confidence_level_how_secure_a_person_feels_in_their_sexual_self: "Confidence Level",
  typical_beliefs_how_early_learning_shapes_sexual_meaning: "Typical Beliefs",
  biochemical_reward_system_dynamics_how_neurochemistry_shapes_desire_attachment_and_sexual_motivation:
    "Reward System",
  energy_level_how_much_intensity_and_activation_sexuality_carries: "Energy Level",
  risk_orientation_how_much_uncertainty_intensity_and_exposure_a_person_needs_or_avoids:
    "Risk Orientation",
  power_orientation_how_control_surrender_and_agency_are_experienced: "Power Orientation",
  curiosity_level_how_much_exploration_learning_and_novelty_a_person_seeks: "Curiosity Level",
  relationship_form_preference_how_relational_structures_shape_safety_desire_and_erotic_continuity:
    "Relationship Form",
  communication_style_how_desire_and_needs_are_expressed: "Communication Style",
  love_language_how_affection_meaning_and_erotic_safety_are_communicated: "Love Language",
  background_know_how_arousal_desire_and_pleasure_three_different_systems_of_human_sexuality:
    "Arousal, Desire & Pleasure",
  arousal_style_how_desire_gets_activated: "Arousal Style",
  initiation_style_how_sexual_contact_gets_started: "Initiation Style",
  typical_arousal_accelerators_turn_ons_of_the_core_archetype: "Arousal Accelerators",
  typical_arousal_brakes_turn_offs_of_the_core_archetype: "Arousal Brakes",
  about_fantasies_desire_amp_pleasure_per_context: "Fantasies by Context",
  about_living_or_not_living_fantasies: "Living Fantasies",
  typical_sexual_fantasy_amp_practice_tendencies: "Fantasy & Practice",
  libido_challenges_in_relationships_when_desire_becomes_conditional: "Libido Challenges",
  typical_challenges_to_enjoy_sex_for_the_core_archetype: "Challenges to Enjoy Sex",
  typical_challenges_to_sustain_partner_for_the_core_archetype: "Challenges in Partnership",
  typical_growth_potentials_for_the_core_archetype: "Growth Potentials",
};

/** Sections that show "Essentials" badge instead of "Full Report" */
const ESSENTIALS_SECTIONS = new Set([
  "probability_of_other_archetypes",
  "core_motivation",
  "sexual_stage",
  "confidence_level_how_secure_a_person_feels_in_their_sexual_self",
]);

/** Sections rendered as category subheadings in sidebar nav */
const SUBHEADING_SECTIONS = new Set([
  "core_archetype",
  "core_motivation",
  "core_insecurities_the_hidden_fears_that_shape_desire_protection_and_erotic_expression",
]);

function resolveAccessTier(section: ReportSection): AccessTier {
  if (ESSENTIALS_SECTIONS.has(section.id)) return "essentials";
  if (section.isPremium) return "full_report";
  return "free";
}

function resolveNavType(section: ReportSection): NavType {
  return SUBHEADING_SECTIONS.has(section.id) ? "subheading" : "link";
}

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

export function resolveReportSections(
  sections: ReportSection[],
  primaryArchetype: string
): DisplayReportSection[] {
  return sections.map((section) => ({
    ...section,
    displayTitle: resolveReportSectionTitle(section, primaryArchetype),
    navTitle: resolveReportNavTitle(section, primaryArchetype),
    accessTier: resolveAccessTier(section),
    navType: resolveNavType(section),
  }));
}
