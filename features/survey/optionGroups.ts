import type { SurveyQuestion } from "@/data/survey-data";

/**
 * Option groups: a multi-select's options shown under collapsible category headings.
 *
 * WHY THIS LIVES IN CODE AND NOT IN `data/survey-source.csv`. The same reason as the flags
 * in `questionFlags.ts`: the CSV is exported from an upstream "Assessment Questions" sheet,
 * and a grouping column there could be dropped by the next export, taking every category
 * with it and leaving no error behind. Grouping is also presentation, not content. It
 * changes how the options are laid out, never which options exist or what is stored.
 *
 * 16016 (C9, "Beyond sex, which of these would you most want to understand about
 * yourself?") is the one grouped question. The Archetype Machine teardown specified
 * thirteen collapsible category headers for it; it first shipped as one flat list of 53
 * (bf47ed6a) because `SurveyQuestion.options` had no grouping concept. The categories and
 * their membership are the teardown's (D1). The authored CSV already lists the 53 topics in
 * exactly these blocks, and the challenge taxonomy in the ontology model files every one of
 * them the same way.
 *
 * Every label must match `question.options` EXACTLY: `submit_survey` resolves a pick to its
 * `answer_option` by exact text. `optionGroupsFor` refuses a grouping that does not cover
 * the question's options one-for-one, and `optionGroups.test.ts` fails CI when that happens,
 * so a reworded topic can never vanish from the page. The question falls back to the flat
 * list instead.
 */
export interface OptionGroup {
  readonly label: string;
  readonly options: readonly string[];
}

export const OPTION_GROUPS: ReadonlyMap<string, readonly OptionGroup[]> = new Map([
  [
    "16016",
    [
      {
        label: "Mood & Energy",
        options: [
          "Low mood & loss of interest",
          "Low energy & motivation",
          "Low self-worth & confidence",
          "Feeling numb or disconnected",
        ],
      },
      {
        label: "Anxiety & Worry",
        options: [
          "Anxiety, tension & worry",
          "Fear of judgement in social situations",
          "Perfectionism & fear of failure",
        ],
      },
      {
        label: "Emotions & Impulses",
        options: [
          "Anger & irritability",
          "Emotions that overwhelm",
          "Rapid mood swings",
          "Feeling empty inside",
        ],
      },
      {
        label: "Trauma & Stress",
        options: [
          "Past stress echoing now",
          "Burnout & chronic stress",
          "Grief & loss",
          "Shame carried from the past",
        ],
      },
      {
        label: "Sleep & Body",
        options: [
          "Poor or broken sleep",
          "Constant fatigue & exhaustion",
          "Stress showing up in the body",
          "Changes in appetite & eating",
        ],
      },
      {
        label: "Focus & Routines",
        options: [
          "Trouble focusing & follow-through",
          "Procrastination & avoidance",
          "Overwhelmed by everyday tasks",
        ],
      },
      {
        label: "Relationships & Closeness",
        options: [
          "Distance in my relationship",
          "Conflict & arguments that escalate",
          "Loneliness & isolation",
          "Pulling close, then away",
          "Trouble saying no & setting boundaries",
          "Trouble trusting others",
        ],
      },
      {
        label: "Intimacy & Desire",
        options: [
          "Mismatched desire with a partner",
          "Body image & feeling comfortable",
          "Shame about sex",
        ],
      },
      {
        label: "Dating & Finding Love",
        options: [
          "Dating feels exhausting",
          "Fear of rejection when making a move",
          "Repeating the same relationship pattern",
          "Being single when you don't want to be",
          "Doubts about committing",
        ],
      },
      {
        label: "Family & Parenting",
        options: [
          "Tension with parents or family",
          "Parenting stress & feeling stretched",
          "Co-parenting after separation",
          "Caring for someone who depends on you",
          "Fertility, pregnancy & becoming a parent",
        ],
      },
      {
        label: "Work, Purpose & Money",
        options: [
          "A difficult workplace",
          "Money worries",
          "Feeling stuck in your career",
          "Money conflict with a partner",
          "Feeling like a fraud at work",
        ],
      },
      {
        label: "Habits & Dependencies",
        options: ["Drinking more than you want to", "Scrolling, gaming & screens"],
      },
      {
        label: "Change, Identity & Meaning",
        options: [
          "Adjusting to a big life change",
          "Not knowing who you are",
          "Life feels without meaning",
          "Feeling wired differently from others",
          "Not feeling like you belong",
        ],
      },
    ],
  ],
]);

/**
 * The categories for `question`, or `undefined` when it is not grouped.
 *
 * Also `undefined` when the grouping no longer covers the question's options one-for-one:
 * same count, no duplicates, no label the question does not have. Rendering flat is always
 * safe; rendering a grouping that has drifted from the data would hide a topic.
 */
export function optionGroupsFor(
  question: Pick<SurveyQuestion, "qId" | "options">
): readonly OptionGroup[] | undefined {
  const groups = OPTION_GROUPS.get(question.qId);
  if (!groups) return undefined;

  const grouped = groups.flatMap((group) => group.options);
  const own = new Set(question.options);
  const exact =
    grouped.length === question.options.length &&
    new Set(grouped).size === grouped.length &&
    grouped.every((option) => own.has(option));
  return exact ? groups : undefined;
}
