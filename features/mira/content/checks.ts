/**
 * Mira's self-checks (22 Nov 2026): three short validated questionnaires a signed-in person can
 * take from Home or /mira/assessments, for self-reflection and coaching. Not for diagnosis or
 * treatment: the intended purpose is in docs/compliance/DPIA.md §7.16. Pure data and maths, so
 * the browser (the questions) and the server (the scoring it trusts) share one source.
 *
 * Rules for this file, all of it pending Sanjin's review (AGENT_README):
 * - Instructions, items and answers are each scale's published English text, word for word.
 * - Scores and bands are the published ones. Higher is worse on all three. The band copy only
 *   describes the answers ("Your answers suggest…"), never the person, never a disorder.
 * - Licences, read on 21 Nov 2026: the GAD-7 and PHQ-9 forms at phqscreeners.com say "No
 *   permission required to reproduce, translate, display or distribute", and their instruction
 *   manual calls them "in the public domain". The three-item loneliness scale has no published
 *   licence (DPIA §7.16, open point). The WHO-5 was not used: WHO publishes it under CC BY-NC-SA
 *   3.0 IGO (2024), which rules out commercial use without WHO's permission.
 *
 * The body check (Body Appreciation Scale-2, server/body-check.ts) fits this shape too (answers
 * 1 to 5, the mean as its score, no bands); it keeps its own table, route and chat card.
 */

export type CheckId = "anxiety" | "mood" | "loneliness";

export type Band = {
  id: string;
  /** The band's lowest score; it runs up to the next band's. */
  min: number;
  /** Short, for cards and the chart. */
  label: string;
  headline: string;
  /** What it can mean in daily life. */
  daily: string;
  /** What it can mean for body confidence and intimacy (Mira's domain). */
  intimacy: string;
  /** From the scale's published point for further evaluation: suggest a professional. */
  professional?: true;
  /** How Mira's context names it, only when the person allows it (server/checks.ts). */
  mira: string;
};

export type Check = {
  id: CheckId;
  /** What `mira_check.scale` stores: the instrument, so a later change of scale is a new id. */
  scale: "gad7" | "phq9" | "ucla3";
  title: string;
  /** The scale's own name. */
  name: string;
  minutes: number;
  about: string;
  instructions: string;
  items: string[];
  options: Array<{ label: string; value: number }>;
  /** Ascending by `min`; the first starts at the lowest possible score. */
  bands: Band[];
  /** The highest possible score. */
  max: number;
  /** Days after a result before the next may be taken. */
  retakeDays: number;
  /** The smallest change, in points, beyond the scale's noise; null where none is published. */
  reliableChange: number | null;
  /** An item whose every answer above the lowest opens the support lines at once. */
  crisisItem?: number;
  /** Who to talk to, on the professional step. */
  helpText: string;
  /** A practice from the body confidence guide (/mira/guide#practice-N). */
  practice: number;
  /** "Talk to Mira about this": put in the chat's message box, never sent for them. */
  starter: string;
  /** The UI's Source line. */
  source: string;
  citation: string;
  /** How the bands were set, where the scale itself sets none. */
  bandNote?: string;
};

/** The GAD-7's and PHQ-9's answers, as their forms print them. */
const HOW_OFTEN = [
  { label: "Not at all", value: 0 },
  { label: "Several days", value: 1 },
  { label: "More than half the days", value: 2 },
  { label: "Nearly every day", value: 3 },
];

export const CHECKS: readonly Check[] = [
  {
    // Spitzer RL, Kroenke K, Williams JBW, Löwe B (2006), Arch Intern Med 166:1092-1097. Items
    // and answers: the English form at phqscreeners.com. Bands: the instruction manual ("Scores
    // of 5, 10, and 15 represent cutpoints for mild, moderate, and severe anxiety"; "a
    // recommended cutpoint for further evaluation is a score of 10 or greater"). Reliable change
    // 4 points: NHS Talking Therapies manual v8 (2024), Table 9.
    id: "anxiety",
    scale: "gad7",
    title: "Anxiety check",
    name: "GAD-7",
    minutes: 2,
    about: "Seven questions about worry and tension over the last two weeks.",
    instructions:
      "Over the last 2 weeks, how often have you been bothered by the following problems?",
    items: [
      "Feeling nervous, anxious or on edge",
      "Not being able to stop or control worrying",
      "Worrying too much about different things",
      "Trouble relaxing",
      "Being so restless that it is hard to sit still",
      "Becoming easily annoyed or irritable",
      "Feeling afraid as if something awful might happen",
    ],
    options: HOW_OFTEN,
    max: 21,
    bands: [
      {
        id: "minimal",
        min: 0,
        label: "Minimal",
        headline: "Your answers suggest minimal anxiety over the last two weeks.",
        daily: "Worry hasn’t had much of a hold on your days lately.",
        intimacy:
          "A quieter mind can make it easier to stay with what your body feels, instead of watching yourself from the outside.",
        mira: "minimal anxiety",
      },
      {
        id: "mild",
        min: 5,
        label: "Mild",
        headline: "Your answers suggest mild anxiety over the last two weeks.",
        daily: "Some days have brought worry, tension or a restless mind, without it taking over.",
        intimacy:
          "Even mild anxiety can pull your attention into your head. In intimate moments that can feel like overthinking, or checking how you look.",
        mira: "mild anxiety",
      },
      {
        id: "moderate",
        min: 10,
        label: "Moderate",
        professional: true,
        headline: "Your answers suggest moderate anxiety over the last two weeks.",
        daily:
          "Worry or tension has been there on many days, and it may be making ordinary things feel harder.",
        intimacy:
          "Anxiety at this level can make it hard to relax into touch or closeness. That isn’t a failing; it’s what a body on alert does.",
        mira: "moderate anxiety",
      },
      {
        id: "severe",
        min: 15,
        label: "Severe",
        professional: true,
        headline: "Your answers suggest severe anxiety over the last two weeks.",
        daily: "Worry, tension or fear have been with you on most days. That is a lot to carry.",
        intimacy:
          "When anxiety is this strong, feeling safe in your body or close to someone can seem out of reach. With support, that can change.",
        mira: "severe anxiety",
      },
    ],
    retakeDays: 14,
    reliableChange: 4,
    helpText:
      "A doctor or a therapist can look at this with you properly, and there is good help for anxiety. If you’d like to talk to someone now, these lines listen.",
    practice: 2,
    starter:
      "I just did the anxiety check. Can we talk about how worry shows up in my body and in intimacy?",
    source: "GAD-7 (Spitzer, Kroenke, Williams and Löwe, 2006), free to use without permission.",
    citation:
      "Spitzer RL, Kroenke K, Williams JBW, Löwe B (2006). A brief measure for assessing generalized anxiety disorder: the GAD-7. Archives of Internal Medicine 166(10):1092–1097. https://doi.org/10.1001/archinte.166.10.1092",
  },
  {
    // Kroenke K, Spitzer RL, Williams JBW (2001), J Gen Intern Med 16:606-613. Items and answers:
    // the English form at phqscreeners.com (its unscored difficulty question is left out, as the
    // manual allows: "not used in calculating any PHQ score"). Bands: the manual ("Scores of 5,
    // 10, 15, and 20 represent cutpoints for mild, moderate, moderately severe and severe
    // depression"; 10 or more is its "yellow flag"). Reliable change 6 points: NHS Talking
    // Therapies manual v8 (2024), Table 9. Item 9 opens the support lines at once (crisisItem).
    id: "mood",
    scale: "phq9",
    title: "Mood check",
    name: "PHQ-9",
    minutes: 3,
    about: "Nine questions about your mood, energy and sleep over the last two weeks.",
    instructions:
      "Over the last 2 weeks, how often have you been bothered by any of the following problems?",
    items: [
      "Little interest or pleasure in doing things",
      "Feeling down, depressed, or hopeless",
      "Trouble falling or staying asleep, or sleeping too much",
      "Feeling tired or having little energy",
      "Poor appetite or overeating",
      "Feeling bad about yourself — or that you are a failure or have let yourself or your family down",
      "Trouble concentrating on things, such as reading the newspaper or watching television",
      "Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual",
      "Thoughts that you would be better off dead or of hurting yourself in some way",
    ],
    options: HOW_OFTEN,
    max: 27,
    bands: [
      {
        id: "minimal",
        min: 0,
        label: "Minimal",
        headline: "Your answers suggest minimal symptoms of depression over the last two weeks.",
        daily: "Your mood, energy and sleep seem to have been holding up.",
        intimacy: "That steadiness is a good place to work on body confidence from.",
        mira: "minimal symptoms of depression",
      },
      {
        id: "mild",
        min: 5,
        label: "Mild",
        headline: "Your answers suggest mild symptoms of depression over the last two weeks.",
        daily: "Some days have felt flat, tiring or harder than they should.",
        intimacy:
          "Low mood can come with a harsher inner voice about your body, and less interest in closeness. Both tend to ease as mood lifts.",
        mira: "mild symptoms of depression",
      },
      {
        id: "moderate",
        min: 10,
        label: "Moderate",
        professional: true,
        headline: "Your answers suggest moderate symptoms of depression over the last two weeks.",
        daily: "Low mood, tiredness or losing interest in things have been there on many days.",
        intimacy:
          "When mood is this low, desire can fade and it can be hard to feel good in your body. That is part of low mood, not a flaw in you.",
        mira: "moderate symptoms of depression",
      },
      {
        id: "moderately-severe",
        min: 15,
        label: "Moderately severe",
        professional: true,
        headline:
          "Your answers suggest moderately severe symptoms of depression over the last two weeks.",
        daily: "Things have been heavy on most days: your mood, energy, sleep or focus.",
        intimacy:
          "Closeness and pleasure can feel far away when you’re carrying this much. Support for your mood comes first, and it can help with the rest too.",
        mira: "moderately severe symptoms of depression",
      },
      {
        id: "severe",
        min: 20,
        label: "Severe",
        professional: true,
        headline: "Your answers suggest severe symptoms of depression over the last two weeks.",
        daily: "The last two weeks have been very hard, nearly every day.",
        intimacy:
          "Right now, looking after yourself matters more than working on body confidence. You deserve support with this.",
        mira: "severe symptoms of depression",
      },
    ],
    retakeDays: 14,
    reliableChange: 6,
    crisisItem: 8,
    helpText:
      "A doctor or a therapist can look at this with you properly, and low mood can get better with the right support. If you’d like to talk to someone now, these lines listen.",
    practice: 4,
    starter:
      "I just did the mood check. Can we talk about how my mood has been affecting how I feel about my body?",
    source: "PHQ-9 (Kroenke, Spitzer and Williams, 2001), free to use without permission.",
    citation:
      "Kroenke K, Spitzer RL, Williams JBW (2001). The PHQ-9: validity of a brief depression severity measure. Journal of General Internal Medicine 16(9):606–613. https://doi.org/10.1046/j.1525-1497.2001.016009606.x",
  },
  {
    // Hughes ME, Waite LJ, Hawkley LC, Cacioppo JT (2004), Research on Aging 26:655-672, Table 1:
    // the lead-in and the three questions as read to respondents, without the telephone-only
    // parts (the opening "First," and each question's read-out answers, which are the buttons
    // here). Coded 1 to 3 and summed (3 to 9). The authors set no cut-off ("There is no standard
    // accepted score for which a person would definitely be considered lonely", ONS, 2018); the
    // bands are the grouping the Campaign to End Loneliness reports researchers have used (3–5
    // "not lonely", 6–9 "lonely"). No reliable-change threshold is published for it.
    id: "loneliness",
    scale: "ucla3",
    title: "Loneliness check",
    name: "Three-Item Loneliness Scale",
    minutes: 1,
    about: "Three questions about feeling connected to other people.",
    instructions:
      "The next questions are about how you feel about different aspects of your life. For each one, tell me how often you feel that way.",
    items: [
      "How often do you feel that you lack companionship?",
      "How often do you feel left out?",
      "How often do you feel isolated from others?",
    ],
    options: [
      { label: "Hardly ever", value: 1 },
      { label: "Some of the time", value: 2 },
      { label: "Often", value: 3 },
    ],
    max: 9,
    bands: [
      {
        id: "low",
        min: 3,
        label: "Low",
        headline: "Your answers suggest loneliness hasn’t weighed on you much lately.",
        daily: "You’ve mostly felt included and connected to people.",
        intimacy:
          "Feeling connected can make it easier to be open about your body with the people you’re close to.",
        mira: "low loneliness",
      },
      {
        id: "high",
        min: 6,
        label: "High",
        professional: true,
        headline:
          "Your answers suggest you’ve been feeling lonely, left out or cut off from others.",
        daily: "Loneliness can make ordinary days feel heavier, even with people around.",
        intimacy:
          "When you feel cut off, it can be harder to trust that someone wants to be close to you, body and all.",
        mira: "high loneliness",
      },
    ],
    retakeDays: 28,
    reliableChange: null,
    helpText:
      "If loneliness has felt heavy for a while, a doctor or a counsellor can help you find a way back to people. If you’d like to talk to someone now, these lines listen.",
    practice: 5,
    starter:
      "I just did the loneliness check. Can we talk about feeling connected, and what it has to do with my body confidence?",
    source:
      "Three-Item Loneliness Scale (Hughes, Waite, Hawkley and Cacioppo, 2004), from the Revised UCLA Loneliness Scale.",
    citation:
      "Hughes ME, Waite LJ, Hawkley LC, Cacioppo JT (2004). A short scale for measuring loneliness in large surveys: results from two population-based studies. Research on Aging 26(6):655–672. https://doi.org/10.1177/0164027504268574",
    bandNote:
      "This scale has no official cut-off. Researchers have grouped scores of 3 to 5 as not lonely and 6 to 9 as lonely, and the bands here follow that.",
  },
];

export const CHECK_IDS = CHECKS.map((c) => c.id);

/** "Talk to Mira" beside the support lines the mood check's question 9 opened. */
export const SUPPORT_STARTER =
  "I just did the mood check and things feel really hard right now. Can we talk?";

/**
 * Beside the band of a result whose question 9 opened the support lines (supportNow), wherever
 * the result is shown (the cards, the history): its total can read "minimal" while that answer
 * matters most.
 */
export const SUPPORT_NOTE = "support for you";

/**
 * The chat's message box for `/mira?say=<id>`: a check's starter or the support one, put there
 * for the person to send or change; anything else puts nothing there.
 */
export const starterFor = (say: unknown): string | undefined =>
  say === "support"
    ? SUPPORT_STARTER
    : typeof say === "string"
      ? CHECKS.find((c) => c.id === say)?.starter
      : undefined;

export const checkById = (id: string): Check | undefined => CHECKS.find((c) => c.id === id);
export const checkByScale = (scale: string): Check | undefined =>
  CHECKS.find((c) => c.scale === scale);

/** One whole answer per question, each one of the scale's own values. */
export function isValidAnswers(check: Check, answers: readonly unknown[]): answers is number[] {
  return (
    answers.length === check.items.length &&
    answers.every((a) => check.options.some((o) => o.value === a))
  );
}

/** The published score of all three: the sum of the answers. */
export const scoreOf = (check: Check, answers: readonly number[]): number =>
  answers.reduce((sum, a) => sum + a, 0);

export const bandOf = (check: Check, score: number): Band =>
  check.bands.findLast((b) => score >= b.min) ?? check.bands[0]!;

/**
 * Any answer above "Not at all" on the PHQ-9's 9th question (thoughts of being better off dead or
 * of self-harm), whatever the total: the support lines open at once.
 */
export const supportNow = (check: Check, answers: readonly number[]): boolean =>
  check.crisisItem !== undefined && (answers[check.crisisItem] ?? 0) > check.options[0]!.value;

/** From one score to the next: reliable when it reaches the published threshold, null with none. */
export function changeSince(
  check: Check,
  before: number,
  after: number
): { diff: number; reliable: boolean | null } {
  const diff = after - before;
  return {
    diff,
    reliable: check.reliableChange === null ? null : Math.abs(diff) >= check.reliableChange,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** When the next result may be taken, after one taken at `at`. */
export const nextTakeAt = (check: Check, at: string | Date): Date =>
  new Date(new Date(at).getTime() + check.retakeDays * DAY_MS);
