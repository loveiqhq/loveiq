// Insight-map "What you'll learn" — the second line.
//
// Added 2026-08-24 after friends-and-family feedback that the insight map
// "does not create ANY real value" and reads as filler. The diagnosis: each row
// carried ONE clause of about twelve words ("conflict shuts your desire down;
// fixing that beats any new technique"), which states a topic without ever
// saying anything the reader did not already suspect. A topic is not an
// insight.
//
// So each row now gets a second line: something specific and slightly
// uncomfortable about how that pattern actually behaves for this archetype,
// written to be recognisable on its own while leaving the mechanism and the
// what-to-do-about-it inside the chapter it links to. Resonance here, resolution
// behind the unlock.
//
// This copy is NOT in the copy matrix (`copy-matrix-v2.csv` / `report2-copy.ts`)
// and is not generated. It lives here for the same reason `report2-summary.ts`
// and `report2-hero-traits.ts` do: it is a layer added on top of the matrix, and
// regenerating the matrix must not silently drop it. If it is ever folded into
// the sheet, delete this file rather than letting the two disagree.
//
// Voice: second person, present tense, no em dashes, no question marks used as
// teases. Roughly 18-28 words per entry.
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
      "It rarely feels like a sex problem at the time. It feels like distance, and you connect the two days later.",
    tile2:
      "Intention is the part most partners skip, and it is why advice about technique keeps missing you entirely.",
    tile3:
      "Your invitations are real. They are just quiet enough that the person next to you reads them as nothing in particular.",
    tile4:
      "It is the rare state where you stop watching yourself, and it has conditions you can name once you see them.",
    tile5:
      "Waiting feels like patience from the inside. From the outside it looks like you do not want it, which makes the wait longer.",
  },

  "spark-seeker": {
    tile1:
      "Sameness never announces itself. Desire just gets quieter until you assume something is wrong with the relationship.",
    tile2:
      "The chase has to run both ways. The moment it goes one-directional the charge drains faster than either of you expects.",
    tile3:
      "Your opener reads as playful to you and as expectation to them, and neither of you has language for the gap.",
    tile4:
      "Not knowing what comes next is doing something specific for your nervous system, and you can build that on purpose.",
    tile5:
      "New is easy for you to reach for and rarely the thing that is missing. What is actually missing tends to sit closer to home.",
  },

  "sensual-connector": {
    tile1:
      "Obligation is quiet. It does not feel like pressure, it feels like the moment was decided without you in it.",
    tile2:
      "Your build starts hours earlier than most people think, which is why the last five minutes almost never rescue it.",
    tile3:
      "You are both waiting for the other to make it safe to start, and the wait reads as disinterest in both directions.",
    tile4:
      "Unhurried is not the same as slow. There is a particular quality of time your body opens to, and it is learnable.",
    tile5:
      "Keeping the peace costs something, and the bill arrives as wanting less rather than as an argument you could have had.",
  },

  "relational-nurturer": {
    tile1:
      "Giving without return does not register as resentment in you. It registers as tiredness, and tiredness gets mistaken for low libido.",
    tile2:
      "Being needed comes to you easily. Being tended to is the one you will have to ask for out loud, in words.",
    tile3:
      "Care is your opening move, and it lands as care rather than as an invitation. So it is received, and nothing follows.",
    tile4:
      "Your deepest pleasure runs through giving, which is a real strength right up until it is the only route your body knows.",
    tile5:
      "The loop seals itself: the emptier you get the more you give, and the further your own wanting moves out of reach.",
  },

  "radiant-performer": {
    tile1:
      "A partner who feels plenty and shows little is not rejecting you. Your body reads the silence as a verdict anyway.",
    tile2:
      "Being seen wanting you is the switch. Knowing that lets you ask for it without it feeling like fishing.",
    tile3:
      "You are waiting to be chosen, they are waiting to be invited, and both of you read the pause as the other's answer.",
    tile4:
      "Your desire is contagious when you let it show, which makes it a lever you can use rather than a fact about you.",
    tile5:
      "Ordinary attention outside the bedroom is what feeds it. When that goes quiet, wanting follows weeks before you notice.",
  },

  "explorer-of-edges": {
    tile1:
      "Judgement does not have to be spoken. A flicker of it is enough, and you will have closed before you decided to.",
    tile2:
      "Intensity without permission is just pressure. Permission is the part that makes an edge safe enough for you to actually want it.",
    tile3:
      "Raising the charge is how you say yes. To a careful partner it reads as a demand, and neither of you names it.",
    tile4:
      "The crossing matters less than the landing. Aftercare is not the epilogue for you, it is part of the peak itself.",
    tile5:
      "Shrinking to fit works, right until the version of you that wanted anything at all has gone quiet too.",
  },

  "curious-apprentice": {
    tile1:
      "The judgement is usually your own. Your body cannot tell the difference between being graded and being watched.",
    tile2:
      "Encouragement is not a nice-to-have for you, it is the mechanism. Without it curiosity turns into self-assessment.",
    tile3:
      "You are waiting for the ground to feel solid. They are reading the hesitation as a no and backing off politely.",
    tile4:
      "Getting it wrong together is the point, and it is the one condition under which you genuinely stop performing.",
    tile5:
      "Analysis feels like preparation. Mostly it is a way of staying safely outside the experience you wanted to have.",
  },

  "tender-devotee": {
    tile1:
      "Comparison lands harder on you than criticism does, and it closes something that takes days of steadiness to reopen.",
    tile2:
      "Out loud and early are both load-bearing. Being wanted quietly does not reach you, however true it is.",
    tile3:
      "Fishing for a yes is your invitation, and it is received as affection. Sweet, appreciated, and not acted on.",
    tile4: "Being clearly chosen is what tips you over, more than anything done to your body.",
    tile5:
      "Yes becomes a way of staying wanted, and every one of them moves you further from knowing what you want.",
  },

  "authority-conductor": {
    tile1:
      "Disrespect and disorder do the same thing to you. The frame goes, and desire goes with it, immediately.",
    tile2:
      "Command only works when the surrender is real. Compliance looks identical from outside and does nothing for you.",
    tile3:
      "You are holding for respect, they are holding for softness, and each of you reads the other's hold as coldness.",
    tile4:
      "For you, leading well and landing well are one movement. The calm afterwards is where the whole thing actually resolves.",
    tile5:
      "Grip is your tell. Once control stops being play and starts being defence, wanting has already left the room.",
  },

  "analytical-sexualist": {
    tile1:
      "Ambiguity costs you more than conflict does. You will keep working the puzzle instead of feeling anything at all.",
    tile2:
      "Honest feedback is genuinely erotic for you, which sounds clinical until you notice how rarely you get any.",
    tile3:
      "You are waiting for clarity, they are waiting for spontaneity, and each of you thinks the other is holding back.",
    tile4:
      "Refining something together is your form of intimacy, and it works precisely when nobody is being marked.",
    tile5:
      "Solving the moment removes you from it. The problem gets smaller and so, quietly, does the wanting.",
  },

  "emotional-voyeur": {
    tile1:
      "Being made the centre of attention too quickly does not excite you, it empties you out.",
    tile2:
      "Most of your arousal has happened before anyone is touched, which is why the room matters more than the technique.",
    tile3:
      "You set a mood and count it as an invitation. They are waiting for something they can be certain about.",
    tile4:
      "Privacy is a condition, not a preference. Nothing being owed is what lets the imagination reach your body at all.",
    tile5:
      "Your wanting is loud in private and vanishes the moment it has to be witnessed, which makes it look like it was never there.",
  },

  "loyal-ritualist": {
    tile1:
      "Change does not feel threatening in the moment. It quietly removes the conditions your body was relying on.",
    tile2:
      "Novelty is what everyone else gets sold. What opens you is the path your body already knows by heart.",
    tile3:
      "You are waiting for the ground to be steady, they are waiting for a move, and steadiness never arrives that way.",
    tile4:
      "Repetition is not boredom for you, it is the route. And it is specific enough to write down.",
    tile5:
      "When your rhythm breaks, desire goes with it. Rebuilding the rhythm works far better than trying to want more.",
  },

  "minimalist-companion": {
    tile1:
      "Pressure arrives through care as easily as through demand. Your body does not distinguish between the two.",
    tile2:
      "No goal is the entire point. The moment touch is heading somewhere it starts costing you something.",
    tile3:
      "Comfort is your opening. It is read as comfort, and so everybody stays comfortable and nothing begins.",
    tile4:
      "Nothing impressive is required, which turns out to be the one condition under which you can actually be present.",
    tile5:
      "It is not that you want less. Intimacy starts asking for more than you have, and wanting steps back to make room.",
  },

  "quiet-withdrawer": {
    tile1:
      "Rush is your trigger, not sex. Take it away and what looked like low desire is often still there underneath.",
    tile2:
      "Time to warm up is not a concession you are asking for. It is the mechanism your body actually runs on.",
    tile3:
      "You hold back for calm, they hold back for a signal, and both of you read the silence as the answer.",
    tile4:
      "For you, calm turning into real wanting is a repeatable sequence, and most people never get far enough in to see it happen.",
    tile5:
      "Pulling away to reduce the pressure creates more of it for you, which is why trying harder only tightens the loop.",
  },
};
