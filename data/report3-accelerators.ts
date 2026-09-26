/**
 * Accelerator & Brakes — the Report 3.0 chapter body, Figma "Chapter — Accelerator
 * & Brakes" (310:221 in the Part IV page 334:521), paywalled as 314:211, with its
 * "Try this & see what shifts" card (374:304 open, 377:221 closed, 375:221 gated).
 * The "Go deeper & learn more" article that closes the chapter lives with the
 * other articles in report3-learn-more.ts.
 *
 * PREMIUM. Registered in __tests__/security/premium-content-bundle.test.ts, so it
 * must never be runtime-imported from a "use client" file. The server reads it and
 * hands the chapter down as props (buildAccelerators), exactly as Typical Beliefs
 * does.
 *
 * THE COPY IS THE FRAME'S. Read off the design context node by node, including its
 * punctuation: straight apostrophes where the frame types them ("Spark Seeker's",
 * "shouldn't"), curly quotes around quoted speech, and the double space either side
 * of "how it is interpreted" (310:231), kept with a no-break space because a browser
 * collapses the second one. The rows are Sanjin's list, approved by Mark in Figma
 * on 2026-09-22. The decorative scales under them went on 25.09 (Mark, 1942039325),
 * and their fills with them.
 *
 * Chrome text — "WHAT BRAKES YOU", "WHAT ACCELERATES YOU" — lives in the client
 * component, never in this module.
 */

import {
  gate,
  splitRamp,
  veilText,
  type Report3GatedCopy,
  type Report3PracticeView,
} from "@features/report/server/gatedCopy";
import type { Report3Block } from "./report3-learn-more";
import type { Report3Run } from "./report3-archetype-page";

const t = (text: string): Report3Run => ({ text });
const b = (text: string): Report3Run => ({ text, weight: 700 });
const i = (text: string): Report3Run => ({ text, italic: true });
const bi = (text: string): Report3Run => ({ text, weight: 700, italic: true });
const p = (...runs: Report3Run[]): Report3Block => ({ kind: "para", runs });

/** One row of a trigger card: 386:219 (brakes) and 386:317 (accelerators). */
export interface Report3TriggerRow {
  /** Plus Jakarta Bold 14/22.4. */
  label: string;
  /** Plus Jakarta Regular 12/19.2 in #8f8a9c. */
  subtext: string;
}

/** Everything one archetype's chapter needs, as authored. */
export interface Report3AcceleratorsCopy {
  intro: readonly Report3Block[];
  brakesLead: string;
  brakes: readonly Report3TriggerRow[];
  acceleratorsLead: string;
  accelerators: readonly Report3TriggerRow[];
  challengesTitle: string;
  challenges: readonly Report3Block[];
  practiceEyebrow: string;
  practiceTitle: string;
  practice: readonly Report3Block[];
  /** 377:221 re-breaks the first practice paragraph for the closed card. */
  practiceTeaser: readonly Report3Block[];
}

export const REPORT_V4_ACCELERATORS: Readonly<Record<string, Report3AcceleratorsCopy>> = {
  "Spark Seeker": {
    // 310:231 — five paragraphs in a 356px box.
    intro: [
      p(
        t("Sexual desire is not controlled by a single switch. The "),
        b("Dual Control Model"),
        t(
          " offers a more useful way to understand it: sexual response is shaped by two partly independent systems working at the same time."
        )
      ),
      p(
        t("The "),
        b("accelerator"),
        t(" responds to cues that make sex feel appealing, rewarding or exciting. The "),
        b("brakes"),
        t(
          " respond to cues that give the body or mind a reason to slow down, become cautious or disengage. Desire depends on the balance between them. A strong accelerator does not guarantee strong desire if the brakes are being pressed just as hard."
        )
      ),
      p(
        t(
          "Both systems respond to much more than obvious sexual stimuli. Physical sensations, energy, fatigue, pain and bodily comfort can matter, but so can psychological and relational cues such as anticipation, confidence, privacy, pressure, trust, feeling desired, conflict or self-consciousness. Even the same situation can activate different systems depending on \u00a0how it is interpreted \u00a0at that moment."
        )
      ),
      p(
        t("For the "),
        b("Spark Seeker,"),
        t(" "),
        b("this balance tends to be especially sensitive to play, anticipation and novelty."),
        t(
          " Where some archetypes may become most receptive through familiarity, steadiness or slow emotional closeness, the Spark Seeker often responds more strongly when something feels alive: teasing, pursuit, surprise or the sense that something is about to happen."
        )
      ),
      p(
        t(
          "That does not mean the Spark Seeker needs constant extremes. It means that desire often responds to a particular kind of psychological charge."
        )
      ),
    ],

    // 311:411
    brakesLead: "For many Spark Seekers, the brakes may sound something like this",
    // 386:219 "WHAT BRAKES YOU"
    brakes: [
      {
        label: "Sex that feels predictable or obligatory",
        subtext:
          "Repeating the same sequence, especially when sex starts to feel like something that is simply expected, can drain erotic tension.",
      },
      {
        label: "Emotional heaviness during erotic moments",
        subtext:
          "Analysis, unresolved arguments or serious conversations entering the sexual space can abruptly shift attention away from play and arousal.",
      },
      {
        label: "Control and possessiveness",
        subtext:
          "Feeling monitored, restricted or managed can turn closeness into confinement and quickly reduce desire.",
      },
      {
        label: "Low-energy, passive encounters",
        subtext:
          "Sexuality that feels flat, overly cautious or without visible enthusiasm may struggle to hold the Spark Seeker's attention.",
      },
      {
        label: "Criticism, shame or judgment",
        subtext:
          "Being mocked for wanting variety, intensity or play can turn openness into self-consciousness and inhibition.",
      },
    ],

    // 311:413 — the frame's trailing space is kept; it has no width at a line end.
    acceleratorsLead: "The accelerators might be just as recognizable: ",
    // 386:317 "WHAT ACCELERATES YOU"
    accelerators: [
      {
        label: "Teasing and playful challenge",
        subtext:
          "Banter, provocative messages and playful resistance can create tension before anything sexual happens.",
      },
      {
        label: "Pursuit and being pursued",
        subtext:
          "Clear signs of attraction, flirtation and someone actively wanting access can make desire feel immediate and alive.",
      },
      {
        label: "Novelty and variation",
        subtext:
          "A new setting, idea, role, outfit or change in the usual pattern can make familiar sexuality feel newly interesting.",
      },
      {
        label: "Confident signals of desire",
        subtext:
          "Dirty talk, praise, bold initiation and unmistakable enthusiasm can strongly reinforce the feeling of being wanted.",
      },
      {
        label: "Spontaneity and controlled unpredictability",
        subtext:
          "An unexpected kiss, sudden escalation or safe sense of rule-breaking can add the uncertainty that keeps attention engaged.",
      },
    ],

    // 312:212 — the H2 and seven paragraphs, in a 361px box.
    challengesTitle: "Common challenges",
    challenges: [
      p(t("Consider something as ordinary as planning sex for Friday night.")),
      p(
        t("One of the Spark Seeker's strongest accelerators is "),
        b("anticipation"),
        t(
          ". In the right form, knowing that something erotic is coming can create days of tension. A suggestive message on Wednesday, playful restraint on Thursday, a new setting or an unanswered "
        ),
        i("“Wait until Friday”"),
        t(" can keep the accelerator building long before anyone touches.")
      ),
      p(
        t(
          "But one of the Spark Seeker's common brakes is sex that feels predictable, scheduled or obligatory."
        )
      ),
      p(
        t(
          "The same Friday plan can therefore produce the opposite reaction if it begins to feel like an appointment: "
        ),
        i("“We said we would have sex tonight, so I guess this is what we are doing.”"),
        t(
          " What could have created anticipation now carries the meaning of duty. The calendar did not necessarily kill desire. "
        ),
        b("The meaning attached to the plan changed which system became louder.")
      ),
      p(
        t(
          "This distinction matters because the Spark Seeker may otherwise interpret the resulting loss of desire as evidence that the attraction itself is disappearing. If spontaneous chemistry used to happen effortlessly, needing to create the conditions for it later can feel suspicious. The thought may become "
        ),
        bi("“If the spark were still real, this shouldn't require any effort.”")
      ),
      p(
        t(
          "That interpretation can shape behavior. The Spark Seeker may pull away, stop initiating, look elsewhere for novelty, or keep increasing stimulation in an attempt to recover the unmistakable feeling of excitement. Yet the underlying problem may be much more specific: the accelerator is receiving too little anticipation while the brake is receiving too much predictability."
        )
      ),
      p(
        b(
          "The goal is not to manufacture permanent excitement. It is to understand what makes excitement accessible."
        )
      ),
    ],

    // 374:308 / 374:317
    practiceEyebrow: "Practice time: ~12 min.",
    practiceTitle: "Try this & see what shifts",
    // 374:323 — the first three step leads end in a line break, the fourth runs on.
    practice: [
      p(
        b("Notice the moment the state changes."),
        t(
          " \nInstead of judging desire globally as high or low, pay attention to transitions. When did interest increase? When did it suddenly disappear? What happened immediately beforehand? A playful message, a confident look, a change of setting, an expectation, criticism or a shift into serious conversation can reveal far more than asking whether the Spark Seeker simply “has enough desire.”"
        )
      ),
      p(
        b("Separate the accelerator from the brake."),
        t(" \nIf desire is low, ask two different questions: "),
        i("“What is missing that normally makes this exciting?”"),
        t(" and "),
        i("“What is present that is making it harder to respond?”"),
        t(
          " Sometimes the solution is to add an accelerator. Sometimes adding more stimulation does very little because the brake is still being pressed."
        )
      ),
      p(
        b("Respect brakes that are protecting something real."),
        t(
          " \nPain, lack of consent, genuine relationship concerns, unwanted pressure or unsafe circumstances are not barriers to override. They are useful information. Other brakes may be more adjustable. Predictability, self-consciousness, accumulated stress or an encounter beginning to feel compulsory may respond to changes in context, communication or expectations."
        )
      ),
      p(
        b("Experiment with conditions, not just intensity."),
        t(
          " Rather than searching immediately for something more extreme, change one element and observe the effect. Move intimacy out of its usual setting. Build anticipation earlier in the day. Let one person surprise the other. Replace a familiar script with a playful choice. Remove the assumption that initiating intimacy has to lead to intercourse or orgasm. Small changes can reveal which part of the experience actually matters."
        )
      ),
      p(
        t(
          "Most importantly, look underneath the specific turn-on. The Spark Seeker may appear to need novelty, but novelty is often delivering several deeper ingredients at once: "
        ),
        b("anticipation, uncertainty, focused attention, freedom, play and unmistakable desire."),
        t(
          " A new partner, setting or fantasy is one way to create those ingredients, but it is not the only way."
        )
      ),
      p(
        t(
          "This creates much more room to work with desire. If pursuit is the real accelerator, familiar partners can still pursue each other. If unpredictability matters, a stable relationship can still contain surprise. If feeling intensely wanted is the key ingredient, changing how desire is expressed may matter more than constantly changing what happens sexually."
        )
      ),
      p(
        t("The goal is therefore not to keep the accelerator pressed as hard as possible. \n\n"),
        b(
          "For the Spark Seeker, sustainable spark comes from learning how to create the conditions that make desire feel alive without requiring every experience to be newer, louder or more intense than the last."
        ),
        t(
          " \nWhen the underlying ingredients become visible, excitement stops being something that has to be chased and becomes something that can be deliberately created."
        )
      ),
    ],
    // 377:242 — the same first paragraph, broken with a blank line after the lead and
    // a fresh line before "A playful message".
    practiceTeaser: [
      p(
        b("Notice the moment the state changes."),
        t(
          " \n\nInstead of judging desire globally as high or low, pay attention to transitions. When did interest increase? When did it suddenly disappear? What happened immediately beforehand? \nA playful message, a confident look, a change of setting, an expectation, criticism or a shift into serious conversation can reveal far more than asking whether the Spark Seeker simply “has enough desire.”"
        )
      ),
    ],
  },
};

/**
 * What the chapter component receives. Assembled on the server and handed down as
 * a prop, never imported by the V4 tree.
 */
export interface Report3AcceleratorsView {
  intro: readonly Report3Block[];
  brakesLead: string;
  brakes: readonly Report3TriggerRow[];
  acceleratorsLead: string;
  accelerators: readonly Report3TriggerRow[];
  /**
   * Index of the first locked row in both cards, or null when the chapter is open.
   * 386:416 and 386:444 keep rows 1-2 sharp; row 3 ramps into the blur, sharp at
   * its top, so it is sent as written in both of lockedBlurCopy.ts's positions, as
   * Typical Beliefs' ramp row is; rows 4-5 sit under the full blur and follow it.
   */
  lockedFrom: number | null;
  challengesTitle: string;
  challenges: Report3GatedCopy;
  practice: Report3PracticeView;
}

/** 386:416 / 386:444 keep two rows sharp. */
export const ACCELERATORS_FREE_ROWS = 2;

/**
 * 314:307 keeps the H2 and the first paragraph sharp — Mark asked for the paywall
 * "right after the first paragraph" (Figma, 2026-09-22) — and ramps into the second.
 */
export const ACCELERATORS_CHALLENGES_FREE_BLOCKS = 1;

/** 375:221 keeps the first practice paragraph sharp and ramps into the second. */
export const ACCELERATORS_PRACTICE_FREE_BLOCKS = 1;

/**
 * Where each ramp paragraph stops being real (splitRamp). The fade runs over its
 * first two lines in 314:307 and its first four in 375:221; these sentence ends sit
 * past that on every phone from 320 to 430, so the band is always real copy and
 * everything after it is only ever seen fully blurred (veiled: lockedBlurCopy.ts).
 */
export const ACCELERATORS_CHALLENGES_RAMP_THROUGH = "create days of tension.";
export const ACCELERATORS_PRACTICE_RAMP_THROUGH = "harder to respond?”";

/** A row under the lock: as written, or its decoy (lockedBlurCopy.ts). */
const veilRow = (row: Report3TriggerRow): Report3TriggerRow => ({
  ...row,
  label: veilText(row.label),
  subtext: veilText(row.subtext),
});

const rampOf = (gated: Report3GatedCopy, realThrough: string): Report3GatedCopy =>
  gated.ramp ? { ...gated, ramp: splitRamp(gated.ramp, realThrough) } : gated;

/**
 * Server-side assembly. Returns null for an archetype nobody has written yet, which
 * is the signal ReportPage falls back to V2's section on.
 *
 * `locked` is decided by the caller, from the same gate the V2 section runs through
 * (`accelUnlocked`), so nothing in the V4 tree ever sees an access plan. A locked
 * reader receives: the intro, both leads and rows 1-2 verbatim; rows 3-5 and
 * everything past the ramps as the page draws them blurred — the copy itself since
 * 26.09, decoys in the switch's other position (lockedBlurCopy.ts); and the closed
 * practice teaser verbatim, because it is free copy.
 */
export function buildAccelerators(
  archetype: string,
  { locked = false }: { locked?: boolean } = {}
): Report3AcceleratorsView | null {
  const copy = REPORT_V4_ACCELERATORS[archetype];
  if (!copy) return null;
  const lockedFrom = locked ? ACCELERATORS_FREE_ROWS : null;
  // The ramp row (index lockedFrom) is legible at its sharp end, so only the rows
  // under the full blur are veiled.
  const rows = (list: readonly Report3TriggerRow[]) =>
    list.map((row, index) => (lockedFrom !== null && index > lockedFrom ? veilRow(row) : row));
  return {
    intro: copy.intro,
    brakesLead: copy.brakesLead,
    brakes: rows(copy.brakes),
    acceleratorsLead: copy.acceleratorsLead,
    accelerators: rows(copy.accelerators),
    lockedFrom,
    challengesTitle: copy.challengesTitle,
    challenges: rampOf(
      gate(copy.challenges, ACCELERATORS_CHALLENGES_FREE_BLOCKS, locked),
      ACCELERATORS_CHALLENGES_RAMP_THROUGH
    ),
    practice: {
      eyebrow: copy.practiceEyebrow,
      title: copy.practiceTitle,
      locked,
      teaser: copy.practiceTeaser,
      ...rampOf(
        gate(copy.practice, ACCELERATORS_PRACTICE_FREE_BLOCKS, locked),
        ACCELERATORS_PRACTICE_RAMP_THROUGH
      ),
    },
  };
}
