import { GUIDE_PRACTICES, SKIP_IT } from "../content/guide";
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
  /** Their goals on the go (Challenges & goals), for a gentle check-in. */
  goals?: GoalForPrompt[];
};

/** One goal on the go as Mira is told of it (server/goals.ts goalsForPrompt). */
export type GoalForPrompt = {
  /** In the person's own words. */
  text: string;
  /** Days a week they aim for, or null. */
  target: number | null;
  /** Days ticked this week (Monday to Sunday), and days since the newest tick (null: none yet). */
  thisWeek: number;
  daysSinceLast: number | null;
};

type IntakeQuestion = {
  id: string;
  question: string;
  answerType: string;
  options?: string[];
  instruction?: string;
};

/** Sanjin's intake questions, as the model needs them: wording, answers and when to ask. */
export function renderIntake(questions = miraConfig.intakeQuestions as IntakeQuestion[]): string {
  return questions
    .map((q) => {
      const answers = q.options?.length ? ` Answers: ${q.options.join(" · ")}.` : "";
      const when = q.instruction ? ` When: ${q.instruction}.` : "";
      return `- [${q.id}] ${q.question}${answers}${when}`;
    })
    .join("\n");
}

/**
 * The guide's practices as /mira/guide writes them (steps, why, the touch rule), so Mira can give
 * the steps when asked. The intros stay out: their LoveIQ figures are not on her evidence cards.
 */
export function renderGuide(practices = GUIDE_PRACTICES): string {
  return practices
    .map((p) =>
      [
        `Practice ${p.number}: ${p.name} (${p.time}; best for: ${p.bestFor}; loveiq.org/mira/guide#practice-${p.number})`,
        ...p.steps.map((s, i) => `${i + 1}. ${s}`),
        ...p.after,
        `Why it works: ${p.why} ${SKIP_IT}`,
      ].join("\n")
    )
    .join("\n\n");
}

export const STABLE_INSTRUCTIONS = `${MIRA_SYSTEM_PROMPT.trim()}

INTAKE QUESTIONS
The app invites the person to these right after your first reply (the invitation and their answer are in the conversation). Ask them one per message, in your own words.

${renderIntake()}

THE GUIDE'S PRACTICES
The body confidence guide is public, so these are not part of your instructions: when someone asks how to do a practice, give its steps as written here, as a short list.

${renderGuide()}

MARKERS FOR THE APP
The app reads these markers and removes them before the person sees your reply. Put each on its own line at the very end, after the Sources line, and never add one to a crisis reply.
- When your message asks one of the intake questions, add its marker, such as [[ASK:onset]], with the id in square brackets above. The app then shows that question's answers as buttons. One per message, and only for these questions.
- When your reply suggests a therapist, a doctor or another health professional (rails 11 and 12, or a medical review alongside coaching), add [[REFER]].
- When the person says or clearly shows that they are under 18 now (not when they talk about their past), add [[MINOR]] (rail 15). It is the one marker that also goes in a crisis reply.

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

type Topic = { id: string; label: string; example: string };

/** Marcus's topics for "Most common prompts" (MVP success board), from mira-config.json. */
export const TOPICS = miraConfig.topics as Topic[];

/**
 * Asked only with a new chat's first message in the person's own words (a starter chip is its
 * own record): the model names the topic, and only its id is kept, never the words.
 */
export function topicInstruction(): string {
  const ids = TOPICS.map((t) => `${t.id} (${t.id === "other" ? "anything else" : t.label})`);
  return [
    "FIRST MESSAGE TOPIC",
    `This is the first message of a new chat, in the person's own words. Add one marker on its own line at the very end of your reply, such as [[TOPIC:hiding]], with the id that fits their message best: ${ids.join(", ")}. Leave it out of a crisis reply.`,
  ].join("\n");
}

export function personalInstructions(
  style: CoachingStyle | null | undefined,
  person: PersonContext,
  opts: { topic?: boolean } = {}
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
  if (opts.topic) lines.push("", topicInstruction());
  return lines.join("\n");
}
