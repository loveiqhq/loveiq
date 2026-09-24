/**
 * Typical Beliefs — the two belief panels of the chapter, Figma 368:5482 and
 * 368:5623 inside "Expanded Chapter — Typical Beliefs" (304:256).
 *
 * PREMIUM. Registered in __tests__/security/premium-content-bundle.test.ts, so it
 * must never be runtime-imported from a "use client" file. The server reads it and
 * hands the rows down as props, exactly as buildLearnMoreForReader does for the
 * long-form articles.
 *
 * THE PAIRINGS ARE THE FRAME'S, NOT THE SOURCE DOCUMENT'S. The authored chapter
 * ("Spark_Seeker_Typical Beliefs_Chapter") writes a bespoke shift under each
 * shadow belief — "Planning can create the conditions for anticipation and spark."
 * Mark replaced all ten with the short sun beliefs from the same chapter, so the
 * two panels read as one set seen twice rather than two separate lists. These are
 * read off the frame, including the hidden `line/shift · hidden at rest` text on
 * the rows the frame delivers un-turned.
 *
 * Quotation marks are the frame's curly pairs, not ASCII, because the copy is set
 * in Lora italic where the difference is obvious.
 */

export interface Report3BeliefTurn {
  /** The shadow belief, struck through once the row turns. */
  shadow: string;
  /** What it becomes — a sun belief, revealed under "THE SHIFT". */
  shift: string;
}

export interface Report3BeliefPanels {
  turns: readonly Report3BeliefTurn[];
  sun: readonly string[];
}

export const REPORT_V4_TYPICAL_BELIEFS: Readonly<Record<string, Report3BeliefPanels>> = {
  "Spark Seeker": {
    turns: [
      {
        shadow: "“If sex has to be planned, the spark must be gone.”",
        shift: "“Planned intimacy can still become playful and spontaneous.”",
      },
      {
        shadow: "“Real desire should happen spontaneously.”",
        shift: "“Spark can be created together, not only discovered.”",
      },
      {
        shadow: "“If things feel predictable, attraction is fading.”",
        shift: "“Familiarity can give me more freedom to experiment.”",
      },
      {
        shadow: "“Good sex should keep becoming more exciting.”",
        shift: "“Desire can change in intensity without meaning something is wrong.”",
      },
      {
        shadow: "“I need novelty to stay sexually interested.”",
        shift: "“I can love novelty without needing constant novelty.”",
      },
      {
        shadow: "“If my partner rarely initiates, they must not really want me.”",
        shift: "“I can enjoy pursuit without needing uncertainty to stay interested.”",
      },
      {
        shadow: "“Being desired proves that I am still attractive and exciting.”",
        shift: "“Being desired feels good, but it does not determine my worth.”",
      },
      {
        shadow: "“Talking about how to make sex better makes it less natural.”",
        shift: "“Curiosity does not mean I am dissatisfied with what I already have.”",
      },
      {
        shadow: "“If I have to ask for flirting or pursuit, it no longer counts.”",
        shift: "“I can ask directly for more flirting, play, or excitement.”",
      },
      {
        shadow: "“Once a relationship becomes too safe or routine, passion inevitably disappears.”",
        shift: "“A quieter kind of intimacy can still contain genuine desire.”",
      },
    ],
    /**
     * 368:5623. The same ten sun beliefs the turns above land on, in the frame's
     * own order — which is NOT the turn order, so the list is written out rather
     * than derived from `turns`.
     */
    sun: [
      "“I can love novelty without needing constant novelty.”",
      "“Spark can be created together, not only discovered.”",
      "“Planned intimacy can still become playful and spontaneous.”",
      "“Familiarity can give me more freedom to experiment.”",
      "“Being desired feels good, but it does not determine my worth.”",
      "“I can ask directly for more flirting, play, or excitement.”",
      "“Curiosity does not mean I am dissatisfied with what I already have.”",
      "“A quieter kind of intimacy can still contain genuine desire.”",
      "“I can enjoy pursuit without needing uncertainty to stay interested.”",
      "“Desire can change in intensity without meaning something is wrong.”",
    ],
  },
};

/* ─── chapter prose ──────────────────────────────────────────────────────────
 * 304:264's own blocks, in frame order: four paragraphs, the belief-map
 * subheading and its lede run BEFORE the two panels; "Common challenges" and its
 * two worked examples run after. The frame sets body copy in Plus Jakarta Sans
 * 16/25.6 (#3f3a4d), its H3s in Lora Bold 16/19.2 and its one H2 in Lora Bold
 * 18/21.6 — all in #161021.
 *
 * Helpers are re-declared rather than imported: report3-learn-more.ts keeps its
 * own `t`/`b`/`i`/`p`/`h` module-private, and widening that file's surface for a
 * second consumer buys nothing. */

import { scrambleLockedText } from "@features/report/server/scrambleLockedText";
import {
  gate,
  type Report3GatedCopy,
  type Report3PracticeView,
} from "@features/report/server/gatedCopy";
import type { Report3Block } from "./report3-learn-more";
import type { Report3Run } from "./report3-archetype-page";

const t = (text: string): Report3Run => ({ text });
const b = (text: string): Report3Run => ({ text, weight: 700 });
const i = (text: string): Report3Run => ({ text, italic: true });
const p = (...runs: Report3Run[]): Report3Block => ({ kind: "para", runs });
const h = (text: string): Report3Block => ({ kind: "heading", text });

/** 304:269 through 304:279 — everything above the coral panel. */
export const TYPICAL_BELIEFS_INTRO: readonly Report3Block[] = [
  p(
    t(
      "Long before people consciously decide what sex, desire, or intimacy mean to them, they have already absorbed beliefs about how these things are supposed to work. Some come directly from caregivers, previous partners, religion, media, or culture. Others are learned more quietly, by noticing what is praised, discouraged, desired, judged, or treated as normal."
    )
  ),
  p(
    t(
      "Because many of these beliefs form before they are consciously examined, they rarely feel like beliefs. They simply feel true. Over time, they become part of the mental framework through which situations are interpreted. The event itself matters, but so does the meaning attached to it."
    )
  ),
  p(
    t(
      "Imagine two people whose partners have not initiated sex for several days. One believes that being sexually desired is evidence of being attractive and valued. The lack of initiation may quickly become "
    ),
    i("“Maybe they do not want me anymore.”"),
    t(
      " Another believes that desire naturally rises and falls with stress, energy, mood, and circumstance. The same few days may carry almost no threat. "
    ),
    b("The situation is identical. The belief changes what the situation means and feels like.")
  ),
  p(
    t("A useful way to think about this is using the framework of "),
    b("sun beliefs and shadow beliefs"),
    t(
      ". Sun beliefs tend to create more room for flexibility, curiosity, and choice. Shadow beliefs make the meaning of a situation more rigid or conditional. A shadow belief is not necessarily false or irrational. It may have developed for understandable reasons. The important question is whether it still helps interpret the present accurately."
    )
  ),
  h("The Spark Seeker belief map"),
  p(
    t(
      "The Spark Seeker tends to place unusual value on chemistry, anticipation, play, novelty, and the feeling of being actively wanted. These preferences can support a highly alive and exploratory sexuality. The difference between sun and shadow lies in what those experiences are allowed to mean."
    )
  ),
];

/** 304:379 — the chapter's only H2, and the frame's only 18px heading. */
export const TYPICAL_BELIEFS_CHALLENGES_TITLE = "Common challenges";

/** 304:380 through 304:410 — the two worked examples, below the green panel. */
export const TYPICAL_BELIEFS_CHALLENGES: readonly Report3Block[] = [
  h("When spontaneity becomes proof of desire"),
  p(t("Consider the shadow belief "), i("“If sex has to be planned, the spark must be gone.”")),
  p(
    t(
      "A partner suggests deliberately setting aside time for intimacy. Nothing about the suggestion itself says attraction has disappeared. It might simply reflect busy schedules, stress, children, work, or a desire to protect time for the relationship."
    )
  ),
  p(t("But the belief changes its meaning.")),
  p(
    t(
      "For the Spark Seeker, planning may begin to feel like evidence that something once effortless now requires maintenance. The thought may become "
    ),
    i("“If we really wanted each other, we would not have to organize this.”")
  ),
  p(
    t(
      "That interpretation can influence behavior. Intentional intimacy may be dismissed as artificial. The Spark Seeker may wait for spontaneous desire to return, increase stimulation in search of the old intensity, or become increasingly attentive to moments when sex feels routine."
    )
  ),
  p(
    t(
      "The problem is not the preference for spontaneity. Spontaneity genuinely may be one of the Spark Seeker's strongest ways desire comes alive. "
    ),
    b(
      "The difficulty begins when spontaneity stops being a preference and starts becoming proof: if desire does not appear naturally and effortlessly, it can begin to feel less real."
    ),
    t(" A more flexible belief leaves the preference intact: "),
    i(
      "“Spontaneity may be especially exciting to me, but desire does not have to be effortless to be genuine. Sometimes spark is discovered; sometimes it is created.”"
    )
  ),
  h("When being wanted becomes evidence of worth"),
  p(t("Now consider "), i("“Being desired proves that I am still attractive and exciting.”")),
  p(
    t(
      "The Spark Seeker often responds strongly to visible signals of desire: flirting, pursuit, teasing, confident initiation, praise, or the sense that someone is having difficulty resisting them. These signals can be particularly rewarding because they combine attraction with excitement."
    )
  ),
  p(t("The shadow appears when their absence takes on too much meaning.")),
  p(
    t(
      "If a partner initiates less during a stressful month, the Spark Seeker may not experience only less sexual activity. The change may start to feel like information: "
    ),
    i("“If they really wanted me, I would feel it.”")
  ),
  p(
    t(
      "Attention can then shift toward evidence of attraction. Is the partner flirting as much? Looking as intensely? Initiating with the same urgency? Responding to teasing?"
    )
  ),
  p(
    t(
      "The Spark Seeker may increase pursuit to see whether the response returns, test the chemistry through flirtation, or lose interest when the expected energy does not come back. Yet the partner's reduced initiation may reflect exhaustion, stress, medication, distraction, or changes in desire that say very little about attraction."
    )
  ),
  p(
    t(
      "The more supportive belief does not require pretending that being desired is unimportant. It makes a more precise distinction: "
    ),
    i(
      "“Being desired is deeply pleasurable to me, but another person's momentary desire is not a reliable measurement of my value or attractiveness.”"
    )
  ),
];

/* ─── "Try this & see what shifts" ───────────────────────────────────────────
 * 374:238 (open), 374:258 (open & gated), 374:217 (closed). The practice that
 * closes the chapter body — the "how to improve" section the team placed after
 * the paywall blur (decision 2026-09-21), with its own gating.
 *
 * Copy is 374:257 verbatim, the runs decoded from its character style
 * overrides. Steps one to five open on a bold lead; step six ("Finally, test
 * the new belief through experience.") is regular in both 374:257 and 375:220,
 * so it is regular here too — flagged for Mark rather than "fixed". */

export const TYPICAL_BELIEFS_PRACTICE_EYEBROW = "Practice time: ~15 min.";
export const TYPICAL_BELIEFS_PRACTICE_TITLE = "Try this & see what shifts";

export const TYPICAL_BELIEFS_PRACTICE: readonly Report3Block[] = [
  p(
    t(
      "The goal is not to eliminate shadow beliefs or replace them with artificially positive ones. It is to notice when an automatic interpretation has quietly turned into a fact."
    )
  ),
  p(t("A simple process can help.")),
  p(
    b("Separate the event from its meaning."),
    t(" First describe what actually happened without interpretation. "),
    i("“My partner has initiated less this week.”"),
    t(" Then ask: "),
    i("“What did I decide that meant?”"),
    t(" The answer might be "),
    i("“They are losing interest.”"),
    t(" That second sentence is where the belief becomes visible.")
  ),
  p(
    b("Name the rule underneath it."),
    t(
      " Once you notice the interpretation, ask what belief might lie underneath. If the thought is "
    ),
    i("“They had to tell me what they wanted, so I must be bad at this,”"),
    t(" the belief might be "),
    i("“A good sexual partner should just know what to do.”"),
    t(" Or if asking for reassurance feels uncomfortable, the belief might be "),
    i("“If I were truly desirable, I would not need to ask.”"),
    t(
      " Putting the belief into a clear sentence makes it much easier to examine instead of simply reacting to it."
    )
  ),
  p(
    b("Ask where the belief came from."),
    t(
      " It may reflect past relationships, cultural messages, family attitudes, romantic ideals, pornography, media, or simply repeated experience. Understanding the origin does not make a belief disappear, but it helps distinguish what feels familiar from what is necessarily true."
    )
  ),
  p(
    b("Test the interpretation."),
    t(
      " Ask whether the belief explains every realistic version of the situation. Can attraction remain strong while spontaneous desire decreases? Can planned sex become intensely erotic? Can a familiar partner still produce novelty? Have you ever wanted someone while being too tired, distracted, or stressed to initiate?"
    )
  ),
  p(
    b("Rewrite the belief without erasing the preference."),
    t(" Effective reframing is not "),
    i("“Routine is exciting”"),
    t(
      " if routine genuinely is not especially exciting for the Spark Seeker. It is something more accurate: "
    ),
    i(
      "“Novelty strongly activates my desire, but novelty is not the only evidence that desire exists.”"
    )
  ),
  p(
    t(
      "Finally, test the new belief through experience. Instead of waiting for pursuit, ask for more flirting. Instead of treating planning as the opposite of spontaneity, use planning to create anticipation. Instead of assuming familiar sex needs a completely new experience, change one element and notice whether curiosity returns."
    )
  ),
  p(
    b(
      "The goal is not for the Spark Seeker to want less spark, but to stop treating its presence or absence as a verdict."
    ),
    t(
      " A quieter period does not automatically mean desire is gone or something is wrong with the relationship. Spark can also be created through anticipation, attention and play. When excitement becomes something that can be cultivated rather than constantly tested, it can remain a source of energy without becoming a measure of how much desire, attraction, or connection is left."
    )
  ),
];

/**
 * The gated-passage and practice shapes now live with the split itself, in
 * features/report/server/gatedCopy.ts, which Accelerator & Brakes shares. Re-exported
 * so this module's importers keep one place to take a chapter's types from.
 */
export type { Report3GatedCopy, Report3PracticeView };

/**
 * What the chapter component receives. Assembled on the server and handed down as
 * a prop, never imported by the V4 tree — the same seam `Report3LearnMoreView`
 * uses, and for the same reason: everything under `features/report/ui/v3` ends up
 * in a client bundle, and this module is paid copy.
 */
export interface Report3TypicalBeliefsView {
  intro: readonly Report3Block[];
  panels: { turns: readonly Report3BeliefTurnView[]; sun: readonly string[] };
  /**
   * Index of the first LOCKED row in both panels, or null when the chapter is
   * open. 381:222 turns rows 1 to 3 and marks row 4 onwards "at rest (p=0) ·
   * LOCKED"; 381:362 blurs its own rows 4 to 10 to match. One number drives both,
   * because the frame uses one boundary. Row `lockedFrom` itself is the ramp row
   * (progressive blur, real copy); every row after it is scrambled.
   */
  lockedFrom: number | null;
  challengesTitle: string;
  challenges: Report3GatedCopy;
  practice: Report3PracticeView;
}

/** A turn as the reader receives it. */
export interface Report3BeliefTurnView {
  shadow: string;
  /**
   * THE SEAM. Withheld on a locked row, which can never turn and so would never
   * show it — sending it anyway would put the paid half of every gated pair into
   * the page for nothing. The blurred shadow belief stays, because the frame draws
   * it and it is what the wall is advertising.
   */
  shift: string | null;
}

/** 381:222 turns three rows before the wall. */
export const TYPICAL_BELIEFS_FREE_ROWS = 3;

/**
 * 348:221 keeps "Common challenges"' subheading and its first three paragraphs
 * sharp; the fourth block ("For the Spark Seeker, planning…") is the one the
 * blur ramps in over.
 */
export const TYPICAL_BELIEFS_CHALLENGES_FREE_BLOCKS = 4;

/** 374:264 keeps the first two practice paragraphs sharp; the third ramps. */
export const TYPICAL_BELIEFS_PRACTICE_FREE_BLOCKS = 2;

/**
 * Server-side assembly. Returns null for an archetype nobody has written yet.
 *
 * `locked` is decided by the caller, from the same gate every other section runs
 * through, so nothing in the V4 tree ever sees an access plan.
 *
 * A locked reader receives: every free block and row verbatim; the ramp block and
 * ramp row verbatim (legible through the light end of the blur); no shift for any
 * locked row; and SCRAMBLED copy for everything that is only ever shown under the
 * full blur. Nothing paid past the ramp leaves the server.
 */
export function buildTypicalBeliefs(
  archetype: string,
  { locked = false }: { locked?: boolean } = {}
): Report3TypicalBeliefsView | null {
  const panels = REPORT_V4_TYPICAL_BELIEFS[archetype];
  if (!panels) return null;
  const lockedFrom = locked ? TYPICAL_BELIEFS_FREE_ROWS : null;
  const underFullBlur = (i: number) => lockedFrom !== null && i > lockedFrom;
  return {
    intro: TYPICAL_BELIEFS_INTRO,
    panels: {
      turns: panels.turns.map((turn, i) => ({
        shadow: underFullBlur(i) ? scrambleLockedText(turn.shadow) : turn.shadow,
        shift: lockedFrom !== null && i >= lockedFrom ? null : turn.shift,
      })),
      sun: panels.sun.map((belief, i) => (underFullBlur(i) ? scrambleLockedText(belief) : belief)),
    },
    lockedFrom,
    challengesTitle: TYPICAL_BELIEFS_CHALLENGES_TITLE,
    challenges: gate(TYPICAL_BELIEFS_CHALLENGES, TYPICAL_BELIEFS_CHALLENGES_FREE_BLOCKS, locked),
    practice: {
      eyebrow: TYPICAL_BELIEFS_PRACTICE_EYEBROW,
      title: TYPICAL_BELIEFS_PRACTICE_TITLE,
      locked,
      ...gate(TYPICAL_BELIEFS_PRACTICE, TYPICAL_BELIEFS_PRACTICE_FREE_BLOCKS, locked),
    },
  };
}
