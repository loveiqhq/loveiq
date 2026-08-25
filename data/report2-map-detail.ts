// Insight-map pattern descriptions.
//
// HISTORY. The rows originally carried ONE clause of about twelve words from
// the copy matrix ("conflict shuts your desire down; fixing that beats any new
// technique") — a topic, not an insight, and the friends-and-family read was
// that the map "does not create ANY real value". A second sentence was added
// under it on 2026-08-24. On 2026-08-25 the two were merged: two stacked lines
// read as a label and a footnote arguing with each other, so each row now gets
// ONE description that runs as prose.
//
// Each entry therefore OPENS on the matrix clause, rephrased into a sentence,
// and continues into the specific, slightly uncomfortable part: how that
// pattern actually behaves for this archetype, recognisable on its own, with
// the mechanism and the what-to-do-about-it left inside the chapter the row
// links to. Resonance here, resolution behind the unlock.
//
// These SUPERSEDE `map["tileN.sub"]` in `report2-copy.ts` for display; the
// matrix clause still renders as the fallback for an archetype with no entry
// here. If the matrix is ever rewritten to carry full descriptions, delete this
// file rather than letting the two disagree.
//
// Voice: second person, present tense, no em dashes. Two to three sentences.
import type { Report2CopySlug } from "./report2-config";

export interface MapLearnDetail {
  tile1?: string;
  tile2?: string;
  tile3?: string;
  tile4?: string;
  tile5?: string;
}

export const mapLearnDetail: Partial<Record<Report2CopySlug, MapLearnDetail>> = {
  "spiritual-lover": {
    tile1:
      "Conflict is what shuts your desire down, and repairing it will do more than any new technique. It rarely feels like a sex problem at the time. It feels like distance, and you connect the two days later.",
    tile2:
      "Your strongest turn-on is touch with clear intention behind it. Intention is the part most partners skip, and it is why advice about technique keeps missing you entirely.",
    tile3:
      "You invite through presence, your partner misses it, and nobody starts. The invitations are real. They are just quiet enough that the person next to you reads them as nothing in particular.",
    tile4:
      "Mutual surrender, where mind and body both say yes. It is the rare state in which you stop watching yourself, and it has conditions you can name once you see them.",
    tile5:
      "The waiting loop is the cycle that quietly eats your desire. Waiting feels like patience from the inside. From the outside it looks like you do not want it, which makes the wait longer.",
  },

  "spark-seeker": {
    tile1:
      "Predictability shuts your desire down, and changing one thing beats trying harder. Sameness never announces itself. Desire just gets quieter until you assume something is wrong with the relationship.",
    tile2:
      "Being chased, and chasing back, is your strongest turn-on. It has to run both ways. The moment it goes one-directional the charge drains faster than either of you expects.",
    tile3:
      "You tease lightly, your partner feels pressured, and nobody says so. Your opener reads as playful to you and as expectation to them, and neither of you has language for the gap.",
    tile4:
      "Not knowing what comes next, and wanting more of it. That uncertainty is doing something specific for your nervous system, and once you know what, you can build it on purpose.",
    tile5:
      "The novelty loop has you chasing new thrills instead of closing the distance. New is easy for you to reach for and rarely the thing that is missing. What is actually missing tends to sit closer to home.",
  },

  "sensual-connector": {
    tile1:
      "Sex that feels owed shuts your desire down, and removing the pressure beats pushing through. Obligation is quiet. It does not feel like pressure, it feels like the moment was decided without you in it.",
    tile2:
      "Touch that starts long before sex does is your strongest turn-on. Your build begins hours earlier than most people think, which is why the last five minutes almost never rescue it.",
    tile3:
      "You wait to feel welcomed, your partner waits for words. You are both waiting for the other to make it safe to start, and the wait reads as disinterest in both directions.",
    tile4:
      "Unhurried skin-to-skin, a whole evening with nothing owed. Unhurried is not the same as slow. There is a particular quality of time your body opens to, and it is learnable.",
    tile5:
      "The harmony loop is how keeping the peace quietly costs you wanting. That cost is real, and the bill arrives as wanting less rather than as an argument you could have had.",
  },

  "relational-nurturer": {
    tile1:
      "One-sided giving quietly shuts your desire down, and sharing the load beats any new move. Giving without return does not register as resentment in you. It registers as tiredness, and tiredness gets mistaken for low libido.",
    tile2:
      "Being tended to, not just wanted, is your strongest turn-on. Being needed comes to you easily. Being tended to is the one you will have to ask for out loud, in words.",
    tile3:
      "You show love by giving, your partner waits for a move, and nobody starts. Care is your opening move, and it lands as care rather than as an invitation. So it is received, and nothing follows.",
    tile4:
      "Slow tending touch, where giving comfort becomes your deepest pleasure. That route is a real strength, right up until it is the only one your body knows.",
    tile5:
      "The over-giving loop: you give more while your own wanting quietly drains. It seals itself, because the emptier you get the more you give, and the further your wanting moves out of reach.",
  },

  "radiant-performer": {
    tile1:
      "A flat, unreacting partner shuts your desire down, and fixing that beats any new move. Someone who feels plenty and shows little is not rejecting you. Your body reads the silence as a verdict anyway.",
    tile2:
      "Being watched with open desire is your strongest turn-on. Being seen wanting you is the switch, and knowing that lets you ask for it without it feeling like fishing.",
    tile3:
      "You wait to feel wanted, your partner waits for you to start, and nobody moves. Both of you read the pause as the other's answer.",
    tile4:
      "Desire you show out loud, and how it spreads to your partner. It is contagious when you let it show, which makes it a lever you can use rather than a fact about you.",
    tile5:
      "The spotlight loop: wanting fades as everyday attention goes quiet. Ordinary attention outside the bedroom is what feeds it, and when that thins out, desire follows weeks before you notice.",
  },

  "explorer-of-edges": {
    tile1:
      "Feeling judged shuts your desire down, and removing that beats any new technique. Judgement does not have to be spoken. A flicker of it is enough, and you will have closed before you decided to.",
    tile2:
      "Consented edge and clear intensity: that is your strongest turn-on. Intensity without permission is just pressure, and permission is the part that makes an edge safe enough for you to actually want it.",
    tile3:
      "You start by raising the charge, a careful partner feels pushed, and nobody says so. Raising the charge is how you say yes; to them it reads as a demand.",
    tile4:
      "Crossing a threshold together, safely held, then landing softly in aftercare. The crossing matters less than the landing: aftercare is not the epilogue for you, it is part of the peak.",
    tile5:
      "The dimming loop: you shrink your edge to fit, until wanting fades too. It works, right until the version of you that wanted anything at all has gone quiet with it.",
  },

  "curious-apprentice": {
    tile1:
      "Feeling judged shuts your desire down, and safety to try beats any new technique. The judgement is usually your own, and your body cannot tell the difference between being graded and being watched.",
    tile2:
      "A partner who guides and cheers you on is your strongest turn-on. Encouragement is not a nice-to-have here, it is the mechanism. Without it, curiosity turns into self-assessment.",
    tile3:
      "You hold back until it feels safe, your partner waits for a bolder move. You are waiting for the ground to feel solid; they are reading the hesitation as a no and backing off politely.",
    tile4:
      "Trying something new together, with zero fear of getting it wrong. Getting it wrong together is the point, and it is the one condition under which you genuinely stop performing.",
    tile5:
      "The overthinking loop: you grade yourself instead of feeling, until wanting fades. Analysis feels like preparation. Mostly it is a way of staying safely outside the experience you wanted to have.",
  },

  "tender-devotee": {
    tile1:
      "Harsh words or feeling compared switch your desire off, and steady kindness reopens it faster than any move you could try. Comparison lands harder on you than criticism does, and it closes something that takes days to reopen.",
    tile2:
      "Being told you are wanted, out loud and early, is your strongest turn-on. Out loud and early are both load-bearing: being wanted quietly does not reach you, however true it is.",
    tile3:
      "You open by fishing for a yes, your partner reads sweetness and waits, and the moment stalls. It is received as affection. Sweet, appreciated, and not acted on.",
    tile4:
      "Warm, affirming touch, where feeling clearly chosen tips you into pleasure. Being chosen does more for you than anything done to your body.",
    tile5:
      "The pleasing loop: you say yes to stay wanted while your own wanting goes quiet. Every yes moves you a little further from knowing what you actually want.",
  },

  "authority-conductor": {
    tile1:
      "When respect slips or things turn chaotic your desire closes, and clearing that beats any move. Disrespect and disorder do the same thing to you: the frame goes, and desire goes with it, immediately.",
    tile2:
      "Clean, consented command met with real surrender is your strongest turn-on. Command only works when the surrender is real. Compliance looks identical from outside and does nothing for you.",
    tile3:
      "You wait for clear respect, your partner waits for softness, and the moment stalls. Each of you reads the other's hold as coldness.",
    tile4:
      "Leading a clear scene, then the settling calm of aftercare together. For you, leading well and landing well are one movement, and the calm afterwards is where the whole thing resolves.",
    tile5:
      "The hardening loop: you grip tighter for control until wanting turns to defence. Grip is your tell. Once control stops being play, desire has already left the room.",
  },

  "analytical-sexualist": {
    tile1:
      "Vague, mixed signals shut your desire down, and clearing them up beats any new move. Ambiguity costs you more than conflict does: you will keep working the puzzle instead of feeling anything at all.",
    tile2:
      "A clear plan and honest feedback are your strongest turn-on. Feedback is genuinely erotic for you, which sounds clinical until you notice how rarely you get any.",
    tile3:
      "You hold off until things feel clear, your partner waits for spontaneity, and nobody moves. Each of you thinks the other is holding back.",
    tile4:
      "Refining what works together, with clear feedback and no shame. Refining something together is your form of intimacy, and it works precisely when nobody is being marked.",
    tile5:
      "The troubleshooting loop: you solve the moment instead of feeling it, until wanting fades. Solving it removes you from it. The problem gets smaller and so, quietly, does the wanting.",
  },

  "emotional-voyeur": {
    tile1:
      "Being rushed into the spotlight shuts your desire down, and taking the pressure off beats any new technique. Being made the centre of attention too quickly does not excite you, it empties you out.",
    tile2:
      "Watching, sensing and imagining before you ever touch: that is your strongest turn-on. Most of your arousal has happened before anyone is touched, which is why the room matters more than the technique.",
    tile3:
      "You open with atmosphere, your partner waits for a clear signal, and the moment stalls. You set a mood and count it as an invitation; they are waiting for something they can be certain about.",
    tile4:
      "A private, unhurried build where imagination leads and nothing is owed. Privacy is a condition, not a preference: nothing being owed is what lets the imagination reach your body at all.",
    tile5:
      "The retreat loop: wanting thrives in private and hides when sex asks you to be seen. Your wanting vanishes the moment it has to be witnessed, which makes it look like it was never there.",
  },

  "loyal-ritualist": {
    tile1:
      "Inconsistency and last-minute changes shut your desire down, and a reliable rhythm beats any new move. Change does not feel threatening in the moment. It quietly removes the conditions your body was relying on.",
    tile2:
      'The trusted rhythm of "our way" is your strongest turn-on. Novelty is what everyone else gets sold; what opens you is the path your body already knows by heart.',
    tile3:
      "You both wait, you for security and your partner for a bolder move, so nothing starts. Steadiness never arrives that way.",
    tile4:
      "Familiar touch that follows the path your body already trusts. Repetition is not boredom for you, it is the route, and it is specific enough to write down.",
    tile5:
      "The broken-rhythm loop: when your routine slips, so does your wanting. Rebuilding the rhythm works far better than trying to want more.",
  },

  "minimalist-companion": {
    tile1:
      "Pressure shuts your desire down, and taking it away beats any new technique. It arrives through care as easily as through demand, and your body does not distinguish between the two.",
    tile2:
      "Simple, unhurried touch with no goal is your strongest turn-on. No goal is the entire point: the moment touch is heading somewhere it starts costing you something.",
    tile3:
      "You start with comfort, your partner waits for a clearer move, and nobody begins. Comfort is read as comfort, so everybody stays comfortable and nothing happens.",
    tile4:
      "Easy, low-pressure closeness, where nothing needs to be impressive. That turns out to be the one condition under which you can actually be present.",
    tile5:
      "The overload loop: wanting fades as intimacy starts to feel like too much. It is not that you want less. Intimacy asks for more than you have, and wanting steps back to make room.",
  },

  "quiet-withdrawer": {
    tile1:
      "Pressure and rush shut your desire down, and easing them beats any new move. Rush is your trigger, not sex. Take it away and what looked like low desire is often still there underneath.",
    tile2:
      "Gentleness, low pressure and time to warm up are your strongest turn-on. Time to warm up is not a concession you are asking for, it is the mechanism your body runs on.",
    tile3:
      "You hold back for calm, your partner holds back for a clear move, and nobody starts. Both of you read the silence as the answer.",
    tile4:
      "Slow, unhurried closeness, where calm finally turns into real wanting. For you that is a repeatable sequence, and most people never get far enough in to see it happen.",
    tile5:
      "The shutdown loop: pressure rises, your desire vanishes, and pulling away invites more pressure. Trying harder only tightens it.",
  },
};
