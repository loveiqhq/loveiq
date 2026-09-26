/**
 * Challenges in Partnerships — the Report 3.0 chapter that opens Part V "How you
 * connect": Figma "Challenges in Partnership" 38:1672 in the Part 5 page 334:829,
 * paywalled as 305:350, with its "Try this & see what shifts" card (399:240 open,
 * 399:219 closed, 399:260 gated). The chapter has no "Go deeper & learn more"
 * article — the content roadmap marks it dropped.
 *
 * PREMIUM. Registered in __tests__/security/premium-content-bundle.test.ts, so it
 * must never be runtime-imported from a "use client" file. The server reads it and
 * hands the chapter down as props (buildPartnership), exactly as Typical Beliefs
 * and Accelerators & Brakes do.
 *
 * THE COPY IS THE FRAME'S, read off 38:1681, the loop cards 532:263-532:375, the
 * result 647:229 and the practice 399:259, run by run — including the straight
 * apostrophe in "Spark Seeker's" (38:1681) and the curly quotes around quoted
 * speech. Two departures, both Fatih's calls of 2026-09-24:
 *  - 38:1681 ends "They feel like facts. " with a trailing space; dropped.
 *  - The practice's principle paragraph runs on in Figma into "Create routines
 *    that make connection possible, then leave room inside" and stops mid-sentence
 *    — Sanjin's source doc ("Spark_Seeker_How_to_improve") is cut off in the same
 *    place. The fragment is dropped until Sanjin supplies the full sentence.
 *
 * Chrome text — the loop's step names ("The Situation" … "My Confirmation"),
 * "What happens", "What's underneath", the orbit prompt — is universal and lives
 * in the client components, never in this module.
 */

import {
  gate,
  splitRamp,
  veilBlock,
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

/**
 * One step of the loop (532:262), in the orbit's clockwise order. The step names
 * and the per-card colours are the client's; only these two lines are the
 * archetype's.
 */
export interface Report3LoopStage {
  /** "What happens" — Manrope Light 15/22.5. */
  happens: string;
  /** "What's underneath" — Manrope Light 14/20. */
  underneath: string;
}

/** Everything one archetype's chapter needs, as authored. */
export interface Report3PartnershipCopy {
  /** 38:1681 — sixteen blocks; the sixth is the inline "Common challenges". */
  body: readonly Report3Block[];
  /** 532:263-532:375 — the six steps, in orbit order. */
  loop: readonly Report3LoopStage[];
  /** 647:229 — the paragraph after the loop. */
  result: Report3Block;
  practiceEyebrow: string;
  practiceTitle: string;
  /** 399:259 — ONE ordered list; split for a locked reader only (buildPartnership). */
  practice: readonly Report3Block[];
  /** 399:219 / 401:222 — the closed card's teaser: practice paragraphs 1-2. */
  practiceTeaser: readonly Report3Block[];
}

const SPARK_PRACTICE: readonly Report3Block[] = [
  p(
    t(
      "The goal is not to make the Spark Seeker want less excitement. It is to become more precise about "
    ),
    b("what the feeling of boredom, pressure, or lost spark is actually signaling"),
    t(" before reacting to it.")
  ),
  p(
    t(
      "A useful first step is to separate what happened from what it came to mean. If sex has become predictable, that is an observation. “"
    ),
    i("We are losing our chemistry"),
    t("” is an interpretation. If a partner asks for more reassurance, that is an event. “"),
    i("They are trying to control me"),
    t("” is the meaning attached to it.")
  ),
  p(t("When tension appears, ask three questions:")),
  {
    kind: "list",
    ordered: true,
    items: [
      [b("What actually happened?"), t(" Describe the situation without explaining it.")],
      [b("What did I make it mean?"), t(" Notice the conclusion that appeared automatically.")],
      [
        b("What am I actually missing or needing?"),
        t(" Look underneath words such as "),
        i("boring"),
        t(", "),
        i("trapped"),
        t(", or "),
        i("disconnected"),
        t("."),
      ],
    ],
  },
  p(
    t(
      "“Boring” might mean missing teasing, anticipation, experimentation, pursuit, or feeling actively chosen. “Trapped” might mean needing more independence, personal space, or the freedom to initiate experiences rather than having everything predetermined."
    )
  ),
  p(
    t(
      "Once the need becomes specific, it becomes possible to communicate it without turning it into a judgment about the relationship."
    )
  ),
  p(
    t("Instead of "),
    i("“Our sex life has become boring,”"),
    t(" try: "),
    i(
      "“I miss the anticipation between us. Could one of us plan something without telling the other exactly what it is?”"
    )
  ),
  p(
    t("Instead of "),
    i("“You are suffocating me,”"),
    t(" try: "),
    i(
      "“I want us to feel secure, but I also notice that I need some independence to stay energized. How can we make room for both?”"
    )
  ),
  p(
    t("The most useful principle for the Spark Seeker is often simple: "),
    b("keep the commitment clear while leaving parts of the experience open."),
    t(
      " Protect time for intimacy without scripting every detail. Build security without removing all uncertainty."
    )
  ),
  p(
    t(
      "The qualities that can create difficulty for the Spark Seeker can also make you an unusually energizing long-term partner. You notice when a relationship has become passive. You bring play where others may accept routine. You are often willing to initiate, experiment, flirt, and remind a partner that commitment does not have to mean becoming erotically invisible to one another."
    )
  ),
  p(
    t("Your challenge is not to stop wanting spark. It is to become better at "),
    b(
      "identifying what creates it, asking for it clearly, and generating it without destabilizing the relationship underneath it."
    )
  ),
  p(
    t(
      "This is the shift: from waiting for aliveness to happen, to learning how to build it together."
    )
  ),
];

export const REPORT_V4_PARTNERSHIP: Readonly<Record<string, Report3PartnershipCopy>> = {
  "Spark Seeker": {
    body: [
      p(
        t(
          "Relationships do not become difficult simply because two people are different. Difficulties often emerge because "
        ),
        b("two perfectly understandable patterns collide"),
        t(".")
      ),
      p(
        t(
          "What feels reassuring to one partner may feel restrictive to another. What feels comfortably familiar to one person may feel erotically flat to the other. A partner may ask for more closeness because they feel uncertain, while the other asks for more space because that closeness has started to feel like pressure. Neither person is necessarily doing anything wrong, but each response can unintentionally intensify the other."
        )
      ),
      p(
        t("For the "),
        b("Spark Seeker,"),
        t(
          " these collisions often become most visible as a relationship settles into familiarity. The same stability that can deepen trust and closeness can also remove some of the uncertainty, pursuit, and discovery that once made desire feel effortless. This can make ordinary shifts in a long-term relationship carry more meaning than they need to, with less intensity sometimes being read as less attraction, less interest, or a sign that something has changed between two people. The challenge is therefore not simply a preference for novelty, but learning to distinguish between a relationship that is genuinely no longer fulfilling and one that simply requires different conditions for desire to stay engaged."
        )
      ),
      p(
        t(
          "Understanding these patterns matters because they become easier to change once they are visible. Instead of arguing about who is too demanding, too distant, too boring, or never satisfied, partners can ask a more useful question: "
        ),
        bi("What is each of us responding to, and what are we accidentally creating together?")
      ),
      p(
        t(
          "Recognizing the pattern early can prevent a small difference from turning into a much larger conflict. It can also show the Spark Seeker where growth matters most, such as communicating vulnerable needs more directly, staying present through slower forms of intimacy, and learning how to create excitement without needing instability to produce it."
        )
      ),
      // 38:1681 sets this inline, in Lora Bold 18/21.6.
      { kind: "heading", text: "Common challenges" },
      p(
        t(
          "Some relationship tensions are especially likely when the Spark Seeker partners with someone whose sexuality and relationship needs work differently:"
        )
      ),
      p(
        b("Routine can feel different to each partner."),
        t(
          " A partner may experience familiar rituals, repeated date nights, or predictable sex as comforting signs of closeness. The Spark Seeker may experience the same predictability as a loss of anticipation and erotic momentum. What feels secure to one person can begin to feel flat to the other."
        )
      ),
      p(
        b("Reassurance can collide with the need for freedom."),
        t(
          " When a partner senses distance, they may naturally respond by seeking more closeness, clearer plans, or more reassurance. The Spark Seeker may experience those attempts as pressure and pull away further. The more one person reaches for security, the more the other may protect independence."
        )
      ),
      p(
        b("Different desire rhythms can be mistaken for different levels of attraction."),
        t(
          " A partner may need time, context, or slower intimacy for desire to build, while the Spark Seeker may respond more strongly to visible pursuit, immediacy, and sexual momentum. If those differences are not understood, quieter desire can be interpreted as rejection, while the Spark Seeker's push for more energy can feel demanding to the partner."
        )
      ),
      p(
        t(
          "The difficult part is that these moments rarely feel like a pattern from the inside. They feel like facts."
        )
      ),
      p(
        b(
          "The key question is whether the Spark Seeker is responding to a genuine incompatibility, or to an interaction pattern that is quietly removing the very conditions that help their desire stay alive."
        )
      ),
      p(
        t(
          "Imagine a couple whose sexual life has gradually become familiar. Sex happens in similar situations, initiation has become straightforward, and both partners generally know what will happen next."
        )
      ),
      p(
        t(
          "One partner experiences this as comfort. The relationship feels secure, sex still happens, and there is no obvious problem."
        )
      ),
      p(
        t(
          "The Spark Seeker may notice something different: the anticipation has disappeared. There is less teasing, less pursuit, less uncertainty and less sense of being actively drawn toward each other. "
        ),
        b("Familiarity itself can begin to acquire meaning: “"),
        bi("They do not really want me the way they used to."),
        b("”")
      ),
      p(
        t(
          "Once that interpretation appears, behavior may start changing. The Spark Seeker may initiate less, become more restless, notice attractive alternatives more strongly, or start criticizing the relationship for feeling flat. The partner senses the distance and may respond by trying harder to create security through planned intimacy, reassurance, or predictable routines."
        )
      ),
    ],
    loop: [
      {
        happens: "More familiarity, more predictability, less teasing and pursuit",
        underneath: "The relationship stabilizes and uncertainty drops",
      },
      {
        happens: "“We have lost the spark”",
        underneath: "Intensity is my evidence that love is real",
      },
      {
        happens: "I withdraw, initiate less, become restless, or seek more aliveness",
        underneath: "Protecting myself from confirming the fear",
      },
      {
        happens: "“Something is wrong, I am losing them”",
        underneath: "Their own fear of losing me",
      },
      {
        happens: "They reach for more reassurance, closeness, and predictability",
        underneath: "Seeking safety through proximity",
      },
      {
        happens: "I feel more confined and less energized",
        underneath: "The loop has produced its own evidence",
      },
    ],
    result: p(
      t("The result is a loop. "),
      b(
        "The more the partner tries to make the relationship feel secure, the more predictable it becomes. The more predictable it becomes, the more the Spark Seeker may experience the loss of excitement as evidence that something is wrong."
      )
    ),
    practiceEyebrow: "Practice time: ~10 min.",
    practiceTitle: "Try this & see what shifts",
    practice: SPARK_PRACTICE,
    practiceTeaser: SPARK_PRACTICE.slice(0, 2),
  },
};

/**
 * What the chapter component receives. Assembled on the server and handed down as
 * a prop, never imported by the V4 tree.
 */
export interface Report3PartnershipView {
  locked: boolean;
  /** 38:1681 open; 305:359 + 305:462 when locked. */
  body: Report3GatedCopy;
  /** Scrambled when locked — 612:862 blurs every card. */
  loop: readonly Report3LoopStage[];
  /** Blurred when locked (659:234): the copy itself, or its decoy (lockedBlurCopy.ts). */
  result: Report3Block;
  practice: Report3PracticeView;
}

/** 305:359 keeps paragraphs 1-4 sharp; the blur ramps in over paragraph 5. */
export const PARTNERSHIP_FREE_BLOCKS = 4;

/**
 * Where paragraph 5 stops being real (splitRamp). The blur fades in over its
 * first ~105px (305:361's progressive blur ends 5.2% down a 2032px box, about four
 * lines); this phrase end sits past that band on every phone from 320 to 430, so
 * the band is always real copy and the rest of the paragraph is only ever seen
 * fully blurred (veiled: lockedBlurCopy.ts).
 */
export const PARTNERSHIP_RAMP_THROUGH = "vulnerable needs more directly,";

/**
 * 399:260 keeps practice paragraphs 1-2 sharp and ramps in over "When tension
 * appears…" and list items 1-2. `gate()` takes one ramp block, so the question
 * line joins the free blocks (it sits at the zero end of Figma's progressive blur,
 * where it reads clear anyway) and the ramp is items 1-2.
 */
export const PARTNERSHIP_PRACTICE_FREE_BLOCKS = 3;

/** A loop stage under the blur: as written, or its decoy (lockedBlurCopy.ts). */
const veilStage = (stage: Report3LoopStage): Report3LoopStage => ({
  happens: veilText(stage.happens),
  underneath: veilText(stage.underneath),
});

/**
 * The practice as a locked reader's gate needs it: the one list split after its
 * second item, the tail numbered on from 3. A paying reader keeps the single list
 * — split ahead of time, it would render as two lists with a paragraph gap.
 */
const splitPracticeList = (blocks: readonly Report3Block[]): readonly Report3Block[] =>
  blocks.flatMap((block) =>
    block.kind === "list" && block.items.length > 2
      ? [
          { ...block, items: block.items.slice(0, 2) },
          { ...block, items: block.items.slice(2), start: 3 },
        ]
      : [block]
  );

/**
 * Server-side assembly. Returns null for an archetype nobody has written yet, which
 * is the signal ReportPage falls back to V2's section on.
 *
 * `locked` is decided by the caller, from the same gate the V2 section runs through
 * (`partnershipUnlocked`, Libido's full-report gate), so nothing in the V4 tree ever
 * sees an access plan. A locked reader receives: paragraphs 1-4 verbatim; practice
 * paragraphs 1-3 and list items 1-2 verbatim; everything the page draws blurred —
 * paragraph 5 past its fade band and all after it, the loop's lines, the result, the
 * rest of the practice — as the copy itself since 26.09, decoys in the switch's
 * other position (lockedBlurCopy.ts); and the closed teaser verbatim, because it is
 * free copy.
 */
export function buildPartnership(
  archetype: string,
  { locked = false }: { locked?: boolean } = {}
): Report3PartnershipView | null {
  const copy = REPORT_V4_PARTNERSHIP[archetype];
  if (!copy) return null;
  const body = gate(copy.body, PARTNERSHIP_FREE_BLOCKS, locked);
  return {
    locked,
    body: body.ramp ? { ...body, ramp: splitRamp(body.ramp, PARTNERSHIP_RAMP_THROUGH) } : body,
    loop: locked ? copy.loop.map(veilStage) : copy.loop,
    result: locked ? veilBlock(copy.result) : copy.result,
    practice: {
      eyebrow: copy.practiceEyebrow,
      title: copy.practiceTitle,
      locked,
      teaser: copy.practiceTeaser,
      ...gate(
        locked ? splitPracticeList(copy.practice) : copy.practice,
        PARTNERSHIP_PRACTICE_FREE_BLOCKS,
        locked
      ),
    },
  };
}
