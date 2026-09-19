// "What this means for you" — the SUMMARY section Figma places DIRECTLY under
// the Hero. In the Part I container (`8427:800`) the child order is
// HERO `8427:801` → SUMMARY `8719:8865` → SNAPSHOT `8719:8871`, so this sits
// between the archetype card and "Your snapshot".
//
// This copy is NOT in Mark's copy matrix: it is absent from `report2-copy.ts`,
// from the handoff `sections-schema.json`, and from `copy-matrix.csv` (grep for
// "Not a verdict" / "never only physical" returns nothing anywhere in the repo
// or the handoff). It is therefore captured here verbatim from the verified
// Figma frame, one entry per archetype — the same approach `report2-snapshot-
// cards.ts` uses for the snapshot micro-copy.
//
// Archetypes without a verified entry render NO section at all rather than
// fabricated or third-person legacy copy. Voice check: these paragraphs are
// SECOND person ("For you, sex is never only physical…"), unlike the pre-2.0
// `data/report-summary.ts` which is third person ("Experiences sexuality
// primarily as a space for…") — they are not interchangeable.
import type { Report2CopySlug } from "./report2-config";

export interface MeansForYou {
  /** Opening paragraph. `bold` renders as <strong> between `before` and `after`. */
  lead: { before: string; bold: string; after: string };
  /** Further body paragraphs, in order. */
  body: string[];
  /** Accent-coloured closing line. */
  closing: string;
}

export const meansForYou: Partial<Record<Report2CopySlug, MeansForYou>> = {
  // Spiritual Lover — verified verbatim from Figma node 8719:8865.
  "spiritual-lover": {
    lead: {
      before: "For you, sex is never only physical. It's a language for ",
      bold: "closeness, meaning, and being fully seen",
      after:
        ". Desire builds through emotional safety and real presence, not pressure or performance, and once the connection feels true, your body opens completely.",
    },
    body: [
      "At your best you create intimacy that is both sacred and deeply human, the kind most people only catch in glimpses. That same depth is why routine, distance, or a conflict left unrepaired can quietly close you down faster than you would expect.",
      "Your full report maps what opens you, what shuts you off, the one pattern that most often gets in your way, and the rare strength that sets you apart.",
    ],
    closing: "Not a verdict. A mirror, and a map for where your intimacy goes next.",
  },

  // The other 13 follow the Figma frame's SHAPE exactly — an opening claim, a
  // bolded triad, "Desire builds through X, not Y, and once Z…", then one
  // paragraph pairing the archetype's strength with what closes it — and take
  // their CONTENT from that archetype's own `core_archetype` / `motivation` /
  // `turn_offs` prose in `data/report-archetypes.ts`, converted from its third
  // person to the second person this block speaks in. The closing line and the
  // "Your full report maps…" paragraph are universal in the frame and are reused
  // verbatim. The source clause each one derives from is quoted above it.

  // "desire does not begin in the body alone, but in the nervous system and the
  // heart" / collapses when "rushed, emotionally disconnected, or unsafe".
  "sensual-connector": {
    lead: {
      before: "For you, desire never starts in the body alone. It starts in ",
      bold: "closeness, safety, and being genuinely met",
      after:
        ". Sensuality unfolds when your nervous system trusts the room, not when the pace picks up, and once you feel held, your body follows without effort.",
    },
    body: [
      "At your best you turn ordinary touch into something unhurried and deeply bonding, the kind of intimacy that feels safe and awake at the same time. That same sensitivity is why being rushed, or sex that has gone emotionally cold, can quietly close you down faster than you would expect.",
      "Your full report maps what opens you, what shuts you off, the one pattern that most often gets in your way, and the rare strength that sets you apart.",
    ],
    closing: "Not a verdict. A mirror, and a map for where your intimacy goes next.",
  },

  // "desire begins in anticipation, energy, and the feeling that something
  // exciting is unfolding" / collapses when "predictable, overly serious, or like
  // a scheduled responsibility".
  "spark-seeker": {
    lead: {
      before: "For you, sex is never a routine to maintain. It runs on ",
      bold: "aliveness, chemistry, and playful charge",
      after:
        ". Desire begins in anticipation and the sense that something is about to happen, not in duty or schedule, and once the current is live, your body needs no persuading.",
    },
    body: [
      "At your best you bring a playful heat that makes intimacy feel like something being discovered rather than repeated. That same appetite for charge is why predictability, or sex that starts to feel like an obligation, can quietly close you down faster than you would expect.",
      "Your full report maps what opens you, what shuts you off, the one pattern that most often gets in your way, and the rare strength that sets you apart.",
    ],
    closing: "Not a verdict. A mirror, and a map for where your intimacy goes next.",
  },

  // "desire is deeply connected to the impulse to soothe, bond, and make a
  // partner feel safe and cherished" / collapses when "emotionally cold,
  // one-sided, or disconnected from care".
  "relational-nurturer": {
    lead: {
      before: "For you, sex is never only physical. It's a way of offering ",
      bold: "care, comfort, and emotional safety",
      after:
        ". Desire rises with the impulse to soothe and be trusted, not with pressure or performance, and once you feel appreciated as well as needed, your sensuality opens fully.",
    },
    body: [
      "At your best you make a partner feel genuinely cherished, and you build a steadiness most people only feel in glimpses. That same devotion is why one-sided giving, or care that never comes back the other way, can quietly close you down faster than you would expect.",
      "Your full report maps what opens you, what shuts you off, the one pattern that most often gets in your way, and the rare strength that sets you apart.",
    ],
    closing: "Not a verdict. A mirror, and a map for where your intimacy goes next.",
  },

  // "desire begins in attention, reaction, and the feeling that they are
  // captivating to someone" / collapses when "unseen, unappreciated, or judged".
  "radiant-performer": {
    lead: {
      before: "For you, sex is never a silent, private thing. It comes alive in ",
      bold: "being seen, desired, and vividly appreciated",
      after:
        ". Desire builds on reaction and evident wanting, not on politeness or restraint, and once you feel captivating to someone, your confidence and your body arrive together.",
    },
    body: [
      "At your best you are magnetic and generous with your energy, able to make a partner feel like the only person in the room. That same responsiveness to attention is why indifference, or the quiet that creeps in with familiarity, can quietly close you down faster than you would expect.",
      "Your full report maps what opens you, what shuts you off, the one pattern that most often gets in your way, and the rare strength that sets you apart.",
    ],
    closing: "Not a verdict. A mirror, and a map for where your intimacy goes next.",
  },

  // "desire begins where normal comfort ends… When there is clear consent and a
  // shared…" / collapses when "intensity is dulled, consent is unclear, or trust
  // feels unstable".
  "explorer-of-edges": {
    lead: {
      before: "For you, sex is never meant to stay small and safe. It lives in ",
      bold: "intensity, transformation, and crossing thresholds",
      after:
        ". Desire begins where ordinary comfort ends, held by clear consent and real trust rather than caution, and once the ground underneath feels solid, you can travel a long way.",
    },
    body: [
      "At your best you can take intimacy somewhere most people never reach, and make the edge feel deliberate rather than reckless. That same appetite for intensity is why a dulled routine, or consent and trust left unspoken, can quietly close you down faster than you would expect.",
      "Your full report maps what opens you, what shuts you off, the one pattern that most often gets in your way, and the rare strength that sets you apart.",
    ],
    closing: "Not a verdict. A mirror, and a map for where your intimacy goes next.",
  },

  // "desire begins in curiosity, questions, experimentation… safe to explore and
  // supported rather than judged" / collapses when "exploration turns into
  // evaluation, shame, or pressure".
  "curious-apprentice": {
    lead: {
      before: "For you, sex is never a test to pass. It is a space for ",
      bold: "curiosity, discovery, and growing skill",
      after:
        ". Desire begins in questions and the excitement of finding out what is possible, not in getting it right, and once you are free to explore without being graded, your body relaxes into it.",
    },
    body: [
      "At your best you bring an openness that makes experimenting together feel easy and genuinely fun. That same care about doing well is why ridicule, or exploration that turns into evaluation, can quietly close you down faster than you would expect.",
      "Your full report maps what opens you, what shuts you off, the one pattern that most often gets in your way, and the rare strength that sets you apart.",
    ],
    closing: "Not a verdict. A mirror, and a map for where your intimacy goes next.",
  },

  // "desire begins in ease, when intimacy feels safe, uncomplicated, and free of
  // expectations" / collapses when "complicated, intense, or pressured".
  "minimalist-companion": {
    lead: {
      before: "For you, sex is never something that needs building up. It works best as ",
      bold: "simple closeness, comfort, and low-pressure warmth",
      after:
        ". Desire arrives in ease, not escalation, when intimacy feels uncomplicated and free of expectation, and once nothing is being asked of you, you can open gently and completely.",
    },
    body: [
      "At your best you make closeness feel effortless — the kind of unhurried warmth that asks nothing and settles everything. That same need for ease is why an elaborate build-up, or intensity you did not ask for, can quietly close you down faster than you would expect.",
      "Your full report maps what opens you, what shuts you off, the one pattern that most often gets in your way, and the rare strength that sets you apart.",
    ],
    closing: "Not a verdict. A mirror, and a map for where your intimacy goes next.",
  },

  // "desire often begins in the mind, through watching, fantasizing, or sensing
  // erotic energy without having to be fully in the spotlight" / collapses when
  // "pushed into performance, exposed without control, or rushed out of their
  // inner world".
  "emotional-voyeur": {
    lead: {
      before: "For you, desire rarely begins out in the open. It begins in ",
      bold: "imagination, atmosphere, and emotionally safe distance",
      after:
        ". Arousal builds through sensing and watching rather than being on display, and once you are not being pulled into the spotlight, your inner world becomes vividly erotic.",
    },
    body: [
      "At your best you hold an inner erotic life richer than most people ever put into words, and you read the charge in a room before anyone names it. That same privacy is why being pushed into performance, or exposed before you chose it, can quietly close you down faster than you would expect.",
      "Your full report maps what opens you, what shuts you off, the one pattern that most often gets in your way, and the rare strength that sets you apart.",
    ],
    closing: "Not a verdict. A mirror, and a map for where your intimacy goes next.",
  },

  // "desire begins in certainty, knowing the frame, setting the tone… When roles,
  // boundaries, and expectations are clear" / collapses when "the dynamic is
  // messy, respect is missing, or consent becomes unclear".
  "authority-conductor": {
    lead: {
      before: "For you, sex is never shapeless. It comes alive through ",
      bold: "structure, clear dynamics, and a frame you can trust",
      after:
        ". Desire begins in certainty — knowing the roles, setting the tone, shaping the encounter — not in improvisation, and once the frame is clean, your arousal becomes deliberate and strong.",
    },
    body: [
      "At your best you build a container so clear that a partner can let go completely inside it, which is rarer than it sounds. That same reliance on clarity is why a messy dynamic, or respect and consent left vague, can quietly close you down faster than you would expect.",
      "Your full report maps what opens you, what shuts you off, the one pattern that most often gets in your way, and the rare strength that sets you apart.",
    ],
    closing: "Not a verdict. A mirror, and a map for where your intimacy goes next.",
  },

  // "desire begins in stability, knowing what works, repeating what feels good,
  // and letting intimacy accumulate over time" / collapses when "unreliable,
  // unpredictable, or constantly changing".
  "loyal-ritualist": {
    lead: {
      before: "For you, sex is never a one-off event. It grows through ",
      bold: "continuity, rhythm, and deepening familiarity",
      after:
        ". Desire builds on knowing what works and returning to it, not on novelty for its own sake, and once the rhythm holds, intimacy accumulates instead of resetting.",
    },
    body: [
      "At your best you build an erotic life that gets richer with time, the kind most people assume is only possible at the beginning. That same reliance on rhythm is why inconsistency, or hot-and-cold attention, can quietly close you down faster than you would expect.",
      "Your full report maps what opens you, what shuts you off, the one pattern that most often gets in your way, and the rare strength that sets you apart.",
    ],
    closing: "Not a verdict. A mirror, and a map for where your intimacy goes next.",
  },

  // "desire begins in safety signals, praise, warmth, and the sense that they are
  // wanted and enough" / collapses when they "sense criticism, disinterest, or
  // comparison".
  "tender-devotee": {
    lead: {
      before: "For you, sex is never separate from feeling wanted. It opens through ",
      bold: "reassurance, warmth, and the sense of being chosen",
      after:
        ". Desire follows safety signals and evident affection rather than pressure, and once you feel accepted exactly as you are, your sensuality becomes tender and completely responsive.",
    },
    body: [
      "At your best you love with an openness that makes a partner feel unmistakably adored. That same sensitivity to approval is why criticism, or a small withdrawal nobody explains, can quietly close you down faster than you would expect.",
      "Your full report maps what opens you, what shuts you off, the one pattern that most often gets in your way, and the rare strength that sets you apart.",
    ],
    closing: "Not a verdict. A mirror, and a map for where your intimacy goes next.",
  },

  // "desire often begins in the mind, through curiosity about what works, how
  // bodies respond… When they feel competent and clear" / collapses when "chaotic,
  // unclear, or emotionally volatile".
  "analytical-sexualist": {
    lead: {
      before: "For you, desire usually starts in the mind. It runs on ",
      bold: "understanding, precision, and knowing what actually works",
      after:
        ". Arousal builds through clarity about how bodies respond, not through vagueness or guesswork, and once you feel competent and the signals are readable, attention turns into real heat.",
    },
    body: [
      "At your best you bring a rare, attentive competence — you notice what works and you can find it again. That same need for clarity is why vague communication, or a moment that turns emotionally volatile, can quietly close you down faster than you would expect.",
      "Your full report maps what opens you, what shuts you off, the one pattern that most often gets in your way, and the rare strength that sets you apart.",
    ],
    closing: "Not a verdict. A mirror, and a map for where your intimacy goes next.",
  },

  // "desire is often present beneath the surface, but it activates only when
  // pressure is low and the nervous system feels truly safe" / collapses when
  // "pressured, overstimulated, or emotionally unsafe".
  "quiet-withdrawer": {
    lead: {
      before:
        "For you, desire is usually already there, under the surface. It comes forward through ",
      bold: "safety, low pressure, and a nervous system that has settled",
      after:
        ". Arousal appears when nothing is being demanded and there is room to arrive in your own time, not when you are being drawn out, and once the pressure drops, wanting returns on its own.",
    },
    body: [
      "At your best you offer a calm, undemanding closeness a partner can genuinely rest in. That same protectiveness is why pressure to engage, or too much stimulation at once, can quietly close you down faster than you would expect.",
      "Your full report maps what opens you, what shuts you off, the one pattern that most often gets in your way, and the rare strength that sets you apart.",
    ],
    closing: "Not a verdict. A mirror, and a map for where your intimacy goes next.",
  },
};
