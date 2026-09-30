import { standardSignOff } from "../logic/signoff";
import type { InstrumentDefinition } from "../logic/types";

const safety = undefined;

/**
 * Brief Fear of Negative Evaluation Scale (Leary 1983), the fear-of-disapproval backbone of
 * Mark's "Boundaries & People-Pleasing", second of 26 in his portfolio matrix, and of three
 * more candidates in it (Friendship Patterns, Perfectionism & Standards, Creative Self-Concept).
 *
 * A draft for two reasons. The license: the University of Salford's questionnaire catalogue
 * says "No restrictions", but that is a catalogue, not the rights holder, and nobody has asked
 * Mark Leary or Sage (the journal's publisher) about commercial digital use. The form: Leary's
 * printed form is not openly available, so the wording is pinned to the open-access study that
 * reprints every item (Tavoli et al. 2009, CC BY), and the validators check it against Leary.
 * The four items that describe the absence of worry (2, 4, 7 and 10, the study's Table 4) are
 * scored in reverse and the total is the sum, as the literature reports Leary's scoring; the
 * validators confirm both against the paper. The source gives no cutoffs; the bands are equal
 * thirds of the range, ours.
 */
const definition: Omit<InstrumentDefinition, "signOff"> = {
  id: "bfne",
  name: "Brief Fear of Negative Evaluation Scale",
  shortName: "BFNE",
  version: "0.1.0",
  status: "draft",
  construct: "fear of negative evaluation",
  humangraph: "anxiety",
  purpose: "screening",
  license: {
    kind: "unknown",
    terms:
      "The University of Salford's questionnaire catalogue lists \"Copyright restrictions: No restrictions.\" It is not the rights holder: Mark Leary and Sage, the journal's publisher, have not been asked about commercial digital use.",
    source:
      "https://hub.salford.ac.uk/psytech/equipment-resources/questionnaire-battery/brief-fear-of-negative-evaluation-scale/",
  },
  form: {
    title:
      "Brief Fear of Negative Evaluation Scale items, as reprinted in Tavoli et al. 2009, Table 4",
    url: "https://doi.org/10.1186/1471-244X-9-42",
    retrieved: "2026-09-30",
    adaptation:
      'The items come from a table in an open-access validation study, not from Leary\'s printed form, which is not openly available: check them against Leary (1983). The study gives the scale only as running from 1 "Not at all" to 5 "Extremely", so 2, 3 and 4 carry their numbers, and it prints no instructions, so ours say only how to answer.',
  },
  bandsFrom: "ours",
  citations: [
    {
      text: "Leary MR. A brief version of the Fear of Negative Evaluation Scale. Personality and Social Psychology Bulletin. 1983;9(3):371-375.",
      doi: "10.1177/0146167283093007",
    },
    {
      text: "Tavoli A, Melyani M, Bakhtiari M, Ghaedi GH, Montazeri A. The Brief Fear of Negative Evaluation Scale (BFNE): translation and validation study of the Iranian version. BMC Psychiatry. 2009;9:42.",
      doi: "10.1186/1471-244X-9-42",
    },
  ],
  instructions: "For each statement, choose how much it describes you.",
  scale: [
    { value: 1, label: "Not at all" },
    { value: 2, label: "2" },
    { value: 3, label: "3" },
    { value: 4, label: "4" },
    { value: 5, label: "Extremely" },
  ],
  items: [
    {
      id: "bfne_1",
      text: "I worry about what other people will think of me even when I know it doesn't make any difference.",
    },
    {
      id: "bfne_2",
      text: "I am unconcerned even if I know people are forming an unfavorable impression of me.",
      reverse: true,
    },
    { id: "bfne_3", text: "I am frequently afraid of other people noticing my shortcomings." },
    {
      id: "bfne_4",
      text: "I rarely worry about what kind of impression I am making on someone.",
      reverse: true,
    },
    { id: "bfne_5", text: "I am afraid that others will not approve of me." },
    { id: "bfne_6", text: "I am afraid that people will find fault with me." },
    { id: "bfne_7", text: "Other people's opinions of me do not bother me.", reverse: true },
    {
      id: "bfne_8",
      text: "When I am talking to someone, I worry about what they may be thinking about me.",
    },
    { id: "bfne_9", text: "I am usually worried about what kind of impression I make." },
    {
      id: "bfne_10",
      text: "If I know someone is judging me, it has little effect on me.",
      reverse: true,
    },
    {
      id: "bfne_11",
      text: "Sometimes I think I am too concerned with what other people think of me.",
    },
    { id: "bfne_12", text: "I often worry that I will say or do the wrong things." },
  ],
  scoring: { method: "sum" },
  bands: [
    {
      min: 12,
      max: 27,
      label: "Less worry about being judged",
      summary: "Your answers suggest you do not worry much about what others think of you.",
      nextStep: "Keep doing what works for you. Check again if that changes.",
    },
    {
      min: 28,
      max: 43,
      label: "Some worry about being judged",
      summary:
        "Your answers suggest you sometimes worry about what others think of you. That is common.",
      nextStep:
        "Notice which moments bring the worry up. Naming it can take some of its power away.",
    },
    {
      min: 44,
      max: 60,
      label: "A lot of worry about being judged",
      summary:
        "Your answers suggest you often worry about how others judge you. Many people feel this.",
      nextStep:
        "If this worry holds you back, talking it through with a therapist can help. It is a common reason people seek support.",
    },
  ],
  safety,
};

export const bfne: InstrumentDefinition = {
  ...definition,
  signOff: standardSignOff(definition),
};
