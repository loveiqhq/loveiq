/**
 * The six sexual stages — the report's stage model, and the six options of survey
 * Q16005 ("Which of these best describes where your sexuality feels right now?").
 * Shared by the Sexual Stage card (Figma 8427:1327, whose rows are this copy) and
 * the stage wheel (8435:651), so the card and the wheel can never name the
 * reader's season differently.
 *
 * `resolveStageId` maps a label back to a stage: the reader's own answer arrives
 * as one of these labels (`STAGE_CODE_TO_LABEL` in ReportPage), and the
 * per-archetype copy matrix carries its own stage phrases, four of which are one
 * of these six by name.
 */
export type StageId =
  | "recharging"
  | "repairing"
  | "awakening"
  | "expanding"
  | "grounded"
  | "evolving";

export interface Stage {
  id: StageId;
  label: string;
  shortLabel: string;
  feels: string;
  focus: string;
  thought: string;
  need: string;
  accent: string;
  eyebrowAccent: string;
}

export const STAGES: readonly Stage[] = [
  {
    id: "recharging",
    label: "Recharging / Pausing",
    shortLabel: "Recharging",
    feels: "Quieter, lower-drive, restoring",
    focus: "Rest, nervous system downshift, simplification",
    thought: "Sex feels far away right now.",
    need: "No pressure + recovery",
    accent: "#818cf8",
    eyebrowAccent: "#a5b4fc",
  },
  {
    id: "repairing",
    label: "Repairing / Reconnecting",
    shortLabel: "Repairing",
    feels: "Tender, cautious, sensitive",
    focus: "Healing shame/pain, rebuilding trust, safety in the body",
    thought: "Can I feel safe and open again?",
    need: "Safety, gentleness, repair",
    accent: "#a78bfa",
    eyebrowAccent: "#c4b5fd",
  },
  {
    id: "awakening",
    label: "Awakening / Exploring",
    shortLabel: "Awakening",
    feels: "Curious, warming up, uncertain but alive",
    focus: "Discovering desire, naming preferences, experimenting lightly",
    thought: "What do I actually like?",
    need: "Permission + low-stakes exploration",
    accent: "#c084fc",
    eyebrowAccent: "#d8b4fe",
  },
  {
    id: "expanding",
    label: "Expanding / Experimenting",
    shortLabel: "Expanding",
    feels: "Confident, expressive, more playful",
    focus: "Novelty, communication, co-creating pleasure, skill-building",
    thought: "Let\u2019s try more, what else is possible?",
    need: "Freedom + boundaries + feedback",
    accent: "#e879f9",
    eyebrowAccent: "#f0abfc",
  },
  {
    id: "grounded",
    label: "Grounded / Integrated",
    shortLabel: "Grounded",
    feels: "Steady, familiar, embodied",
    focus: "Consistency, sustainable intimacy, appreciation, rhythm",
    thought: "This works for me.",
    need: "Presence + maintenance + nuance",
    accent: "#f472b6",
    eyebrowAccent: "#f9a8d4",
  },
  {
    id: "evolving",
    label: "Evolving / Transcending",
    shortLabel: "Evolving",
    feels: "Expansive, meaningful, connected beyond the physical",
    focus: "Purpose, intimacy-as-growth, creativity/spirituality, surrender",
    thought: "This is bigger than sex.",
    need: "Integration + grounding + devotion",
    accent: "#fb7185",
    eyebrowAccent: "#fda4af",
  },
];

/**
 * Match a stage label back to its stage. Accepts the exact label
 * ("Recharging / Pausing"), the id, or a truncated form ("Recharging"), so both
 * the reader's own answer and the copy matrix's phrases resolve where they can.
 * Returns null for the ten archetype phrases that are none of the six.
 */
export function resolveStageId(userStageLabel: string | null): StageId | null {
  if (!userStageLabel) return null;
  const normalized = userStageLabel.toLowerCase().trim();
  for (const stage of STAGES) {
    if (
      normalized.startsWith(stage.id) ||
      normalized.startsWith(stage.shortLabel.toLowerCase()) ||
      normalized.includes(stage.shortLabel.toLowerCase())
    ) {
      return stage.id;
    }
  }
  return null;
}
