/**
 * Report V4 — "Summary of the <Archetype>" (Figma 1:736), every archetype's.
 *
 * SERVER-ONLY since the slimmed report (16.10). Mark "basically halfed it … and then
 * locked it also" (14.10 sync; frame 1665:3796): a locked reader reads the first two
 * paragraphs and the third's first sentence, the rest of the third fades out under the
 * veil into the gate card, and nothing after it reaches the page. That makes the copy
 * paid like a chapter's, so it moved out of the client-imported
 * `report3-archetype-page.ts` and reaches the page through `buildSummary`, registered in
 * the premium-content-bundle test. Essentials and the full report unlock it all.
 */
import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";
import { splitRunsAtFirstSentence, veilText } from "@features/report/server/gatedCopy";
import type { Report3Run, Report3Summary } from "./report3-archetype-page";

/**
 * Part II · "Summary of the <Archetype>" — 1:736.
 *
 * Spark Seeker's is the frame's; the other 13 are Sanjin's summary docs (03.10). No doc
 * marks a Paywall in it: the slimmed report's wall (1665:3796) is the page's, set in
 * `buildSummary` below. `missingReport3Summary()` names any archetype without one, the
 * same way `missingReport3Blurbs()` and `missingReport3CardCopy()` do, so a gap closes
 * loudly.
 */
export const REPORT_V4_SUMMARY: Readonly<Record<string, Report3Summary>> = {
  // Re-read from 1:741 on 2026-09-24, after Mark updated the text and moved its
  // emphasis ("We have updated this text. Please push to staging", 1939884155). The
  // frame no longer draws the closing line 1:744.
  "Spark Seeker": {
    paragraphs: [
      [
        {
          weight: 800,
          text: "The Spark Seeker experiences sexuality primarily as a space for aliveness, chemistry, and playful charge.",
        },
        {
          text: " For them, desire begins in anticipation, energy, and the feeling that something exciting is unfolding. When there is flirtation, novelty, and a sense of “spark,” their erotic system ignites quickly and vividly.",
        },
      ],
      [
        { text: "They are " },
        { weight: 700, text: "lively, charismatic, and pleasure-forward lovers" },
        { text: " who value " },
        { weight: 700, text: "teasing, spontaneity, and emotional lightness" },
        {
          text: " over heaviness or routine. Sexuality is meaningful to them not as reassurance or devotion, but as a way to feel energized, wanted, and fully awake in the moment. Fun, novelty, and momentum are central to their arousal.",
        },
      ],
      [
        { text: "At their best, Spark Seekers create intimacy that feels " },
        { weight: 700, text: "electric, playful, and creatively alive for both partners." },
        {
          text: " Their presence invites laughter, confidence, and erotic adventure. However, because their desire is closely tied to stimulation and freshness, they ",
        },
        {
          weight: 700,
          text: "may struggle when sex becomes predictable, duty-like, or emotionally dense.",
        },
        {
          text: " In such moments, arousal can drop quickly, not because attraction is gone, but because their system stops feeling “charged.”",
        },
      ],
      [
        { text: "Spark Seekers may " },
        {
          weight: 800,
          text: "hesitate to slow down or go deeper emotionally, fearing it will dull the spark or trap them in expectations.",
        },
        {
          text: " This can lead to repeated cycles of intensity followed by restlessness, or to disconnection when a partner asks for more consistency than they naturally offer. They may also worry that if they are not exciting, they will lose desirability or feel bored and stuck.",
        },
      ],
      [
        {
          weight: 800,
          text: "Growth for the Spark Seeker lies in learning to sustain desire beyond novelty,",
        },
        {
          text: " building depth without losing play, communicating needs for variety without shame, and developing the capacity to enjoy calm intimacy without interpreting it as “dead.”",
        },
      ],
      [
        {
          text: "When supported and understood, the Spark Seeker’s sexuality becomes a powerful source of joy, creativity, and lasting erotic vitality that can keep relationships feeling bright over time.",
        },
      ],
    ],
  },
  // Sanjin's summary docs (03.10), one per archetype. They mark bold only: each first
  // paragraph's opening bold run takes Spark Seeker's lead weight (800), every other 700.
  "Analytical Sexualist": {
    paragraphs: [
      [
        {
          weight: 800,
          text: "The Analytical Sexualist experiences sexuality as something that becomes more rewarding through understanding, learning, and refinement.",
        },
        {
          text: " Desire is often strengthened by clarity: knowing what works, why it works, and how pleasure can be created more intentionally. Curiosity, feedback, and the sense of becoming more skilled can themselves become part of the erotic experience.",
        },
      ],
      [
        { text: "They tend to be " },
        { weight: 700, text: "thoughtful, observant, and improvement-oriented lovers" },
        {
          text: " who pay close attention to technique, patterns, and their partner’s responses. Rather than relying entirely on instinct, they may enjoy asking questions, exploring new methods, and making precise adjustments. Sexuality becomes a space where curiosity and competence can translate into real pleasure.",
        },
      ],
      [
        { text: "At their best, Analytical Sexualists bring " },
        { weight: 700, text: "attention, openness, and a genuine willingness to learn" },
        {
          text: " into intimacy. They can become exceptionally attuned partners because they notice details and take feedback seriously. However, the same mind that helps them understand pleasure can sometimes interfere with experiencing it. When attention shifts toward evaluating performance or figuring out what should happen next, they may become mentally busy instead of physically absorbed.",
        },
      ],
      [
        {
          text: "This becomes especially difficult when sex feels ambiguous or unpredictable. Without clear signals, they may search for explanations, worry about doing something incorrectly, or retreat further into analysis. ",
        },
        {
          weight: 700,
          text: "Underneath the drive to understand can be a deeper concern about getting it wrong",
        },
        { text: ", appearing inexperienced, or not being naturally intuitive enough." },
      ],
      [
        {
          text: "Their deeper challenge is therefore not thinking itself, but the belief that understanding must come before surrender. Pleasure does not always provide clear instructions, and intimacy cannot always be solved in advance.",
        },
      ],
      [
        {
          weight: 700,
          text: "Growth for the Analytical Sexualist lies in allowing knowledge and instinct to work together.",
        },
        {
          text: " As the pressure to perform correctly softens, their curiosity can remain a strength without becoming constant evaluation, creating sexuality that feels both intelligently attuned and genuinely lived.",
        },
      ],
    ],
  },
  "Authority Conductor": {
    paragraphs: [
      [
        {
          weight: 800,
          text: "The Authority Conductor experiences sexuality primarily as a space for power, direction, and intentional control.",
        },
        {
          text: " Desire comes alive when there is a clear dynamic to shape: tension to build, a rhythm to set, and a partner who willingly responds to their lead. Knowing where the interaction is going, and having influence over how it unfolds, creates much of the erotic charge.",
        },
      ],
      [
        { text: "They are " },
        { weight: 700, text: "decisive, commanding, and highly intentional lovers" },
        {
          text: " who often enjoy structure, anticipation, and clearly defined roles. Rather than waiting for chemistry to happen, they prefer to create it through timing, instructions, restraint, rewards, or carefully negotiated power dynamics. Sexuality becomes a place where confidence and authority can be expressed directly.",
        },
      ],
      [
        { text: "At their best, Authority Conductors can create intimacy that feels " },
        { weight: 700, text: "focused, intense, and deeply containing" },
        {
          text: ". Their certainty can help a partner relax into surrender because someone else is confidently holding the structure. The same strength can become limiting, however, when control stops being part of the erotic experience and starts feeling necessary for safety.",
        },
      ],
      [
        {
          text: "Underneath this preference for authority may be a deeper discomfort with being exposed, dependent, or unsure. ",
        },
        { weight: 700, text: "Leading can feel safer than needing." },
        {
          text: " When vulnerability begins to feel like losing status or giving someone else too much power, they may tighten control, become less flexible, or struggle to receive without first managing the conditions.",
        },
      ],
      [
        {
          text: "The deeper pattern is not simply a desire to dominate, but a desire to remain secure while desire becomes intense. Growth lies in ",
        },
        {
          weight: 700,
          text: "keeping power transparent and consensual while becoming less dependent on control for emotional protection",
        },
        {
          text: ". As trust deepens, authority can remain a genuine source of pleasure without having to defend against softness, uncertainty, or receiving. This allows them to lead from desire rather than self-protection, while leaving more room for their partner’s needs, reactions, and influence to shape the experience too.",
        },
      ],
    ],
  },
  "Curious Apprentice": {
    paragraphs: [
      [
        {
          weight: 800,
          text: "The Curious Apprentice experiences sexuality primarily as a space for discovery, learning, and growth.",
        },
        {
          text: " Desire is often strongest when there is something new to understand, practice, or explore together. Clear feedback, patient guidance, and the feeling of making progress can turn uncertainty itself into excitement.",
        },
      ],
      [
        { text: "They tend to be " },
        { weight: 700, text: "curious, open, and highly receptive lovers" },
        {
          text: ", willing to ask questions and experiment rather than pretend they already know everything. Sexuality becomes a process of learning what works, both for themselves and for a partner. They often thrive when exploration feels collaborative: trying something, noticing the response, talking about it, and adjusting together.",
        },
      ],
      [
        { text: "At their best, Curious Apprentices bring " },
        { weight: 700, text: "humility, attentiveness, and genuine willingness to grow" },
        {
          text: " into intimacy. They can become remarkably skilled partners because they pay attention and remain open to feedback. But the same desire to learn can become self-consciousness when they feel they are supposed to already know what to do. Instead of experiencing the moment, attention can shift toward ",
        },
        { italic: true, text: "“Am I doing this right?”" },
      ],
      [
        {
          text: "This vulnerability can make criticism, impatience, or comparison especially disruptive. When sexuality starts to feel like a test of competence, they may hesitate to initiate, rely heavily on a partner for direction, or avoid experiences where they fear getting something wrong. ",
        },
        { weight: 700, text: "Curiosity can quietly turn into performance pressure." },
      ],
      [
        {
          text: "Underneath this pattern is often a tension between wanting guidance and wanting to feel capable in their own right. Learning feels safe when mistakes are allowed; it becomes threatening when not knowing is interpreted as inadequacy.",
        },
      ],
      [
        { text: "Growth for the Curious Apprentice lies in " },
        { weight: 700, text: "moving from student to co-creator" },
        {
          text: ", keeping their openness to learning while developing greater trust in their own preferences, instincts, and initiative. Over time, sexuality can become not only something they are learning how to do, but something they increasingly feel confident shaping for themselves.",
        },
      ],
    ],
  },
  "Emotional Voyeur": {
    paragraphs: [
      [
        {
          weight: 800,
          text: "The Emotional Voyeur experiences sexuality primarily through imagination, observation, and the emotional tension of being close without being fully exposed.",
        },
        {
          text: " Desire often begins before direct participation, in watching, anticipating, imagining, or quietly absorbing what is unfolding. The space between themselves and the action can intensify arousal rather than diminish it.",
        },
      ],
      [
        { text: "They tend to be " },
        { weight: 700, text: "reserved, observant, and inwardly imaginative lovers" },
        {
          text: " who may feel more sexually expressive in fantasy than through direct initiation. Watching a partner experience pleasure, building an erotic scenario in their mind, or feeling invited into something without pressure can create a strong sense of intimacy. For them, distance is not necessarily disconnection. It can be part of what makes desire feel safe and compelling.",
        },
      ],
      [
        { text: "At their best, Emotional Voyeurs bring " },
        { weight: 700, text: "attentiveness, sensitivity, and a rich inner erotic world" },
        {
          text: " into intimacy. Their ability to notice subtle reactions and become absorbed in another person’s pleasure can make sexuality feel emotionally charged even without constant action or intensity.",
        },
      ],
      [
        {
          text: "The same sensitivity can become difficult when attention turns directly toward them. Being watched, evaluated, expected to perform, or pushed into immediate participation may make self-consciousness replace arousal. Retreating into fantasy can then feel easier than remaining present in a situation where they feel exposed.",
        },
      ],
      [
        { text: "Over time, this can create a deeper pattern: " },
        {
          weight: 700,
          text: "desire feels strongest when vulnerability can be experienced from a protected distance.",
        },
        {
          text: " Fantasy and observation offer erotic closeness while preserving control over how visible they become. The challenge is not voyeurism itself, but when safety becomes so dependent on remaining outside the experience that shared intimacy becomes harder to enter.",
        },
      ],
      [
        { text: "Growth lies in discovering that " },
        { weight: 700, text: "being involved does not have to mean being put on display." },
        {
          text: " As safety and confidence deepen, observation and fantasy can remain genuine sources of pleasure while becoming bridges into shared experience, rather than places they need to disappear into.",
        },
      ],
    ],
  },
  "Explorer of Edges": {
    paragraphs: [
      [
        {
          weight: 800,
          text: "The Explorer of Edges experiences sexuality as a space for intensity, transformation, and discovering what lies beyond the familiar.",
        },
        {
          text: " Desire often comes alive when an experience carries psychological charge: something new, powerful, taboo, demanding, or immersive enough to pull them fully into the moment. For them, erotic intensity is not simply about stimulation. It can create a sense of expansion, release, and access to parts of themselves that ordinary life rarely reaches.",
        },
      ],
      [
        { text: "They tend to be " },
        {
          weight: 700,
          text: "direct, curious, adventurous, and unusually open to exploring the edges of desire.",
        },
        {
          text: " Power exchange, strong sensation, darker aesthetics, elaborate roleplay, or unfamiliar experiences may appeal because they create total engagement. When trust is strong, they can bring remarkable honesty and courage to sexuality, naming desires others might hide and creating experiences that feel deeply intentional rather than merely conventional.",
        },
      ],
      [
        { text: "At their best, Explorers of Edges combine " },
        {
          weight: 700,
          text: "bold experimentation with presence, trust, and psychological depth.",
        },
        {
          text: " They can make sexuality feel like a place where both partners discover something new about themselves. Yet the same appetite for intensity can make gentler or more predictable experiences feel comparatively muted. Over time, they may need increasingly strong psychological or sensory charge to reach the same level of engagement.",
        },
      ],
      [
        { text: "Beneath this can sit a more vulnerable question: " },
        { weight: 700, text: "Will the full intensity of who I am be accepted?" },
        {
          text: " Fear of being judged, restricted, or seen as “too much” can make compatible spaces feel especially important. At the same time, when intensity becomes the main route to feeling fully alive, calm can begin to register as emptiness rather than simply a different kind of experience.",
        },
      ],
      [
        { text: "Growth lies not in becoming less intense, but in " },
        {
          weight: 700,
          text: "making intensity something they can choose rather than something they must continually escalate.",
        },
        {
          text: " When exploration exists alongside emotional grounding, clear boundaries, accountability, and an ability to remain engaged outside the peak, their sexuality can stay adventurous without needing every experience to push further than the last.",
        },
      ],
    ],
  },
  "Loyal Ritualist": {
    paragraphs: [
      [
        {
          weight: 800,
          text: "The Loyal Ritualist experiences sexuality primarily as a space for stability, familiarity, and dependable connection.",
        },
        {
          text: " Desire grows through trust, repetition, and the comfort of knowing what to expect. Familiar touch, shared routines, and a steady rhythm allow their erotic system to relax into pleasure rather than having to constantly adapt to something new.",
        },
      ],
      [
        { text: "They are " },
        { weight: 700, text: "grounded, consistent, and deeply loyal lovers" },
        {
          text: " who often find meaning in the rituals a couple builds together. A familiar sequence, a regular night for intimacy, or simply knowing how a partner likes to be touched can become more valuable with time, not less. For them, repetition can create depth because each return strengthens the sense of ",
        },
        { italic: true, text: "“this is ours.”" },
      ],
      [
        { text: "At their best, Loyal Ritualists create intimacy that feels " },
        { weight: 700, text: "safe, reliable, and quietly devoted" },
        {
          text: ". They bring continuity to a sexual relationship and can make a partner feel deeply known. However, the same preference for stability can make unfamiliar experiences feel disruptive rather than exciting. Pressure to constantly experiment may create anxiety or self-consciousness instead of curiosity.",
        },
      ],
      [
        { text: "Beneath this resistance can be a deeper fear that " },
        { weight: 700, text: "change means something is wrong with what already works" },
        {
          text: ". They may worry that preferring familiarity makes them boring, outdated, or less sexually capable than more adventurous partners. This can make them hold more tightly to established patterns precisely when a relationship begins asking for flexibility.",
        },
      ],
      [
        { text: "Growth lies not in abandoning ritual, but in discovering that " },
        { weight: 700, text: "security and change do not have to compete" },
        {
          text: ". Small variations can exist inside a trusted structure, allowing curiosity to grow without sacrificing the stability that makes desire possible.",
        },
      ],
      [
        {
          text: "When this balance develops, the Loyal Ritualist can preserve what they value most while allowing intimacy to evolve, creating a sexual connection that feels ",
        },
        { weight: 700, text: "both dependable and alive over time." },
      ],
    ],
  },
  "Minimalist Companion": {
    paragraphs: [
      [
        {
          weight: 800,
          text: "The Minimalist Companion experiences sexuality primarily as a space for comfort, closeness, and quiet connection.",
        },
        {
          text: " Desire tends to emerge when life feels calm, expectations are low, and there is enough familiarity to simply be present with another person. Rather than being pulled toward intensity or novelty, their erotic system responds to safety, ease, and the feeling that nothing needs to be performed.",
        },
      ],
      [
        { text: "They are " },
        { weight: 700, text: "gentle, undemanding, and low-pressure lovers" },
        {
          text: " who often prefer simple affection, familiar rhythms, and intimacy that fits naturally into everyday life. Sex does not need to be elaborate to feel meaningful. A soft touch that becomes more, an unhurried evening together, or familiar sex in a comfortable setting may offer exactly what they value: ",
        },
        { weight: 700, text: "connection without complication" },
        { text: "." },
      ],
      [
        {
          text: "At their best, Minimalist Companions bring a sense of steadiness and acceptance into intimacy. There is little need to chase the next experience or turn sex into a performance. However, because their desire is often quieter and less novelty-driven, they may begin to question themselves when surrounded by expectations that sexuality should be frequent, adventurous, or intensely passionate.",
        },
      ],
      [
        { weight: 700, text: "Pressure tends to make desire retreat rather than grow." },
        {
          text: " When a partner repeatedly asks for more excitement, more initiation, or more experimentation, sex can start to feel like a test they are failing. They may accommodate for a while rather than explain their limits, eventually becoming depleted and withdrawing further.",
        },
      ],
      [
        { text: "The deeper challenge is therefore not simplicity itself, but " },
        { weight: 700, text: "allowing simplicity to become silence or resignation" },
        {
          text: ". Growth lies in trusting that a quieter erotic style is valid while becoming more able to express what feels good, name what does not, and remain open to small expansions that feel genuinely inviting rather than imposed.",
        },
      ],
      [
        {
          text: "When this balance develops, the Minimalist Companion can create sexuality that is ",
        },
        {
          weight: 700,
          text: "calm without becoming stagnant, familiar without becoming disconnected, and simple without feeling like less.",
        },
      ],
    ],
  },
  "Quiet Withdrawer": {
    paragraphs: [
      [
        {
          weight: 800,
          text: "The Quiet Withdrawer experiences sexuality primarily through the need for safety, spaciousness, and freedom from pressure.",
        },
        {
          text: " Desire is most likely to emerge when nothing is being demanded of them and they feel certain that they can slow down, stop, or say no without disappointing their partner. Gentle affection, calm presence, and low-intensity environments give their erotic system room to open.",
        },
      ],
      [
        { text: "They tend to be " },
        { weight: 700, text: "reserved, cautious, and receptive rather than initiating" },
        {
          text: ", often preferring closeness that develops gradually instead of explicit pursuit or high sexual intensity. Affection, companionship, and simply spending time together may feel more natural than actively expressing sexual wants. When desire does appear, it can be subtle and easily disrupted by feeling watched, evaluated, hurried, or expected to perform.",
        },
      ],
      [
        { text: "At their best, Quiet Withdrawers bring a " },
        { weight: 700, text: "soft, undemanding quality to intimacy" },
        {
          text: ". They can appreciate tenderness, patience, quiet physical connection, and forms of closeness that do not need to constantly become more intense. However, because pressure so easily activates withdrawal, even ordinary expectations around sex, communication, or initiation can make desire disappear before it has had time to develop.",
        },
      ],
      [
        {
          text: "When overwhelmed, they may become quiet, retreat internally, avoid sexual conversations, or distance themselves from situations that could lead to expectations. ",
        },
        {
          weight: 700,
          text: "What looks like disinterest can sometimes be a protective response to feeling that engagement will create demands they are unsure they can meet.",
        },
        {
          text: " Over time, this can leave partners feeling rejected while the Quiet Withdrawer feels increasingly scrutinized and hesitant to engage.",
        },
      ],
      [
        { text: "The deeper pattern is often one of " },
        { weight: 700, text: "protecting safety by becoming less visible" },
        {
          text: ". Expressing desire, boundaries, or discomfort can feel risky, so withdrawal becomes easier than revealing what is happening internally. Yet the same strategy that reduces pressure can also make genuine wants harder for both partners to recognize.",
        },
      ],
      [
        { text: "Growth lies in developing a stronger sense that " },
        { weight: 700, text: "closeness does not require surrendering agency" },
        {
          text: ". As safety, self-expression, and confidence in boundaries increase, sexuality can become less about avoiding what feels overwhelming and more about recognizing, expressing, and acting on what they genuinely want.",
        },
      ],
    ],
  },
  "Radiant Performer": {
    paragraphs: [
      [
        {
          weight: 800,
          text: "The Radiant Performer experiences sexuality primarily as a space for expression, admiration, and feeling vividly desired.",
        },
        {
          text: " For them, desire often comes alive through attention: the look in a partner’s eyes, an enthusiastic reaction, a compliment, or the feeling of being captivating. When they feel seen and wanted, their erotic confidence can rise quickly.",
        },
      ],
      [
        { text: "They are " },
        { weight: 700, text: "expressive, charismatic, and visually oriented lovers" },
        {
          text: " who often enjoy turning sexuality into an experience. Seduction, presentation, playful performance, and strong reactions can all intensify arousal. Sexuality is not only something they feel internally; part of its charge comes from seeing their effect on another person and feeling that their desirability is being reflected back to them.",
        },
      ],
      [
        { text: "At their best, Radiant Performers bring " },
        { weight: 700, text: "confidence, creativity, and magnetic presence" },
        {
          text: " into intimacy. They can make a partner feel swept into something exciting and memorable. Yet the same responsiveness to admiration can become vulnerable when feedback grows quieter. A distracted partner, subtle reactions, or the familiarity of a long-term relationship may feel less like ordinary variation and more like no longer being seen.",
        },
      ],
      [
        {
          text: "Because sexual confidence can become closely tied to the response they receive, ",
        },
        { weight: 700, text: "performing well may sometimes compete with simply feeling." },
        {
          text: " Attention can shift toward appearance, impact, or whether the other person seems impressed, making awkwardness, vulnerability, or quieter pleasure harder to relax into.",
        },
      ],
      [
        { text: "The deeper pattern is not simply a desire for attention. " },
        { weight: 700, text: "Being visibly desired can become evidence of sexual worth." },
        {
          text: " When admiration is abundant, confidence expands; when it disappears, self-doubt can enter quickly.",
        },
      ],
      [
        {
          text: "Growth lies in keeping the Radiant Performer’s expressive spark while learning that sexuality does not always have to be ",
        },
        { weight: 700, text: "something they perform well or use to prove their desirability." },
        {
          text: " The more they can stay connected to their own pleasure even when the reaction is quieter, the less their confidence depends on constant applause, and the more freely their natural expressiveness can come through.",
        },
      ],
    ],
  },
  "Relational Nurturer": {
    paragraphs: [
      [
        {
          weight: 800,
          text: "The Relational Nurturer experiences sexuality primarily as a space for care, emotional closeness, and mutual safety.",
        },
        {
          text: " For them, desire often grows through feeling connected, trusted, and emotionally attuned to a partner. Warmth, vulnerability, affectionate touch, and the sense that both people are genuinely caring for one another can open the door to arousal.",
        },
      ],
      [
        { text: "They tend to be " },
        { weight: 700, text: "gentle, attentive, and deeply responsive lovers" },
        {
          text: " who naturally notice what helps a partner relax, feel valued, and open up. Sexuality can become an extension of that care: a way to soothe, reconnect, repair, and communicate affection through the body. Giving pleasure can be especially rewarding because their partner’s enjoyment and emotional softening reinforce their own sense of connection.",
        },
      ],
      [
        { text: "At their best, Relational Nurturers create intimacy that feels " },
        { weight: 700, text: "safe, generous, emotionally present, and deeply restorative" },
        {
          text: ". Their patience and sensitivity can make partners feel remarkably seen and accepted. Yet the same instinct to care can become a vulnerability when attention consistently flows in one direction. They may focus so strongly on a partner’s feelings or pleasure that their own desire becomes difficult to notice, express, or receive.",
        },
      ],
      [
        { text: "Over time, sexuality can quietly become tied to being needed. " },
        {
          weight: 700,
          text: "If being caring becomes the main way they experience their value in a relationship, receiving can feel more vulnerable than giving.",
        },
        {
          text: " They may overextend themselves, hesitate to voice frustration, or remain in the caretaker role even when it leaves them depleted. Desire can then fade beneath emotional labor rather than disappearing because closeness no longer matters.",
        },
      ],
      [
        { text: "Growth lies in allowing intimacy to become more mutual: " },
        { weight: 700, text: "remaining caring without making care the price of being loved." },
        {
          text: " As giving and receiving become more balanced, the Relational Nurturer can discover a sexuality in which they are not only a source of safety and pleasure, but someone equally free to want, receive, and be cared for.",
        },
      ],
    ],
  },
  "Sensual Connector": {
    paragraphs: [
      [
        {
          weight: 800,
          text: "The Sensual Connector experiences sexuality primarily as a space for closeness, presence, and deep sensory connection.",
        },
        {
          text: " Desire tends to emerge when they feel emotionally safe, cared for, and genuinely connected to the person they are with. Rather than switching on instantly, their arousal often builds through anticipation, affectionate touch, trust, and the feeling that both people are fully present.",
        },
      ],
      [
        { text: "They are " },
        { weight: 700, text: "warm, attentive, and deeply embodied lovers" },
        {
          text: " who value slowness, tenderness, and emotional attunement. Extended touch, kissing, eye contact, shared vulnerability, and simply taking time can matter as much as any particular sexual act. For them, pleasure often becomes richer when physical sensation and emotional connection reinforce one another.",
        },
      ],
      [
        { text: "At their best, Sensual Connectors create intimacy that feels " },
        { weight: 700, text: "safe, immersive, affectionate, and deeply connected" },
        {
          text: ". Their sensitivity to a partner’s emotions and body can make sex feel unusually attentive and mutual. However, the same sensitivity means that conflict, emotional distance, pressure, or distraction can quickly interrupt desire. When connection feels unsettled, their body may struggle to open sexually even when attraction remains.",
        },
      ],
      [
        {
          text: "Because closeness carries so much erotic weight, moments of distance can sometimes feel larger than they are. A partner being withdrawn, less affectionate, or temporarily less available may be experienced not only as distance, but as a sign that the bond itself is weakening. This can lead to overthinking, waiting for reassurance, or suppressing needs to preserve harmony.",
        },
      ],
      [
        {
          weight: 700,
          text: "Growth lies in keeping emotional depth without making connection the sole condition for desire.",
        },
        {
          text: " Developing greater erotic autonomy, expressing needs more directly, and allowing room for play or novelty can make sexuality more flexible without sacrificing the closeness that matters.",
        },
      ],
      [
        {
          text: "When this balance develops, the Sensual Connector’s sexuality becomes a powerful capacity for ",
        },
        { weight: 700, text: "pleasure, trust, tenderness, and deeply felt intimacy" },
        { text: ", where connection supports desire without having to carry its entire weight." },
      ],
    ],
  },
  "Spiritual Lover": {
    paragraphs: [
      [
        {
          weight: 800,
          text: "The Spiritual Lover experiences sexuality primarily as a space for meaning, connection, and transcendence.",
        },
        {
          text: " Desire comes alive when sex feels emotionally significant, deeply present, and connected to something larger than physical pleasure alone. When there is trust, vulnerability, and a sense of genuine union, their erotic system can open slowly but powerfully.",
        },
      ],
      [
        { text: "They are " },
        { weight: 700, text: "reflective, emotionally attuned, and depth-oriented lovers" },
        {
          text: " who are often drawn to slow touch, eye contact, breath, ritual, and sustained presence. Sexuality is meaningful not simply because of what happens physically, but because of what the experience seems to express: ",
        },
        { italic: true, text: "we are truly here with each other." },
        {
          text: " Their desire is therefore especially sensitive to emotional and relational alignment.",
        },
      ],
      [
        { text: "At their best, Spiritual Lovers create intimacy that feels " },
        { weight: 700, text: "tender, immersive, and profoundly connected" },
        {
          text: ". They can bring patience, vulnerability, and unusual presence into sex, allowing an encounter to become more than a sequence of sexual acts. Yet the same sensitivity to meaning can make ordinary, playful, or purely physical sex feel less compelling.",
        },
      ],
      [
        {
          text: "Because depth matters so much, they may begin to expect sex to feel significant before they can fully surrender to it. Routine, unresolved tension, emotional distance, or a partner who approaches sex more casually can weaken desire. They may also idealize complete union, making normal moments of distraction, awkwardness, or difference feel more disappointing than they need to.",
        },
      ],
      [
        { text: "The deeper pattern is a tendency to " },
        {
          weight: 700,
          text: "link meaningful sex with meaningful connection so closely that simple pleasure can become undervalued",
        },
        {
          text: ". Growth lies in expanding rather than abandoning this depth: allowing sexuality to be sacred without always needing to feel profound, and making room for humor, raw physical desire, and everyday pleasure alongside emotional and spiritual connection. When these sides come together, ",
        },
        {
          weight: 700,
          text: "sex can remain deeply meaningful without carrying the burden of having to transcend ordinary life every time.",
        },
      ],
    ],
  },
  "Tender Devotee": {
    paragraphs: [
      [
        {
          weight: 800,
          text: "The Tender Devotee experiences sexuality primarily as a space for reassurance, acceptance, and feeling deeply wanted.",
        },
        {
          text: " Desire tends to open when they feel emotionally safe, appreciated, and certain that they are pleasing their partner. Warm praise, affectionate touch, and clear signs of approval can quiet self-doubt and allow them to relax into intimacy.",
        },
      ],
      [
        { text: "They are often " },
        { weight: 700, text: "gentle, attentive, and deeply responsive lovers" },
        {
          text: " who naturally tune into a partner’s preferences and reactions. Rather than pushing their own agenda, they may find pleasure in giving, adapting, and being guided. Sex can feel especially meaningful when it communicates, ",
        },
        { italic: true, text: "“You are wanted. You are enough. I am happy with you.”" },
      ],
      [
        { text: "At their best, Tender Devotees bring " },
        { weight: 700, text: "care, devotion, sensitivity, and emotional generosity" },
        {
          text: " into intimacy. They notice subtle shifts in a partner and often work hard to create an experience the other person will enjoy. Yet this same sensitivity can become difficult when attention moves away from their own body and toward constant monitoring: ",
        },
        {
          italic: true,
          text: "Am I doing this right? Are they enjoying it? Have I disappointed them?",
        },
      ],
      [
        {
          text: "Because approval carries so much emotional weight, criticism, ambiguity, or withdrawal can quickly affect desire. They may hide preferences, struggle to say no, or agree to experiences they do not genuinely want because rejection feels more threatening than self-silencing. Over time, ",
        },
        {
          weight: 700,
          text: "the wish to feel loved can become entangled with the need to perform loveability",
        },
        {
          text: ", making it harder to distinguish genuine desire from the urge to secure reassurance.",
        },
      ],
      [
        { text: "Growth lies in allowing intimacy to become a place where " },
        { weight: 700, text: "their own desire matters as much as their partner’s response" },
        {
          text: ". As self-worth becomes less dependent on constant approval, tenderness no longer has to be earned through pleasing. The Tender Devotee can remain caring and responsive while becoming more honest about what they want, what they do not want, and what actually feels good to them.",
        },
      ],
    ],
  },
};

/** Archetypes still waiting on a Part II summary. Asserted by a test. */
export function missingReport3Summary(): string[] {
  return KNOWN_ARCHETYPES.filter((name) => !REPORT_V4_SUMMARY[name]);
}

/** Paragraphs a locked reader reads whole: the slimmed frame keeps two (1665:3802). */
export const SUMMARY_FREE_PARAGRAPHS = 2;

/** The Summary as its reader receives it — `buildSummary`. */
export interface Report3SummaryView {
  locked: boolean;
  /** Read in full: every paragraph, or a locked reader's first two. */
  paragraphs: readonly (readonly Report3Run[])[];
  /**
   * A locked reader's third paragraph: its first sentence, read sharp, then the rest, drawn
   * on its own line under the veil and faded out into the gate card, as written or as its
   * decoy (lockedBlurCopy.ts). Null when unlocked, or when there is no third paragraph.
   */
  ramp: { lead: readonly Report3Run[]; veiled: readonly Report3Run[] } | null;
  closer?: string;
}

/**
 * Server-side assembly, as the chapters' `build*` do. Null for an archetype with no
 * summary, which ReportPage falls back to V2's "What this means for you" on. A third
 * paragraph in which no sentence ends fails closed: the locked reader gets the first two
 * and the gate.
 */
export function buildSummary(
  archetype: string,
  { locked = false }: { locked?: boolean } = {}
): Report3SummaryView | null {
  const copy = REPORT_V4_SUMMARY[archetype];
  if (!copy) return null;
  if (!locked) {
    return {
      locked,
      paragraphs: copy.paragraphs,
      ramp: null,
      ...(copy.closer ? { closer: copy.closer } : {}),
    };
  }
  const third = copy.paragraphs.at(SUMMARY_FREE_PARAGRAPHS);
  const split = third ? splitRunsAtFirstSentence(third) : null;
  return {
    locked,
    paragraphs: copy.paragraphs.slice(0, SUMMARY_FREE_PARAGRAPHS),
    ramp: split
      ? {
          lead: split[0],
          veiled: split[1].map((run) => ({ ...run, text: veilText(run.text), veiled: true })),
        }
      : null,
  };
}
