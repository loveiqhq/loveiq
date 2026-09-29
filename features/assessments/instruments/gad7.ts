import { standardSignOff } from "../logic/signoff";
import type { InstrumentDefinition } from "../logic/types";

const safety = undefined;

/**
 * GAD-7, as the PHQ Screeners form prints it (its punctuation, and no difficulty question:
 * that one is on some clinic versions, not on this form). Bands from Spitzer et al. (2006).
 * The summaries and next steps are ours, for review.
 */
const definition: Omit<InstrumentDefinition, "signOff"> = {
  id: "gad7",
  name: "Generalized Anxiety Disorder 7-item scale",
  shortName: "GAD-7",
  version: "1.0.0",
  status: "in-validation",
  construct: "anxiety",
  humangraph: "anxiety",
  purpose: "screening",
  license: {
    kind: "attribution",
    terms:
      "Exempted from Pfizer's general copyright restrictions under the PHQ Screeners terms of use: no permission is needed to reproduce, translate, display or distribute, with the credit line. The terms also say responses should be verified by a clinician, which a validator must weigh for a screen people take on their own.",
    source: "https://www.phqscreeners.com",
    attribution:
      "Developed by Drs. Robert L. Spitzer, Janet B.W. Williams, Kurt Kroenke and colleagues, with an educational grant from Pfizer Inc.",
  },
  form: {
    title: "GAD-7, English, PHQ Screeners",
    url: "https://www.phqscreeners.com",
    retrieved: "2026-09-29",
  },
  bandsFrom: "source",
  citations: [
    {
      text: "Spitzer RL, Kroenke K, Williams JBW, Löwe B. A brief measure for assessing generalized anxiety disorder: the GAD-7. Archives of Internal Medicine. 2006;166(10):1092-1097.",
      doi: "10.1001/archinte.166.10.1092",
    },
  ],
  instructions:
    "Over the last 2 weeks, how often have you been bothered by the following problems?",
  scale: [
    { value: 0, label: "Not at all" },
    { value: 1, label: "Several days" },
    { value: 2, label: "More than half the days" },
    { value: 3, label: "Nearly every day" },
  ],
  items: [
    { id: "gad7_1", text: "Feeling nervous, anxious or on edge" },
    { id: "gad7_2", text: "Not being able to stop or control worrying" },
    { id: "gad7_3", text: "Worrying too much about different things" },
    { id: "gad7_4", text: "Trouble relaxing" },
    { id: "gad7_5", text: "Being so restless that it is hard to sit still" },
    { id: "gad7_6", text: "Becoming easily annoyed or irritable" },
    { id: "gad7_7", text: "Feeling afraid as if something awful might happen" },
  ],
  scoring: { method: "sum" },
  bands: [
    {
      min: 0,
      max: 4,
      label: "Minimal",
      summary: "Your answers show few signs of anxiety over the last two weeks.",
      nextStep: "You can carry on as you are. Take this check again if things change.",
    },
    {
      min: 5,
      max: 9,
      label: "Mild",
      summary:
        "Your answers show some signs of anxiety over the last two weeks. This is common, and it can come and go.",
      nextStep:
        "Small steps can help: good sleep, moving your body, and talking to someone you trust. Check again in a few weeks.",
    },
    {
      min: 10,
      max: 14,
      label: "Moderate",
      summary:
        "Your answers show a clear level of anxiety over the last two weeks. It may be getting in the way of daily life.",
      nextStep:
        "It is worth talking to a doctor or a therapist. This check is a screen, not a diagnosis, and they can tell you more.",
    },
    {
      min: 15,
      max: 21,
      label: "Severe",
      summary:
        "Your answers show a high level of anxiety over the last two weeks. That can be a lot to carry.",
      nextStep:
        "Please talk to a doctor or a therapist soon. This check is a screen, not a diagnosis, and a professional can help you find the right support.",
    },
  ],
  safety,
};

export const gad7: InstrumentDefinition = {
  ...definition,
  signOff: standardSignOff(definition),
};
