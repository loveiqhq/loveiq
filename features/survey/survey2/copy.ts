import type { SurveyQuestion } from "@/data/survey-data";

/**
 * Mark's simpler wording for Survey 2.0 (Survey Review, 19 Nov 2026: the boards with an
 * orange-dashed outline). Only 2.0 shows it; the classic survey keeps its words.
 *
 * A REWORDED OPTION KEEPS ITS STORED VALUE. `optionLabels` maps the option as stored (and
 * scored, and matched by submit_survey's answer_option rows) to the words the reader sees. His
 * to-do 3: "Keep the stored answer values the same, so scoring, boosts and the 'fantasy' pricing
 * rule still match." Every option keeps its place: each change is one label for one option.
 *
 * 01005 is left as it is: its board is still marked "to review".
 */
export type Survey2Copy = Partial<
  Pick<
    SurveyQuestion,
    | "question"
    | "guide"
    | "supportAndGuidance"
    | "formatGuidance"
    | "maxSelections"
    | "optionLabels"
    | "optionLayout"
  >
>;

export const SURVEY_2_COPY: Readonly<Record<string, Survey2Copy>> = {
  "02001": {
    optionLabels: {
      "Something happened first: touch, flirting, kissing, fantasy, closeness":
        "Once something gets me in the mood, like touch or closeness",
    },
  },
  "02002": {
    question: "I usually need touch or closeness before I feel desire.",
  },
  "02004": {
    question: "The best sex usually starts when…",
    optionLabels: {
      "I'm the one who starts things — I make the first move": "I make the first move",
      "The other person starts things — I respond to them": "they make the first move",
      "It works best when we plan it ahead and both know it's coming": "we planned it ahead",
      "It happens naturally, with no one having to start": "it just happens, no one has to start",
    },
  },
  "03003": {
    question: "Which kinds of settings most reliably turn you on?",
    optionLabels: {
      "Slow, intentional, almost ritual-like":
        "Creating the mood on purpose: lights, music, taking our time",
    },
  },
  "03005": {
    question: "When you're not in the mood, what usually changes that?",
    optionLabels: {
      "Physical stuff — touch, rhythm, build-up, body sensation": "Touch and physical build-up",
      "The right setting — low stress, privacy, time, feeling safe":
        "A calm, private moment with time",
      "Emotional closeness — warmth, affection, feeling connected":
        "Feeling emotionally close to them",
      "Something new — surprise, exploration, novelty": "Something new or surprising",
      "Skill and technique — when one of us is really good at it":
        "When one of us really knows what to do in bed",
      "My imagination — fantasy, what I'm watching, reading, or picturing":
        "Fantasies in my head, or erotic content",
      "It varies — no single thing stands out": "It varies",
    },
  },
  "03006": {
    question: "How do you like to learn what works for you in sex?",
  },
  "08006": {
    question: "When I feel pressured during sex, my arousal drops and I pull away.",
  },
  "16007": {
    question:
      "When you want to improve something important (health, relationships, confidence, your sex life), what's usually your first move?",
  },
  "16013": {
    question: "Knowing more about how I work sexually matters to me.",
  },
  "16014": {
    question: "What's in the way of better sex right now?",
    guide: "Pick the one thing that holds you back most right now.",
    supportAndGuidance: "Pick the one thing that holds you back most right now.",
    optionLabels: {
      "I'm not sure what would actually help": "I don't know what would help",
      "The person I'm with isn't on the same page or willing to engage":
        "The person I'm with won't talk about it or work on it",
      "It doesn't feel emotionally safe enough yet": "I don't yet feel safe or trusting enough",
      "Shame, self-judgment, or inner pressure": "Shame, or being hard on myself",
      "Physical pain or body issues": "Pain or other physical problems",
      "Useful support feels too expensive or hard to access":
        "Good help is too expensive or hard to find",
      "I struggle to keep going with things over time":
        "I try things, but lose motivation over time",
    },
  },
  // The topics screen of 16016 (Mark's board "16016 step 2"): only the topics inside the areas
  // picked on the screen before (`16016a`), up to three.
  "16016": {
    question: "In the areas you picked, which of these matter most to you right now?",
    guide: "This helps us decide what to build next, so there are no wrong answers.",
    supportAndGuidance: "This helps us decide what to build next, so there are no wrong answers.",
    formatGuidance: "Pick up to 3.",
    maxSelections: 3,
    optionLayout: "sections",
  },
};

/** A question as Survey 2.0 asks it: its 2.0 wording over its own, the options untouched. */
export function withSurvey2Copy(question: SurveyQuestion): SurveyQuestion {
  const copy = SURVEY_2_COPY[question.qId];
  return copy ? { ...question, ...copy } : question;
}
