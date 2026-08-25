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
// Shape of every body: what you actually do (named without flattery), why that
// is not a flaw, what it costs anyway, then the loop rewrite. The existing
// `rungN.move` still closes the rung, so bodies never end on an instruction.
//
// Voice: second person, present tense, no em dashes. Roughly 90-130 words.
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
      "The common misreading of the Spiritual Lover is that this sexuality is precious, or slow, or asks for more than a normal week can give. It is none of those. It is conditional, and the conditions are real: presence, safety, nothing important left unsaid. Growth here is not learning to need less. It is learning that the conditions can be built rather than waited for.",
    rung1:
      'You quietly outsource the conditions for desire. If the evening feels right, if nothing is unsaid, if you feel properly met, then wanting arrives. That is not a flaw, it is what depth costs. But it leaves your erotic life dependent on a mood neither of you controls, and in a week where the mood never quite lands you can go from "we\'re fine" to "we haven\'t in a month" without either of you deciding anything. The shift is from waiting for the conditions, to withdrawing when they do not come, to reading the distance as a verdict on the relationship. It becomes: notice a condition is missing, make one of them yourself, let the mood follow the move instead of preceding it.',
    rung2:
      "You communicate in weather. A longer look, a change of tone, a conversation that goes somewhere real and is meant as an invitation. To you that is unmistakable. To your partner it is a nice evening. Nothing is wrong with how you signal, except that it needs a translator, and the person who most needs to understand it does not have one. The shift is from signalling through mood, to feeling unmet when it is missed, to concluding they are not really present. It becomes: one sentence they can act on, said before the mood has to carry it.",
    rung3:
      "A flat night reads to you as evidence. Not consciously, but somewhere underneath, an evening that does not reach depth gets filed as proof that something is going. That reading is why you brace, and bracing is what actually flattens the next one. The shift is from an ordinary disconnected evening, to reading it as decline, to withdrawing to protect yourself from the answer. It becomes: an ordinary evening is an ordinary evening, and the repair is one sentence long.",
    rung4:
      "Meaning, for you, lives above the neck. Sex is a way to reach something, and touch that is only touch can feel like it is missing the point. So you skip past the body on the way somewhere else, which is a strange thing for a sexuality this embodied to do. The shift is from wanting the transcendent version, to finding the merely physical disappointing, to needing more from every encounter than most encounters can carry. It becomes: an evening where the body is the whole point, and depth is allowed to be absent without anything being wrong.",
    rung5:
      "You keep the peace with your body. Saying yes when the answer is not quite yes, because the alternative is a conversation that might cost the closeness. It works, and it costs you the thing it was protecting: a yes that is not fully yours makes the next one harder to feel. The shift is from sensing a no, to saying yes anyway to protect the connection, to feeling further away afterwards for reasons you cannot name. It becomes: the truth said early, and repair treated as part of the intimacy rather than a threat to it.",
  },

  "sensual-connector": {
    opener:
      "The Sensual Connector gets read as easy, warm, uncomplicated. That reading misses how much has to be right first. Your desire is not low-maintenance, it is relational: it needs to be met before it will move, and being met is not something you can order. Growth is not becoming less dependent on connection. It is gaining a way in when the connection has not happened yet.",
    rung1:
      "You wait to be warmed up, and you are very good at waiting. Someone reaches for you, something opens, and your body follows beautifully. When nobody reaches, nothing happens, and you read that as not being in the mood rather than as not having been approached. The shift is from waiting to be started, to concluding your desire is gone, to organising your week around a libido you think has left. It becomes: start yourself, low and slow and for no one, and find out what is actually still there.",
    rung2:
      "You hint. A softer voice, an earlier bedtime, standing a little closer. It is generous, because it never puts pressure on anyone. It is also nearly invisible, and when it is missed you do not repeat it, you retreat. The shift is from hinting, to being missed, to deciding they are not paying attention. It becomes: plain words, once, early enough that neither of you is already tired.",
    rung3:
      "Distance reads as danger to you fast. A short answer, a night facing away, and a low alarm starts that has very little to do with the actual evening. Then you reach, or over-reach, at exactly the moment reaching lands worst. The shift is from noticing distance, to reading threat, to closing it too hard and too soon. It becomes: distance can stretch and come back, and ten minutes of not acting is usually enough to find out.",
    rung4:
      "Novelty is not exciting to you, it is exposing. Anything new means the safety has to be rebuilt from scratch, and rebuilding is the expensive part. So the repertoire narrows, quietly, and then narrowness starts reading as boredom rather than as protection. The shift is from wanting something to change, to the new thing feeling unsafe, to going back to what is known and feeling flatter each time. It becomes: one variable at a time, everything else held exactly as it is.",
    rung5:
      "Your yes is often a braced yes. Not unwilling, but bracing, going along with something before your body has caught up because the alternative feels like rejecting someone. And a braced yes teaches your body that sex is something to get through. The shift is from not being ready, to saying yes anyway, to your body learning to expect being ahead of itself. It becomes: an honest maybe, out loud, and the warming-up asked for rather than skipped.",
  },
  "spark-seeker": {
    opener:
      "Spark Seekers get called shallow, or commitment-shy. Neither is true. This is a nervous system that responds fast to charge and momentum, and becomes fiercely devoted when they are present. Growth is not learning to want less spark. It is learning to make it, so it can light a quiet Tuesday and not only a first month.",
    rung1:
      "You wait for the charge to arrive from outside: a look, a change of plan, something unexpected. When it comes you are unstoppable. When it does not, you assume the wanting has gone, when what has actually gone is the input. The shift is from waiting for a spark, to reading its absence as the end of something, to going looking for a bigger one. It becomes: supply a small one yourself, and notice how quickly your system still answers.",
    rung2:
      "Restlessness moves you before it speaks. You feel flat, and instead of saying so you get quieter, busier, further away. Your partner reads distance and gets careful, which is the single least charged thing they could do. The shift is from boredom, to drifting, to blaming the relationship for going flat. It becomes: boredom, one specific ask, something to play with tonight.",
    rung3:
      "Calm registers as dead to you. Not boring, dead, as though the absence of charge were evidence about the relationship rather than a Tuesday. That reading is what makes you reach for the exit long before anything is actually wrong. The shift is from a quiet evening, to reading it as decline, to manufacturing intensity or leaving. It becomes: quiet is quiet, and ten more minutes inside it usually proves it.",
    rung4:
      "You treat depth as the opposite of play, so you avoid it to protect the spark, and the relationship stays fun and slightly thin. But depth does not have to be heavy. It only has to be true, and truth delivered warmly is still charged. The shift is from wanting to go deeper, to fearing it will flatten things, to keeping it light and feeling unmet anyway. It becomes: one honest sentence, then straight back to teasing, and the charge survives it.",
    rung5:
      "Freedom, for you, is measured in exits kept open. It feels like safety and works like a slow leak: an agreement you have not fully chosen is one you resent, and resentment is not sexy. The shift is from feeling boxed in, to testing the edges, to needing an escape to feel alive. It becomes: freedom as choosing again, out loud, because you want to, which is the only version that stays charged.",
  },

  "relational-nurturer": {
    opener:
      "The Relational Nurturer is read as selfless, which sounds like a compliment and works like a trap. Your desire genuinely runs through care, and that is a real erotic route, not a substitute for one. Growth is not giving less. It is adding the half that has been missing: the ability to receive.",
    rung1:
      "You give to feel safe. If you are useful, you cannot be left, and being useful is something you are very good at. But desire needs somewhere to arrive, and you have built a life where everything flows outward. The shift is from giving, to being needed, to feeling emptier and giving more to fix it. It becomes: let them tend to you, and do not pay it back the same evening.",
    rung2:
      "You go quiet to keep things smooth. It works, right up to the point where the unsaid thing turns into resentment, and resentment does not stay in the conversation you avoided. It shows up in bed. The shift is from a need you notice, to silence to protect the peace, to a coldness neither of you can trace. It becomes: name it early, while it is still small enough to say kindly.",
    rung3:
      'Wanting feels like taking. Somewhere you learned that your own desire is an imposition, so you ask for nothing and then feel unseen for not being offered it. The shift is from wanting something, to judging the want as selfish, to going without and quietly counting. It becomes: say "I want this too" and let it stand, with no case made for why you deserve it.',
    rung4:
      "Sex has joined the list of things you do for the relationship. It is on the same shelf as remembering the appointments. Once it is a task, your body treats it like one, and no amount of technique fixes a task. The shift is from sex as care you provide, to your own pleasure as an optional extra, to wondering where your libido went. It becomes: one evening organised entirely around what you want, with nothing owed back.",
    rung5:
      "You absorb. The extra chore, the difficult mood, the thing nobody else picked up. Each one is small and the total is not, and a body carrying everyone is not a body that wants anything. The shift is from noticing something needs doing, to doing it silently, to being too depleted for the closeness you were protecting. It becomes: one no, unexplained, and the load actually shared.",
  },

  "radiant-performer": {
    opener:
      "Radiant Performers get called attention-seeking. What is actually happening is more specific and less flattering to everyone else: your desire runs on visible response, and most people are far less expressive than they feel. Growth is not needing less attention. It is having a second source, so a quiet partner stops reading as a verdict.",
    rung1:
      "Your wanting waits for the mirror. Feeling desirable is something that happens to you when someone shows it, which makes your erotic life dependent on how demonstrative another person happens to be. The shift is from needing the reaction, to reading its absence as rejection, to performing harder for a bigger one. It becomes: build some of it yourself, before anyone is watching, and notice that it holds.",
    rung2:
      "You perform instead of asking. It is the more charming route and the less reliable one: a partner who misses the performance has no idea a request was made. The shift is from wanting to be wanted, to showing off to get it, to feeling flat when the show lands quietly. It becomes: ask in plain words for the thing the performance was for.",
    rung3:
      'Silence gets read fast. A partner who is content but undemonstrative feels to you like a partner losing interest, and you act on that reading before checking it. The shift is from quiet, to "they are not into me", to withdrawing or escalating. It becomes: quiet is quiet, and ten minutes of not acting on the story usually dissolves it.',
    rung4:
      "You are wanted when you are impressive, which means you are never quite wanted when you are tired, ordinary, or off form. That is a lot of a life to be excluded from. The shift is from being desired for the performance, to needing to perform to be desired, to never resting inside it. It becomes: one evening where you receive and put on no show at all.",
    rung5:
      "Any attention will do when you are hungry for it, and that is when the cheap kind gets reached for. It works for an hour and leaves you further from the thing you wanted. The shift is from feeling unseen, to taking whatever attention is available, to feeling less real afterwards. It becomes: ask the person who matters for one true look, instead of collecting ten that do not count.",
  },
  "explorer-of-edges": {
    opener:
      "Explorers of Edges get treated as a risk to be managed. The truth is narrower: your desire needs charge and it needs permission, and the second one is the part that keeps getting left out. Growth is not turning the intensity down. It is gaining the range to be intense one night and tender the next, both deliberately.",
    rung1:
      "You escalate to feel something. When the charge drops you reach for more edge rather than a different kind, and the ladder only goes one way. That is not recklessness, it is an arousal system that has learned only one route in. The shift is from feeling flat, to needing more intensity, to a threshold that keeps climbing. It becomes: choose the charge deliberately, and find out that a three can work as well as a nine.",
    rung2:
      "You test rather than ask. Hints, provocations, pushing slightly past to see what happens. It is efficient with the right partner and disastrous with a careful one, who experiences a demand and says nothing. The shift is from wanting something specific, to testing for it sideways, to reading their hesitation as rejection. It becomes: the thing named plainly, with an agreed edge and a way to stop.",
    rung3:
      "A flicker of hesitation lands on you as judgement, and judgement closes you instantly. So you hide the want rather than risk the flinch, and hiding it guarantees you never get it. The shift is from showing an edge, to catching a hesitation, to putting it away and deciding they cannot handle you. It becomes: hesitation is a no about one thing, not a verdict about you, and it can be asked about.",
    rung4:
      "Soft reads as boring, so you skip it, and skipping it means your whole erotic life happens above a certain temperature. Anticipation is charge too, and it is the one you never use. The shift is from wanting intensity, to dismissing slowness as nothing, to a repertoire with no low gears. It becomes: one slow night charged entirely by teasing, and the discovery that it counts.",
    rung5:
      "You bring your real desires to people who cannot hold them, then conclude the desires are the problem. They are not. The audience was. The shift is from hiding what you want, to occasionally revealing it to whoever is nearest, to being met badly and hiding it further. It becomes: say one real thing to someone who has earned it, and let their response be information about them.",
  },

  "curious-apprentice": {
    opener:
      "Curious Apprentices get read as inexperienced, which misses what is actually happening: you are learning in a room where you believe you are being marked. Growth is not becoming more confident first. It is discovering that curiosity works fine without confidence, as soon as nobody is grading.",
    rung1:
      "You wait to be told what works, which puts your pleasure in someone else's hands and makes you dependent on how good a teacher they happen to be. Meanwhile the most reliable source of that information is lying in your own bed. The shift is from not knowing what you like, to waiting to be shown, to having nothing to offer when asked. It becomes: find out alone, with no audience and nothing to report.",
    rung2:
      "You wait to feel safe enough to ask, and safe enough never quite arrives, because the thing that makes it safe is having asked once and survived. The shift is from wanting to ask, to waiting for more certainty, to the moment passing again. It becomes: ask before you feel ready, and let the asking be the thing that builds the readiness.",
    rung3:
      "Awkward gets filed as failure. A fumble, a mistimed move, a laugh at the wrong moment, and you are outside the experience reviewing it. The reviewing is what ends the evening, not the fumble. The shift is from something going slightly wrong, to reading it as evidence about you, to leaving your body to analyse it. It becomes: awkward is what two people learning look like, and one sentence out loud brings you back.",
    rung4:
      "You stay open only when you are sure, which rules out most of what is worth trying. Certainty is the last thing that arrives, not the first. The shift is from being curious, to needing to know it will go well, to declining and calling it not being in the mood. It becomes: try, treat a flop as funny, and notice that the flop cost nothing.",
    rung5:
      "You say yes to seem experienced. It is a small lie that puts your body somewhere it did not choose, and bodies remember that. The shift is from not wanting to seem new, to agreeing to something you are not up for, to trusting your own yes a little less. It becomes: no to the rushed thing, yes to the thing you are genuinely curious about, and the difference becomes legible again.",
  },

  "minimalist-companion": {
    opener:
      "Minimalist Companions get told they have low desire. That is a misreading of a system with a very low pressure tolerance: what looks like not wanting is usually wanting that has been asked for too loudly. Growth is not wanting more or performing more. It is opening on your own calm, and staying close when life gets noisy.",
    rung1:
      "You wait to feel unpressured, and pressure is nearly always present somewhere, so the waiting rarely resolves. Your body needs an on-ramp and nobody has built one, including you. The shift is from wanting closeness, to waiting for conditions with no pressure at all, to concluding it is not there. It becomes: ease yourself in early and slowly, with no goal attached and nothing to reach.",
    rung2:
      "When it becomes too much you go quiet. Not a refusal, just gone, which is much harder for a partner to respond to than a no. The shift is from too much, to going silent, to them reading disinterest and pulling back further. It becomes: name your pace out loud while there is still an evening left to adjust.",
    rung3:
      "Pressure reads as failure. Feeling crowded becomes evidence that you are not enough for someone, and that reading is heavier than the crowding was. The shift is from feeling pressed, to concluding something is wrong with you, to withdrawing to stop being seen failing. It becomes: pressure is a signal to slow down, not a verdict, and it can be said plainly.",
    rung4:
      "Anything new arrives as a demand, so your repertoire stays exactly where it is. Safe, and slowly less alive. The shift is from an invitation to try something, to hearing an expectation, to declining and shrinking the range further. It becomes: one small new thing inside something already comfortable, with nothing to perform.",
    rung5:
      "Your yes is often the path of least friction. It keeps the evening pleasant and teaches your body that closeness costs effort. The shift is from not really wanting it, to agreeing to keep things easy, to closeness starting to feel like work. It becomes: no to the effortful moment, said warmly, and yes only from real ease.",
  },

  "emotional-voyeur": {
    opener:
      "Emotional Voyeurs get read as withholding or passive. What is actually true is that most of your erotic life has already happened before anyone touches you, and being pulled into the open too fast ends it. Growth is not getting louder. It is building a bridge from the inside out, on your own terms.",
    rung1:
      "Your wanting lives in private and mostly stays there. It is rich, specific and detailed, and almost none of it makes the journey into the room. The shift is from a vivid inner life, to nothing crossing over, to a partner who has no idea how much is there. It becomes: warm up where it works, then carry one small piece of it into the room with you.",
    rung2:
      "When it gets to be too much you retreat, and retreating is quiet enough that nobody knows a limit was reached. The shift is from too much, to disappearing, to a partner who slows down for reasons they cannot see. It becomes: say the pace you need before you go, not after.",
    rung3:
      "Being seen equals being judged, so you arrange things so that you are not quite visible. It protects you and it also means you are never actually met. The shift is from being looked at, to feeling assessed, to closing so you cannot be found. It becomes: ten seconds of being watched, on purpose, and staying to find out that nothing happened.",
    rung4:
      "The moment attention lands you close, which means the exact thing you want most is the thing you flinch from. The shift is from wanting to be desired, to being visibly desired, to shutting down at the point of arrival. It becomes: low light rather than none, and a little seen rather than not at all.",
    rung5:
      "You keep desire hidden to keep it safe, and hidden desire has nowhere to grow. The shift is from a private want, to never voicing it, to a slow conviction that it could not be received. It becomes: one fantasy said out loud, in words, to someone who has shown they can hear it.",
  },
  "authority-conductor": {
    opener:
      "Authority Conductors get read as controlling. The more accurate word is responsible: you hold the frame because you have learned that things go wrong when nobody does. Growth is not giving up the frame. It is discovering it can hold you too, and that surrender is the thing you are actually after.",
    rung1:
      "You feel safe only while you are running it. Directing the evening is how you stay regulated, which works and quietly means you never get to arrive anywhere yourself. The shift is from holding the frame, to feeling safe only inside it, to never being carried by anyone. It becomes: hand over one small decision, let it stand, and notice the room does not fall apart.",
    rung2:
      "You issue rather than ask. Framing a want as an instruction is efficient and it hides you: nobody can meet a need they were never told about, only comply with an order. The shift is from wanting something, to phrasing it as direction, to being obeyed and still unmet. It becomes: one desire said plainly, with no structure around it to hide in.",
    rung3:
      "A challenge lands as disrespect, and your response to disrespect is to tighten. Tightening is the fastest way to turn a difference of opinion into a standoff. The shift is from being challenged, to reading contempt, to gripping harder and making it true. It becomes: ask what they meant before you decide what it was.",
    rung4:
      "Softness feels like it costs authority, so you keep it out of the room, including afterwards when it is the whole point. The shift is from leading well, to staying in charge past the end, to never receiving the care that closes it. It becomes: one night where the scene ends and you stop managing the room.",
    rung5:
      "You believe control is what keeps it safe. It is what keeps it predictable, which is a different thing, and predictability is the enemy of the surrender you want. The shift is from wanting to let go, to needing to know exactly what happens, to nothing being able to surprise you. It becomes: one unplanned moment, stayed with, in your body rather than above it.",
  },

  "loyal-ritualist": {
    opener:
      "Loyal Ritualists get called routine, as though the routine were the limitation. It is the mechanism: your body opens on a path it already trusts, which is a real erotic route and not a failure of imagination. Growth is not learning to like novelty. It is making the safety portable, so a changed week does not take your desire with it.",
    rung1:
      "Your safety lives in the exact sequence. Same night, same order, same room, and it works beautifully until any part of it moves. Then there is no version of the ritual left to reach for. The shift is from safety in the routine, to the routine changing, to safety with nowhere to go. It becomes: one cue you can carry anywhere, so the ground travels with you.",
    rung2:
      "You wait for them to remember what steadies you, because having to ask for it feels like it stops counting. So they forget, and you file it. The shift is from needing something specific, to hoping it is remembered, to a quiet ledger neither of you is reading aloud. It becomes: name the one thing that settles you, tonight, in a sentence.",
    rung3:
      "A change in plan registers as a change in the bond. Not consciously, but the alarm is the same one, and it fires long before there is anything to worry about. The shift is from a shifted plan, to reading it as a shifted commitment, to bracing and going cool. It becomes: a change is life moving, and waiting before you decide otherwise is usually enough.",
    rung4:
      "New means dangerous, so nothing new comes in, and the repertoire slowly narrows to whatever survived. Safe and increasingly thin. The shift is from an invitation, to hearing risk, to declining and narrowing the path further. It becomes: one tiny new thing added to a ritual you already love, with everything else untouched.",
    rung5:
      "You say yes to avoid disappointing them, which puts your body somewhere it has not caught up to. Over time that teaches your body that the ritual is for them. The shift is from not being ready, to agreeing anyway, to the routine losing the safety it was built for. It becomes: turn down the rushed moment, and let yes wait for your body.",
  },

  "tender-devotee": {
    opener:
      "Tender Devotees get called needy. What is happening is precise rather than excessive: your desire runs on being chosen, and chosen has to be shown, not assumed. Growth is not needing less reassurance. It is adding worth you can feel without proof, so that the reassurance lands instead of being audited.",
    rung1:
      "Your worth arrives through pleasing. If you are good to them, you are safe, which makes every encounter a small performance of value. The shift is from wanting to be wanted, to earning it by pleasing, to never knowing whether you would be wanted otherwise. It becomes: bring something of your own worth into the room before anyone confirms it.",
    rung2:
      "You fish. A hint, a look, a sentence that leaves space for a compliment, and it is read as sweetness rather than as the question it was. The shift is from needing reassurance, to angling for it, to receiving affection that does not answer the thing you asked. It becomes: ask out loud, once, plainly, and let it be given rather than extracted.",
    rung3:
      "Silence means they are done with you. A quiet evening becomes a verdict, and the verdict changes how you act long before you have checked it. The shift is from them going quiet, to assuming the worst, to over-giving or withdrawing to manage a threat that is not there. It becomes: ask what is true instead of deciding it.",
    rung4:
      "Sex works as proof. It reassures you that you are still chosen, which means your own pleasure is rarely the point, and a body that is never the point stops speaking up. The shift is from wanting closeness, to using sex to confirm you are wanted, to losing track of what you would want for yourself. It becomes: ask for one thing that is purely yours.",
    rung5:
      "You agree to stay lovable. Each yes is small, and together they teach you that the love depends on them. The shift is from wanting to say no, to agreeing to protect the bond, to a bond that has never been tested and so never feels safe. It becomes: one no, unexplained, and the discovery that the love holds.",
  },

  "analytical-sexualist": {
    opener:
      "Analytical Sexualists get called clinical. In fact the mind is the on-ramp: understanding something is genuinely arousing to you, and that is a real route rather than a defence. Growth is not thinking less. It is letting the body get a word in before every question has been answered.",
    rung1:
      "You need to understand it before you can want it, so the analysis runs first and the body waits its turn, which it does not always take. The shift is from a sensation arriving, to naming and assessing it, to the sensation passing while you were describing it. It becomes: notice one good thing before you explain it, and let the explanation wait.",
    rung2:
      "You ask ten questions to feel certain. Each is reasonable and the total reads as an audit, which is the least erotic thing that can happen to a partner. The shift is from needing clarity, to interrogating for it, to a partner who becomes careful and gives you less to work with. It becomes: one clear question, then stop, and let the rest be found out.",
    rung3:
      "Not knowing feels unsafe, so uncertainty tightens you at exactly the point where loosening is what is called for. The shift is from an unknown, to reading it as risk, to controlling the moment until nothing can happen in it. It becomes: say the uncertainty out loud, and let it be fine rather than solved.",
    rung4:
      "Spontaneity reads as chaos, so you plan it out, and a fully planned evening has no room left for the thing you were hoping would happen. The shift is from wanting something to surprise you, to needing to know its shape, to designing the surprise out of it. It becomes: a short window with one rule, improvised inside it.",
    rung5:
      "Getting it right is the goal, which turns sex into a performance with a mark at the end. Marked sex is not sex you can lose yourself in. The shift is from wanting it to be good, to measuring whether it was, to never being fully in the part you are measuring. It becomes: one round where nothing is assessed and wrong is allowed.",
  },

  "quiet-withdrawer": {
    opener:
      "Quiet Withdrawers get read as uninterested. The more accurate reading is that the desire is there until pressure arrives, and then it is not. That is not absence, it is a switch, and switches can be understood. Growth is not needing less calm. It is keeping all of it while your range grows.",
    rung1:
      "Your calm depends on nothing being asked of you, which means it is always in someone else's hands. So closeness and calm end up in opposition, and calm wins. The shift is from needing quiet, to needing nothing to be asked, to closeness itself registering as a demand. It becomes: make some calm yourself, five slow breaths before contact, and find that it holds while someone is near.",
    rung2:
      "You disappear before you explain. Not dramatically, just less present, and by the time anyone notices there is nothing to respond to. The shift is from too much, to going, to a partner who learns not to reach. It becomes: name it before you leave, one sentence, while you are still in the room.",
    rung3:
      "Any push and your whole system shuts. There is no middle setting between fine and gone, which makes ordinary friction cost far more than it should. The shift is from a small push, to full shutdown, to an evening that ends without a conversation. It becomes: a pause instead of a vanishing, one minute, said out loud, and then back.",
    rung4:
      "You feel safe at a distance, which is true and also means safety and closeness never occupy the same moment. The shift is from wanting closeness, to needing space to feel safe, to being safest exactly where nobody is. It becomes: two more minutes of calm contact past the point you would normally pull away.",
    rung5:
      "Your yes avoids conflict. It is the quickest route through and it teaches your body that sex is something that happens to you. The shift is from not wanting it, to agreeing to keep the peace, to wanting even less next time. It becomes: no to the pushed moment, yes to the genuinely calm one, and the difference starts to register again.",
  },
};
