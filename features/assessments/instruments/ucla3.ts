import { standardSignOff } from "../logic/signoff";
import type { InstrumentDefinition } from "../logic/types";

const safety = undefined;

/**
 * UCLA 3-item Loneliness Scale. Wording, answers and scoring from Hughes et al. (2004),
 * which gives no cutoffs. The two bands are a split at 6, a convention in population
 * studies, not the source's: the validators decide whether to keep it. The license for
 * commercial digital use has not been checked, so this stays a draft.
 */
const definition: Omit<InstrumentDefinition, "signOff"> = {
  id: "ucla3",
  name: "Three-Item Loneliness Scale",
  shortName: "UCLA-3",
  version: "0.1.0",
  status: "draft",
  construct: "loneliness",
  humangraph: "attachment",
  purpose: "screening",
  license: {
    kind: "unknown",
    terms:
      "Derived from the Revised UCLA Loneliness Scale (Russell). Widely used in research and public surveys; permission for commercial digital use has not been checked.",
    source: "Hughes et al. 2004 (see citation); Russell, Peplau and Cutrona 1980",
  },
  form: {
    title: "Three-Item Loneliness Scale, as printed in Hughes et al. 2004",
    url: "https://doi.org/10.1177/0164027504268574",
    retrieved: "2026-09-29",
    adaptation:
      'The source is an interview script ("First, how often do you feel that you lack companionship: Hardly ever, some of the time, or often?"). For self-completion each question stands alone with the answers as options, and the interviewer\'s "tell me" becomes "choose".',
  },
  bandsFrom: "ours",
  citations: [
    {
      text: "Hughes ME, Waite LJ, Hawkley LC, Cacioppo JT. A short scale for measuring loneliness in large surveys: results from two population-based studies. Research on Aging. 2004;26(6):655-672.",
      doi: "10.1177/0164027504268574",
    },
  ],
  instructions:
    "The next questions are about how you feel about different aspects of your life. For each one, choose how often you feel that way.",
  scale: [
    { value: 1, label: "Hardly ever" },
    { value: 2, label: "Some of the time" },
    { value: 3, label: "Often" },
  ],
  items: [
    { id: "ucla3_1", text: "How often do you feel that you lack companionship?" },
    { id: "ucla3_2", text: "How often do you feel left out?" },
    { id: "ucla3_3", text: "How often do you feel isolated from others?" },
  ],
  scoring: { method: "sum" },
  bands: [
    {
      min: 3,
      max: 5,
      label: "Lonely less often",
      summary: "Your answers show that you feel lonely only now and then.",
      nextStep: "Keep up the things that connect you with others. Check again if that changes.",
    },
    {
      min: 6,
      max: 9,
      label: "Lonely more often",
      summary:
        "Your answers show that you feel lonely fairly often. Many people feel this at some point in life.",
      nextStep:
        "Small steps can help, like reaching out to one person this week. If it has lasted a long time, a therapist can help.",
    },
  ],
  safety,
};

export const ucla3: InstrumentDefinition = {
  ...definition,
  signOff: standardSignOff(definition),
};
