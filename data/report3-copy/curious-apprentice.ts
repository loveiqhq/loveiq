/**
 * Curious Apprentice's four V4 chapters, transcribed 2026-10-01 from Sanjin's docs, verbatim (curly
 * quotes and single spaces normalised); paywall cuts at his "Paywall" comments.
 * - Typical Beliefs: chapter 1KRZnVNS695qJMbj8fOycRS5I7jJMxgwso85ckw08k3c, how-to 1jR5Mkxr4lF2Kiesb-uSZcYGfVMHVKM-RdOQHh4Gm2NM
 * - Accelerators & Brakes: chapter 19V6hynjdIlWuetA4rKyMc_fme74TtUB3E-60qwswVhI, how-to 1jKWvg54eOJDNpe04Tq7b_sYZ1evcT8_Tp3Lv2nYq6qg
 * - Challenges in Partnerships: chapter 1tE1odfnff7NlIGoxpcdPtyQs8fzhOfeWXVi9fF-JC74, how-to 1LvU4OFMlcNqByaBY_DXwtSIpENN0CCA49fot6yvL538, loop 1_Y-6AnM13n6MhNhY-Q8Q1NvTSM8y3LYM0decH1cL0N8
 * - Fantasy vs. Reality: chapter 1SexZ6tkqcrHK4AU657F3sfrQNdfO7HNkGX7L6grTkDQ, how-to 1D2FnWi-K7KvMGQkhzPdEj5-4BiipOkrubeVewo7UDsM
 *
 * PREMIUM: server-only (__tests__/security/premium-content-bundle.test.ts).
 */
import type { Report3ArchetypeCopy } from "./types";
import { b, bi, h, h2, i, ol, p, t } from "./runs";

export const CURIOUS_APPRENTICE: Report3ArchetypeCopy = {
  typicalBeliefs: {
    turns: [
      {
        shadow: "“I should already know what I am doing.”",
        shift:
          "“Sexual competence is not something I am supposed to arrive with. I can become more skilled through attention, communication, and experience.”",
      },
      {
        shadow: "“If I have to ask what my partner likes, they may realize I am inexperienced.”",
        shift: "“Asking gives me information about this person, not proof that I lack knowledge.”",
      },
      {
        shadow: "“If I do something incorrectly, I will disappoint my partner.”",
        shift:
          "“I want to be a thoughtful lover, but good sex does not depend on getting everything right the first time.”",
      },
      {
        shadow: "“I need clear instructions before I can trust myself to take the lead.”",
        shift:
          "“Guidance helps me learn, but I can also make suggestions, experiment, and adjust without knowing the perfect answer in advance.”",
      },
      {
        shadow:
          "“Someone more experienced probably understands what I should want better than I do.”",
        shift:
          "“Experience can give someone useful knowledge, but I am still the best source of information about what feels right for me.”",
      },
      {
        shadow: "“If my partner gives me feedback, it means I was doing something wrong.”",
        shift:
          "“Feedback helps us fine-tune an experience together. It does not have to be a judgment of my ability.”",
      },
      {
        shadow: "“I need more experience before I can feel sexually confident.”",
        shift:
          "“Experience can build confidence, but confidence can also grow by acting, communicating, and trusting myself while I am still learning.”",
      },
      {
        shadow: "“If I am not becoming better at sex, I am falling behind.”",
        shift:
          "“I enjoy learning and improving, but sexuality is not a skill ladder I need to keep climbing.”",
      },
      {
        shadow: "“Being sexually open-minded means I should be willing to try almost anything.”",
        shift:
          "“Curiosity gives me permission to explore, not an obligation to say yes. I can be adventurous and still have firm limits.”",
      },
      {
        shadow: "“If I feel unsure during sex, I should hide it so I do not interrupt the moment.”",
        shift:
          "“Uncertainty is allowed. I can slow down, ask, adjust, or say what I am feeling without ruining the experience.”",
      },
    ],
    sun: [
      "“I see sexuality as something I can keep discovering rather than something I need to have completely figured out.”",
      "“I enjoy learning how different people experience pleasure instead of assuming the same approach works for everyone.”",
      "“I can approach unfamiliar experiences with curiosity while still checking whether they actually feel right for me.”",
      "“Questions, feedback, and conversation can make sex more interesting and more personal.”",
      "“I am willing to revise what I think I like when new experiences teach me something different.”",
      "“I can treat experimentation as exploration rather than as a performance I need to succeed at.”",
      "“I enjoy becoming more attentive to subtle reactions, preferences, and changes in a partner.”",
      "“Learning from someone else can expand my sexuality without requiring me to hand over authority for what I want.”",
      "“I can let confidence grow through experience while still taking initiative before I feel completely certain.”",
      "“My curiosity can help me build a richer sexual life because I am willing to notice, ask, explore, and adapt.”",
    ],
    // The doc opens on these three, written around this archetype, in place of the four
    // universal paragraphs the other docs keep.
    intro: [
      p(
        t(
          "Long before you consciously decide what sex means to you, you begin absorbing beliefs about it. They come from caregivers, previous partners, friends, media, cultural expectations and the countless examples of intimacy you see around you. Some are taught directly. Others are learned so quietly that they never feel like beliefs at all. They simply feel true."
        )
      ),
      p(
        t("These beliefs matter because they shape "),
        b("what a situation means to you"),
        t(
          ", and meaning changes how you respond. Imagine two people whose partner says, “Tell me what you like.” One has learned, "
        ),
        i("“A good lover should already know what to do.”"),
        t(
          " The question may feel exposing, almost like a test they have failed. The other believes, "
        ),
        i("“Good sex is something people learn together.”"),
        t(
          " The same question feels like an invitation. Nothing about the situation changed. The interpretation did."
        )
      ),
      p(
        t("LoveIQ describes these patterns as "),
        b("sun beliefs"),
        t(" and "),
        b("shadow beliefs"),
        t(
          ". Sun beliefs tend to leave room for curiosity, flexibility and choice. Shadow beliefs are more likely to turn uncertainty into pressure, judgment or rigid rules. Shadow does not mean bad or irrational. Many such beliefs were learned for understandable reasons. The useful question is whether they still support the kind of sexual experience you want today."
        )
      ),
    ],
    lede: [
      h2("The Curious Apprentice Belief Map"),
      p(
        t("For the "),
        b("Curious Apprentice"),
        t(", beliefs tend to gather around "),
        b("learning, competence and self-trust"),
        t(
          ". Curiosity itself is often a strength. The more difficult patterns appear when not knowing something yet starts to feel like evidence of being inadequate."
        )
      ),
    ],
    challenges: [
      p(
        t(
          "Imagine the Curious Apprentice is touching a partner and cannot quite tell what is working. The natural impulse may be to ask, "
        ),
        i("“Slower or firmer?”"),
        t(" But a shadow belief can interrupt: "),
        bi(
          "“I should be able to tell. What if asking makes it obvious that I do not know what I am doing?”"
        )
      ),
      p(
        t(
          "Attention then moves away from sensation and connection toward monitoring performance. The Curious Apprentice may start searching for clues, repeating something that worked before or trying to remember what they have learned elsewhere instead of simply asking the person in front of them."
        )
      ),
      p(
        t("The irony is that "),
        b(
          "the belief designed to hide inexperience can interfere with one of the Curious Apprentice’s greatest strengths: genuine willingness to communicate and learn."
        ),
        t(
          " A simple question could create better sex, but when asking feels like admitting failure, curiosity becomes harder to use."
        )
      ),
      p(
        t(
          "Another appeal for the Curious Apprentice is guidance, especially with a partner who communicates openly and makes experimentation feel safe. The challenge appears when guidance becomes a requirement for action."
        )
      ),
      p(
        t("Suppose a partner says, "),
        i("“You choose tonight,”"),
        t(" or "),
        i("“Surprise me.”"),
        t(" Instead of feeling freeing, the openness may suddenly feel high stakes. "),
        bi("“What if I choose something they do not like? What if I get it wrong?”"),
        t(
          " The Curious Apprentice may hesitate, ask the partner to decide after all or fall back on something already proven to work."
        )
      ),
      p(
        t(
          "From the outside, that hesitation can look like passivity or lack of desire. Internally, something different may be happening: "
        ),
        b(
          "the Curious Apprentice has ideas, but does not yet fully trust those ideas without external confirmation."
        )
      ),
      p(
        t(
          "Over time, this can create an unequal dynamic in which one partner becomes the teacher and the Curious Apprentice remains the student. Learning is still happening, but confidence keeps being postponed until some imagined future point when enough has finally been learned."
        )
      ),
    ],
    practice: [
      p(
        t(
          "The goal is not to eliminate shadow beliefs or replace them with artificially positive ones. It is to notice when an automatic rule is shaping what a sexual experience means, then decide whether that interpretation still fits."
        )
      ),
      p(t("A simple process can help.")),
      p(
        b("Separate the event from its meaning."),
        t(
          " Start with what actually happened, without interpretation. A partner redirects your hand. That is the event. “I was doing it wrong” is the meaning added afterward. Keeping those two things separate makes the belief easier to see."
        )
      ),
      p(
        b("Name the rule underneath it. "),
        t(
          "Try completing sentences such as “To be a good lover, I should...” or “If I do not know what to do, it means...” For the Curious Apprentice, this may reveal rules such as “I should already know this,” “I need more experience before I can feel confident,” or “If I need guidance, I am not good enough yet.”"
        )
      ),
      p(
        b("Ask where the belief came from. "),
        t(
          "Some rules may come from previous partners, comparison with more experienced people, media that presents sexual confidence as effortless, or environments where asking questions felt embarrassing. Understanding the source does not automatically remove the belief, but it helps distinguish between something that feels familiar and something the Curious Apprentice genuinely wants to keep believing."
        )
      ),
      p(
        b("Test the interpretation. "),
        t(
          "Ask whether the belief holds up across real experience. Would you think less of a partner for asking what feels good? Does being experienced mean knowing exactly what every new partner wants? Can someone be sexually confident and still ask questions, make imperfect guesses or change direction? Testing the belief creates room for other interpretations."
        )
      ),
      p(
        b("Rewrite the belief without erasing the preference. "),
        t(
          "The aim is not to make the Curious Apprentice less curious, less interested in learning or less appreciative of guidance. It is to remove the pressure attached to those preferences."
        )
      ),
      p(
        t(
          "“I should already know what to do” can become “I can bring what I know while still learning this particular person.”"
        )
      ),
      p(
        t(
          "“Feedback means I got something wrong” can become “Feedback helps us make the experience more specific to us.”"
        )
      ),
      p(
        t(
          "“I need clear instructions before I can take the lead” can become “I can make a choice, notice the response and adjust.”"
        )
      ),
      p(
        t("A useful practice is to pair "),
        b("one act of learning with one act of self-trust."),
        t(
          " Ask one concrete question, such as “Lighter or firmer?” Then let the next small choice come from your own curiosity. Change the rhythm. Suggest something. Name what sounds interesting. Notice the response and adjust."
        )
      ),
      p(
        t(
          "Over time, this shifts learning from something the Curious Apprentice uses to prove competence into something that supports confidence. "
        ),
        b(
          "The aim is not to become less teachable. It is to stop treating uncertainty as evidence of inadequacy."
        ),
        t(
          " When learning becomes collaboration rather than evaluation, curiosity can remain one of the Curious Apprentice’s greatest strengths while self-trust grows alongside it."
        )
      ),
    ],
    cuts: { challengesFree: 1, practiceFree: 2 },
  },
  accelerators: {
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
          "Both systems respond to much more than obvious sexual stimuli. Physical sensations, energy, fatigue, pain and bodily comfort can matter, but so can psychological and relational cues such as anticipation, confidence, privacy, pressure, trust, feeling desired, conflict or self-consciousness. Even the same situation can activate different systems depending on how it is interpreted at that moment."
        )
      ),
      p(
        t("For the"),
        b(
          " Curious Apprentice, desire often becomes easier to access when sexuality feels like a space for discovery rather than a test of competence."
        ),
        t(
          " Curiosity can be a powerful accelerator, but it works best when there is enough safety to experiment, ask questions and not already know the answer."
        )
      ),
    ],
    brakes: [
      {
        label: "Feeling evaluated or criticized",
        subtext:
          "Harsh correction, mockery or visible disappointment can quickly turn exploration into a performance test.",
      },
      {
        label: "Pressure to already know what to do",
        subtext:
          "Situations that imply sexual skill should be automatic can activate insecurity about being inexperienced or “behind.”",
      },
      {
        label: "Unclear feedback",
        subtext:
          "A partner who gives little indication of what feels good can leave too much room for guessing and self-monitoring.",
      },
      {
        label: "High-stakes experimentation",
        subtext:
          "Intense or unfamiliar experiences without enough preparation, communication or room to change course can overwhelm curiosity rather than feed it.",
      },
      {
        label: "Getting stuck in performance mode",
        subtext:
          "Once attention shifts toward “Am I doing this right?” or “Are they enjoying this enough?”, evaluating the experience can begin competing with actually feeling it.",
      },
    ],
    accelerators: [
      {
        label: "Clear, encouraging guidance",
        subtext:
          "Specific cues such as “slower,” “right there,” or “I like that” can remove uncertainty while keeping attention connected to pleasure.",
      },
      {
        label: "Learning something new together",
        subtext:
          "A new technique, toy, position or idea can become exciting when it feels like exploration rather than something the Curious Apprentice is expected to master immediately.",
      },
      {
        label: "Enthusiastic feedback",
        subtext:
          "Knowing what is working can build confidence and make it easier to stay immersed instead of wondering how the experience is being received.",
      },
      {
        label: "Step-by-step exploration",
        subtext:
          "Having room to try, pause, adjust and try again allows curiosity to develop without making novelty feel overwhelming or high stakes.",
      },
      {
        label: "Open sexual communication",
        subtext:
          "Partners who comfortably discuss preferences, fantasies and sensations provide the information the Curious Apprentice can use to explore with greater confidence.",
      },
    ],
    challenges: [
      p(
        t("Imagine the Curious Apprentice trying something new with a partner. "),
        b("Clear, encouraging guidance is an accelerator."),
        t(
          " A simple “a little slower... yes, exactly like that” provides information, reduces uncertainty and makes experimentation feel collaborative. The Curious Apprentice can adjust, notice the response and become more absorbed in what is happening."
        )
      ),
      p(
        t("Now imagine the same encounter with "),
        b("pressure to already know what to do"),
        t(
          ", one of the Curious Apprentice’s stronger brakes. The partner seems impatient or says, “You’ve never done this before?” Suddenly, the task has changed. Instead of discovering what feels good together, the Curious Apprentice may begin monitoring every movement: "
        ),
        i("“Was that wrong? What should I do next? Can they tell I’m unsure?”")
      ),
      p(
        t(
          "The accelerator has not necessarily disappeared. Curiosity, attraction and the desire to learn may all still be present. But the brake has become stronger."
        )
      ),
      p(
        t(
          "This can create a particularly confusing pattern. The Curious Apprentice may genuinely want an experience and still find arousal fading once it begins. Trying harder can then make the problem worse, because more attention is directed toward performing correctly and less toward sensation, connection and pleasure."
        )
      ),
      p(
        b(
          "For the Curious Apprentice, learning itself can therefore press either system. When learning feels collaborative, it can be deeply erotic. When it feels like evaluation, the same desire to learn can become a brake."
        )
      ),
    ],
    practice: [
      p(
        t("The first step is to notice "),
        b("when the state changes"),
        t(
          " rather than simply deciding whether an experience was good or bad. When did curiosity become excitement? When did excitement turn into self-consciousness? Was there a particular comment, silence, expectation or moment of uncertainty that changed the experience?"
        )
      ),
      p(
        b("Then separate the accelerator from the brake."),
        t(" A Curious Apprentice might initially conclude, "),
        i("“Maybe I just wasn’t into it.”"),
        t(" A more precise reading might be: "),
        i(
          "“I was excited when we were exploring together, but I lost that excitement when I stopped knowing what my partner wanted.”"
        ),
        t(
          " That distinction matters because the second explanation gives something concrete to work with."
        )
      ),
      p(
        t("It is also useful to distinguish "),
        b("protective brakes from adjustable brakes"),
        t(
          ". Discomfort, unclear consent, pain, unwanted pressure or genuine concerns about a situation deserve to slow things down. Those brakes are providing useful information. A brake such as "
        ),
        i("“I should already know how to do this”"),
        t(
          " serves a different function. It may reflect an expectation about sexual competence rather than anything actually unsafe in the moment."
        )
      ),
      p(
        t("From there, "),
        b("experiment with conditions instead of trying to force more desire. "),
        t(
          "The Curious Apprentice may benefit from partners agreeing that a new experience is an experiment, not a performance. Feedback can be made explicit. Either person can pause, redirect or laugh when something does not work. A new technique can be tried without needing to become the entire encounter."
        )
      ),
      p(
        t("A useful experiment is to change "),
        b("one condition at a time"),
        t(
          ". If uncertainty seems to activate the brakes, ask for clearer feedback. If novelty becomes overwhelming, slow the exploration down. If self-monitoring takes over, temporarily remove the goal of orgasm or “doing it well” and return attention to simple questions such as: "
        ),
        i("“What feels interesting right now?”"),
        t(" or "),
        i("“What would I like more or less of?”")
      ),
      p(
        t(
          "Over time, it also helps to look beneath individual accelerators. Being taught, receiving feedback and trying something new may appear to be separate turn-ons, but they can share a deeper ingredient: "
        ),
        b("permission to be curious without being judged for not already knowing."),
        t(
          " Once that ingredient becomes visible, there are more ways to create it. It can come from a partner, but also from stronger self-trust, clearer communication and growing familiarity with personal preferences."
        )
      ),
      p(
        t(
          "This matters because guidance should not become something the Curious Apprentice needs in order to feel sexually capable. The long-term opportunity is to move gradually from "
        ),
        i("“Tell me if I’m doing it correctly”"),
        t(" toward "),
        i("“Let’s discover what works for us.”"),
        t(
          " Feedback remains valuable, but it becomes information between equals rather than reassurance from teacher to student."
        )
      ),
      p(
        t("The goal is not to maximize the accelerator or eliminate every brake. "),
        b(
          "It is to calibrate the conditions so curiosity can remain alive without turning sexuality into another place where the Curious Apprentice has to prove competence."
        ),
        t(
          " When experimentation feels safe enough to include uncertainty, mistakes and adjustment, learning stops competing with pleasure and can become part of the pleasure itself."
        )
      ),
    ],
    cuts: { challengesFree: 1, practiceFree: 1, practiceRampThrough: null },
  },
  partnership: {
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
        b("Curious Apprentice"),
        t(", these collisions often form around "),
        b("learning, feedback, and sexual confidence"),
        t(
          ". Curiosity tends to thrive when there is room to ask, experiment, adjust, and understand what a partner enjoys. But partners differ greatly in how naturally they communicate about sex. Some enjoy giving direction. Others expect desire to unfold more intuitively, communicate mostly through body language, or simply assume a partner should already know what to do."
        )
      ),
      p(
        t(
          "That difference can create a difficult loop. The less clear the feedback, the more the Curious Apprentice may question what is happening. The more uncertain the Curious Apprentice becomes, the more carefully they may check, analyze, or wait for direction. A partner can then experience that caution as insecurity or passivity, which may make them give even less guidance."
        )
      ),
      p(
        t("Understanding these patterns matters because "),
        b(
          "a problem that feels like personal inadequacy may actually be something two people are creating together"
        ),
        t(
          ". Once the pattern becomes visible, it is easier to address before uncertainty turns into avoidance, frustration, or an unequal sexual dynamic. It also points toward an important area of growth for the Curious Apprentice: learning from a partner without making that partner the final authority on what is right."
        )
      ),
      h("Common Challenges"),
      p(
        b("Feedback can start to feel like evaluation."),
        t(" A partner may be naturally quiet during sex or give broad responses such as "),
        i("“Whatever feels good”"),
        t(" or "),
        i("“Just relax.”"),
        t(
          " The Curious Apprentice may experience the lack of clear feedback as uncertainty and start wondering, "
        ),
        i("“Am I doing this right? Should I change something? Are they enjoying this?”"),
        t(
          " More checking can then make the interaction feel less spontaneous to the partner, while the partner’s withdrawal leaves the Curious Apprentice with even less information."
        )
      ),
      p(
        b("Guidance can slowly become an unequal role."),
        t(
          " With a confident or experienced partner, being shown what they enjoy can feel exciting and safe. But if the partner becomes the permanent teacher, the Curious Apprentice may start waiting for instructions rather than bringing personal preferences, instincts, or initiative into the relationship. The partner may eventually feel responsible for directing the sexual connection, while the Curious Apprentice becomes even less certain without guidance."
        )
      ),
      p(
        b("Curiosity can collide with a partner’s need for spontaneity."),
        t(
          " The Curious Apprentice may enjoy discussing what worked, asking questions, or intentionally trying something differently next time. A partner who prefers less verbal processing may experience the same behavior as overanalysis or feel that sex is being turned into a lesson. If that partner shuts the conversation down, the Curious Apprentice can lose one of the main ways they build confidence and understanding."
        )
      ),
      p(
        t(
          "The difficult part is that these situations may not feel like relationship patterns from the inside. They can feel like proof: "
        ),
        i("“I should be better at this by now,” “My partner is frustrated with me,”"),
        t(" or "),
        i("“Maybe I just do not know what I am doing.”")
      ),
      p(
        b(
          "The more important question is whether the Curious Apprentice is still learning with a partner, or has started depending on the partner to feel sexually competent at all."
        )
      ),
      p(
        t(
          "Consider a partner who rarely says much during sex. The Curious Apprentice tries something, receives little reaction, changes technique, asks whether it feels good, changes again, then starts monitoring every response. What began as genuine attentiveness gradually pulls attention away from sensation and into performance. The partner may become frustrated by the constant checking and say, "
        ),
        i("“Stop thinking so much.” "),
        b("This creates a loop."),
        t(
          " The Curious Apprentice hears criticism, becomes even more self-conscious, and the next sexual encounter begins with more pressure than the last."
        )
      ),
    ],
    loop: [
      {
        happens: "A partner gives little or unclear feedback",
        underneath: "The Curious Apprentice has less information to rely on",
      },
      {
        happens: "“I must be doing something wrong.”",
        underneath: "Uncertainty starts to feel like failure",
      },
      {
        happens: "I check more, change more, and monitor closely",
        underneath: "Reassurance feels like the path to confidence",
      },
      {
        happens: "“They are overthinking everything.”",
        underneath: "The moment starts to feel less spontaneous",
      },
      {
        happens: "They become frustrated or give even less feedback",
        underneath: "They pull away from the pressure",
      },
      {
        happens: "I feel even more unsure and self-conscious",
        underneath: "The loop creates its own evidence",
      },
    ],
    result: p(
      t(
        "Or imagine that one partner initially has more sexual experience and enjoys taking the lead. The arrangement works well at first. Over time, however, the Curious Apprentice continues asking, "
      ),
      i("“What do you want me to do?”"),
      t(" while rarely choosing what happens next. Eventually the partner says, "),
      i("“Sometimes I wish you would just take the lead.”"),
      t(" What the partner means as an invitation may be heard as, "),
      i("“You should already know how.”"),
      t(
        " The Curious Apprentice becomes more cautious precisely when the relationship needs more initiative."
      )
    ),
    tail: [
      p(
        t("In both cases, "),
        b(
          "the attempt to avoid getting sex wrong can create the very hesitation that starts causing difficulty"
        ),
        t(".")
      ),
    ],
    practice: [
      p(
        t(
          "The goal is not for the Curious Apprentice to stop asking questions or learning from a partner. The useful shift is to "
        ),
        b("notice when curiosity has turned into a search for reassurance"),
        t(
          ", and to respond to uncertainty without immediately treating it as evidence of doing something wrong."
        )
      ),
      p(t("When a difficult moment appears, use three questions:")),
      ol(
        [
          b("What happened?"),
          t(" Describe only what could actually be observed. "),
          i(
            "“My partner suggested doing it differently.” “They were quieter than usual.” “They said they wished I would initiate more.”"
          ),
        ],
        [
          b("What did I make it mean?"),
          t(" Notice the conclusion that followed. "),
          i(
            "“I am not good at this.” “They are disappointed in me.” “I should already know what they want.”"
          ),
          t(" This is often where useful information turns into performance pressure."),
        ],
        [
          b("What do I actually need?"),
          t(
            " Look beneath the self-criticism. The answer might be clearer feedback, reassurance that experimentation is welcome, more permission to make mistakes, or simply enough confidence to act without knowing exactly how the partner will respond."
          ),
        ]
      ),
      p(
        t(
          "Once the need is clear, turn it into something the partner can actually respond to. Instead of repeatedly asking "
        ),
        i("“Am I doing this right?”"),
        t(", try: "),
        i("“It helps me when you tell me what you want more or less of while we are doing it.”"),
        t(" Instead of withdrawing after hearing "),
        i("“I wish you would take the lead more,”"),
        t(" try: "),
        i(
          "“I want to do that. It would help if I knew what taking the lead feels like to you, and then I want to experiment with it myself.”"
        )
      ),
      p(
        t(
          "This changes the recurring pattern. When uncertainty appears, the Curious Apprentice does not have to respond by checking more, waiting for instructions, or becoming more cautious. The Curious Apprentice can gather enough information, make a choice, notice the response, and adjust. "
        ),
        b(
          "The aim is not certainty before acting. It is becoming comfortable learning through the interaction itself."
        )
      ),
      p(
        t(
          "A simple practice is to take ownership of one small part of an encounter. Choose how to initiate, suggest something worth trying, or decide what happens next without asking the partner to design the experience first. Feedback can come afterward. Over time, this helps the Curious Apprentice move from "
        ),
        i("“Tell me what the right thing is”"),
        t(" toward "),
        i(
          "“Let me bring something of my own, and we can discover together whether it works for us.”"
        )
      ),
      p(
        t("The underlying tendency is not a weakness. "),
        b(
          "Curiosity, attentiveness, and willingness to learn can make the Curious Apprentice an unusually responsive partner."
        ),
        t(
          " Those qualities become even more valuable when they are paired with self-trust. Instead of using curiosity to avoid getting things wrong, the Curious Apprentice can use it to notice more, communicate more clearly, experiment with confidence, and build a sexual connection that neither partner has to already know how to create."
        )
      ),
    ],
    cuts: { freeBlocks: 4, rampThrough: null, practiceFree: 2 },
  },
  fantasy: {
    intro: [
      p(
        t(
          "A sexual fantasy can feel like evidence. If a scene is intensely arousing or keeps returning, it is easy to assume it must reveal something you secretly want. But "
        ),
        b("fantasy and real-world desire are not the same psychological experience"),
        t(".")
      ),
      p(
        t(
          "Fantasy is closer to a private mental movie. The mind can enter at exactly the exciting moment, remove awkwardness, intensify attraction, make another person respond perfectly, and end the scene whenever it wants."
        )
      ),
      p(
        t(
          "Reality comes with everything fantasy can edit out: another person’s needs, an actual body, communication, uncertainty, boundaries, safety, emotions and consequences."
        )
      ),
      p(
        t(
          "This is why something can be highly arousing in imagination without being appealing in real life. "
        ),
        b(
          "Arousal tells you that something activated your erotic system. It does not automatically tell you that you want to experience it."
        ),
        t(" Desire, pleasure and consent are separate questions.")
      ),
      p(
        t("For many Curious Apprentices, fantasy becomes especially charged around "),
        b("learning, guidance and discovery"),
        t(
          ". Where some archetypes may fantasize about already knowing exactly what to do, the Curious Apprentice may be drawn to situations where not knowing is part of the erotic experience: a partner demonstrates, gives feedback, introduces something new or creates enough safety to explore without embarrassment."
        )
      ),
      h("What a Fantasy Might Actually Be About"),
      p(
        b("Being taught by an experienced lover."),
        t(
          " The fantasy might involve a confident partner taking the lead, showing exactly what they enjoy and responding with clear encouragement. In imagination, the instructions are perfect and every adjustment produces the right reaction. In reality, experience does not make someone an authority on another person’s body, and guidance may be less certain, more collaborative and much more dependent on ongoing feedback."
        )
      ),
      p(
        b("Trying something new and getting it right."),
        t(
          " Another fantasy might involve discovering a new technique, toy or position and quickly becoming skilled at it together. The appeal can lie in curiosity, progress and the excitement of expanding what sex can be. Reality usually includes awkward attempts, changes of mind and things that sound exciting but simply do not feel especially good."
        )
      ),
      p(
        b("Being watched while learning."),
        t(
          " A fantasy might involve a partner observing while the Curious Apprentice tries something unfamiliar, offering praise and small corrections along the way. In imagination, being watched confirms progress and competence. In reality, observation can also heighten self-consciousness and turn attention toward “performing correctly” rather than noticing what feels good."
        )
      ),
      p(
        t("These fantasies suggest an important distinction. "),
        b(
          "The erotic ingredient may not be inexperience itself. It may be the freedom to be inexperienced without being judged for it."
        ),
        t(
          " Guidance, praise and structure can make uncertainty feel safe enough to become exciting."
        )
      ),
      p(
        t("That means the deeper fantasy may be less “Teach me what I should know” and more "),
        b("“Give me enough safety that I can explore without needing to already know.”")
      ),
    ],
    challenges: [
      h("Common Challenges"),
      p(
        b("Guidance can quietly become a search for the right answer."),
        t(
          " Consider the fantasy of being taught by an experienced partner. In imagination, the partner knows what works and communicates it clearly. There is little ambiguity."
        )
      ),
      p(
        t(
          "In reality, a partner may say, “Try whatever feels natural,” or give feedback that changes from moment to moment. For the Curious Apprentice, that openness can sometimes create more uncertainty rather than more freedom. The thought may become, "
        ),
        i("“But what am I actually supposed to do?”")
      ),
      p(
        t("The result can be hesitation, repeated checking or waiting for the partner to lead. "),
        b(
          "What began as curiosity can turn into performance monitoring when feedback is treated as proof of whether something is being done correctly."
        )
      ),
      p(
        t(
          "Sex, however, rarely has a single correct technique. A partner’s preferences are information, not an answer key."
        )
      ),
      p(
        b("Learning can pull attention away from experiencing."),
        t(
          " Imagine trying a new technique after reading about it together. The Curious Apprentice may remember the steps, monitor the partner’s reactions and mentally compare what is happening with what was expected."
        )
      ),
      p(
        t(
          "The new experience may be going perfectly well, yet attention is divided between sensation and evaluation: "
        ),
        i("“Am I doing this properly? Is this what they meant? Should I change something?”")
      ),
      p(
        t("This creates a particular paradox. "),
        b(
          "The stronger the effort to become good at sex, the easier it can become to stop actually feeling the sex that is happening."
        ),
        t(
          " Fantasy can hide this tension because imagined learning happens without awkwardness, distraction or uncertainty."
        )
      ),
    ],
    practice: [
      p(
        t(
          "Understanding fantasy does not require decoding every image or finding a hidden explanation for it. The goal is simpler: "
        ),
        b("learn to separate what happens in the fantasy from what makes it appealing.")
      ),
      p(
        t(
          "Take a recurring fantasy and change one element at a time. If the partner were not especially experienced but was patient and communicative, would the fantasy still work? If the praise disappeared but curiosity remained, would it still feel exciting? If there were no “correct” technique to master, would exploration itself still carry a charge?"
        )
      ),
      p(
        t(
          "This helps reveal whether the important ingredient is expertise, clear feedback, reassurance, discovery, permission to be inexperienced or the feeling of becoming more capable."
        )
      ),
      p(
        t(
          "Then reality-test the fantasy. Include the parts imagination skips: asking questions, misunderstanding something, laughing when an experiment feels awkward, discovering that a technique does not work, or hearing a partner say, “I don’t know, let’s try it.”"
        )
      ),
      p(
        t("Notice what happens to the desire when "),
        b("learning becomes genuinely collaborative rather than perfectly guided"),
        t(".")
      ),
      p(
        t(
          "Finally, translate the appeal instead of reproducing the entire teacher-and-student scenario. If clear guidance is erotic, partners can use more specific feedback during sex. If discovery matters, choose one unfamiliar thing to explore rather than trying to perform it perfectly. If encouragement matters, make positive feedback explicit. If being taught is part of the fantasy itself, that dynamic can be explored consensually while still remembering that outside the role, both people remain equal participants in discovering what works."
        )
      ),
      p(
        t("One useful shift is to replace “Did I do it right?” with two questions: "),
        b("“What did I notice?” and “What would I like to try differently?”"),
        t(" That turns sex from a test into an experiment.")
      ),
      p(
        t("For the Curious Apprentice, the goal is not to stop learning. "),
        b("It is to let learning build self-trust rather than replace it."),
        t(
          " Guidance can open doors, but sexual confidence grows when curiosity gradually moves from “Tell me what is right” toward “Let’s find out what works.”"
        )
      ),
    ],
    cuts: { practiceFree: 1 },
  },
};
