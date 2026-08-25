// Growth Potentials — the prose under each ladder rung.
//
// SERVER ONLY. This is FULL_REPORT-tier paid copy: import it from
// `app/api/report/route.ts` and thread the resolved strings down as props, the
// way `growthCopy` already handles the rungs. Importing it from a client
// component would ship every archetype's paid chapter into the browser bundle,
// which is the exact leak `archetypeContent` was restructured to close.
//
// WHY IT EXISTS. The chapter was five `from → to` pairs of four to eight words
// each plus a one-line first move. Mark's read (2026-08-25): the chapter is
// crucial and the ladder was "too mechanic", "crossing out things" in "very
// short keywords". The old report's growth chapter is what he says he feels
// seen by, and its register is doing three things the ladder never did:
//
//   1. It names the MISCONCEPTION about the archetype before anything else, so
//      the reader is defended rather than diagnosed ("a common misconception is
//      that this sexuality is shallow — in reality it is highly alive").
//   2. It names the loop the reader is actually in, and rewrites it — the
//      device that makes a growth line actionable rather than aspirational:
//      "boredom → distancing → blame" becomes "boredom → request → shared play".
//   3. It says what the shift looks like in an ordinary week, in the second
//      person, without instructing.
//
// So the ladder stays — it is scannable, per-archetype and already right — and
// each rung gains a body in that register. `opener` runs above the ladder.
//
// TIGHTENED 2026-08-26. The first pass ran 90-130 words a rung and re-explained
// the dynamic each time. By this chapter the reader has been through the whole
// report, so the pattern needs a reference, not a re-derivation. Mark's note:
// shorter, at most three sentences, and more PRACTICAL.
//
// Shape of every body now: one sentence naming the cost in recognisable terms,
// then one or two saying what to do differently. No loop diagrams, no build-up.
// The rung's `move` follows as the single concrete action, so a body never has
// to end on an instruction — it hands over to one.
//
// Voice: second person, present tense, no em dashes. Three sentences maximum,
// roughly 30-55 words.
import type { Report2CopySlug } from "./report2-config";

export interface GrowthDetail {
  /** Sits above the ladder: the misconception, then what is actually true. */
  opener: string;
  rung1: string;
  rung2: string;
  rung3: string;
  rung4: string;
  rung5: string;
}

export const growthDetail: Partial<Record<Report2CopySlug, GrowthDetail>> = {
  "spiritual-lover": {
    opener:
      "The Spiritual Lover gets read as precious, or slow, or hard to satisfy. It is none of those: it is conditional, and the conditions are presence, safety and nothing important left unsaid. All three can be built rather than waited for.",
    rung1:
      "You wait for the conditions to be right, so in a week where they never quite land, nothing happens. Build one instead of waiting for all three. Presence is the cheapest to make and the one that moves the others.",
    rung2:
      "Your invitations are real and quiet enough to be missed. Say the thing before the mood has to carry it. One plain sentence beats an evening of signalling.",
    rung3:
      "You file a flat night as evidence, and the bracing that follows is what flattens the next one. Treat an ordinary evening as an ordinary evening. The repair is one sentence, said the same day.",
    rung4:
      "You reach past the body on the way to something deeper, which is a strange move for a sexuality this embodied. Give the body an evening where it is the whole point. Depth is allowed to be absent.",
    rung5:
      "The yes that keeps the peace costs you the next one, because your body learns that its answer is negotiable. Say the truth early, while it is still small. Repair is part of the intimacy, not a threat to it.",
  },

  "sensual-connector": {
    opener:
      "The Sensual Connector reads as easy and uncomplicated, which misses how much has to be right first. Your desire is relational: it moves once it has been met. What is missing is a way in when the meeting has not happened yet.",
    rung1:
      "You wait to be warmed up, and when nobody reaches you read it as not being in the mood rather than as not being approached. Start yourself, low and slow, for no one. Most of what you thought had gone is still there.",
    rung2:
      "Your hints are generous and nearly invisible, and when they are missed you retreat rather than repeat. Use plain words instead, early. Late in the evening is already too late.",
    rung3:
      "Distance sets off an alarm that has little to do with the actual evening, and you reach at the worst moment. Wait ten minutes before acting on it. Distance usually stretches and comes back on its own.",
    rung4:
      "Anything new means rebuilding your safety from scratch, so the repertoire quietly narrows. Change one variable and hold everything else exactly as it is. Narrow is protection, not preference.",
    rung5:
      "A braced yes teaches your body that sex is something to get through. Give an honest maybe instead. Asking to be warmed up is a request, not a rejection.",
  },

  "spark-seeker": {
    opener:
      "Spark Seekers get called shallow or commitment-shy. Neither holds: this is a system that answers fast to charge and goes all in when it is there. The work is making the charge yourself, so it can light a quiet Tuesday.",
    rung1:
      "You wait for the charge to arrive from outside, and read its absence as the wanting having gone. What has gone is the input. Supply a small one and watch how fast your system still answers.",
    rung2:
      "Restlessness moves you before it speaks: you go quieter and further away, and your partner gets careful, which is the least charged thing they could do. Ask instead of drifting. One specific thing to play with tonight.",
    rung3:
      "Calm registers as dead, and that reading has you reaching for the exit long before anything is wrong. Sit in it ten minutes longer than is comfortable. Quiet is usually just quiet.",
    rung4:
      "You avoid depth to protect the spark, and end up with something fun and slightly thin. Depth does not have to be heavy, only true. One honest sentence, then straight back to teasing.",
    rung5:
      "Freedom measured in exits is a slow leak: an agreement you have not chosen is one you resent. Choose one out loud instead. Chosen is the only version that stays charged.",
  },

  "relational-nurturer": {
    opener:
      "The Relational Nurturer is called selfless, which sounds like praise and works like a trap. Care is a real erotic route, not a substitute for one. What is missing is the other half: receiving.",
    rung1:
      "You give to feel safe, which means everything flows outward and desire has nowhere to arrive. Let them tend to you and do not pay it back the same evening. That discomfort is the point.",
    rung2:
      "Going quiet keeps the peace until the unsaid thing turns into resentment, and resentment does not stay in the conversation you avoided. Name it while it is small. Small is when it can still be said kindly.",
    rung3:
      'You treat your own wanting as an imposition, ask for nothing, then feel unseen for not being offered it. Say "I want this too" and stop there. No case for why you have earned it.',
    rung4:
      "Sex has joined the list of things you do for the relationship, and a body treats a task like a task. Build one evening around your pleasure. Nothing owed back afterwards.",
    rung5:
      "You absorb the extra thing every time, and a body carrying everyone does not want anything. Say no to one you would normally take on. No explanation attached.",
  },

  "radiant-performer": {
    opener:
      "Radiant Performers get called attention-seeking. What is actually true is narrower: your desire runs on visible response, and most people show far less than they feel. A second source is what keeps a quiet partner from reading as a verdict.",
    rung1:
      "Your wanting waits for the mirror, which puts your erotic life at the mercy of how demonstrative someone happens to be. Build some of it before anyone is watching. It holds better than you expect.",
    rung2:
      "You perform instead of asking, and a partner who misses the performance has no idea a request was made. Say the thing the performance was for. Plainly, out loud.",
    rung3:
      "A content but undemonstrative partner reads as one losing interest, and you act on that before checking it. Wait ten minutes before you do anything with the story. It usually dissolves.",
    rung4:
      "Being wanted for being impressive rules out every evening you are tired or ordinary, which is most of them. Receive without performing once. Nothing to be good at.",
    rung5:
      "When you are hungry for it, any attention will do, and the cheap kind leaves you further from what you wanted. Ask the person who matters for one real look. One counts more than ten that do not.",
  },

  "explorer-of-edges": {
    opener:
      "Explorers of Edges get treated as a risk to manage. The truth is narrower: your desire needs charge and permission, and it is the permission that keeps getting left out. Range is the growth, not restraint.",
    rung1:
      "When the charge drops you reach for more edge rather than a different kind, and the ladder only goes one way. Choose the intensity deliberately. A three can work as well as a nine.",
    rung2:
      "Testing sideways works with the right partner and lands as a demand on a careful one, who says nothing. Name the thing plainly. Agree an edge and a way to stop before you start.",
    rung3:
      "A flicker of hesitation lands as judgement and closes you instantly, so you hide the want and guarantee you never get it. Ask what the hesitation was. It is usually about the thing, not about you.",
    rung4:
      "Soft reads as boring, so your whole erotic life happens above a certain temperature. Anticipation is charge too. Run one slow night on teasing alone.",
    rung5:
      "You bring real desires to people who cannot hold them, then conclude the desires are the problem. The audience was. Say one real thing to someone who has earned it.",
  },

  "curious-apprentice": {
    opener:
      "Curious Apprentices get read as inexperienced. What is actually happening is that you are learning in a room where you believe you are being marked. Curiosity works fine without confidence, as soon as nobody is grading.",
    rung1:
      "Waiting to be told what works puts your pleasure in someone else's hands and makes you dependent on how good a teacher they are. The best source is in your own bed. Find out alone first.",
    rung2:
      "Safe enough never quite arrives, because what makes it safe is having asked once and survived. Ask before you feel ready. The asking is what builds the readiness.",
    rung3:
      "A fumble puts you outside the experience reviewing it, and the reviewing is what ends the evening, not the fumble. Say it out loud and come back. One sentence is enough.",
    rung4:
      "Waiting for certainty rules out most of what you would enjoy, because certainty arrives last. Try it and let a flop be funny. A flop costs nothing.",
    rung5:
      "Saying yes to seem experienced puts your body somewhere it did not choose, and bodies remember that. No to the rushed thing. Yes to the one you are actually curious about.",
  },

  "minimalist-companion": {
    opener:
      "Minimalist Companions get told they have low desire. It is a very low pressure tolerance: what looks like not wanting is usually wanting that was asked for too loudly. Calm is the on-ramp, and you can build it yourself.",
    rung1:
      "Waiting to feel unpressured rarely resolves for you, because pressure is almost always somewhere. Ease yourself in early and slowly. No goal, nothing to reach.",
    rung2:
      "Going silent is much harder to respond to than a no, so your partner reads disinterest and backs further away. Say your pace out loud. While there is still an evening to adjust.",
    rung3:
      "Feeling crowded becomes evidence that you are not enough, and that reading is heavier than the crowding was. Treat pressure as a signal to slow down. Say so plainly.",
    rung4:
      "Anything new arrives as a demand, so your range stays exactly where it is: safe, and slowly less alive. Add one small new thing inside something comfortable. Nothing to perform.",
    rung5:
      "The easy yes keeps the evening pleasant and teaches your body that closeness costs effort. Decline the effortful moment, warmly. Yes only from real ease.",
  },

  "emotional-voyeur": {
    opener:
      "Emotional Voyeurs get read as withholding. In fact most of your erotic life has already happened before anyone touches you, and being pulled into the open too fast ends it. The work is a bridge, built on your own terms.",
    rung1:
      "Your wanting is vivid in private and almost none of it makes the crossing, so a partner has no idea how much is there. Warm up where it works, then carry one piece of it in. One is enough.",
    rung2:
      "You retreat quietly enough that nobody knows a limit was reached. Say the pace you need before you go. Not afterwards.",
    rung3:
      "Being looked at reads as being assessed, so you arrange never to be quite visible and are never quite met. Be watched for ten seconds on purpose. Stay long enough to see that nothing happened.",
    rung4:
      "You close at the exact moment the thing you want most arrives. Try a little seen rather than not at all. Low light rather than none.",
    rung5:
      "Desire kept hidden to stay safe has nowhere to grow, and eventually you believe it could not be received. Say one fantasy out loud. To someone who has shown they can hear it.",
  },

  "authority-conductor": {
    opener:
      "Authority Conductors get read as controlling. Responsible is the better word: you hold the frame because you have learned what happens when nobody does. The frame can hold you too, and that is the part you are actually after.",
    rung1:
      "Running it is how you stay regulated, which works and means you never arrive anywhere yourself. Hand over one small decision and let it stand. The room does not fall apart.",
    rung2:
      "A want phrased as an instruction gets obeyed rather than met, and hides you in the process. Say one desire with no structure around it. Nothing to comply with.",
    rung3:
      "Disrespect makes you tighten, and tightening turns a difference of opinion into a standoff. Ask what they meant first. Decide afterwards.",
    rung4:
      "Staying in charge past the end means you never receive the part that closes it. Let the scene finish and stop managing the room. Aftercare is not the epilogue.",
    rung5:
      "Control keeps things predictable, which is the enemy of the surrender you want. Leave one moment unplanned. Stay in your body through it rather than above it.",
  },

  "loyal-ritualist": {
    opener:
      "Loyal Ritualists get called routine, as though the routine were the limitation. It is the mechanism: your body opens on a path it trusts. The work is making that safety portable, so a changed week does not take your desire with it.",
    rung1:
      "Your safety lives in the exact sequence, so when any part of it moves there is nothing left to reach for. Pick one cue you can take anywhere. Then the ground travels with you.",
    rung2:
      "Waiting to be remembered turns into a ledger neither of you is reading aloud. Name the one thing that settles you. Tonight, in a sentence.",
    rung3:
      "A changed plan sets off the same alarm as a changed commitment, long before there is anything to worry about. Wait before you decide what it meant. Life moving is usually all it is.",
    rung4:
      "Treating new as dangerous narrows the path to whatever survived: safe, and increasingly thin. Add one small new thing to a ritual you already love. Leave everything else alone.",
    rung5:
      "Yes to avoid disappointing them puts your body somewhere it has not caught up to, and the ritual stops being yours. Turn down the rushed moment. Let yes wait for your body.",
  },

  "tender-devotee": {
    opener:
      "Tender Devotees get called needy. It is more precise than that: your desire runs on being chosen, and chosen has to be shown rather than assumed. What is missing is worth you can feel without proof.",
    rung1:
      "Worth that arrives through pleasing makes every encounter a small performance of value. Bring something of your own into the room first. Before anyone confirms it.",
    rung2:
      "Fishing gets read as sweetness, so you receive affection that does not answer what you asked. Ask plainly instead, once. Given beats extracted.",
    rung3:
      "A quiet evening becomes a verdict, and you act on the verdict before checking it. Ask what is actually true. Do not decide it for them.",
    rung4:
      "Sex used as proof means your own pleasure is rarely the point, and a body that is never the point stops speaking up. Ask for one thing that is purely yours. No reciprocity attached.",
    rung5:
      "Every small yes teaches you that the love depends on them. Decline one thing without over-explaining. The love holds, and now you know it.",
  },

  "analytical-sexualist": {
    opener:
      "Analytical Sexualists get called clinical. In fact the mind is the on-ramp: understanding something is genuinely arousing for you, and that is a route rather than a defence. The work is letting the body speak before every question is answered.",
    rung1:
      "The analysis runs first and the body waits its turn, which it does not always take. Notice one good sensation before you explain it. The explanation can wait.",
    rung2:
      "Ten reasonable questions add up to an audit, and an audited partner gives you less to work with. Ask the single one you need. Then stop.",
    rung3:
      "Uncertainty tightens you at exactly the point where loosening is what is called for. Say it out loud instead of solving it. Not certain, still good.",
    rung4:
      "A fully planned evening has no room left for the thing you were hoping would happen. Set one rule and a short window. Improvise inside it.",
    rung5:
      "Marked sex is not sex you can lose yourself in, and you are always marking. Run one round where nothing is assessed. Wrong is allowed.",
  },

  "quiet-withdrawer": {
    opener:
      "Quiet Withdrawers get read as uninterested. The desire is there until pressure arrives, and then it is not, which is a switch rather than an absence. Switches can be understood, and this one can be worked with.",
    rung1:
      "Calm that depends on nothing being asked of you is held in someone else's hands, so closeness and calm end up opposed. Make some yourself before contact. Five slow breaths is enough to start.",
    rung2:
      "You go less present before you say anything, and by the time it shows there is nothing to respond to. Name it while you are still in the room. One sentence.",
    rung3:
      "You have no setting between fine and gone, so ordinary friction costs far more than it should. Pause instead of vanishing. One minute, out loud, then back.",
    rung4:
      "Safe at a distance means safety and closeness never occupy the same moment. Stay two minutes past the point you would normally pull away. Calm contact, nothing more.",
    rung5:
      "The yes that avoids conflict teaches your body that sex happens to you. No to the pushed moment. Yes to the genuinely calm one.",
  },
};
