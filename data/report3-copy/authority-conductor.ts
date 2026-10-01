/**
 * Authority Conductor's four V4 chapters, transcribed 2026-10-01 from Sanjin's docs, verbatim (curly
 * quotes and single spaces normalised); paywall cuts at his "Paywall" comments.
 * - Typical Beliefs: chapter 1a8CXX2t14AMbvnVU4zIYXxdVTkCbggpE8wJ1jXPSX20, how-to 1QiQ70wcYriZp24BF7uuASB4u63tCVBjr97A3ke-rKx4
 * - Accelerators & Brakes: chapter 1K1RESNZJchVrYPntJpPmCdH5bT4g77iQXtqmnzOl8Gk, how-to 1O0OQG-n_5Oe_DSVbUgd54CXyr18s-hmZAy2fB0sB1RY
 * - Challenges in Partnerships: chapter 10-Fe2VzJDthsUOJaq7Tm3xYFle7B-51J5Hz5J0TQkOg, how-to 1KBSD0W9XzOFcubWxKV0ZFInzGvS9WhcZ6kPDtMo-8fQ, loop 1bQzlV_SoiC85pq1EKNnwupkYuI42uQi-QpzDBjlfU1I
 * - Fantasy vs. Reality: chapter 1HMSSHloSuSQuvk4q2PAD7M92O5mB4UTPpmb9dunxvOw, how-to 1VRq-5fKDfgIYVz3cAs4k-07PnOoKDf3CZH8ON5HM0ZA
 *
 * PREMIUM: server-only (__tests__/security/premium-content-bundle.test.ts).
 */
import type { Report3ArchetypeCopy } from "./types";
import { b, bi, h, h2, i, ol, p, t } from "./runs";

export const AUTHORITY_CONDUCTOR: Report3ArchetypeCopy = {
  typicalBeliefs: {
    turns: [
      {
        shadow: "“If I am not directing what is happening, I am losing my position.”",
        shift:
          "“I can enjoy taking the lead without needing to control every moment. My authority does not disappear when I adapt.”",
      },
      {
        shadow: "“If my partner challenges me, they are disrespecting me.”",
        shift:
          "“I value respect, but disagreement or pushback does not automatically threaten it. A partner can challenge me and still value my leadership.”",
      },
      {
        shadow: "“If I reveal what I truly need, I give someone leverage over me.”",
        shift:
          "“Being selective about vulnerability matters to me, but expressing a real need does not require giving up my strength or agency.”",
      },
      {
        shadow: "“If I let someone else take control, I become weak or exposed.”",
        shift:
          "“I can choose when to lead and when to surrender. Giving up control voluntarily can be an expression of trust rather than weakness.”",
      },
      {
        shadow:
          "“If my partner changes a boundary or redirects what is happening, my authority is being taken away.”",
        shift:
          "“My partner’s autonomy does not diminish my leadership. Responding confidently to new information can be part of leading well.”",
      },
      {
        shadow:
          "“If everything has to be discussed explicitly, the power dynamic loses its intensity.”",
        shift:
          "“Spontaneity matters to me, but clear negotiation can make a power dynamic safer, more trusting, and ultimately more immersive.”",
      },
      {
        shadow: "“Needing reassurance makes me dependent in a way I cannot afford.”",
        shift:
          "“I can value self-reliance and still receive reassurance when I need it. Accepting care does not make me less capable.”",
      },
      {
        shadow: "“Being followed or deferred to is how I know I am respected and desired.”",
        shift:
          "“Being followed can be deeply erotic for me, but respect and desire can also be expressed through trust, honesty, affection, and engagement.”",
      },
      {
        shadow: "“If the plan becomes messy or unpredictable, something has gone wrong.”",
        shift:
          "“Structure helps me feel confident, but I can adjust to unpredictability without losing the dynamic or my sense of control.”",
      },
      {
        shadow:
          "“If I stop managing the situation, I risk being hurt, outplayed, or losing the upper hand.”",
        shift:
          "“Being intentional about control can protect me, but intimacy does not require me to stay strategically ahead of my partner at all times.”",
      },
    ],
    sun: [
      "“I enjoy creating a clear sense of direction, structure, and intention in sexual experiences.”",
      "“Taking responsibility for the tone and pace of an encounter can be deeply erotic and satisfying for me.”",
      "“I can make decisions confidently while still staying attentive to my partner’s reactions and autonomy.”",
      "“I value clear consent because it gives me a stronger foundation for leading with confidence.”",
      "“I can use authority to create safety, anticipation, and focus rather than simply control.”",
      "“I am comfortable expressing what I want directly instead of relying on hints or ambiguity.”",
      "“I can stay composed and responsive when a partner needs something different from what I expected.”",
      "“I enjoy building trust strong enough that power can feel exciting rather than threatening.”",
      "“Leadership is most satisfying to me when it is chosen, mutual, and grounded in respect.”",
      "“I can bring confidence, decisiveness, and presence into intimacy without needing every moment to revolve around control.”",
    ],
    lede: [
      h2("The Authority Conductor belief map"),
      p(
        t("For the"),
        b(" Authority Conductor"),
        t(", many of the most relevant beliefs concern "),
        b(
          "what it means to lead, to be respected, to reveal vulnerability, and to give up control"
        ),
        t(
          ". Leadership and clearly negotiated power can be genuine sources of desire. The important distinction is whether authority remains something chosen because it feels erotic and authentic, or starts to feel necessary in order to remain safe, respected, or emotionally protected."
        )
      ),
    ],
    // The doc sets this after the sun beliefs, above Common challenges.
    afterPanels: [
      p(
        t("The revealing part is not simply which beliefs sound familiar. It is "),
        b("what happens when one of them becomes activated in an ordinary intimate moment"),
        t(
          ". The same preference for leadership can create a clear, exciting container in one situation and make a small loss of control feel surprisingly personal in another."
        )
      ),
    ],
    challenges: [
      p(
        t(
          "Imagine a carefully negotiated sexual encounter in which the Authority Conductor has been setting the pace. Halfway through, the partner pauses and asks to change something: "
        ),
        i("“I don’t want that tonight. Can we do this instead?”")
      ),
      p(
        t(
          "On the surface, this is simply new information about a boundary or preference. But if the shadow belief "
        ),
        bi("“If my partner pushes back, they are undermining or disrespecting me”"),
        t(" is active, the moment can acquire a very different meaning.")
      ),
      p(
        t("Instead of hearing "),
        i("“This is what feels right for me now,”"),
        t(" the Authority Conductor may experience something closer to "),
        i("“They are resisting me,” “I am losing the dynamic,”"),
        t(" or "),
        i("“They no longer respect the position we agreed on.”"),
        t(" What was a sexual adjustment becomes a question of authority.")
      ),
      p(
        t(
          "That interpretation can change behavior quickly. The Authority Conductor may become colder, more rigid, unusually focused on the original agreement, or simply lose desire once the sense of control is disrupted. The problem is not the preference for leadership. "
        ),
        b(
          "It is the moment when a partner’s autonomy begins to feel like evidence that leadership itself is being threatened."
        )
      ),
      p(
        t("The corresponding sun belief creates a different possibility: "),
        i("“A partner can change direction and still respect me.”"),
        t(
          " Authority no longer depends on uninterrupted compliance. In fact, responding confidently to new information can become part of the leadership itself."
        )
      ),
      p(t("A different shadow belief can appear outside an explicitly sexual power dynamic.")),
      p(
        t(
          "Imagine an argument after which a partner notices that the Authority Conductor is unusually withdrawn and says, "
        ),
        i(
          "“You don’t have to manage everything with me. Tell me what you actually need right now.”"
        )
      ),
      p(
        t(
          "For someone whose vulnerability feels relatively safe, that invitation may register as closeness. For the Authority Conductor, however, the belief "
        ),
        bi("“If I reveal what I really need, I give someone leverage over me”"),
        t(" may change its meaning completely.")
      ),
      p(
        t("A simple need for reassurance can suddenly feel exposing. Saying "),
        i("“I need to know we’re okay”"),
        t(
          " may feel far riskier than explaining the problem, setting a rule, proposing a solution, or regaining control of the conversation. The Authority Conductor may therefore become analytical, dismiss the need altogether, redirect attention toward the partner, or re-establish distance."
        )
      ),
      p(
        t("This can create a paradox. "),
        b(
          "The strategies used to avoid feeling vulnerable can also prevent the experience that might make vulnerability feel safer."
        ),
        t(" A partner cannot respond warmly to a need they are never allowed to see.")
      ),
      p(
        t("The more flexible belief is not "),
        i("“I should surrender all control.”"),
        t(" It is "),
        i("“I can reveal something real without giving away my power.”"),
        t(
          " That distinction matters. Vulnerability does not require abandoning discernment, boundaries, or authority. It simply means that control no longer has to protect every emotionally exposed part of the relationship."
        )
      ),
    ],
    practice: [
      p(
        t(
          "The aim is not to make yourself less confident or decisive. The goal is to notice when control, responsibility or certainty begins to narrow the experience, then create enough space for flexibility, mutual influence and surprise."
        )
      ),
      p(t("A simple process can help.")),
      p(
        t("The first step is to "),
        b("separate what happened from what it seemed to mean"),
        t(
          ". Describe the event without interpretation. “My partner asked to change the plan.” “They disagreed with me.” “I wanted reassurance.” Then ask: “What did I decide that meant?”"
        )
      ),
      p(
        t("Next, "),
        b("name the rule underneath the reaction"),
        t(
          ". Perhaps it is “If they challenge me, they do not respect me,” “If I need them, they have power over me,” or “If I am not directing what happens, I am no longer safe.” Once the rule is visible, it becomes possible to examine rather than automatically obey it."
        )
      ),
      p(
        t("Then, "),
        b("ask where that belief may have come from and what it has been protecting. "),
        t(
          "Control may once have reduced uncertainty. Emotional self-containment may have protected against disappointment. Being difficult to read may have felt safer than revealing a need that could be ignored. Understanding that history does not make the belief wrong. It simply helps distinguish a familiar protective rule from an accurate description of the present."
        )
      ),
      p(
        t("From there,"),
        b(" test the interpretation against real experience."),
        t(
          " Does disagreement always mean disrespect? Has someone ever known what the Authority Conductor needed and treated that knowledge with care rather than using it as leverage? Can a partner retain clear boundaries while still willingly entering a dominant and submissive dynamic? Can adapting to another person’s response sometimes demonstrate more confidence than insisting that the original plan continue?"
        )
      ),
      p(
        t("Finally,"),
        b(" rewrite the belief without erasing the underlying preference. "),
        t(
          "The goal is not to replace “I like being in control” with “I should stop wanting control.” A more useful shift might be: “I can enjoy being in control without needing control to prove that I am respected.” Or: “I can reveal something real without giving away my power.”"
        )
      ),
      p(
        t(
          "The aim is not to remove the desire to lead. For many Authority Conductors, structure, direction, psychological intensity, and chosen authority are meaningful parts of sexuality. The aim is to make those qualities increasingly deliberate. "
        ),
        b(
          "Authority becomes more secure when it does not have to defend itself against every moment of uncertainty, disagreement, vulnerability, or change."
        )
      ),
    ],
    cuts: { challengesFree: 3, practiceFree: 2 },
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
        t("For the "),
        b("Authority Conductor, "),
        t("desire tends to become especially responsive to "),
        b("clarity, influence and a defined erotic structure"),
        t(
          ". The experience is often more compelling when power has a shape and the roles inside it feel intentional."
        )
      ),
    ],
    brakes: [
      {
        label: "Chaos or unclear roles",
        subtext:
          "When nobody seems to know what the dynamic is or where it is going, erotic focus may quickly give way to irritation or disengagement.",
      },
      {
        label: "Boundaries or agreements being ignored",
        subtext:
          "A partner disregarding negotiated rules, limits or protocol can shut desire down because the structure no longer feels trustworthy.",
      },
      {
        label: "Feeling stripped of the chosen role",
        subtext:
          "Unexpectedly being directed, overruled or placed in a position that feels diminishing can interfere with arousal when leadership is central to the erotic frame.",
      },
      {
        label: "Unstructured emotional exposure",
        subtext:
          "Vulnerability may become inhibiting when it appears suddenly and leaves the Authority Conductor feeling exposed rather than deliberately open.",
      },
      {
        label: "The erotic frame being disrupted mid-experience",
        subtext:
          "Unexpected conflict, confrontation or renegotiation can move attention away from sensation and toward restoring clarity or control.",
      },
    ],
    accelerators: [
      {
        label: "Clear power roles and chosen hierarchy",
        subtext:
          "Knowing who is leading and who is following can create erotic certainty and allow tension to build.",
      },
      {
        label: "A partner responding to direction",
        subtext:
          "Being listened to, deferred to or trusted to guide the experience can make influence itself part of the reward.",
      },
      {
        label: "Rules, rituals and protocol",
        subtext:
          "Agreed instructions, rituals or behavioral expectations can turn structure into anticipation and erotic focus.",
      },
      {
        label: "Orchestrating tension and escalation",
        subtext:
          "Controlling timing, teasing, denial, reward or the progression of an encounter can make the build-up as compelling as the sexual outcome.",
      },
      {
        label: "Respectful challenge inside a clear container",
        subtext:
          "A capable, self-assured partner who pushes back without breaking the agreed dynamic can create a particularly charged sense of tension and earned surrender.",
      },
    ],
    challenges: [
      p(
        t(
          "Imagine an encounter built around a clearly negotiated power dynamic. The Authority Conductor is directing the pace, the partner is responding enthusiastically, and the structure itself is creating tension. The accelerator has plenty to work with."
        )
      ),
      p(
        t(
          "Then the rhythm changes. The partner becomes uncertain and wants to slow down, alter the dynamic or talk through something that no longer feels right."
        )
      ),
      p(
        t(
          "That change should always be respected. But internally, more than one process may now be happening. The sexual brake may respond not only to the interruption itself, but also to the sudden loss of the role and structure that had been carrying the Authority Conductor’s arousal. Attention can shift from "
        ),
        i("“This feels good”"),
        t(" toward "),
        i("“I need to get the dynamic back under control.”")
      ),
      p(
        t(
          "The result can be paradoxical. The Authority Conductor may become more directive precisely when desire is beginning to disappear, trying to restore the condition that normally fuels it. Yet the harder attention moves toward maintaining the frame, the less room there may be to simply experience pleasure, adapt or receive new information from the partner."
        )
      ),
      p(
        b(
          "This is the central tension in the Authority Conductor’s pattern: control can be one of the strongest accelerators of desire, while the need to preserve control can sometimes become a brake of its own."
        )
      ),
    ],
    practice: [
      p(
        t("Begin by noticing "),
        b("changes in state rather than judging the overall encounter."),
        t(
          " Pay attention to the moment desire intensifies, but also to the instant it weakens. Did you become more aroused when the partner followed an instruction, entered a ritual or handed over control? Did interest drop when the interaction became ambiguous, emotionally exposed or difficult to direct?"
        )
      ),
      p(
        t(
          "Then separate the accelerator from the brake. If a structured dynamic is exciting, ask what underneath it is doing the erotic work. It may be "
        ),
        b(
          "influence, anticipation, competence, focused attention, trust, responsibility, being deliberately chosen to lead, or the experience of another person willingly yielding control."
        ),
        t(
          " These ingredients are more useful to understand than the surface behavior alone because they can often be created in more than one way."
        )
      ),
      p(
        t(
          "Do the same with the brakes. Some should not be reduced at all. A partner withdrawing consent, expressing discomfort, crossing a boundary, or making the situation unsafe is meaningful information. "
        ),
        b("Protective brakes are not obstacles to overcome.")
      ),
      p(
        t(
          "Other brakes may be more adjustable. If desire disappears whenever the Authority Conductor is not fully directing the experience, for example, it can be useful to explore whether the brake is responding to the situation itself or to what the situation has come to mean. "
        ),
        i("“If I am not leading, I am losing my position”"),
        t(" creates a very different sexual experience from "),
        i("“I can still be respected while allowing the dynamic to change.”")
      ),
      p(
        b("Experiment by changing one condition at a time."),
        t(
          " Keep the power dynamic but allow the partner more choice within it. Keep the ritual but remove the expectation that it must unfold perfectly. Build a clear scene while deliberately leaving one part unscripted. Practice receiving pleasure without immediately directing what happens next. The aim is not to force surrender or flexibility, but to discover "
        ),
        b(
          "which parts of control are genuinely erotic and which have become prerequisites for feeling secure enough to stay engaged."
        )
      ),
      p(
        t(
          "This also makes the Authority Conductor’s strengths easier to use deliberately. Rather than simply increasing intensity, rules or control, the Authority Conductor can build the conditions that make those elements powerful in the first place: clarity, anticipation, trust, responsiveness and a shared commitment to the chosen dynamic."
        )
      ),
      p(
        t(
          "That distinction matters. More control is not always more erotic. More stimulation is not always more desire. "
        ),
        b(
          "The goal is calibration: enough structure for the Authority Conductor’s accelerator to engage, enough flexibility that maintaining the structure does not become another brake."
        )
      ),
    ],
    cuts: { challengesFree: 2, practiceFree: 1, practiceRampThrough: null },
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
        t("For the"),
        b(" Authority Conductor,"),
        t(" these collisions often become most visible around "),
        b("leadership, control, and the rules that organize intimacy"),
        t(
          ". Clear roles, deliberate structure, and the feeling of directing an erotic experience can create excitement and confidence. When both partners actively choose that dynamic, authority itself can become part of the attraction."
        )
      ),
      p(
        t(
          "The challenge is that erotic authority and relationship authority are not the same thing. A partner may enjoy being guided sexually while still wanting equal influence over boundaries, decisions, conflict, and the shape of the relationship. If those two forms of power begin to blur, a normal act of disagreement can start to feel like resistance, disrespect, or loss of control."
        )
      ),
      p(
        t(
          "Understanding this pattern matters because the problem is rarely leadership itself. It is what happens when "
        ),
        b(
          "maintaining the position of leader becomes more important than understanding what is actually happening between two people"
        ),
        t(
          ". Recognizing that early can prevent erotic structure from turning into relational rigidity and can show where growth matters most: negotiating authority clearly, tolerating challenge without treating it as disloyalty, and expressing vulnerable needs without having to control the response."
        )
      ),
      h("Common challenges"),
      p(
        b("Leadership can collide with a partner’s need for autonomy."),
        t(
          " The Authority Conductor may feel most comfortable when expectations, roles, and boundaries are clear. A partner may enjoy that structure while still wanting the freedom to change their mind, challenge a decision, or step outside the usual dynamic. What feels like healthy autonomy to one partner can sometimes register as disruption or loss of respect to the other."
        )
      ),
      p(
        b("Conflict can become a struggle over who controls the frame."),
        t(
          " When hurt, disappointed, or uncertain, the Authority Conductor may be more comfortable setting terms, withdrawing strategically, or steering the conversation than openly saying what feels vulnerable. A partner who wants direct emotional transparency may experience this as being managed rather than met."
        )
      ),
      p(
        b("Stability can remove some of the tension that made power erotic."),
        t(
          " In a secure relationship, the partner may become clearer about boundaries, less reactive to push-pull dynamics, and more comfortable speaking as an equal. That can be healthy for the relationship while also changing the erotic game. If tension depended heavily on uncertainty, leverage, or always being one step ahead, transparency can initially feel strangely flat."
        )
      ),
      p(
        t(
          "The difficult part is that these moments rarely feel like patterns from the inside. They can feel like facts: "
        ),
        i(
          "“They do not respect the dynamic anymore.” “If I soften now, I lose my position.” “They used to respond to me differently.”"
        )
      ),
      p(
        b(
          "The key question is whether the Authority Conductor is protecting an erotic structure that both partners have chosen, or protecting the feeling of never having to be the one who is uncertain, dependent, or exposed."
        )
      ),
      p(
        t(
          "Imagine a couple with a clearly negotiated power dynamic. The partner usually enjoys following the Authority Conductor’s lead during sex and finds the structure exciting."
        )
      ),
      p(
        t(
          "One evening, however, the partner is tired and says they do not want to follow the usual protocol. That boundary may be completely ordinary. Consent can change from one moment to the next, even inside a long-standing dynamic. But for the Authority Conductor, the change may carry another meaning: "
        ),
        i("“Are they challenging me?”"),
        t(" or "),
        i("“Does this dynamic no longer matter to them?”")
      ),
      p(
        t(
          "If that interpretation takes over, the Authority Conductor may become colder, more rigid, or more focused on restoring the structure. The partner, sensing that saying no has changed the emotional atmosphere, may become more defensive about their independence."
        )
      ),
    ],
    loop: [
      {
        happens: "A partner steps outside the usual dynamic",
        underneath: "Their autonomy shows up more strongly",
      },
      { happens: "“They are challenging me.”", underneath: "Control starts to feel uncertain" },
      {
        happens: "I become colder, firmer, or more controlling",
        underneath: "Restoring authority feels protective",
      },
      {
        happens: "“I am being managed, not met.”",
        underneath: "They feel the need to protect autonomy",
      },
      { happens: "They push back or become more independent", underneath: "They seek autonomy" },
      {
        happens: "I feel less respected and less in control",
        underneath: "The loop creates its own evidence",
      },
    ],
    result: p(
      t("A loop forms. "),
      b(
        "The more the Authority Conductor tries to restore authority, the more the partner needs to protect autonomy. The more strongly the partner protects autonomy, the more the Authority Conductor may experience the relationship as slipping out of their hands."
      )
    ),
    tail: [
      p(
        t(
          "What began as one changed preference can become a conflict about respect, power, and trust. The deeper distinction is important: "
        ),
        b("consensual authority is powerful precisely because it can be withdrawn."),
        t(
          " A partner’s ability to pause, question, or renegotiate the dynamic does not weaken it. It is what keeps the authority chosen rather than assumed."
        )
      ),
      p(t("A second version of the pattern can appear outside sex.")),
      p(
        t(
          "Imagine the Authority Conductor feels hurt after a partner makes an important decision without discussing it first. The feeling underneath may be simple: disappointment, insecurity, or fear that their importance in the relationship is changing. But saying "
        ),
        i("“That hurt me more than I expected”"),
        t(" requires giving up some control over how the conversation unfolds.")
      ),
      p(
        t(
          "Instead, the Authority Conductor may become distant, more formal, or unusually decisive. They may control the timing of the conversation, withhold warmth, or wait for the partner to notice that something is wrong."
        )
      ),
      p(
        t(
          "The partner senses the shift but does not know what caused it. They may push for an explanation or become frustrated by the distance. The Authority Conductor can then experience that pressure as another challenge to the frame: "
        ),
        i("“They are trying to force this conversation on their terms.”"),
        t(" Now both partners are responding to the defense rather than the original hurt.")
      ),
      p(
        t(
          "The partner pushes for transparency. The Authority Conductor protects control more strongly. The original need disappears behind a contest over who determines the terms of the interaction."
        )
      ),
      p(
        t("This is where control can become expensive. "),
        b(
          "The Authority Conductor may successfully protect the position of strength while making it harder for the partner to respond to the person underneath it."
        )
      ),
    ],
    practice: [
      p(
        t(
          "The goal is not for the Authority Conductor to become less decisive or less interested in structured power. The useful shift is learning to distinguish "
        ),
        b("chosen authority from defensive control"),
        t(".")
      ),
      p(t("When tension appears, ask three questions:")),
      ol(
        [b("What happened?"), t(" Describe the event without interpretation.")],
        [b("What did I make it mean?"), t(" Notice the conclusion that appeared automatically.")],
        [
          b("What do I actually need, miss, or want to ask for?"),
          t(" Look underneath the urge to regain control."),
        ]
      ),
      p(t("For example:")),
      p(
        i("What happened?"),
        t(" My partner did not want to follow a sexual protocol we usually enjoy.")
      ),
      p(i("What did I make it mean? “They do not respect my authority anymore.”")),
      p(
        i("What do I actually need?"),
        t(
          " I want to know that the dynamic still matters while making it safe for my partner to change their mind."
        )
      ),
      p(t("That can become a specific request:")),
      p(
        i(
          "“I want your no to be easy to give. I also care about this dynamic. Can we check in later about whether you simply wanted something different tonight or whether there is anything you want to change?”"
        )
      ),
      p(
        t(
          "The same principle applies outside sex. Instead of protecting hurt through withdrawal or control, translate it directly: "
        ),
        i(
          "“I felt left out when that decision was made without me. I want us to agree on which things we decide together.”"
        )
      ),
      p(
        t("For the Authority Conductor, "),
        b("vulnerability does not require giving up leadership"),
        t(
          ". Clear authority can coexist with admitting uncertainty, asking for reassurance, and allowing a partner to disagree without turning the disagreement into a struggle over status."
        )
      ),
      p(
        t(
          "It also helps to keep erotic power clearly negotiated. Leadership becomes more sustainable when both partners know where the dynamic applies, what it includes, and how either person can pause or renegotiate it."
        )
      ),
      p(
        t(
          "The qualities behind these challenges are also strengths. The Authority Conductor can bring decisiveness, structure, anticipation, and a powerful sense of containment into intimacy."
        )
      ),
      p(
        b(
          "The aim is not less power. It is power that remains strong because it no longer has to defend itself."
        )
      ),
    ],
    cuts: { freeBlocks: 4, rampThrough: "rarely leadership itself. ", practiceFree: 2 },
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
        t("For many Authority Conductors, fantasy becomes especially charged around "),
        b("direction, structure and chosen power"),
        t(
          ". The appeal may lie not only in having control, but in creating an erotic world where roles are clear, responses make sense and another person willingly enters the structure the Authority Conductor has designed."
        )
      ),
      h("What a fantasy might actually be about"),
      p(
        b("Designing the entire encounter."),
        t(
          " The fantasy might involve choosing the setting, pace, rules and sequence while a partner follows instructions and waits for permission. In imagination, every command lands exactly as intended and the partner’s surrender feels unmistakably willing. In reality, a partner may improvise, hesitate, ask for something different or want to renegotiate. The fantasy may therefore be partly about dominance, but also about "
        ),
        b("the erotic certainty of knowing exactly where each person stands"),
        t(".")
      ),
      p(
        b("Making a strong partner finally surrender."),
        t(
          " Another fantasy might involve a confident, difficult-to-impress person gradually giving up control, asking for attention or choosing to submit. What creates the charge may be less about defeating someone than about their surrender feeling especially meaningful because it was not automatic. In reality, attraction cannot guarantee compliance, and a partner’s independence continues to exist inside any consensual power dynamic."
        )
      ),
      p(
        b("Handing control to someone completely trusted."),
        t(
          " A less obvious fantasy may reverse the usual position. The Authority Conductor stops directing, planning and staying one step ahead, and another person takes over. In imagination, surrender carries no risk because the partner understands exactly what is needed and never mistakes vulnerability for weakness. In reality, giving up control may activate discomfort long before the experience becomes pleasurable."
        )
      ),
      p(
        t("These fantasies reveal an important distinction. "),
        b(
          "The Authority Conductor may be drawn not simply to power, but to what power organizes: uncertainty, vulnerability, anticipation and trust."
        ),
        t(
          " Dominance can create a clear container for these experiences. Surrender can reveal what happens when that container is no longer theirs to manage."
        )
      ),
      p(
        t("The deeper question is therefore not only “Who is in control?” but "),
        b("“What becomes possible when control feels secure enough to stop being monitored?”")
      ),
    ],
    challenges: [
      h("Common challenges"),
      p(
        b("A perfectly responsive fantasy can make real dominance feel less satisfying."),
        t(
          " Consider the fantasy of designing the entire encounter. In imagination, a command produces exactly the desired response. A pause creates tension. A rule is followed. Resistance appears only when it is erotically useful."
        )
      ),
      p(
        t(
          "Reality is more collaborative. A partner may misunderstand an instruction, laugh, need reassurance or suddenly want something different. The Authority Conductor may notice the thought, "
        ),
        i("“This is not going the way I pictured it.”")
      ),
      p(
        t(
          "The temptation can be to tighten the structure and direct more precisely. But the problem may not be insufficient control. "
        ),
        b(
          "Fantasy offers control without unpredictability, while real consensual dominance always includes another person’s agency."
        ),
        t(
          " Their ability to respond, change course and set limits is not outside the dynamic. It is part of what makes the power exchange real."
        )
      ),
      p(
        t(
          "If the Authority Conductor expects reality to reproduce fantasy’s perfect responsiveness, improvisation can begin to feel like disruption rather than participation."
        )
      ),
      p(
        b("Surrender may be exciting in imagination because vulnerability is already solved."),
        t(
          " Consider the fantasy of finally giving control to someone trusted. The Authority Conductor does not need to watch the situation, protect status or anticipate what comes next. The partner simply gets it right."
        )
      ),
      p(
        t(
          "A real attempt may feel very different. Even after boundaries are discussed, the moment another person starts directing the encounter, attention may shift toward monitoring: "
        ),
        i("“Do they actually know what they are doing? Am I still in control of this?”")
      ),
      p(
        t(
          "The Authority Conductor may then start correcting, negotiating from inside the scene or quietly taking the lead back."
        )
      ),
      p(
        t("That does not mean surrender is secretly unwanted. "),
        b(
          "The fantasy may be showing how erotic relief from control could feel once trust is already complete. Reality requires that trust to be experienced rather than assumed."
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
          "Take a recurring fantasy and change one ingredient at a time. If a partner followed every instruction but showed little emotional engagement, would dominance still feel satisfying? If the partner challenged the Authority Conductor while clearly respecting the agreed hierarchy, would the scene still work? If surrender were possible without any loss of respect or status, would giving up control become more appealing?"
        )
      ),
      p(
        t("This helps distinguish "),
        b("control itself from the experiences control creates"),
        t(
          ", such as clarity, responsiveness, anticipation, influence, trust or relief from uncertainty."
        )
      ),
      p(
        t(
          "Then reality-test the fantasy. Put back everything imagination removes. Imagine negotiating the scene beforehand, hearing a limit, adjusting an instruction, misreading a reaction, pausing for a check-in and allowing the partner to change their mind. If the fantasy involves surrender, include the possibility of feeling exposed, uncertain or tempted to regain control."
        )
      ),
      p(t("Notice which parts remain erotic once another person’s full agency returns.")),
      p(
        t(
          "Finally, translate the underlying appeal instead of reproducing the fantasy literally. If erotic certainty matters, clear roles and negotiated protocols may provide it without requiring rigid control over every moment. If earning surrender creates the charge, a partner can choose playful resistance or challenge within an agreed frame. If orchestrating the encounter is pleasurable, the Authority Conductor can design the structure while deliberately leaving some spaces unscripted."
        )
      ),
      p(
        t(
          "And if the fantasy is about finally putting control down, start smaller. Let a trusted partner choose the setting, determine the pace or direct one part of the encounter. The point is not to prove that the Authority Conductor can surrender. It is to discover "
        ),
        b("which forms of control can be released without making safety disappear with them"),
        t(".")
      ),
      p(
        t("For the Authority Conductor, the goal is not to make power less central. "),
        b(
          "It is to make power flexible enough to hold another person’s agency and the Authority Conductor’s own vulnerability at the same time."
        ),
        t(
          " Fantasy can show how compelling perfect control feels, but it can also reveal something more surprising: sometimes the deepest expression of security is no longer needing to control every part of the frame."
        )
      ),
    ],
    cuts: { practiceFree: 1 },
  },
};
