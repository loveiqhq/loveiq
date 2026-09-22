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
      "The problem is not the preference for spontaneity. Spontaneity genuinely may be one of the Spark Seeker’s strongest ways desire comes alive. "
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
      "The Spark Seeker may increase pursuit to see whether the response returns, test the chemistry through flirtation, or lose interest when the expected energy does not come back. Yet the partner’s reduced initiation may reflect exhaustion, stress, medication, distraction, or changes in desire that say very little about attraction."
    )
  ),
  p(
    t(
      "The more supportive belief does not require pretending that being desired is unimportant. It makes a more precise distinction: "
    ),
    i(
      "“Being desired is deeply pleasurable to me, but another person’s momentary desire is not a reliable measurement of my value or attractiveness.”"
    )
  ),
];

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
   * LOCKED" under a 5px layer blur; 381:362 blurs its own rows 4 to 10 to match.
   * One number drives both, because the frame uses one boundary.
   */
  lockedFrom: number | null;
  challengesTitle: string;
  challenges: readonly Report3Block[];
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
 * Server-side assembly. Returns null for an archetype nobody has written yet.
 *
 * `locked` is decided by the caller, from the same gate every other section runs
 * through, so nothing in the V4 tree ever sees an access plan.
 */
export function buildTypicalBeliefs(
  archetype: string,
  { locked = false }: { locked?: boolean } = {}
): Report3TypicalBeliefsView | null {
  const panels = REPORT_V4_TYPICAL_BELIEFS[archetype];
  if (!panels) return null;
  const lockedFrom = locked ? TYPICAL_BELIEFS_FREE_ROWS : null;
  return {
    intro: TYPICAL_BELIEFS_INTRO,
    panels: {
      turns: panels.turns.map((turn, i) => ({
        shadow: turn.shadow,
        shift: lockedFrom !== null && i >= lockedFrom ? null : turn.shift,
      })),
      sun: panels.sun,
    },
    lockedFrom,
    challengesTitle: TYPICAL_BELIEFS_CHALLENGES_TITLE,
    challenges: TYPICAL_BELIEFS_CHALLENGES,
  };
}
