import { standardSignOff } from "../logic/signoff";
import type { InstrumentDefinition } from "../logic/types";

const safety = undefined;

/**
 * Self-Compassion Scale, Short Form (Raes, Pommier, Neff and Van Gucht 2011), the
 * self-compassion backbone of Mark's "The Inner Critic", first of 26 in his portfolio matrix
 * (18 Sep 2026). Wording, answers and scoring are from Neff's own information sheet, which
 * grants use "for any purpose whatsoever". Its bands are the sheet's "ad hoc rubric": the
 * sheet says there are no clinical norms, and our copy does not pretend there are.
 *
 * The sheet averages the six two-item subscale means. With two items in every subscale that
 * is the same number as the mean of all twelve, which is what the engine computes (a test
 * checks the two agree).
 */
const definition: Omit<InstrumentDefinition, "signOff"> = {
  id: "scssf",
  name: "Self-Compassion Scale, Short Form",
  shortName: "SCS-SF",
  version: "0.1.0",
  status: "in-validation",
  construct: "self-compassion",
  humangraph: "self",
  purpose: "screening",
  license: {
    kind: "attribution",
    terms:
      'Dr. Kristin Neff "grants permission to use the Self-Compassion Scale Short Form (Raes et al., 2011) for any purpose whatsoever, including research, clinical work, teaching, etc.", asking that it be cited.',
    source: "https://self-compassion.org/wp-content/uploads/2021/03/SCS-SF-information.pdf",
    attribution:
      "Raes, F., Pommier, E., Neff, K. D., & Van Gucht, D. (2011). Construction and factorial validation of a short form of the Self-Compassion Scale. Clinical Psychology & Psychotherapy, 18, 250-255.",
  },
  form: {
    title:
      "Self-Compassion Scale Short Form (SCS-SF): How I typically act towards myself in difficult times",
    url: "https://self-compassion.org/wp-content/uploads/2021/03/SCS-SF-information.pdf",
    retrieved: "2026-09-30",
  },
  bandsFrom: "source",
  citations: [
    {
      text: "Raes F, Pommier E, Neff KD, Van Gucht D. Construction and factorial validation of a short form of the Self-Compassion Scale. Clinical Psychology & Psychotherapy. 2011;18(3):250-255.",
      doi: "10.1002/cpp.702",
    },
    {
      text: "Neff KD. Self-Compassion Scale Short Form (SCS-SF): permission, the form, the scoring key and norms. self-compassion.org.",
      url: "https://self-compassion.org/wp-content/uploads/2021/03/SCS-SF-information.pdf",
    },
  ],
  instructions:
    "Please read each statement carefully before answering. Indicate how often you behave in the stated manner, using the following scale:",
  // The form labels only the ends of the scale; 2, 3 and 4 carry their numbers, as it prints them.
  scale: [
    { value: 1, label: "Almost never" },
    { value: 2, label: "2" },
    { value: 3, label: "3" },
    { value: 4, label: "4" },
    { value: 5, label: "Almost always" },
  ],
  // Word for word, the form's curly apostrophes and item 8's missing full stop included.
  items: [
    {
      id: "scssf_1",
      text: "When I fail at something important to me I become consumed by feelings of inadequacy.",
      reverse: true,
    },
    {
      id: "scssf_2",
      text: "I try to be understanding and patient towards those aspects of my personality I don’t like.",
    },
    {
      id: "scssf_3",
      text: "When something painful happens I try to take a balanced view of the situation.",
    },
    {
      id: "scssf_4",
      text: "When I’m feeling down, I tend to feel like most other people are probably happier than I am.",
      reverse: true,
    },
    { id: "scssf_5", text: "I try to see my failings as part of the human condition." },
    {
      id: "scssf_6",
      text: "When I’m going through a very hard time, I give myself the caring and tenderness I need.",
    },
    { id: "scssf_7", text: "When something upsets me I try to keep my emotions in balance." },
    {
      id: "scssf_8",
      text: "When I fail at something that’s important to me, I tend to feel alone in my failure",
      reverse: true,
    },
    {
      id: "scssf_9",
      text: "When I’m feeling down I tend to obsess and fixate on everything that’s wrong.",
      reverse: true,
    },
    {
      id: "scssf_10",
      text: "When I feel inadequate in some way, I try to remind myself that feelings of inadequacy are shared by most people.",
    },
    {
      id: "scssf_11",
      text: "I’m disapproving and judgmental about my own flaws and inadequacies.",
      reverse: true,
    },
    {
      id: "scssf_12",
      text: "I’m intolerant and impatient towards those aspects of my personality I don’t like.",
      reverse: true,
    },
  ],
  scoring: { method: "mean" },
  // The sheet's rubric: 1.0-2.49 low, 2.5-3.5 moderate, 3.51-5.0 high. Every mean a person
  // can get is a twelfth, and none falls in the gaps between those ranges.
  bands: [
    {
      min: 1,
      max: 2.49,
      label: "Low",
      summary:
        "Your answers suggest you are often hard on yourself when things go wrong. This is a rough guide, not a clinical score.",
      nextStep:
        "When you slip up, try talking to yourself the way you would talk to a good friend. If this is hard to change on your own, a therapist can help.",
    },
    {
      min: 2.5,
      max: 3.5,
      label: "Moderate",
      summary:
        "Your answers suggest you are kind to yourself some of the time, and hard on yourself at other times.",
      nextStep:
        "Notice what you say to yourself on a hard day. Small changes in that voice can make a real difference.",
    },
    {
      min: 3.51,
      max: 5,
      label: "High",
      summary: "Your answers suggest you tend to treat yourself with care when things go wrong.",
      nextStep: "Keep doing what helps you. It can carry you through the harder days too.",
    },
  ],
  safety,
};

export const scssf: InstrumentDefinition = {
  ...definition,
  signOff: standardSignOff(definition),
};
