/**
 * Relational Nurturer's four V4 chapters, transcribed 2026-10-01 from Sanjin's docs, verbatim (curly
 * quotes and single spaces normalised); paywall cuts at his "Paywall" comments.
 * - Typical Beliefs: chapter 1_Xtk4fmkHx0SJkehb8P6qCJNNweu5guyG0iCXhQHSmk, how-to 1AkvVnidpSDDgR8GytY0u8dYxpvP9eiVrGpTHD65AxNA
 * - Accelerators & Brakes: chapter 1Jr9kaEdb3SY5oOFOyFQhy94-Vs9s7iSHliMMPxEFH_k, how-to 1qlwweNuBTbmlIZUoFXubnHekYVVgC71YO6Ou-7IzPTg
 * - Challenges in Partnerships: chapter 1W84pckRAf_BguESkH_LalTCfHTX5IEab-KjpsHW_ju4, how-to 1PlanxlZG9ieAo0kjy-IlP4LZxqDo4hgxPetweK0tXBY, loop 1OfUVVEZRx97A82YGfSUIGWTp3kPgNVnhufJmRKvjPco
 * - Fantasy vs. Reality: chapter 1TDWzCA50T2ePnO0B7fIRy7ZABjCHMo3rjjLDdsEUggs, how-to 1iyTU2P7lr-a5g5bLjOVRXffYsVMvoCrKlbac_2yeTUA
 *
 * PREMIUM: server-only (__tests__/security/premium-content-bundle.test.ts).
 */
import type { Report3ArchetypeCopy } from "./types";
import { b, bi, h, h2, i, ol, p, t } from "./runs";

export const RELATIONAL_NURTURER: Report3ArchetypeCopy = {
  typicalBeliefs: {
    turns: [
      {
        shadow: "“If my partner needs me, I know I matter.”",
        shift:
          "“Being needed can feel meaningful without becoming proof of importance. Love and erotic value do not depend on continually solving, soothing, or supporting.”",
      },
      {
        shadow: "“A good partner puts their partner’s needs first.”",
        shift:
          "“Caring for another person does not require treating personal needs as secondary. Mutual care works in both directions.”",
      },
      {
        shadow:
          "“If my partner is struggling, I should take care of them before focusing on what I want.”",
        shift:
          "“Compassion does not require automatically becoming the caretaker. A partner’s difficult feelings and the Relational Nurturer’s own needs can exist at the same time.”",
      },
      {
        shadow: "“Wanting someone to take care of me is asking too much.”",
        shift:
          "“Receiving does not have to be earned through giving first. Being supported can be part of intimacy rather than a burden placed on it.”",
      },
      {
        shadow: "“If my partner is disappointed when I say no, I have let them down.”",
        shift:
          "“A partner can feel disappointed without anyone having failed. A genuine no protects honesty and mutuality.”",
      },
      {
        shadow:
          "“If my partner really knows and cares about me, I should not have to ask for what I need.”",
        shift:
          "“Being understood does not require being mind-read. Clear requests give another person the opportunity to respond with care.”",
      },
      {
        shadow: "“Sex feels most meaningful when it restores closeness between us.”",
        shift:
          "“Sexual intimacy can be powerful after emotional repair, but it does not need to carry the responsibility of proving that the relationship is okay.”",
      },
      {
        shadow: "“Focusing too much on my own pleasure is selfish.”",
        shift:
          "“Attention to personal pleasure does not take pleasure away from a partner. Mutual sexuality requires two experiences, not one giver and one receiver.”",
      },
      {
        shadow:
          "“Anger or frustration can damage closeness, so it is better to keep things gentle.”",
        shift:
          "“Warmth and honesty can coexist. Expressing frustration respectfully can protect intimacy better than allowing it to accumulate silently.”",
      },
      {
        shadow:
          "“If I stop giving so much, my partner may stop valuing what I bring to the relationship.”",
        shift:
          "“Care has more meaning when it is chosen rather than required. Being loved should leave room to be tired, unavailable, needy, imperfect, and still valued.”",
      },
    ],
    sun: [
      "“Emotional safety can make sexual openness easier for me.”",
      "“Tenderness, attentiveness, and slow connection can be deeply erotic.”",
      "“I can enjoy giving pleasure because it feels good to contribute to my partner’s experience.”",
      "“Sex can deepen emotional connection without needing to solve an emotional problem.”",
      "“Mutual vulnerability can bring two people closer without either person becoming responsible for fixing the other.”",
      "“Gentleness and erotic intensity can exist together.”",
      "“I value sexuality in which both people can notice, respond to, and care about each other’s experience.”",
      "“Aftercare, affection, and emotional presence can be meaningful parts of sex rather than something separate from it.”",
      "“Naming what I need gives my partner a better chance to care for me well.”",
      "“A satisfying sexual connection can include giving, receiving, comforting, playfulness, desire, and pleasure without any one role defining me.”",
    ],
    // The doc's opening: the four universal paragraphs, the third with "in this case".
    intro: [
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
          " Another believes that desire naturally rises and falls with stress, energy, mood, and circumstance. The same few days may carry almost no threat in this case. "
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
    ],
    lede: [
      h2("The Relational Nurturer belief map"),
      p(
        t("For the "),
        b("Relational Nurturer"),
        t(", beliefs often gather around "),
        b("care, reciprocity, emotional safety, and what it means to be a good partner"),
        t(
          ". Caring deeply is not the problem. In fact, attentiveness and responsiveness can be central strengths. The shadow tends to appear when care stops being something freely given and starts becoming something that feels necessary to preserve closeness, earn appreciation, or deserve care in return."
        )
      ),
    ],
    challenges: [
      p(t("Consider the belief "), bi("“If my partner needs me, I know I matter.”")),
      p(
        t(
          "Imagine the Relational Nurturer’s partner comes home overwhelmed after a difficult week. The conversation becomes entirely about the partner’s stress. The Relational Nurturer listens, reassures, helps them settle, and eventually moves into affectionate or sexual touch because closeness feels like a natural extension of taking care of them."
        )
      ),
      p(
        t(
          "Nothing about that behavior is inherently problematic. The Relational Nurturer may genuinely enjoy providing comfort. The difficulty appears when "
        ),
        b("being useful becomes the route through which closeness feels secure"),
        t(".")
      ),
      p(
        t("Attention can gradually move away from "),
        i("“What am I feeling or wanting?”"),
        t(" toward "),
        i("“What do they need from me?”"),
        t(
          " If the partner relaxes, expresses gratitude, or becomes affectionate, the interaction may feel rewarding. But if this pattern repeats, the Relational Nurturer may become highly skilled at reading the partner while becoming less practiced at noticing personal desire."
        )
      ),
      p(
        t(
          "Sex can then begin to organize itself around caregiving. Desire may appear most easily during reconciliation, emotional support, or moments when the partner needs soothing, while ordinary moments of personal wanting feel harder to claim."
        )
      ),
      p(t("The belief has quietly created a rule: "), i("“Being there for them keeps us close.”")),
      p(
        t("Now consider "),
        bi(
          "“If my partner really knows and cares about me, I should not have to ask for what I need.”"
        )
      ),
      p(
        t(
          "After repeatedly supporting a partner, the Relational Nurturer may hope that care will eventually be noticed and returned without having to request it. Perhaps they want the partner to initiate affection, ask how they are doing, take the lead sexually, or simply recognize that they are exhausted."
        )
      ),
      p(
        t("When that does not happen, disappointment can become surprisingly intense: "),
        i("“I notice everything they need. Why don’t they notice me?”")
      ),
      p(
        t(
          "Yet the need may still remain unspoken. Asking directly can feel less satisfying because part of what is wanted is the experience of being spontaneously noticed."
        )
      ),
      p(
        t(
          "This can create a painful cycle. The Relational Nurturer gives more, hopes the partner recognizes the need underneath the giving, feels unseen when they do not, and then becomes quieter or more resentful rather than clearer."
        )
      ),
      p(
        b(
          "The conflict is not necessarily that the partner does not care. The two people may be operating with different beliefs about how care should be communicated."
        )
      ),
    ],
    practice: [
      p(
        t(
          "The goal is not to make the Relational Nurturer less caring. It is to make care more conscious, reciprocal, and compatible with personal desire."
        )
      ),
      p(t("A simple process can help.")),
      p(
        b("Separate the event from its meaning."),
        t(" Start with what actually happened. "),
        i("“My partner talked about their problems for an hour and did not ask how I was doing.”"),
        t(" Then notice the interpretation that followed: "),
        i("“They only value me for what I do for them.”"),
        t(
          " The first statement describes the event. The second reveals the meaning attached to it."
        )
      ),
      p(
        b("Name the rule underneath it."),
        t(" Ask what would have to be true for the reaction to make sense. Perhaps it is "),
        i("“If someone cares about me, they should notice when I need support,”"),
        t(" or "),
        i("“If my partner is unhappy, I should help before thinking about myself.”"),
        t(" Shadow beliefs often become easier to recognize when they are written as rules.")
      ),
      p(
        b("Ask where the belief came from."),
        t(
          " The Relational Nurturer may have learned that being helpful, emotionally mature, accommodating, or easy to rely on brought appreciation or closeness. Previous relationships may also have reinforced the idea that care is safest when earned through giving. Understanding the origin does not invalidate the preference for nurturing. It simply helps separate what is genuinely valued from what once felt necessary."
        )
      ),
      p(
        b("Test the interpretation."),
        t(
          " Look for evidence beyond the first emotional conclusion. Does the partner respond well when needs are stated clearly? Have there been situations where someone failed to notice a need but cared once they understood it? Can a person be temporarily absorbed in their own distress without taking the Relational Nurturer for granted? Testing a belief means widening the interpretation, not forcing the most positive explanation."
        )
      ),
      p(
        b("Rewrite the belief without erasing the preference."),
        t(" The aim is not "),
        i("“I should stop taking care of people.”"),
        t(" A more useful shift might be: "),
        b(
          "“Caring for my partner is important to me, but I do not need to earn closeness by always being the one who gives. I can ask, receive, set limits, and still be loving.”"
        )
      ),
      p(
        t("The same principle can be applied during sex. Instead of asking only "),
        i("“What would make my partner feel good?”"),
        t(" occasionally add: "),
        i(
          "“What am I noticing in my own body? What would I want if I were not responsible for anyone else’s experience right now?”"
        )
      ),
      p(
        t("For the Relational Nurturer, this distinction can be especially important. "),
        b(
          "The goal is not to remove care from sexuality. It is to let care remain erotic because it is wanted, rather than because closeness seems to depend on it."
        ),
        t(
          " When giving and receiving both become available, nurturing can remain a genuine strength without becoming the only role through which intimacy feels secure."
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
        t("For the"),
        b(" Relational Nurturer"),
        t(", this balance tends to be especially sensitive to "),
        b("the emotional quality of the interaction"),
        t(
          ". Desire often becomes easier to access when closeness feels warm, reciprocal and emotionally safe. It can retreat when intimacy begins to feel cold, demanding or one-sided."
        )
      ),
    ],
    brakes: [
      {
        label: "Emotional coldness or unresolved distance",
        subtext:
          "Desire may become harder to access when there is resentment, contempt or a sense that emotional connection has disappeared.",
      },
      {
        label: "Feeling taken for granted",
        subtext:
          "Giving can lose its erotic quality when care starts to feel expected rather than noticed and valued.",
      },
      {
        label: "One-sided emotional labor",
        subtext:
          "Constantly regulating, reassuring or supporting a partner can leave little room for the Relational Nurturer’s own sexual state to emerge.",
      },
      {
        label: "Being pushed into a service role",
        subtext:
          "Sex can become less appealing when attention is centered on what the Relational Nurturer can provide, with little curiosity about what they want or feel.",
      },
      {
        label: "Criticism when expressing needs or limits",
        subtext:
          "If asking for something, saying no or needing support creates conflict, desire may retreat as intimacy becomes associated with emotional cost.",
      },
    ],
    accelerators: [
      {
        label: "A partner relaxing into their touch",
        subtext:
          "Seeing tension soften during massage, kissing or slow physical contact can make care itself feel erotic.",
      },
      {
        label: "Mutual vulnerability",
        subtext:
          "Honest emotional sharing, tenderness and moments of genuine openness can create the sense of closeness that allows desire to deepen.",
      },
      {
        label: "Feeling appreciated while giving pleasure",
        subtext:
          "A partner’s sounds, reactions, gratitude or affectionate attention can make giving feel intimate rather than simply helpful.",
      },
      {
        label: "Slow, attentive physical connection",
        subtext:
          "Unhurried touch, cuddling, soft kisses and body-centered sex can give the Relational Nurturer enough space to settle into arousal.",
      },
      {
        label: "Receiving care in return",
        subtext:
          "Being held, soothed, touched or actively cared for can become especially powerful when the Relational Nurturer does not have to manage the other person’s experience.",
      },
    ],
    challenges: [
      p(
        t(
          "Imagine an evening when a partner comes home tense and overwhelmed. The Relational Nurturer begins with a massage. The partner gradually relaxes, becomes more affectionate and clearly enjoys the attention. The Relational Nurturer notices the change, feels the connection deepen, and sexual interest begins to appear. "
        ),
        b("The partner’s relaxation and pleasure are pressing the accelerator.")
      ),
      p(
        t(
          "Now imagine that this pattern happens constantly. The partner arrives distressed, receives comfort, and expects the Relational Nurturer to create closeness again. There is little curiosity about how the Relational Nurturer is feeling, and little care flowing in the opposite direction. What once felt intimate can gradually begin to register as responsibility. The thought may shift from "
        ),
        i("“I love making them feel this good”"),
        t(" to "),
        i("“I am taking care of them again.”")
      ),
      p(t("The physical behavior has barely changed. "), b("Its meaning has.")),
      p(
        t(
          "That distinction can explain an especially confusing pattern for the Relational Nurturer: something that is genuinely erotic under conditions of reciprocity can become a brake when it starts to feel like an obligation."
        )
      ),
      p(
        t(
          "The deeper question is therefore not simply whether care, closeness or giving are turn-ons. It is "
        ),
        b("what has to be present for giving to still feel erotic rather than like work.")
      ),
    ],
    practice: [
      p(
        t("Start by noticing "),
        b("changes in state rather than judging the overall level of desire"),
        t(
          ". Think about a specific moment when interest grew, disappeared or changed direction. What happened immediately before it? Perhaps a partner softened during touch and desire suddenly became stronger. Perhaps the Relational Nurturer was interested until the encounter began to feel focused entirely on the partner’s needs."
        )
      ),
      p(
        t(
          "Then ask what was actually pressing the accelerator or brake. Be precise. “Connection turns me on” contains much less useful information than “Seeing my partner relax while they remain emotionally present with me makes closeness feel erotic.” Likewise, “Stress kills desire” is less revealing than “When I feel responsible for regulating my partner before I can relax, I stop noticing my own arousal.”"
        )
      ),
      p(
        t("Next, separate "),
        b("protective brakes from adjustable brakes"),
        t(
          ". Some inhibition is valuable information. If there is unresolved resentment, genuine exhaustion, unwanted sex, pain or a serious lack of reciprocity, the goal is not to override that reaction. The situation itself may need attention. Other brakes may be more flexible. For example, the Relational Nurturer may have difficulty relaxing into receiving because attention immediately shifts toward whether the partner is enjoying themselves or needs something."
        )
      ),
      p(
        b("Experiment by changing one condition at a time. "),
        t(
          "Let a partner initiate care without immediately returning it. Spend part of an encounter receiving touch without being responsible for where it leads. Resolve a lingering conflict before trying to create sexual closeness. Notice whether desire changes when appreciation is expressed clearly rather than assumed. These are not techniques for forcing arousal. They are ways of discovering "
        ),
        b("which conditions allow it to emerge more naturally"),
        t(".")
      ),
      p(
        t(
          "It is also useful to look beneath the obvious accelerator. If giving pleasure is especially arousing, the deeper ingredient may not simply be giving. It may be seeing the partner soften, feeling trusted, experiencing mutual emotional presence, or knowing that the care is genuinely appreciated. Once that ingredient is clear, it can be created in more than one way."
        )
      ),
      p(
        t(
          "The same applies to brakes. If a lack of reciprocity suppresses desire, the answer is not necessarily to stop being caring. It may be to create situations in which care moves in both directions, so that the Relational Nurturer can remain a participant in intimacy rather than becoming its caretaker."
        )
      ),
      p(
        t("This is the central calibration for the Relational Nurturer: "),
        b(
          "do not simply maximize closeness or opportunities to give. Pay attention to the kind of closeness being created."
        ),
        t(
          " The most supportive sexual dynamic is likely to be one where warmth, care and responsiveness remain strengths, while the Relational Nurturer also has enough room to receive, want, respond and be attended to."
        )
      ),
      p(
        t(
          "The goal is not to remove the brakes or keep the accelerator pressed as strongly as possible. It is to understand what each system is responding to, so desire does not have to compete with responsibility for the entire emotional experience."
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
        b("Relational Nurturer,"),
        t(" these collisions often form around "),
        b("care, reciprocity, and the expression of needs"),
        t(
          ". The Relational Nurturer tends to notice a partner’s emotional state quickly and may respond with reassurance, listening, touch, practical help, or attempts to restore closeness. At the same time, their own needs can be expressed more quietly or left unspoken in the hope that a caring partner will notice them too."
        )
      ),
      p(
        t(
          "This can create a subtle imbalance. A partner who is comfortable asking for support may receive more and more of it, while the Relational Nurturer asks for relatively little in return. A more independent or direct partner may simply assume that everything is fine unless told otherwise. "
        ),
        b(
          "What begins as generosity can gradually become a relationship role neither person consciously chose."
        )
      ),
      p(
        t(
          "Understanding the pattern early matters because it is much easier to adjust before care turns into exhaustion, resentment, or sexual distance. It also points toward clear areas of growth: making needs visible sooner, setting limits before depletion, and allowing care to move toward the Relational Nurturer rather than mainly away from them."
        )
      ),
      h("Common challenges"),
      p(
        b("Care can slowly become an unequal role."),
        t(
          " When a partner is stressed, struggling, or emotionally expressive, the Relational Nurturer may naturally offer more support. If that partner is comfortable receiving while the Relational Nurturer is hesitant to ask, one person can gradually become the person who is cared for while the other becomes the person who keeps everything steady. What feels like loving support to one partner can eventually feel like being taken for granted to the other."
        )
      ),
      p(
        b("Unspoken needs can collide with direct communication."),
        t(
          " The Relational Nurturer may show care through attention, touch, listening, and noticing small changes, and may hope for similar sensitivity in return. A partner who expects needs to be stated clearly may not recognize those quieter signals. The Relational Nurturer may experience this as "
        ),
        i("“They should know I need something too,”"),
        t(" while the partner genuinely believes that no request means no problem.")
      ),
      p(
        b("Sex can begin to feel like another form of caretaking."),
        t(
          " The Relational Nurturer may find closeness, soothing touch, emotional repair, and a partner’s pleasure deeply meaningful. But with a partner who readily receives this attention without turning enough of it back, intimacy can begin to organize itself around the partner’s comfort. Sex may remain caring and affectionate while leaving less room for the Relational Nurturer’s own desire, pleasure, or wish to be pursued."
        )
      ),
      p(
        t(
          "The difficult part is that these moments rarely feel like a pattern from the inside. They can feel like love, patience, loyalty, or simply "
        ),
        i("“They need me right now.”")
      ),
      p(
        b(
          "The key question is not whether the Relational Nurturer cares too much. It is whether care is still freely chosen and moving in both directions, or whether being needed has quietly become the safest position in the relationship."
        )
      ),
      p(
        t(
          "Imagine one partner has been under pressure for several weeks. The Relational Nurturer listens after work, changes plans when the partner is overwhelmed, provides reassurance, and tries to make home feel easier. When the partner asks whether everything is okay, the answer may still be yes because their problem feels more urgent."
        )
      ),
      p(
        t(
          "The partner takes that answer seriously. From their perspective, the relationship is working: they are struggling, their partner is supportive, and no other need has been clearly expressed."
        )
      ),
      p(
        t(
          "Over time, however, the Relational Nurturer may begin to notice how rarely the attention moves in the opposite direction. A thought can form: "
        ),
        i("“If they really cared, they would notice how much I am carrying.”"),
        t(" The partner may be operating from an entirely different assumption: "),
        i("“I thought they would tell me if something was wrong.”")
      ),
    ],
    loop: [
      {
        happens: "My partner is struggling and I give more support",
        underneath: "Their needs feel more urgent than mine",
      },
      {
        happens: "“If they really cared, they would notice me too.”",
        underneath: "Being noticed feels like proof of care",
      },
      {
        happens: "I keep giving and wait for them to notice",
        underneath: "Asking directly feels less natural than being understood",
      },
      {
        happens: "“They would tell me if something was wrong.”",
        underneath: "No request sounds like no problem",
      },
      {
        happens: "They continue receiving support as usual",
        underneath: "They do not realize something is missing",
      },
      {
        happens: "I feel unseen and increasingly taken for granted",
        underneath: "The loop makes their lack of response feel meaningful",
      },
    ],
    result: p(
      t("Neither reaction requires a lack of care. "),
      b(
        "The collision is between two different expectations about how care should be communicated."
      ),
      t(
        " The more the Relational Nurturer waits to be noticed, the less information the partner receives. The less the partner responds, the more meaningful that absence can begin to feel."
      )
    ),
    tail: [
      p(
        t(
          "A similar pattern can enter the sexual relationship. After a difficult conversation, the Relational Nurturer may be very comfortable soothing, holding, touching, or helping a partner relax into intimacy. That closeness can be genuinely pleasurable and may even help desire emerge."
        )
      ),
      p(
        t(
          "But if intimacy repeatedly begins with one person needing comfort, the Relational Nurturer can spend so much attention tracking the partner that their own arousal becomes secondary. They may continue giving affection and pleasure while initiating less for themselves, feeling less connected to their own preferences, or becoming less interested in sex over time."
        )
      ),
      p(
        t(
          "The partner may see reduced desire. The Relational Nurturer may simply feel tired. Underneath both experiences, however, there may be a more specific problem: "
        ),
        b(
          "too much of the erotic relationship has become organized around giving, and not enough around receiving."
        )
      ),
    ],
    practice: [
      p(
        t(
          "The goal is not for the Relational Nurturer to become less caring. It is to make care more conscious, reciprocal, and specific enough that it remains a choice rather than quietly becoming a responsibility."
        )
      ),
      p(t("When tension appears, use three questions:")),
      ol(
        [b("What happened?"), t(" Describe the event without interpreting it.")],
        [b("What did I make it mean?"), t(" Notice the conclusion that appeared automatically.")],
        [
          b("What do I actually need, miss, or want to ask for?"),
          t(
            " Move underneath the disappointment and identify something the partner can respond to."
          ),
        ]
      ),
      p(t("For example:")),
      p(
        i("What happened?"),
        t(
          " My partner spent most of the evening talking through something difficult. We went to bed without them asking much about how I was doing."
        )
      ),
      p(
        i("What did I make it mean? “My needs matter less.”"),
        t(" Or perhaps, "),
        i("“I am only important when I am helping.”")
      ),
      p(
        i("What do I actually need?"),
        t(" I want some of the care and attention to come back toward me.")
      ),
      p(t("Once that need is clear, it can become a request instead of a silent test:")),
      p(
        i(
          "“I want to be here for you, but I need some care tonight too. Can you ask me how I am doing and hold me for a few minutes before we keep talking about this?”"
        )
      ),
      p(
        t(
          "For the Relational Nurturer, asking directly can initially feel less meaningful than being noticed without having to ask. But a clear request gives the partner information that hints and quiet disappointment cannot. It also makes it easier to distinguish a partner who genuinely does not reciprocate from one who simply did not understand what was needed."
        )
      ),
      p(
        t(
          "The same principle applies sexually. Instead of automatically moving into giving, the Relational Nurturer can make room for a request that exists purely because it would feel good: "
        ),
        i(
          "“I love focusing on you, but tonight I want you to take the lead and focus on me first.”"
        )
      ),
      p(
        t("Boundaries can work in the same way. "),
        i(
          "“I can listen for a little while, but I am exhausted tonight and need some quiet afterward”"
        ),
        t(
          " is not a withdrawal of love. It prevents support from continuing past the point where it begins turning into resentment."
        )
      ),
      p(
        t("A particularly useful practice for the Relational Nurturer is "),
        b("receiving without immediately balancing the exchange"),
        t(
          ". Accept the massage without returning one. Let the partner plan the evening. Name a sexual preference and allow attention to remain there. Let reassurance land before offering reassurance back. These moments help create a different relational experience: closeness does not have to be earned through usefulness."
        )
      ),
      p(
        t(
          "The qualities behind these challenges are also some of the Relational Nurturer’s greatest strengths. Their attentiveness can make a partner feel deeply understood. Their instinct for repair can bring warmth back after difficult moments. Their care can create the emotional safety in which intimacy becomes unusually tender and connected."
        )
      ),
      p(
        t(
          "Those strengths become more sustainable when care no longer requires disappearing inside the caregiver role."
        )
      ),
      p(
        b(
          "The aim is not less nurture. It is mutual nurture: care that can move both ways, desire that does not depend on being useful, and intimacy in which the Relational Nurturer is not only the person who holds, but also someone who can be held."
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
        t(
          "For many Relational Nurturers, fantasy tends to become especially charged where sexuality and care overlap. Where some archetypes may be drawn toward distance, novelty or anonymity, the Relational Nurturer may be more responsive to scenes involving "
        ),
        b(
          "care, emotional release, gratitude, repair, devotion or the feeling of helping another person soften and let go"
        ),
        t(
          ". Sometimes the fantasy reverses that familiar role and makes the Relational Nurturer the one being cared for instead."
        )
      ),
      h("What a fantasy might actually be about"),
      p(
        b("Sex after an emotional breakthrough."),
        t(
          " The fantasy might involve a partner opening up completely, being held through tears, and slowly moving from comfort into deeply connected sex. In imagination, the emotional transition is seamless and mutually wanted. In reality, intense emotion may activate the Relational Nurturer’s caregiving side rather than sexual desire, and the partner may need comfort without wanting the moment to become erotic."
        )
      ),
      p(
        b("An evening devoted to a partner’s pleasure."),
        t(
          " The fantasy may center on giving slow, attentive touch and watching a partner relax, surrender and respond with unmistakable appreciation. In reality, concentrating entirely on the partner can sometimes pull attention away from the Relational Nurturer’s own arousal. The experience may feel emotionally rewarding without being equally sexually fulfilling."
        )
      ),
      p(
        b("Finally being the one who receives."),
        t(
          " A different fantasy might involve a partner taking over, refusing to let the Relational Nurturer caretake, and focusing entirely on their pleasure. The fantasy can remove guilt, responsibility and the need to ask. In reality, receiving sustained attention may feel surprisingly vulnerable, and the instinct to check on the partner, reciprocate or regain the caregiving role can quickly return."
        )
      ),
      p(
        t("These fantasies point to an important distinction. "),
        b(
          "The fantasy may not only be about closeness. It may also be about the role the Relational Nurturer gets to occupy inside that closeness."
        ),
        t(
          " Being needed, helping someone let go, being appreciated for giving, or finally being relieved of responsibility can each create very different forms of erotic charge."
        )
      ),
      p(
        t(
          "The useful question, then, is not simply whether the Relational Nurturer would want the fantasy to happen. It is "
        ),
        b("what the fantasy makes possible that may be harder to access in ordinary sexual life.")
      ),
    ],
    challenges: [
      h("Common challenges"),
      p(
        b("Pleasure can become easier to read through the partner than through oneself."),
        t(
          " Consider the fantasy of spending an evening focused on a partner’s pleasure. The partner relaxes, responds intensely and expresses gratitude. Every signal confirms that the Relational Nurturer is giving something valuable."
        )
      ),
      p(
        t(
          "In reality, this can make the partner’s response the easiest measure of whether sex is going well. A Relational Nurturer may leave an encounter knowing exactly how much the partner enjoyed it, yet be much less certain about their own experience. The thought may become, "
        ),
        i("“They loved it, so why do I still feel slightly absent?”")
      ),
      p(
        t("Nothing is wrong with finding pleasure in giving. The challenge appears when "),
        b("being useful becomes so familiar that personal desire becomes harder to notice"),
        t(".")
      ),
      p(
        b("Receiving can be easier to fantasize about than to tolerate."),
        t(
          " In the fantasy where a partner takes over completely, the Relational Nurturer does not have to decide when enough has been given or whether attention should be returned. The fantasy solves that problem automatically."
        )
      ),
      p(
        t(
          "Reality does not. Imagine a partner offering a long massage with no expectation of anything in return. After a few minutes, the Relational Nurturer may begin asking whether the partner is tired, offering to switch places, or thinking about how to reciprocate afterward. Attention quietly moves away from receiving and back toward managing the other person’s experience."
        )
      ),
      p(
        t(
          "The fantasy may therefore reveal something more specific than a wish to surrender control. "
        ),
        b(
          "Its appeal may be the experience of being cared for without first having to earn that care through service."
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
          "Take a recurring fantasy and change one ingredient at a time. If the partner no longer needed comfort, would the fantasy still work? If there were no gratitude afterward, would giving still feel as erotic? If the Relational Nurturer could receive pleasure without reciprocating, would that feel exciting, uncomfortable, or both?"
        )
      ),
      p(
        t("The point is not to decode the fantasy perfectly. It is to notice "),
        b("which emotional ingredient carries the charge"),
        t(".")
      ),
      p(
        t(
          "Then perform a reality test. Put back everything imagination conveniently removes. How would the experience begin? What would need to be communicated? What does the other person actually want? What happens if one person becomes emotional, distracted or unsure? What would the Relational Nurturer need in order to stay connected to their own body rather than automatically shifting into care?"
        )
      ),
      p(
        t(
          "This is particularly important with fantasies involving emotional repair. Comfort does not automatically need to become sex. Repair can happen first, and desire can be allowed to appear separately if both people genuinely want it."
        )
      ),
      p(
        t(
          "Finally, translate the underlying appeal rather than reproducing the entire fantasy. If the charge comes from watching a partner soften, try mutual slow touch rather than making one person responsible for the whole experience. If appreciation matters, make gratitude and verbal recognition part of sex while keeping attention on both partners. If the fantasy is about relief from responsibility, create a period where the Relational Nurturer is explicitly allowed to receive without immediately returning the favor."
        )
      ),
      p(
        t("For the Relational Nurturer, the goal is not to make care less erotic. "),
        b("It is to give care more than one direction."),
        t(
          " Fantasies can reveal where nurturing, desire, usefulness and receiving have become intertwined. Understanding those distinctions makes it easier to keep the warmth and devotion that matter while creating more room for personal desire, mutuality and pleasure that does not always have to be earned through giving."
        )
      ),
    ],
    cuts: { practiceFree: 1 },
  },
};
