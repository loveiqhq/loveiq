import { standardSignOff } from "../logic/signoff";
import type { InstrumentDefinition } from "../logic/types";

const safety = undefined;

/**
 * Unmitigated Communion Scale (Fritz and Helgeson 1998), the people-pleasing core of Mark's
 * "Boundaries & People-Pleasing", second of 26 in his portfolio matrix. Wording and answers
 * as Vicki Helgeson's lab at Carnegie Mellon posts the form.
 *
 * A draft for two reasons. The license: the lab posts the form with no terms of use, and
 * nobody has asked about commercial digital use. The scoring: the form carries no key, and no
 * open copy of the 1998 paper states one. Item 2 ("I never find myself getting overly
 * involved...") runs the other way from the rest, so it is scored in reverse, and the total is
 * the mean, as the literature reports the scale. Both are inferred, not read from the source,
 * and the validators must confirm them against Fritz and Helgeson (1998). The source gives no
 * cutoffs; the bands are equal thirds of the range, ours.
 */
const definition: Omit<InstrumentDefinition, "signOff"> = {
  id: "ucs",
  name: "Unmitigated Communion Scale",
  shortName: "UCS",
  version: "0.1.0",
  status: "draft",
  construct: "unmitigated communion",
  humangraph: "attachment",
  purpose: "screening",
  license: {
    kind: "unknown",
    terms:
      "Posted by the Gender, Relationships, and Health Lab at Carnegie Mellon University (Vicki Helgeson) with no terms of use. Commercial digital use has not been asked about.",
    source:
      "https://www.cmu.edu/dietrich/psychology/gender-relationships-health/instruments/index.html",
  },
  form: {
    title:
      "Unmitigated Communion Scale, Gender, Relationships, and Health Lab, Carnegie Mellon University",
    url: "https://www.cmu.edu/dietrich/psychology/gender-relationships-health/instruments/unmitigated-communion.pdf",
    retrieved: "2026-09-30",
    adaptation:
      'The form tells the reader to circle a number from 1 to 5 under SD, D, N, A and SA; on screen those are options written out as Strongly disagree, Disagree, Neutral, Agree and Strongly agree, and "circle" becomes "choose". The form gives no scoring key: item 2 is scored in reverse because its wording runs the other way, and the total is the mean. Confirm both against Fritz and Helgeson (1998).',
  },
  bandsFrom: "ours",
  citations: [
    {
      text: "Fritz HL, Helgeson VS. Distinctions of unmitigated communion from communion: self-neglect and overinvolvement with others. Journal of Personality and Social Psychology. 1998;75(1):121-140.",
      doi: "10.1037/0022-3514.75.1.121",
    },
  ],
  instructions:
    "Using the scale below, choose the number beside each statement that indicates the extent to which you agree or disagree.",
  scale: [
    { value: 1, label: "Strongly disagree" },
    { value: 2, label: "Disagree" },
    { value: 3, label: "Neutral" },
    { value: 4, label: "Agree" },
    { value: 5, label: "Strongly agree" },
  ],
  // Word for word, the form's curly apostrophes included.
  items: [
    { id: "ucs_1", text: "I always place the needs of others above my own." },
    {
      id: "ucs_2",
      text: "I never find myself getting overly involved in others’ problems.",
      reverse: true,
    },
    { id: "ucs_3", text: "For me to be happy, I need others to be happy." },
    {
      id: "ucs_4",
      text: "I worry about how other people get along without me when I am not there.",
    },
    {
      id: "ucs_5",
      text: "I have great difficulty getting to sleep at night when other people are upset.",
    },
    {
      id: "ucs_6",
      text: "It is impossible for me to satisfy my own needs when they interfere with the needs of others.",
    },
    { id: "ucs_7", text: "I can’t say no when someone asks me for help." },
    { id: "ucs_8", text: "Even when exhausted, I will always help other people." },
    { id: "ucs_9", text: "I often worry about others’ problems." },
  ],
  scoring: { method: "mean" },
  // Every mean a person can get is a ninth; none falls in the gaps between these ranges.
  bands: [
    {
      min: 1,
      max: 2.34,
      label: "Balanced giving",
      summary: "Your answers suggest you look after your own needs as well as other people's.",
      nextStep: "Keep that balance. Check again if life gets busier or asks more of you.",
    },
    {
      min: 2.35,
      max: 3.67,
      label: "Some self-neglect",
      summary: "Your answers suggest you sometimes put others first at a cost to yourself.",
      nextStep:
        "Notice when saying yes leaves you drained. A small no, now and then, can protect your energy.",
    },
    {
      min: 3.7,
      max: 5,
      label: "Others first, often",
      summary:
        "Your answers suggest you often put other people's needs ahead of your own, even when it costs you.",
      nextStep:
        "Try one small step this week, like turning down a request you would rather not take on. A therapist can help if this feels hard.",
    },
  ],
  safety,
};

export const ucs: InstrumentDefinition = {
  ...definition,
  signOff: standardSignOff(definition),
};
