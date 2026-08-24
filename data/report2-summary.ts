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
      "You have probably had the experience of everything looking fine on paper, the two of you getting along, nothing obviously wrong, and still not reaching for each other. For you that is rarely about sex. It is usually something small left unsaid a week ago that never got closed.",
      "From here the report gets specific. Which conditions reliably open you and which quietly close you, why your invitations keep getting missed by someone who genuinely wants you, and the loop you fall into while you wait for the moment to feel right. There is also one strength in your profile that very few people carry, and it is not the one you would guess.",
    ],
    closing: "Not a verdict. A mirror, and a map for where your intimacy goes next.",
  },

  // The other 13 follow the Figma frame's SHAPE exactly — an opening claim, a
  // bolded triad, "Desire builds through X, not Y, and once Z…", then one
  // paragraph pairing the archetype's strength with what closes it — and take
  // their CONTENT from that archetype's own `core_archetype` / `motivation` /
  // `turn_offs` prose in `data/report-archetypes.ts`, converted from its third
  // person to the second person this block speaks in. The source clause each one
  // derives from is quoted above it.
  //
  // EXPANDED 2026-08-24. Friends-and-family feedback was that this block is "too
  // short, not inspiring enough" and should read as a real summary of the
  // reader's highest-scoring archetype. Two paragraphs were added to every entry
  // and one was removed:
  //   3rd — RECOGNITION. One ordinary, specific scene the reader has already
  //         lived, said plainly. This is the paragraph that has to land.
  //   4th — OPEN LOOP. Replaces the universal "Your full report maps what opens
  //         you, what shuts you off…" line, which was identical for all fourteen
  //         and therefore told nobody anything. Each version now names the
  //         specific things the paid chapters answer, in that archetype's own
  //         terms, without answering them. Resonance here, resolution behind the
  //         unlock — the free block must be worth reading on its own and must
  //         still leave something to buy.
  // Only the accent-coloured `closing` line is still universal, by design: it is
  // the frame's signature sign-off, not an argument.

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
      "The version you know well: the day was fine, the evening was fine, and by the time you are in bed you are somewhere else entirely. Nothing went wrong. Nobody was unkind. You were just not met anywhere along the way, and your body kept score of that without telling you.",
      "From here the report gets specific about what being met actually means for you, hour by hour rather than in the last five minutes. It also names the thing you do to keep the peace, what that quietly costs you, and why you and your partner can both be waiting for the other one to make it safe to start.",
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
      "You have felt it fade before, and you have probably read the fade as a verdict on the relationship. Six weeks in it was effortless, and now you are working at it. The fade is real. What it means is almost never what it looks like from inside it.",
      "From here the report gets specific: what actually reignites it for you, why the lever you reach for first is usually the wrong one, and the exact loop that has you chasing something new when the distance is the thing that needs attention. Relighting it is a skill, and it has steps.",
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
      "You know the tiredness. Not dramatic, not a fight, just less reaching for your partner and no obvious reason why. You will usually explain it as stress or a busy month. More often it is the arithmetic of how much has gone out and how little has come back.",
      "From here the report gets specific. What being tended to actually looks like for you and how to ask for it without it costing you something, why your care lands as care rather than as an invitation, and the loop where giving more is the very thing draining you. There is also a strength in here you have never been properly credited for.",
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
      "There is a particular silence you know. They are there, they are willing, and they show you nothing. Your body reads that as an answer even when your head knows better, and the evening goes quiet without either of you deciding it should.",
      "From here the report gets specific about what actually feeds you, why it has to happen outside the bedroom before it can happen in it, and how to ask to be wanted out loud without feeling like you are begging for it. It also names the pattern you fall into when the attention goes quiet, which starts weeks before you notice.",
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
      "You have made yourself smaller before. Not dramatically, just editing what you asked for down to something safe and telling yourself it was fine. It usually was fine. It also cost you something you did not price at the time.",
      "From here the report gets specific about where your edge actually sits, what turns intensity into pressure and permission into something you can want, and why the landing matters at least as much as the crossing. It also names the loop that starts when you shrink to fit, and what that loop eventually takes with it.",
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
      "You know the feeling of being in the room and slightly outside it at the same time. Watching how it is going. Grading yourself. It is not that you were not interested, it is that you never quite got in.",
      "From here the report gets specific about what makes it safe enough for you to stop assessing, why encouragement is the mechanism rather than a nicety, and how your hesitation reads to someone who is waiting for a sign. There is also a way you learn in this that almost nobody else has access to.",
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
      "Someone has probably told you that you want it less than other people do, and it has probably stuck. What is closer to true is that intimacy starts asking for more than you have, and wanting steps back to make room.",
      "From here the report gets specific about what pressure looks like when it arrives dressed as care, why touch with nowhere to go opens you while touch heading somewhere closes you, and how your version of closeness works when nobody is trying to make it more than it is.",
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
      "Most of it happens before anything happens. You have a rich and specific inner life around this that almost nobody has seen, and there is a moment where being asked to bring it into the room makes it disappear.",
      "From here the report gets specific about why privacy is a condition rather than a preference, what lets your imagination actually reach your body, and the loop where wanting is loud in private and vanishes the moment it has to be witnessed. That is not the same as not wanting, and the difference matters more than you think.",
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
      "You know the difference between someone doing what you asked and someone actually giving it to you. From the outside those look identical. One of them does nothing for you at all, and it is hard to explain why without sounding ungrateful.",
      "From here the report gets specific about what makes surrender real rather than compliant, why the calm afterwards is part of the thing and not the epilogue, and the point where holding the frame stops being play and turns into defence. Catching that turn early is most of the work.",
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
      "When the routine slips, the wanting slips with it, and the two rarely get connected. A run of travel, a changed schedule, something small rearranged, and a few weeks later it looks like a problem with desire rather than a problem with rhythm.",
      "From here the report gets specific about which parts of your rhythm are load-bearing and which are only habit, why the path your body already knows opens you where novelty does not, and how to rebuild it after a break without trying to force yourself to want more.",
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
      "Being compared to someone lands differently on you than being criticised does. It closes something that then takes days of ordinary kindness to reopen, and the person who said it will have forgotten by dinner.",
      "From here the report gets specific about why said out loud and said early both matter, how your way of inviting gets received as sweetness and left there, and the loop where saying yes becomes a way of staying wanted until you have lost track of what you wanted.",
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
      "You will recognise the moment you stop being in it and start working it out. Reading the situation, adjusting, checking whether it is going well. The trouble is that the working out happens instead of the experience rather than alongside it.",
      "From here the report gets specific about why ambiguity costs you more than conflict does, what honest feedback actually does to your arousal, and the loop where solving the moment quietly removes you from it. There is also a form of intimacy available to you that most people never get near.",
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
      "You have probably concluded at some point that you are simply someone who does not want it much. Notice how often that conclusion arrives just after a stretch where you felt pushed. Take the rush out and something is usually still there.",
      "From here the report gets specific about what your body counts as pressure, why time to warm up is the mechanism rather than a concession you are asking for, and the loop where pulling away to lower the pressure reliably produces more of it. That loop has a way out, and it is not trying harder.",
    ],
    closing: "Not a verdict. A mirror, and a map for where your intimacy goes next.",
  },
};
