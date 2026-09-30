import { standardSignOff } from "../logic/signoff";
import type { InstrumentDefinition } from "../logic/types";

const safety = undefined;

/**
 * Rosenberg Self-Esteem Scale, the self-esteem backbone of Mark's "The Inner Critic". Wording,
 * answers and scoring as the University of Maryland's Department of Sociology prints them.
 *
 * Public domain, on the department's own notice (the banner at the top of its scale pages,
 * which is an image, so a text-only read misses it; CodeRabbit caught that on #437). Its
 * older FAQ still says the family's permission covers "educational and professional
 * research", and the notice is the later word.
 *
 * The department gives no cutoffs ("To obtain norms for a sample similar to your own, you
 * must search the academic literature"). The bands split at 15 and 25, a split often used in
 * practice and not the source's: the validators decide whether to keep it.
 */
const definition: Omit<InstrumentDefinition, "signOff"> = {
  id: "rses",
  name: "Rosenberg Self-Esteem Scale",
  shortName: "RSES",
  version: "0.1.0",
  status: "in-validation",
  construct: "self-esteem",
  humangraph: "self",
  purpose: "screening",
  license: {
    kind: "public-domain",
    terms:
      'The University of Maryland\'s notice: "The Rosenberg Self-Esteem Scale is now in the public domain, meaning you may use it without charge and without notifying the Sociology Department. This permission extends to making translations or adaptations as you see fit, consistent with traditional scholarly attribution practices."',
    source: "https://socy.umd.edu/about-us/rosenberg-self-esteem-scale",
    attribution:
      "Rosenberg, M. (1965). Society and the Adolescent Self-Image. Princeton, NJ: Princeton University Press.",
  },
  form: {
    title: "Rosenberg Self-Esteem Scale, University of Maryland Department of Sociology",
    url: "https://socy.umd.edu/about-us/using-rosenberg-self-esteem-scale",
    retrieved: "2026-09-30",
    adaptation:
      'The paper form tells the reader to circle SA, A, D or SD. On screen the four answers are options written out in full, so each "circle SA" becomes "choose Strongly agree", and the capital letters of the instructions are set in normal type.',
  },
  bandsFrom: "ours",
  citations: [
    {
      text: "Rosenberg M. Society and the Adolescent Self-Image. Revised edition. Middletown, CT: Wesleyan University Press; 1989.",
    },
    {
      text: "Rosenberg M. Society and the Adolescent Self-Image. Princeton, NJ: Princeton University Press; 1965.",
    },
  ],
  instructions:
    "Below is a list of statements dealing with your general feelings about yourself. If you strongly agree, choose Strongly agree. If you agree with the statement, choose Agree. If you disagree, choose Disagree. If you strongly disagree, choose Strongly disagree.",
  // The department's scoring: SA=3, A=2, D=1, SD=0, reversed for items 3, 5, 8, 9 and 10.
  scale: [
    { value: 3, label: "Strongly agree" },
    { value: 2, label: "Agree" },
    { value: 1, label: "Disagree" },
    { value: 0, label: "Strongly disagree" },
  ],
  items: [
    {
      id: "rses_1",
      text: "I feel that I'm a person of worth, at least on an equal plane with others.",
    },
    { id: "rses_2", text: "I feel that I have a number of good qualities." },
    { id: "rses_3", text: "All in all, I am inclined to feel that I am a failure.", reverse: true },
    { id: "rses_4", text: "I am able to do things as well as most other people." },
    { id: "rses_5", text: "I feel I do not have much to be proud of.", reverse: true },
    { id: "rses_6", text: "I take a positive attitude toward myself." },
    { id: "rses_7", text: "On the whole, I am satisfied with myself." },
    { id: "rses_8", text: "I wish I could have more respect for myself.", reverse: true },
    { id: "rses_9", text: "I certainly feel useless at times.", reverse: true },
    { id: "rses_10", text: "At times I think I am no good at all.", reverse: true },
  ],
  scoring: { method: "sum" },
  bands: [
    {
      min: 0,
      max: 14,
      label: "Lower self-esteem",
      summary: "Your answers suggest you often feel unsure of your own worth right now.",
      nextStep:
        "Try writing down one thing you did well each day this week. If these feelings weigh on you, a therapist can help.",
    },
    {
      min: 15,
      max: 25,
      label: "Middle range",
      summary:
        "Your answers suggest you feel fairly good about yourself, with some doubts at times.",
      nextStep:
        "Notice which moments bring the doubts up. That is often where a small change helps most.",
    },
    {
      min: 26,
      max: 30,
      label: "Higher self-esteem",
      summary: "Your answers suggest you feel good about who you are.",
      nextStep: "Keep doing what supports that feeling. Check again if things change.",
    },
  ],
  safety,
};

export const rses: InstrumentDefinition = {
  ...definition,
  signOff: standardSignOff(definition),
};
