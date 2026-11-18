import miraConfig from "../content/mira-config.json";
import { MIRA_SYSTEM_PROMPT } from "../content/system-prompt";
import { renderCards } from "./cards";

/**
 * Mira's instructions for one message, in two parts:
 *
 * - STABLE: Sanjin's rules, voice and safety rails, then the evidence cards. Identical for
 *   everyone, so the model provider caches it.
 * - PERSONAL: this person's coaching style and what they allowed Mira to use (their name, their
 *   Sexual Personality result). Never cached, never logged.
 *
 * The coaching style shades how Mira talks; it cannot override the rules or the voice guide
 * (Sanjin, on the canvas: "these can't override the rules and voice guide").
 */

export type StyleKey = "guidance" | "challenge" | "depth" | "practical" | "tone";
export type CoachingStyle = Partial<Record<StyleKey, number>>;

type StyleScale = {
  key: StyleKey;
  label: string;
  left: string;
  right: string;
  leftInstruction: string;
  rightInstruction: string;
};

export const STYLE_SCALES = miraConfig.styleScales as StyleScale[];

export type PersonContext = {
  name?: string | null;
  gender?: string | null;
  country?: string | null;
  archetype?: string | null;
  signedIn: boolean;
};

export const STABLE_INSTRUCTIONS = `${MIRA_SYSTEM_PROMPT.trim()}

EVIDENCE CARDS
These are the only research sources you may draw on. Cite a card by its id in your Sources line.

${renderCards()}`;

/** 1 and 2 lean left, 4 and 5 lean right, 3 (or nothing) is balanced and adds no line. */
export function styleInstructions(style: CoachingStyle | null | undefined): string[] {
  const lines: string[] = [];
  for (const scale of STYLE_SCALES) {
    const v = style?.[scale.key];
    if (typeof v !== "number" || v === 3) continue;
    const strong = v === 1 || v === 5 ? "Clearly: " : "Somewhat: ";
    lines.push(strong + (v < 3 ? scale.leftInstruction : scale.rightInstruction));
  }
  return lines;
}

export function personalInstructions(
  style: CoachingStyle | null | undefined,
  person: PersonContext
): string {
  const lines: string[] = ["ABOUT THIS CONVERSATION"];
  lines.push(
    person.signedIn
      ? "The person has a free account; this chat is kept if they chose that in Settings."
      : "The person is chatting anonymously. Do not ask for their email or name."
  );
  if (person.name) lines.push(`Their name, as they want to be called: ${person.name}.`);
  if (person.gender)
    lines.push(`Their gender, as they described it: ${person.gender}. Do not ask again.`);
  if (person.country) lines.push(`They are based in: ${person.country}.`);
  if (person.archetype) {
    lines.push(
      `Their LoveIQ Sexual Personality result is "${person.archetype}". Mention it only when it truly helps, and never as a diagnosis.`
    );
  }
  const styleLines = styleInstructions(style);
  if (styleLines.length > 0) {
    lines.push("Their coaching style (it shades how you talk; your rules and voice still apply):");
    lines.push(...styleLines.map((s) => `- ${s}`));
  }
  return lines.join("\n");
}
