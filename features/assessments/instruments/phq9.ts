import { standardSignOff } from "../logic/signoff";
import type { InstrumentDefinition, SafetyRule } from "../logic/types";

/**
 * Item 9 asks about thoughts of being better off dead or of self-harm. Any answer above
 * "Not at all" shows this at once, before the score, whatever the total is, and its next
 * step replaces the band's. The manual says judging risk after a positive item 9 needs a
 * clinical interview, so it also asks the person to tell a doctor. Ours, and the first
 * thing the clinical review must look at. Help lines are by country: our readers are mostly
 * in Canada, the UK, Australia, the US and New Zealand (GA4, 90 days to 2026-09-29).
 */
const safety: SafetyRule[] = [
  {
    item: "phq9_9",
    atLeast: 1,
    message:
      "You said you have had thoughts of being better off dead or of hurting yourself. You do not have to deal with this alone. If you might act on these thoughts, call your emergency number now. You can also talk to a crisis line, day or night.",
    nextStep:
      "Please also tell a doctor soon how you have been feeling, even if your other answers were low. They can talk it through with you properly.",
    resources: [
      {
        region: "US",
        lines: ["Emergency: 911", "988 Suicide and Crisis Lifeline: call or text 988"],
      },
      {
        region: "CA",
        lines: ["Emergency: 911", "9-8-8 Suicide Crisis Helpline: call or text 988"],
      },
      { region: "GB", lines: ["Emergency: 999", "Samaritans: 116 123"] },
      { region: "IE", lines: ["Emergency: 112 or 999", "Samaritans: 116 123"] },
      { region: "AU", lines: ["Emergency: 000", "Lifeline: 13 11 14"] },
      { region: "NZ", lines: ["Emergency: 111", "Need to talk?: call or text 1737"] },
      {
        region: "DE",
        lines: ["Emergency: 112", "TelefonSeelsorge: 0800 111 0 111 or 0800 111 0 222"],
      },
      {
        region: "ANY",
        lines: [
          "Your local emergency number (112 in the EU)",
          "A free, confidential helpline in your country: findahelpline.com",
        ],
      },
    ],
  },
];

/**
 * PHQ-9. Wording, answers, scoring and bands from Kroenke et al. (2001) and the PHQ
 * Screeners site. The summaries, next steps and the safety message are ours, for review.
 */
const definition: Omit<InstrumentDefinition, "signOff"> = {
  id: "phq9",
  name: "Patient Health Questionnaire-9",
  shortName: "PHQ-9",
  version: "1.0.0",
  status: "validated",
  construct: "depression",
  humangraph: "affect",
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
    title: "PHQ-9, English, PHQ Screeners",
    url: "https://www.phqscreeners.com",
    retrieved: "2026-09-29",
  },
  bandsFrom: "source",
  citations: [
    {
      text: "Kroenke K, Spitzer RL, Williams JBW. The PHQ-9: validity of a brief depression severity measure. Journal of General Internal Medicine. 2001;16(9):606-613.",
      doi: "10.1046/j.1525-1497.2001.016009606.x",
    },
    {
      text: "Kroenke K, Spitzer RL. The PHQ-9: a new depression diagnostic and severity measure. Psychiatric Annals. 2002;32(9):509-515. The band labels, including None-minimal, are from its Table 4, as the PHQ manual prints them.",
      doi: "10.3928/0048-5713-20020901-06",
    },
  ],
  instructions:
    "Over the last 2 weeks, how often have you been bothered by any of the following problems?",
  scale: [
    { value: 0, label: "Not at all" },
    { value: 1, label: "Several days" },
    { value: 2, label: "More than half the days" },
    { value: 3, label: "Nearly every day" },
  ],
  items: [
    { id: "phq9_1", text: "Little interest or pleasure in doing things" },
    { id: "phq9_2", text: "Feeling down, depressed, or hopeless" },
    { id: "phq9_3", text: "Trouble falling or staying asleep, or sleeping too much" },
    { id: "phq9_4", text: "Feeling tired or having little energy" },
    { id: "phq9_5", text: "Poor appetite or overeating" },
    {
      id: "phq9_6",
      text: "Feeling bad about yourself — or that you are a failure or have let yourself or your family down",
    },
    {
      id: "phq9_7",
      text: "Trouble concentrating on things, such as reading the newspaper or watching television",
    },
    {
      id: "phq9_8",
      text: "Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual",
    },
    {
      id: "phq9_9",
      text: "Thoughts that you would be better off dead or of hurting yourself in some way",
    },
    {
      id: "phq9_difficulty",
      text: "If you checked off any problems, how difficult have these problems made it for you to do your work, take care of things at home, or get along with other people?",
      unscored: true,
      options: [
        { value: 0, label: "Not difficult at all" },
        { value: 1, label: "Somewhat difficult" },
        { value: 2, label: "Very difficult" },
        { value: 3, label: "Extremely difficult" },
      ],
    },
  ],
  scoring: { method: "sum" },
  bands: [
    {
      min: 0,
      max: 4,
      label: "None-minimal",
      summary: "Your answers show few signs of low mood over the last two weeks.",
      nextStep: "You can carry on as you are. Take this check again if things change.",
    },
    {
      min: 5,
      max: 9,
      label: "Mild",
      summary:
        "Your answers show some signs of low mood over the last two weeks. Many people go through this.",
      nextStep:
        "Small steps can help: time outside, regular sleep, and time with people you like. Check again in a few weeks.",
    },
    {
      min: 10,
      max: 14,
      label: "Moderate",
      summary:
        "Your answers show a clear level of low mood over the last two weeks. It may be making daily life harder.",
      nextStep:
        "It is worth talking to a doctor or a therapist. This check is a screen, not a diagnosis, and they can tell you more.",
    },
    {
      min: 15,
      max: 19,
      label: "Moderately Severe",
      summary:
        "Your answers show a high level of low mood over the last two weeks. That is hard, and it is not your fault.",
      nextStep:
        "Please talk to a doctor or a therapist soon. This check is a screen, not a diagnosis, and support can make a real difference.",
    },
    {
      min: 20,
      max: 27,
      label: "Severe",
      summary:
        "Your answers show a very high level of low mood over the last two weeks. You deserve support with this.",
      nextStep:
        "Please talk to a doctor or a therapist as soon as you can. This check is a screen, not a diagnosis, and a professional can help you find the right care.",
    },
  ],
  safety,
};

/**
 * Approved by Eman Cickusic on 2026-09-30, who chose not to wait for Mark and Sanjin's
 * line-by-line review (decision:2026-09-30-f201cff6e0). A change to anything these lines
 * cover changes the fingerprint, and the gate then refuses `validated` until it is signed
 * again.
 */
export const phq9: InstrumentDefinition = {
  ...definition,
  signOff: standardSignOff(definition).map((s) => ({
    ...s,
    by: "Eman Cickusic",
    on: "2026-09-30",
  })),
  // Re-expressed on 2026-09-30, when the fingerprint began to cover the sign-off lines' own
  // wording. The old fingerprint, a38a3e3655c255a1, still matched, so what was approved is unchanged.
  signedHash: "a7ed0e7b7b72ac6b",
};
