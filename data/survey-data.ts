// Auto-generated from data/survey-source.csv — do not edit manually
// Run: node scripts/update-survey.js

export type AnswerType = "open" | "scale" | "single" | "multiple" | "country";

export interface AnswerOptionExplained {
  option: string;
  explanation: string;
}

export interface SurveyQuestion {
  qId: string;
  cId: number;
  chapter: string;
  question: string;
  answerType: AnswerType;
  options: string[];
  required: boolean;
  guide: string;
  supportAndGuidance: string;
  scaleLabels?: { low: string; high: string };
  inputType?: "email" | "text";
  placeholder?: string;
  comment?: string;
  howAnswerIsUsed?: string;
  answerOptionsExplained?: AnswerOptionExplained[];
  hoverStates?: Record<number, string>;
  formatGuidance?: string;
  maxSelections?: number;
}

export const surveyQuestions: SurveyQuestion[] = [
  {
    qId: "00000",
    cId: 15,
    chapter: "Background & Lifestyle",
    question: "What is your email?",
    answerType: "open",
    options: ["Email address"],
    required: true,
    guide:
      "Use an inbox you actually check. Pick a private one if you don't want this report landing next to work or shared mail.",
    supportAndGuidance:
      "Use an inbox you actually check. Pick a private one if you don't want this report landing next to work or shared mail.",
    inputType: "email",
    placeholder: "your@email.com",
    comment: "Used to deliver your report and any relevant LoveIQ communication.",
    howAnswerIsUsed: "Used to deliver your report and any relevant LoveIQ communication.",
    formatGuidance: "Enter a valid email address.",
  },
  {
    qId: "00001",
    cId: 15,
    chapter: "Background & Lifestyle",
    question: "What is your name?",
    answerType: "open",
    options: ["Free text"],
    required: true,
    guide:
      "Whatever you'd like us to call you in your report — first name, initials, or a nickname is fine.",
    supportAndGuidance:
      "Whatever you'd like us to call you in your report — first name, initials, or a nickname is fine.",
    inputType: "text",
    placeholder: "Type your answer…",
    comment: "Used to personalize your report and communication.",
    howAnswerIsUsed: "Used to personalize your report and communication.",
    formatGuidance: "Enter a name or nickname.",
  },
  {
    qId: "01002",
    cId: 1,
    chapter: "Current Sexual Wellbeing & Pain Points",
    question: "Right now, I feel satisfied with my sex life.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Think about the last 1–2 months overall, not your best or worst day. If you're not having sex right now, rate how you feel about that.",
    supportAndGuidance:
      "Think about the last 1–2 months overall, not your best or worst day. If you're not having sex right now, rate how you feel about that.",
    scaleLabels: { low: "Not true at all", high: "Completely true" },
    comment:
      "Provides baseline context for interpreting your report. This does not directly define your archetype.",
    howAnswerIsUsed:
      "Provides baseline context for interpreting your report. This does not directly define your archetype.",
    hoverStates: {
      "1": "Not true at all: Your current sexual life feels clearly unfulfilling, frustrating, painful, absent, or far from what you want.",
      "2": "Mostly not true: More of your current experience feels lacking than fulfilling, and dissatisfaction is a noticeable part of your reality.",
      "3": "Slightly not true: Some parts may work, but there is enough frustration, inconsistency, or disappointment to pull your overall satisfaction down.",
      "4": "Mixed / depends: Some parts feel okay or satisfying, while others feel lacking, unclear, inconsistent, or only partly fulfilling.",
      "5": "Slightly true: Your sexual life feels more satisfying than not, even if some frustrations, gaps, or unmet needs remain.",
      "6": "Mostly true: Most of your sexual life feels good, aligned, and meaningfully fulfilling, with only limited dissatisfaction.",
      "7": "Completely true: Your current sexual life feels deeply fulfilling, aligned, and broadly good for you overall.",
    },
  },
  {
    qId: "01005",
    cId: 1,
    chapter: "Current Sexual Wellbeing & Pain Points",
    question: "I want more variety — new positions, places, fantasies, or kinds of sex.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      '"Variety" can mean new acts, fantasies, locations, pacing, or roles — anything that breaks the same-old pattern.',
    supportAndGuidance:
      '"Variety" can mean new acts, fantasies, locations, pacing, or roles — anything that breaks the same-old pattern.',
    scaleLabels: { low: "Not true at all", high: "Completely true" },
    comment:
      "Helps estimate whether your erotic style leans more toward novelty-seeking or familiarity and steadiness.",
    howAnswerIsUsed:
      "Helps estimate whether your erotic style leans more toward novelty-seeking or familiarity and steadiness.",
    hoverStates: {
      "1": "Not true at all: Familiarity, steadiness, and known patterns usually feel more satisfying to you than novelty or change.",
      "2": "Mostly not true: You may enjoy occasional variation, but novelty is usually not an important driver of your sexuality.",
      "3": "Slightly not true: Some variety appeals to you at times, though you generally lean more toward familiarity than change.",
      "4": "Mixed / depends: Variety matters in some situations, but it is not a major or consistent driver of your sexuality.",
      "5": "Slightly true: Novelty does matter to you, and some freshness or variation can noticeably improve your sexual experience.",
      "6": "Mostly true: Newness, change, or experimentation are often important parts of what keeps sexuality engaging for you.",
      "7": "Completely true: Novelty, variety, experimentation, or freshness are strong and recurring parts of what keeps sexuality alive for you.",
    },
  },
  {
    qId: "01006",
    cId: 1,
    chapter: "Current Sexual Wellbeing & Pain Points",
    question: "Sex often hurts or feels physically bad for me.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Include any sexual contact, not only penetration. Answer from your usual recent experience, not one bad time.",
    supportAndGuidance:
      "Include any sexual contact, not only penetration. Answer from your usual recent experience, not one bad time.",
    scaleLabels: { low: "Not true at all", high: "Completely true" },
    comment:
      "Used to tailor guidance more safely and realistically around comfort, pacing, and pain sensitivity.",
    howAnswerIsUsed:
      "Used to tailor guidance more safely and realistically around comfort, pacing, and pain sensitivity.",
    hoverStates: {
      "1": "Not true at all: Sex is generally physically comfortable for you, without pain being a meaningful part of the experience.",
      "2": "Mostly not true: Discomfort may happen occasionally, but it is uncommon and not a major pattern for you.",
      "3": "Slightly not true: Discomfort shows up sometimes, but not often enough to define your sexual experience overall.",
      "4": "Mixed / depends: Discomfort or pain shows up in some contexts and matters, but it is not always present.",
      "5": "Slightly true: Discomfort is a noticeable part of your experience in certain situations, even if it is not constant.",
      "6": "Mostly true: Pain or physical discomfort happens fairly often and meaningfully shapes how sex feels for you.",
      "7": "Completely true: Discomfort or pain is a frequent, important, or defining part of your sexual experience.",
    },
  },
  {
    qId: "02001",
    cId: 2,
    chapter: "Spontaneous Desire VS Responsive Desire",
    question: "When you wanted sex recently, what usually happened first?",
    answerType: "single",
    options: [
      "Nothing — I just got horny on my own",
      "Something happened first: touch, flirting, kissing, fantasy, closeness",
      "Sex was planned, with time and privacy set aside",
      "It depends — varies by person or situation",
      "I haven't felt much desire lately",
    ],
    required: true,
    guide:
      "Go with your usual recent pattern, not a one-off. Pick what most often comes before you feel desire.",
    supportAndGuidance:
      "Go with your usual recent pattern, not a one-off. Pick what most often comes before you feel desire.",
    comment:
      "Helps identify your primary desire activation pattern, which is important for archetype scoring and recommendation logic.",
    howAnswerIsUsed:
      "Helps identify your primary desire activation pattern, which is important for archetype scoring and recommendation logic.",
    formatGuidance: "Select one option.",
  },
  {
    qId: "02002",
    cId: 2,
    chapter: "Spontaneous Desire VS Responsive Desire",
    question:
      "My desire only kicks in after touch, kissing, or feeling close — it rarely shows up out of nowhere.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "This is about how desire usually starts for you. Cues can be physical (touch) or emotional (closeness, flirting, fantasy).",
    supportAndGuidance:
      "This is about how desire usually starts for you. Cues can be physical (touch) or emotional (closeness, flirting, fantasy).",
    scaleLabels: { low: "Not true at all", high: "Completely true" },
    comment:
      "A strong indicator of whether desire tends to be responsive rather than internally self-starting.",
    howAnswerIsUsed:
      "A strong indicator of whether desire tends to be responsive rather than internally self-starting.",
    hoverStates: {
      "1": "Not true at all: Desire usually appears on its own, before another person initiates or before affectionate cues are needed.",
      "2": "Mostly not true: Affection or initiation can help sometimes, but desire often begins internally without much prompting.",
      "3": "Slightly not true: Desire can be helped by affection, though it still often appears without needing much activation from another person.",
      "4": "Mixed / depends: Affection or initiation often helps, but desire also begins on its own in other situations.",
      "5": "Slightly true: Desire often comes more easily after affection or initiation, even if it does not always require it.",
      "6": "Mostly true: Desire usually needs affectionate, relational, or erotic cues before it really starts to build.",
      "7": "Completely true: Desire usually needs affectionate, relational, or erotic activation before it comes online.",
    },
  },
  {
    qId: "02003",
    cId: 2,
    chapter: "Spontaneous Desire VS Responsive Desire",
    question: "I enjoy sex more when it's planned ahead than when it just happens.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Answer from what actually feels better in your body, not what sounds more romantic. 'Planned' can mean scheduled or just expected.",
    supportAndGuidance:
      "Answer from what actually feels better in your body, not what sounds more romantic. 'Planned' can mean scheduled or just expected.",
    scaleLabels: { low: "Not true at all", high: "Completely true" },
    comment:
      "Helps determine whether anticipation and structure support desire better than spontaneity.",
    howAnswerIsUsed:
      "Helps determine whether anticipation and structure support desire better than spontaneity.",
    hoverStates: {
      "1": "Not true at all: Spontaneity usually feels better, freer, or more energizing to you than planning.",
      "2": "Mostly not true: Planning may help occasionally, but spontaneous intimacy is still usually more enjoyable for you.",
      "3": "Slightly not true: You can appreciate planning in some contexts, though you still tend to prefer spontaneity overall.",
      "4": "Mixed / depends: Both planning and spontaneity can work, depending on stress, timing, or context.",
      "5": "Slightly true: Planned sex often helps your enjoyment, even if spontaneity can still work sometimes.",
      "6": "Mostly true: Planned sex usually feels easier, safer, or more successful for you than spontaneous intimacy.",
      "7": "Completely true: Planned sex usually feels easier, safer, more enjoyable, or more successful than spontaneous intimacy.",
    },
  },
  {
    qId: "02004",
    cId: 2,
    chapter: "Spontaneous Desire VS Responsive Desire",
    question: "What kind of starting point usually leads to the best sex for you?",
    answerType: "single",
    options: [
      "I'm the one who starts things — I make the first move",
      "The other person starts things — I respond to them",
      "It works best when we plan it ahead and both know it's coming",
      "It happens naturally, with no one having to start",
    ],
    required: true,
    guide:
      '"Starting" means whoever makes the first move, signals interest, or opens the moment. Pick what works most reliably.',
    supportAndGuidance:
      '"Starting" means whoever makes the first move, signals interest, or opens the moment. Pick what works most reliably.',
    comment:
      "Helps distinguish self-starting, partner-led, mutual, and planned initiation patterns.",
    howAnswerIsUsed:
      "Helps distinguish self-starting, partner-led, mutual, and planned initiation patterns.",
    formatGuidance: "Select one option.",
  },
  {
    qId: "03003",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: "Which kinds of settings or vibes most reliably turn you on?",
    answerType: "multiple",
    options: [
      "Private, calm, and feeling safe",
      "New or adventurous situations",
      "Slow, intentional, almost ritual-like",
      "Unplanned, spur-of-the-moment",
      "A bit forbidden, edgy, or rule-breaking",
      "Being seen — or almost being seen — by others",
      "Something else",
    ],
    required: true,
    guide:
      "Focus on what works for you, not what sounds adventurous or 'evolved'. Multiple answers are fine.",
    supportAndGuidance:
      "Focus on what works for you, not what sounds adventurous or 'evolved'. Multiple answers are fine.",
    comment:
      "Helps identify whether privacy, ritual, spontaneity, adventure, or edge is part of your arousal style.",
    howAnswerIsUsed:
      "Helps identify whether privacy, ritual, spontaneity, adventure, or edge is part of your arousal style.",
    formatGuidance: "Select up to three options.",
    maxSelections: 3,
  },
  {
    qId: "03004",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: "I need to feel emotionally close before I want sex.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "This is about whether emotional closeness actually opens your desire — not whether you value connection in general.",
    supportAndGuidance:
      "This is about whether emotional closeness actually opens your desire — not whether you value connection in general.",
    scaleLabels: { low: "Not true at all", high: "Completely true" },
    comment:
      "Helps determine whether emotional closeness is optional, supportive, or close to a prerequisite for desire.",
    howAnswerIsUsed:
      "Helps determine whether emotional closeness is optional, supportive, or close to a prerequisite for desire.",
    hoverStates: {
      "1": "Not true at all: Emotional closeness is not a major requirement for desire to show up for you.",
      "2": "Mostly not true: Connection can help a little, but desire usually does not depend much on emotional closeness.",
      "3": "Slightly not true: Emotional connection matters somewhat, though desire can still emerge without much of it.",
      "4": "Mixed / depends: Connection often helps desire, but it is not always required for you to feel engaged.",
      "5": "Slightly true: Desire usually works better when you feel emotionally connected to the other person.",
      "6": "Mostly true: Emotional closeness strongly supports your ability to access, sustain, or enjoy desire.",
      "7": "Completely true: Without emotional closeness, desire is often hard to access, sustain, or enjoy fully.",
    },
  },
  {
    qId: "03005",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: "What most reliably moves you from 'not really interested' to actually turned on?",
    answerType: "single",
    options: [
      "Physical stuff — touch, rhythm, build-up, body sensation",
      "The right setting — low stress, privacy, time, feeling safe",
      "Emotional closeness — warmth, affection, feeling connected",
      "Something new — surprise, exploration, novelty",
      "Skill and technique — when one of us is really good at it",
      "My imagination — fantasy, what I'm watching, reading, or picturing",
      "It varies — no single thing stands out",
    ],
    required: true,
    guide:
      "Go with what actually flips the switch in real life, not the answer that sounds best on paper.",
    supportAndGuidance:
      "Go with what actually flips the switch in real life, not the answer that sounds best on paper.",
    comment: "One of the clearest direct indicators of your primary arousal pathway.",
    howAnswerIsUsed: "One of the clearest direct indicators of your primary arousal pathway.",
    formatGuidance: "Select one option.",
  },
  {
    qId: "03006",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: "How do you usually figure out what works for you sexually?",
    answerType: "single",
    options: [
      "I want clear guidance, instructions, and feedback",
      "I learn by trying things and seeing what happens",
      "I follow what feels natural in the moment, no overthinking",
      "I'd rather not treat sex as a project to work on",
    ],
    required: true,
    guide:
      "This is how you actually learn about your sexuality — not the method you think sounds best.",
    supportAndGuidance:
      "This is how you actually learn about your sexuality — not the method you think sounds best.",
    comment:
      "Helps distinguish guided, analytical, and intuitive approaches to sexual growth and exploration.",
    howAnswerIsUsed:
      "Helps distinguish guided, analytical, and intuitive approaches to sexual growth and exploration.",
    formatGuidance: "Select one option.",
  },
  {
    qId: "03008",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: "I prefer sex that is intense and high-energy over sex that is soft and slow.",
    answerType: "scale",
    options: [],
    required: true,
    guide: "Pick the energy you usually prefer, not what fits one mood or one experience.",
    supportAndGuidance:
      "Pick the energy you usually prefer, not what fits one mood or one experience.",
    scaleLabels: { low: "Not true at all", high: "Completely true" },
    comment: "Helps position your erotic style on a calm-to-intense spectrum.",
    howAnswerIsUsed: "Helps position your erotic style on a calm-to-intense spectrum.",
    hoverStates: {
      "1": "Not true at all: You strongly prefer sex to feel softer, gentler, calmer, or more grounded than intense.",
      "2": "Mostly not true: You usually lean toward gentle, tender, calm, or slower sexual energy.",
      "3": "Slightly not true: You can enjoy some activation, but generally prefer sex to stay more soft than intense.",
      "4": "Mixed / depends: You enjoy both softness and intensity, depending on context, mood, or dynamic.",
      "5": "Slightly true: You often prefer more charge, edge, or activation, though softness still matters.",
      "6": "Mostly true: You are usually drawn to stronger, faster, or more charged erotic energy.",
      "7": "Completely true: You strongly prefer high-intensity, high-charge, or high-activation erotic energy",
    },
  },
  {
    qId: "03009",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: "Sexual tension, anticipation, and being chased or pursued reliably turn me on.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Think about what creates real erotic pull for you over time, not just a one-off thrill.",
    supportAndGuidance:
      "Think about what creates real erotic pull for you over time, not just a one-off thrill.",
    scaleLabels: { low: "Not true at all", high: "Completely true" },
    comment:
      "Helps identify whether tension, pursuit, and anticipation are meaningful arousal drivers for you.",
    howAnswerIsUsed:
      "Helps identify whether tension, pursuit, and anticipation are meaningful arousal drivers for you.",
    hoverStates: {
      "1": "Not true at all: Chase energy, tension, or pursuit are not important ingredients in your turn-on.",
      "2": "Mostly not true: You may notice some spark from anticipation now and then, but it is usually not central for you.",
      "3": "Slightly not true: Tension or pursuit can add something in certain moments, though they are not major turn-on drivers.",
      "4": "Mixed / depends: Anticipation or pursuit can add spark, but they are not central or consistently important.",
      "5": "Slightly true: Some tension, teasing, or pursuit often helps create erotic charge for you.",
      "6": "Mostly true: Anticipation, longing, teasing, or pursuit are often meaningful parts of what turns you on.",
      "7": "Completely true: Tension, longing, teasing, or the energy of pursuit are strong and recurring parts of what turns you on.",
    },
  },
  {
    qId: "03010",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: "Which kind of sexual atmosphere usually feels best for you?",
    answerType: "single",
    options: [
      "Very safe, calm, and predictable",
      "Mostly safe, with a little novelty",
      "A balance of familiar and new",
      "Adventurous, as long as the limits are clear",
      "Intense or taboo energy — within limits we've both agreed to.",
    ],
    required: true,
    guide:
      "Pick the level of uncertainty, novelty, and edge that feels most alive for you when sex is going well.",
    supportAndGuidance:
      "Pick the level of uncertainty, novelty, and edge that feels most alive for you when sex is going well.",
    comment:
      "Strong signal for whether your style stays mostly safe and private or includes more edge, novelty, or taboo energy.",
    howAnswerIsUsed:
      "Strong signal for whether your style stays mostly safe and private or includes more edge, novelty, or taboo energy.",
    formatGuidance: "Select one option.",
  },
  {
    qId: "03011",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: "Sex feels best to me when it feels meaningful or sacred — not just physical.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "You don't need to be religious. Picture sex that feels emotionally or spiritually significant, vs. sex that's purely about pleasure.",
    supportAndGuidance:
      "You don't need to be religious. Picture sex that feels emotionally or spiritually significant, vs. sex that's purely about pleasure.",
    scaleLabels: { low: "Not true at all", high: "Completely true" },
    comment:
      "Helps identify whether meaning, ritual, and depth are central to sexual fulfillment for you.",
    howAnswerIsUsed:
      "Helps identify whether meaning, ritual, and depth are central to sexual fulfillment for you.",
    hoverStates: {
      "1": "Not true at all: Sexual fulfillment is not strongly tied to ritual, meaning, or sacredness for you.",
      "2": "Mostly not true: Meaning can be nice, but it is usually not a major factor in whether sex feels fulfilling.",
      "3": "Slightly not true: Depth or significance may enrich sex sometimes, though it is not usually central for you.",
      "4": "Mixed / depends: Meaning or ritual can enrich sex in some situations, but they are not always central.",
      "5": "Slightly true: Sex often feels more fulfilling when it carries some emotional, symbolic, or meaningful depth.",
      "6": "Mostly true: Significance, ritual, or a deeper sense of meaning are often important parts of fulfillment for you.",
      "7": "Completely true: Sex feels most fulfilling when it carries significance, ritual, reverence, or a deeper sense of meaning.",
    },
  },
  {
    qId: "03012",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question:
      "Without something a bit forbidden, taboo, or high-intensity, sex can feel flat to me.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "This is checking whether sex generally needs an extra charge — like risk, role-play, power dynamics, dirty talk, or pushing against rules — to feel engaging for you.",
    supportAndGuidance:
      "This is checking whether sex generally needs an extra charge — like risk, role-play, power dynamics, dirty talk, or pushing against rules — to feel engaging for you.",
    scaleLabels: { low: "Not true at all", high: "Completely true" },
    comment:
      "Key indicator of whether edge or taboo is part of your erotic baseline rather than occasional curiosity.",
    howAnswerIsUsed:
      "Key indicator of whether edge or taboo is part of your erotic baseline rather than occasional curiosity.",
    hoverStates: {
      "1": "Not true at all: Gentle, straightforward, or emotionally connected sex can feel fully alive for you without strong edge or taboo.",
      "2": "Mostly not true: Some intensity may be enjoyable at times, but it is usually not needed for sex to feel engaging.",
      "3": "Slightly not true: Edge can add spark sometimes, though sex does not generally depend on it to feel alive.",
      "4": "Mixed / depends: Edge, taboo, or intensity can add excitement, but they are not required in every context.",
      "5": "Slightly true: Some edge or erotic intensity often helps sex feel more alive, even if it is not always necessary.",
      "6": "Mostly true: Without enough charge, edge, or intensity, sex often feels less engaging or less alive for you.",
      "7": "Completely true: Without some intensity, taboo flavor, or erotic charge, sex often feels less alive or less engaging for you.",
    },
  },
  {
    qId: "03013",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: "Which turns you on most?",
    answerType: "single",
    options: [
      "Being watched, desired, or admired",
      "Watching the other person — their body, reactions, pleasure",
      "Getting fully absorbed in the feeling, with no focus on watching either way",
      "Not sure",
    ],
    required: true,
    guide: "Answer from fantasy or real life — pick the one with the strongest pull for you.",
    supportAndGuidance:
      "Answer from fantasy or real life — pick the one with the strongest pull for you.",
    comment: "Helps distinguish being seen, watching, and inward/relational arousal patterns.",
    howAnswerIsUsed:
      "Helps distinguish being seen, watching, and inward/relational arousal patterns.",
    formatGuidance: "Select one option.",
  },
  {
    qId: "03014",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: "During sex, I can usually reach orgasm when I want to.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Think about typical partnered sex in recent months, in decent conditions. This is about pattern, not pressure.",
    supportAndGuidance:
      "Think about typical partnered sex in recent months, in decent conditions. This is about pattern, not pressure.",
    scaleLabels: { low: "Not true at all", high: "Completely true" },
    comment:
      "Used to tailor pacing, expectations, and guidance around orgasm and partnered pleasure. It does not directly define your archetype.",
    howAnswerIsUsed:
      "Used to tailor pacing, expectations, and guidance around orgasm and partnered pleasure. It does not directly define your archetype.",
    hoverStates: {
      "1": "Not true at all: Orgasm with a partner is very uncommon for you, even when you want it and conditions are reasonably supportive.",
      "2": "Mostly not true: Orgasm with a partner is possible, but only in rare or unusually favorable situations.",
      "3": "Slightly not true: Orgasm with a partner happens from time to time, but it is not something you can generally count on.",
      "4": "Mixed / depends: Orgasm with a partner happens with some consistency, though it still feels variable and not fully dependable.",
      "5": "Slightly true: Orgasm with a partner is available to you fairly often and feels like a recurring part of partnered sex.",
      "6": "Mostly true: Orgasm with a partner happens in most supportive situations when you want it.",
      "7": "Completely true: Orgasm with a partner is highly accessible and reliably available to you when you want it.",
    },
  },
  {
    qId: "08002",
    cId: 8,
    chapter: "Attachment Style & Emotional Safety",
    question: "I generally feel secure in my close relationships.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Answer from your usual relational baseline, not one rough week. If your current relationship reflects a real shift, let it count.",
    supportAndGuidance:
      "Answer from your usual relational baseline, not one rough week. If your current relationship reflects a real shift, let it count.",
    scaleLabels: { low: "Not true at all", high: "Completely true" },
    comment:
      "Gives baseline context for how safe and settled you tend to feel in closeness and attachment.",
    howAnswerIsUsed:
      "Gives baseline context for how safe and settled you tend to feel in closeness and attachment.",
    hoverStates: {
      "1": "Not true at all: Relationships often feel unstable, threatening, or hard to trust for you.",
      "2": "Mostly not true: Security is often hard to sustain, and worry, distrust, or withdrawal tend to show up more than steadiness.",
      "3": "Slightly not true: Some parts of you can feel secure, but insecurity still outweighs steadiness overall.",
      "4": "Mixed / depends: Some parts of you feel secure, but worry, withdrawal, or instability still show up in meaningful ways.",
      "5": "Slightly true: You often can feel secure, even though certain triggers or patterns still shake that steadiness.",
      "6": "Mostly true: You usually feel relatively safe, trusting, and steady in relationships, even if not perfectly all the time.",
      "7": "Completely true: You generally feel worthy of love, able to trust closeness, and able to stay relatively steady through distance or conflict.",
    },
  },
  {
    qId: "08003",
    cId: 8,
    chapter: "Attachment Style & Emotional Safety",
    question: "When someone you feel close to pulls away or goes cold, you usually…",
    answerType: "single",
    options: [
      "Move toward them, looking for reassurance or contact",
      "Pull back, go quiet, or create distance yourself",
      "Get frustrated, irritated, or push back at them",
      "Stay calm and handle it on your own",
      "It depends on the person or situation",
    ],
    required: true,
    guide:
      "Picture a moment when someone close gets less warm or responsive than you'd like. Go with your most common first reaction.",
    supportAndGuidance:
      "Picture a moment when someone close gets less warm or responsive than you'd like. Go with your most common first reaction.",
    comment:
      "Helps identify pursuit, withdrawal, protest, or self-regulation patterns that shape intimacy dynamics.",
    howAnswerIsUsed:
      "Helps identify pursuit, withdrawal, protest, or self-regulation patterns that shape intimacy dynamics.",
    formatGuidance: "Select one option.",
  },
  {
    qId: "08004",
    cId: 8,
    chapter: "Attachment Style & Emotional Safety",
    question: "I usually want more closeness and togetherness than space and independence.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "If your current relationship reflects a lasting shift in how you handle closeness vs. space, let that matter.",
    supportAndGuidance:
      "If your current relationship reflects a lasting shift in how you handle closeness vs. space, let that matter.",
    scaleLabels: { low: "Not true at all", high: "Completely true" },
    comment:
      "Places you on a closeness-versus-distance pattern that shapes intimacy recommendations.",
    howAnswerIsUsed:
      "Places you on a closeness-versus-distance pattern that shapes intimacy recommendations.",
    hoverStates: {
      "1": "Not true at all: You typically value autonomy and space; togetherness can feel constraining or overwhelming.",
      "2": "Mostly not true: You generally prefer independence; closeness matters less to you than freedom.",
      "3": "Slightly not true: You appreciate some closeness, but independence and personal space feel more important.",
      "4": "Mixed / depends: You value closeness and independence equally, or your preference shifts depending on the person or life stage.",
      "5": "Slightly true: You usually prefer more togetherness than space, though independence still matters to you.",
      "6": "Mostly true: You strongly prefer closeness and togetherness; you feel less satisfied without frequent connection.",
      "7": "Completely true: You strongly prefer closeness and togetherness; independence feels much less important than connection.",
    },
  },
  {
    qId: "08005",
    cId: 8,
    chapter: "Attachment Style & Emotional Safety",
    question: "After a real make-up talk where we both opened up, I often want them sexually.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Think about a real reconnection moment after tension — not a quick patch-up. What usually happens to your desire after?",
    supportAndGuidance:
      "Think about a real reconnection moment after tension — not a quick patch-up. What usually happens to your desire after?",
    scaleLabels: { low: "Not true at all", high: "Completely true" },
    comment: "Strong clue for whether emotional reconnection reliably reopens desire for you.",
    howAnswerIsUsed:
      "Strong clue for whether emotional reconnection reliably reopens desire for you.",
    hoverStates: {
      "1": "Not true at all: Even after repair, desire usually does not increase much for you.",
      "2": "Mostly not true: Emotional repair may help a little at times, but it usually does not shift desire very much.",
      "3": "Slightly not true: Repair can help in some moments, though it does not reliably bring desire back for you.",
      "4": "Mixed / depends: Emotional repair helps in some situations, but not consistently.",
      "5": "Slightly true: A good repair conversation often helps desire return at least somewhat.",
      "6": "Mostly true: When repair happens well, desire usually increases or becomes more accessible for you.",
      "7": "Completely true: When emotional repair happens well, desire often returns or rises noticeably.",
    },
  },
  {
    qId: "08006",
    cId: 8,
    chapter: "Attachment Style & Emotional Safety",
    question:
      "When I feel pressure during sex — to perform, to talk, or to take it further — I tend to shut down or want to pull away.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Pressure can be obvious or subtle. Go with what reliably happens in your body when you feel pushed, rushed, or watched.",
    supportAndGuidance:
      "Pressure can be obvious or subtle. Go with what reliably happens in your body when you feel pushed, rushed, or watched.",
    scaleLabels: { low: "Not true at all", high: "Completely true" },
    comment:
      "High-weight indicator of pressure sensitivity, which strongly affects pacing, safety, and the kinds of recommendations that are likely to be useful.",
    howAnswerIsUsed:
      "High-weight indicator of pressure sensitivity, which strongly affects pacing, safety, and the kinds of recommendations that are likely to be useful.",
    hoverStates: {
      "1": "Not true at all: Pressure does not usually make you shut down, withdraw, or lose openness.",
      "2": "Mostly not true: Some pressure may be unpleasant, but it usually does not cause a strong shutdown response.",
      "3": "Slightly not true: Pressure affects you at times, though it does not usually lead to major withdrawal.",
      "4": "Mixed / depends: Some forms of pressure affect you, but not always strongly or consistently.",
      "5": "Slightly true: Pressure often reduces your openness and can start to make you pull back.",
      "6": "Mostly true: Pressure fairly often makes your body or mind close down, withdraw, or lose desire.",
      "7": "Completely true: Pressure reliably makes your body or mind close down, pull back, or lose openness.",
    },
  },
  {
    qId: "08012",
    cId: 8,
    chapter: "Attachment Style & Emotional Safety",
    question: "I lose interest in sex when the other person leans on me too much emotionally.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Answer from what actually happens when their need starts feeling like weight or pressure — not what you think should happen.",
    supportAndGuidance:
      "Answer from what actually happens when their need starts feeling like weight or pressure — not what you think should happen.",
    scaleLabels: { low: "Not true at all", high: "Completely true" },
    comment:
      "We use this to tell whether too much emotional dependence or neediness tends to cool desire for you.",
    howAnswerIsUsed:
      "We use this to tell whether too much emotional dependence or neediness tends to cool desire for you.",
    hoverStates: {
      "1": "Not true at all: A partnerâs increased emotional dependence does not usually reduce your attraction or desire.",
      "2": "Mostly not true: Emotional dependence may feel challenging sometimes, but it does not usually cool your erotic interest.",
      "3": "Slightly not true: Too much dependence can affect attraction occasionally, though it is not a strong pattern for you.",
      "4": "Mixed / depends: In some situations, too much dependence can cool desire, but not consistently.",
      "5": "Slightly true: When a partner becomes more emotionally dependent, your attraction can start to drop in noticeable ways.",
      "6": "Mostly true: Emotional overdependence fairly often reduces your erotic interest or sense of attraction.",
      "7": "Completely true: When a partner becomes too emotionally dependent, your attraction or erotic interest often drops noticeably.",
    },
  },
  {
    qId: "09013",
    cId: 9,
    chapter: "Relational Patterns & Boundaries",
    question:
      "I sometimes use flirting or sex to calm tension, get reassurance, or avoid asking for what I need directly.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Think about patterns under stress in close relationships. If this has become a stable way you handle tension, count it.",
    supportAndGuidance:
      "Think about patterns under stress in close relationships. If this has become a stable way you handle tension, count it.",
    scaleLabels: { low: "Not true at all", high: "Completely true" },
    comment:
      "We use this carefully to tell apart ordinary flirtation from a more strategic or influence-based dynamic, so we do not over-read it.",
    howAnswerIsUsed:
      "We use this carefully to tell apart ordinary flirtation from a more strategic or influence-based dynamic, so we do not over-read it.",
    hoverStates: {
      "1": "Not true at all: Flirtation or sex is rarely used by you to influence the relationship dynamic or get needs met indirectly.",
      "2": "Mostly not true: This may happen once in a while, but it is not usually part of how you navigate the relationship.",
      "3": "Slightly not true: Under stress or in certain situations, you might do this a little, though it is not a strong pattern.",
      "4": "Mixed / depends: This may happen in certain situations, especially under stress, but it is not a dominant pattern.",
      "5": "Slightly true: You sometimes use flirtation or sexuality to shape the dynamic, gain reassurance, or get needs met.",
      "6": "Mostly true: Using flirtation or sexuality to influence the dynamic or secure something relational is a fairly common pattern for you.",
      "7": "Completely true: Using flirtation or sexuality to shape the dynamic, secure closeness, or steer the relationship is a recurring pattern for you.",
    },
  },
  {
    qId: "10002",
    cId: 10,
    chapter: "Communication Style",
    question: "During sex, how do you most naturally show or say what you want?",
    answerType: "multiple",
    options: [
      "Through touch — guiding hands, moving their body, using my own body",
      'With short, direct words ("more", "harder", "slower", "yes")',
      "Talking and giving feedback throughout",
      "Checking in emotionally — asking how they feel, sharing how I feel",
      "Mostly through sounds, looks, and body language",
      "I don't communicate much during sex",
    ],
    required: true,
    guide:
      "You may have more than one. Focus on what happens most easily when you're relaxed and into it.",
    supportAndGuidance:
      "You may have more than one. Focus on what happens most easily when you're relaxed and into it.",
    comment:
      "This tells us whether your communication style is more quiet, embodied, concise, expressive, or emotionally transparent.",
    howAnswerIsUsed:
      "This tells us whether your communication style is more quiet, embodied, concise, expressive, or emotionally transparent.",
    formatGuidance: "Select up to three options.",
    maxSelections: 3,
  },
  {
    qId: "10003",
    cId: 10,
    chapter: "Communication Style",
    question: "I'm comfortable expressing what turns me on.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Think about real situations with another person — not private thoughts. How easily can you actually say it out loud?",
    supportAndGuidance:
      "Think about real situations with another person — not private thoughts. How easily can you actually say it out loud?",
    scaleLabels: { low: "Not true at all", high: "Completely true" },
    comment:
      "This shows how easily you can name and voice what turns you on, which changes the communication style we recommend.",
    howAnswerIsUsed:
      "This shows how easily you can name and voice what turns you on, which changes the communication style we recommend.",
    hoverStates: {
      "1": "Not true at all: Expressing what turns you on feels difficult, vulnerable, or highly inhibited.",
      "2": "Mostly not true: You can sometimes sense what you want, but saying it out loud often feels awkward, exposed, or hard.",
      "3": "Slightly not true: You can express some desires, though it still takes effort and often comes with hesitation.",
      "4": "Mixed / depends: You can express some desires in certain situations, but not always with ease or consistency.",
      "5": "Slightly true: You can often communicate what turns you on, even if some inhibition or self-consciousness remains.",
      "6": "Mostly true: You are usually able to name, signal, or communicate what turns you on with relatively little hesitation.",
      "7": "Completely true: You can usually name, signal, or communicate what turns you on with relative ease and low shame.",
    },
  },
  {
    qId: "10004",
    cId: 10,
    chapter: "Communication Style",
    question:
      "I'm comfortable saying what I don't want — slowing things down, stopping, or naming a limit.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Think about in-the-moment situations. How easily can you slow, stop, redirect, or say no when something feels off?",
    supportAndGuidance:
      "Think about in-the-moment situations. How easily can you slow, stop, redirect, or say no when something feels off?",
    scaleLabels: { low: "Not true at all", high: "Completely true" },
    comment:
      "This shows how easily you can protect your boundaries in sexual moments, which helps us avoid advice that assumes over-accommodating is fine.",
    howAnswerIsUsed:
      "This shows how easily you can protect your boundaries in sexual moments, which helps us avoid advice that assumes over-accommodating is fine.",
    hoverStates: {
      "1": "Not comfortable at all: Expressing limits or saying no feels very difficult, especially in the moment.",
      "2": "Mostly not true: You may know your limits internally, but voicing them clearly often feels hard, risky, or guilt-provoking.",
      "3": "Slightly not true: You can sometimes name boundaries, though it still takes effort or comes with noticeable hesitation.",
      "4": "Mixed / depends: You can express limits in some situations, but not always clearly, easily, or consistently.",
      "5": "Slightly true: You can often communicate what you do not want, even if some discomfort or self-consciousness remains.",
      "6": "Mostly true: You are usually able to name limits and protect your boundaries with relatively little hesitation.",
      "7": "Completely true: You can usually express what you do not want clearly and protect your boundaries without major shutdown or guilt.",
    },
  },
  {
    qId: "10005",
    cId: 10,
    chapter: "Communication Style",
    question: "If the other person is quiet or hard to read during sex, I lose arousal.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Does low feedback from them make you lose momentum, confidence, or interest in continuing?",
    supportAndGuidance:
      "Does low feedback from them make you lose momentum, confidence, or interest in continuing?",
    scaleLabels: { low: "Not true at all", high: "Completely true" },
    comment:
      "This is one of the strongest clues for whether your arousal depends on visible feedback, enthusiasm, and feeling responded to.",
    howAnswerIsUsed:
      "This is one of the strongest clues for whether your arousal depends on visible feedback, enthusiasm, and feeling responded to.",
    hoverStates: {
      "1": "Not true at all: Your arousal does not depend much on visible feedback or expressiveness from the other person.",
      "2": "Mostly not true: A quiet or neutral counterpart may register a little, but it usually does not lower your arousal much.",
      "3": "Slightly not true: Feedback matters somewhat, though you can usually stay engaged even if the other person is hard to read.",
      "4": "Mixed / depends: A quiet or neutral counterpart can affect your arousal in some situations, but not always strongly.",
      "5": "Slightly true: Whenthe other person is hard to read, your arousal often drops at least somewhat.",
      "6": "Mostly true: Visible feedback is usually important for your arousal, and neutrality often reduces your engagement.",
      "7": "Completely true: When the other person is hard to read, your arousal often drops noticeably.",
    },
  },
  {
    qId: "11001",
    cId: 11,
    chapter: "Partner-Related Needs",
    question: "Which power dynamic most naturally turns you on?",
    answerType: "single",
    options: [
      "Being the one in charge — leading, directing, setting the pace",
      "Letting the other person take charge — following, surrendering, being led",
      "Switching — sometimes leading, sometimes letting go",
      "Equal — we meet in the middle, no one's in charge",
      "Not sure / depends on the situation",
    ],
    required: true,
    guide: "Pick what feels most alive in your body, not what sounds 'right' to want.",
    supportAndGuidance: "Pick what feels most alive in your body, not what sounds 'right' to want.",
    comment:
      "This gives us a direct clue about whether your energy tends toward leading, surrendering, switching, or staying mostly role-light.",
    howAnswerIsUsed:
      "This gives us a direct clue about whether your energy tends toward leading, surrendering, switching, or staying mostly role-light.",
    formatGuidance: "Select one option.",
  },
  {
    qId: "11002",
    cId: 11,
    chapter: "Partner-Related Needs",
    question: "I enjoy clear roles, agreements, or rules during sex.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Do clear expectations, defined roles, or agreed rules tend to make sex feel easier, safer, or hotter for you?",
    supportAndGuidance:
      "Do clear expectations, defined roles, or agreed rules tend to make sex feel easier, safer, or hotter for you?",
    scaleLabels: { low: "Not true at all", high: "Completely true" },
    comment:
      "We use this to tell whether rules, roles, and explicit agreements make sex feel freer for you rather than restrictive.",
    howAnswerIsUsed:
      "We use this to tell whether rules, roles, and explicit agreements make sex feel freer for you rather than restrictive.",
    hoverStates: {
      "1": "Not true at all: Structure, protocols, or explicit rules usually feel unnecessary or restrictive for you.",
      "2": "Mostly not true: Some clarity may help occasionally, but formal structure is usually not part of what makes sex work for you.",
      "3": "Slightly not true: You can appreciate a little structure in some contexts, though you generally do not rely on it much.",
      "4": "Mixed / depends: Some degree of structure can help, depending on context, mood, or partner dynamic.",
      "5": "Slightly true: Clear roles, agreements, or structure often improve the experience, even if you do not always need them.",
      "6": "Mostly true: Clear rules, roles, or agreed structure usually make sex feel easier, safer, or more erotically alive for you.",
      "7": "Completely true: Clear rules, roles, or agreed structure often make sex feel more open, safe, or erotically alive for you.",
    },
  },
  {
    qId: "11003",
    cId: 11,
    chapter: "Partner-Related Needs",
    question: "During sex, I focus more on the other person's pleasure than on my own.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Think about where your attention actually lands during sex — not where you think it ought to go.",
    supportAndGuidance:
      "Think about where your attention actually lands during sex — not where you think it ought to go.",
    scaleLabels: { low: "Not true at all", high: "Completely true" },
    comment:
      "This helps us distinguish giving-focused, balanced, and receiving-or-guided dynamics in the way you naturally relate during sex.",
    howAnswerIsUsed:
      "This helps us distinguish giving-focused, balanced, and receiving-or-guided dynamics in the way you naturally relate during sex.",
    hoverStates: {
      "1": "Not true at all: My attention is usually much more on my own experience than the other personâs.",
      "2": "Mostly not true: My attention tends to stay more on my own experience than the other personâs.",
      "3": "Slightly not true: My attention is somewhat more on my own experience than the other personâs.",
      "4": "Mixed / depends: My attention feels fairly balanced, or it depends on the context or who I'm with.",
      "5": "Slightly true: My attention tends to go somewhat more toward the other personâs experience than toward my own.",
      "6": "Mostly true: My attention usually goes more toward the other personâs experience than toward my own.",
      "7": "Completely true: My attention strongly and naturally goes more toward the other personâs experience than toward my own.",
    },
  },
  {
    qId: "11004",
    cId: 11,
    chapter: "Partner-Related Needs",
    question: "Taking care of someone — being attentive, soothing, healing — turns me on.",
    answerType: "scale",
    options: [],
    required: true,
    guide: "Rate how much giving care fuels your desire.",
    supportAndGuidance: "Rate how much giving care fuels your desire.",
    scaleLabels: { low: "Not true at all", high: "Completely true" },
    comment:
      "This is a very strong clue for whether caregiving and emotional soothing are part of what makes sex feel connecting for you.",
    howAnswerIsUsed:
      "This is a very strong clue for whether caregiving and emotional soothing are part of what makes sex feel connecting for you.",
    hoverStates: {
      "1": "Not true at all: This does not deepen connection and may pull you out of desire.",
      "2": "Mostly not true: You care, but soothing them usually does not increase sexual connection.",
      "3": "Slightly not true: It may help occasionally, but it is not usually connecting for you.",
      "4": "Mixed / depends: It depends on who I'm with, situation, intensity, or timing.",
      "5": "Slightly true: It can add some warmth or closeness, but is not central.",
      "6": "Mostly true: Reassuring or grounding them often deepens your sexual connection.",
      "7": "Completely true: Helping them feel emotionally safe strongly increases intimacy and connection.",
    },
  },
  {
    qId: "14020",
    cId: 14,
    chapter: "Identity & Conditioning",
    question: "What most reliably makes you actually want sex?",
    answerType: "multiple",
    options: [
      "Feeling emotionally close to the other person",
      "Fun and play — pleasure for its own sake",
      "Trying something new or unfamiliar",
      "Strong charge, tension, or edge",
      "Feeling wanted, desired, or chosen",
      "A clear lead/follow dynamic between us",
      "Meaning, depth, or devotion",
      "Pleasing or taking care of the other person",
      "Comfort, soothing, or stress relief",
    ],
    required: true,
    guide:
      "Several may fit. Pick the ones that actually bring your desire online, not every reason sex can matter.",
    supportAndGuidance:
      "Several may fit. Pick the ones that actually bring your desire online, not every reason sex can matter.",
    comment:
      "This is one of the most important direct questions in the assessment because it tells us what actually pulls desire online for you: bonding, play, novelty, power, meaning, repair, comfort, intensity, escape, or service.",
    howAnswerIsUsed:
      "This is one of the most important direct questions in the assessment because it tells us what actually pulls desire online for you: bonding, play, novelty, power, meaning, repair, comfort, intensity, escape, or service.",
    formatGuidance: "Select up to three options.",
    maxSelections: 3,
  },
  {
    qId: "14021",
    cId: 14,
    chapter: "Identity & Conditioning",
    question: "I sometimes go for intense sex to snap out of feeling stressed, flat, or shut down.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "If intensity has become a regular way you move through stress, numbness, or feeling cut off, let that count here.",
    supportAndGuidance:
      "If intensity has become a regular way you move through stress, numbness, or feeling cut off, let that count here.",
    scaleLabels: { low: "Not true at all", high: "Completely true" },
    comment:
      "This does not define who you are sexually. We use it to notice when sex may be functioning more as stress relief or escape, so the recommendations stay supportive.",
    howAnswerIsUsed:
      "This does not define who you are sexually. We use it to notice when sex may be functioning more as stress relief or escape, so the recommendations stay supportive.",
    hoverStates: {
      "1": "Not true at all: Intense sex is not usually something you seek to regulate stress, numbness, or disconnection.",
      "2": "Mostly not true: Intensity may appeal for other reasons sometimes, but it is usually not about escaping numbness or stress.",
      "3": "Slightly not true: Under certain conditions intensity might serve that function a little, though it is not a strong pattern.",
      "4": "Mixed / depends: Under certain conditions, intensity can serve that role for you, but it is not a major pattern.",
      "5": "Slightly true: When stressed, numb, or disconnected, you sometimes seek stronger sexual intensity to shift your state.",
      "6": "Mostly true: Intense sex fairly often functions as a way to feel more alive or move out of stress, numbness, or disconnection.",
      "7": "Completely true: When stressed, numb, or disconnected, you often seek stronger sexual intensity to shift your state or feel more alive.",
    },
  },
  {
    qId: "15001",
    cId: 15,
    chapter: "Background & Lifestyle",
    question: "Which country do you live in?",
    answerType: "country",
    options: [],
    required: true,
    guide: "",
    supportAndGuidance: "",
    comment:
      "We use this to keep examples, language, and recommendations appropriate to your general cultural context.",
    howAnswerIsUsed:
      "We use this to keep examples, language, and recommendations appropriate to your general cultural context.",
    formatGuidance: "Use your main place of residence.",
  },
  {
    qId: "15002",
    cId: 15,
    chapter: "Background & Lifestyle",
    question: "Which ZIP / postal code do you live in?",
    answerType: "open",
    options: ["ZIP / postal code"],
    required: true,
    guide: "",
    supportAndGuidance: "",
    inputType: "text",
    placeholder: "Type your answer…",
    comment:
      "We use this only for general regional context when tailoring recommendations and examples.",
    howAnswerIsUsed:
      "We use this only for general regional context when tailoring recommendations and examples.",
    formatGuidance: "Enter your current postal code for your main residence.",
  },
  {
    qId: "15003",
    cId: 15,
    chapter: "Background & Lifestyle",
    question: "Which age range are you in?",
    answerType: "single",
    options: ["18–24", "25–34", "35–44", "45–54", "55–64", "65+"],
    required: true,
    guide: "",
    supportAndGuidance: "",
    comment:
      "This helps us adapt examples and recommendations to life-stage context without stereotyping.",
    howAnswerIsUsed:
      "This helps us adapt examples and recommendations to life-stage context without stereotyping.",
    formatGuidance: "Go with the band you fall into today.",
  },
  {
    qId: "15004",
    cId: 15,
    chapter: "Background & Lifestyle",
    question: "What kind of relationship setup are you in right now?",
    answerType: "single",
    options: [
      "Single",
      "In one exclusive relationship (only each other)",
      "Mostly exclusive, with some agreed exceptions",
      "Non-exclusive, with agreed limits — known as 'open'",
      "Multiple committed relationships, with everyone's knowledge — known as 'polyamorous'",
      "Multiple connections, prioritizing my own independence (no shared household)",
      "Still figuring it out / doesn't fit a label",
    ],
    required: true,
    guide: "Doesn't have to fit perfectly — pick what's closest to your real situation right now.",
    supportAndGuidance:
      "Doesn't have to fit perfectly — pick what's closest to your real situation right now.",
    comment:
      "This changes which scripts and advice make sense for you—single, monogamous, open, poly, or another structure.",
    howAnswerIsUsed:
      "This changes which scripts and advice make sense for you—single, monogamous, open, poly, or another structure.",
    formatGuidance: "Select one option.",
  },
  {
    qId: "15005",
    cId: 15,
    chapter: "Background & Lifestyle",
    question: "Do you have children?",
    answerType: "single",
    options: [
      "No",
      "Yes, youngest is 0–3",
      "Yes, youngest is 4–10",
      "Yes, youngest is 11–17",
      "Yes, children are 18+ and live with me",
      "Yes, children are 18+ and do not live with me",
      "Prefer not to answer",
    ],
    required: true,
    guide:
      "If your kids are different ages, answer based on the youngest. Helps us estimate your time, energy, and privacy load.",
    supportAndGuidance:
      "If your kids are different ages, answer based on the youngest. Helps us estimate your time, energy, and privacy load.",
    comment:
      "This helps us factor in time, fatigue, and caregiving load so suggestions feel realistic in daily life.",
    howAnswerIsUsed:
      "This helps us factor in time, fatigue, and caregiving load so suggestions feel realistic in daily life.",
    formatGuidance: "Select one option.",
  },
  {
    qId: "15006",
    cId: 15,
    chapter: "Background & Lifestyle",
    question: "How high is your overall stress level most of the time?",
    answerType: "single",
    options: ["Very low", "Low", "Medium", "High", "Very high"],
    required: true,
    guide:
      "Think about your usual baseline, not just this week. Stress affects desire, patience, and arousal more than people realize.",
    supportAndGuidance:
      "Think about your usual baseline, not just this week. Stress affects desire, patience, and arousal more than people realize.",
    comment:
      "We use this to avoid recommending high-effort or novelty-heavy steps when your bandwidth is already low.",
    howAnswerIsUsed:
      "We use this to avoid recommending high-effort or novelty-heavy steps when your bandwidth is already low.",
    formatGuidance: "Select one option.",
  },
  {
    qId: "15007",
    cId: 15,
    chapter: "Background & Lifestyle",
    question: "How rested do you usually feel when you wake up?",
    answerType: "single",
    options: ["Very rested", "Rather rested", "In between", "Rather tired", "Very tired"],
    required: true,
    guide:
      "Answer for how you usually feel right when you wake — before coffee, news, or routine kicks in.",
    supportAndGuidance:
      "Answer for how you usually feel right when you wake — before coffee, news, or routine kicks in.",
    comment: "This helps us judge whether low energy, not low desire, may be part of the picture.",
    howAnswerIsUsed:
      "This helps us judge whether low energy, not low desire, may be part of the picture.",
    formatGuidance: "Select one option.",
  },
  {
    qId: "15008",
    cId: 15,
    chapter: "Background & Lifestyle",
    question:
      "Do you live with any long-term physical or mental health conditions that affect your energy, mood, or everyday functioning?",
    answerType: "single",
    options: [
      "No",
      "Yes, mainly physical health",
      "Yes, mainly mental health",
      "Yes, both physical and mental health",
      "I'm not sure",
      "Prefer not to answer",
    ],
    required: true,
    guide:
      "Ongoing conditions that meaningfully affect your daily life, not short rough patches. No diagnosis details needed.",
    supportAndGuidance:
      "Ongoing conditions that meaningfully affect your daily life, not short rough patches. No diagnosis details needed.",
    comment:
      "We use this to pace the report more gently when health, energy, or mood are affecting sexuality.",
    howAnswerIsUsed:
      "We use this to pace the report more gently when health, energy, or mood are affecting sexuality.",
    formatGuidance: "Select one option.",
  },
  {
    qId: "15009",
    cId: 15,
    chapter: "Background & Lifestyle",
    question:
      "Are you currently taking any medication or hormones that you think might affect your energy, mood, or sex drive?",
    answerType: "single",
    options: [
      "No",
      "Yes, lowers my drive",
      "Yes, increases my drive",
      "Yes, not sure how it affects me",
      "Prefer not to answer",
    ],
    required: true,
    guide:
      "Examples: antidepressants, hormonal birth control, testosterone. Answer from what you notice — not what's 'supposed' to happen.",
    supportAndGuidance:
      "Examples: antidepressants, hormonal birth control, testosterone. Answer from what you notice — not what's 'supposed' to happen.",
    comment:
      "This helps us separate your personal pattern from possible medication or hormone effects and make the advice more realistic.",
    howAnswerIsUsed:
      "This helps us separate your personal pattern from possible medication or hormone effects and make the advice more realistic.",
    formatGuidance: "Select one option.",
  },
  {
    qId: "15010",
    cId: 15,
    chapter: "Background & Lifestyle",
    question: "What is your gender identity?",
    answerType: "single",
    options: ["Woman", "Man", "Nonbinary", "Other", "I'd rather not label this"],
    required: true,
    guide: "Pick the option that fits best — you can also choose not to label.",
    supportAndGuidance: "Pick the option that fits best — you can also choose not to label.",
    comment: "We use this to make the language and examples in your report fit you better.",
    howAnswerIsUsed: "We use this to make the language and examples in your report fit you better.",
    formatGuidance: "Select one option.",
  },
  {
    qId: "15011",
    cId: 15,
    chapter: "Background & Lifestyle",
    question: "What is your sexual orientation?",
    answerType: "single",
    options: [
      "Heterosexual",
      "Homosexual",
      "Bisexual",
      "Pansexual",
      "Queer",
      "Questioning / exploring",
      "Other",
      "I don't use a label",
    ],
    required: true,
    guide: "Pick the option that fits best — you can also choose not to label.",
    supportAndGuidance: "Pick the option that fits best — you can also choose not to label.",
    comment:
      "We use this to avoid assumptions and make the language and examples more relevant to your context.",
    howAnswerIsUsed:
      "We use this to avoid assumptions and make the language and examples more relevant to your context.",
    formatGuidance: "Select one option.",
  },
  {
    qId: "16001",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question: "Which changes would actually improve your sex life over the next 3 months?",
    answerType: "multiple",
    options: [
      "Wanting sex more often — more drive, easier to get turned on",
      "More pleasure or easier orgasms",
      "Less pain or physical discomfort during sex",
      "Feeling more emotionally close during sex",
      "Talking more openly about what I want and don't want",
      "More excitement, freshness, or playfulness",
      "Feeling more confident in my own body",
      "Feeling more connected to my own sexuality",
      "Healing past experiences that still affect me sexually",
      "Being more on the same page with someone I'm involved with",
      "Something else",
    ],
    required: true,
    guide:
      "What would make the biggest real difference in 3 months — not what sounds important on paper?",
    supportAndGuidance:
      "What would make the biggest real difference in 3 months — not what sounds important on paper?",
    comment:
      "This sets the main focus of your next-step suggestions, so the report starts with what matters most to you now.",
    howAnswerIsUsed:
      "This sets the main focus of your next-step suggestions, so the report starts with what matters most to you now.",
    formatGuidance: "Select all that apply.",
  },
  {
    qId: "16002",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question: "Working on my sexuality is a priority for me right now.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Think about real life right now — bandwidth, motivation, life pressures — not how important it feels in theory.",
    supportAndGuidance:
      "Think about real life right now — bandwidth, motivation, life pressures — not how important it feels in theory.",
    scaleLabels: { low: "Not true at all", high: "Completely true" },
    comment:
      "This tells us whether to make your recommendations more immediate and action-oriented or more exploratory and grounded.",
    howAnswerIsUsed:
      "This tells us whether to make your recommendations more immediate and action-oriented or more exploratory and grounded.",
    hoverStates: {
      "1": "Not true at all: This is not a priority right now, and other parts of life clearly come first.",
      "2": "Mostly not true: This matters a little, but it is still low on your list of priorities.",
      "3": "Slightly not true: This has some relevance for you, though it is not yet a strong focus.",
      "4": "Mixed / depends: This matters, but it is one priority among several rather than the main one.",
      "5": "Slightly true: This feels meaningfully worth your attention and is becoming a clear area to work on.",
      "6": "Mostly true: This feels like a strong current priority and something you genuinely want to address.",
      "7": "Completely true: This feels urgent, central, or highly important to focus on now.",
    },
  },
  {
    qId: "16005",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question: "Which of these best describes where your sexuality feels right now?",
    answerType: "single",
    options: [
      "Pausing — I need a break from sex right now",
      "Repairing — I'm working to feel safe and close again after something hurt",
      "Waking up — I'm figuring out what I actually enjoy",
      "Experimenting — I'm ready to try new things and have more fun",
      "Steady — Sex feels normal and good in my life",
      "Transcending — Sex feels connected to something bigger than just pleasure",
    ],
    required: true,
    guide: "This is your current season, not a fixed identity. Pick what fits the past 1–2 months.",
    supportAndGuidance:
      "This is your current season, not a fixed identity. Pick what fits the past 1–2 months.",
    comment:
      "This helps us locate the season you are in now—paused, repairing, awakening, expanding, grounded, or evolving—so the report meets you where you are.",
    howAnswerIsUsed:
      "This helps us locate the season you are in now—paused, repairing, awakening, expanding, grounded, or evolving—so the report meets you where you are.",
    formatGuidance: "Select one option.",
  },
  {
    qId: "16006",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question: "Where would you like your sexuality to be 3–6 months from now?",
    answerType: "single",
    options: [
      "More rest and space from sex right now",
      "Rebuilding trust and safety in my sexuality",
      "Rediscover what turns me on and what I enjoy",
      "Explore more, try new things, and feel more confident",
      "I want sex to feel natural and integrated into my everyday life",
      "I want sex to feel spiritually meaningful and deeply connected",
    ],
    required: true,
    guide:
      "Several may appeal. Pick the direction that would make the biggest real difference for you right now.",
    supportAndGuidance:
      "Several may appeal. Pick the direction that would make the biggest real difference for you right now.",
    comment:
      "This shows the direction you want to grow, so recommendations aim toward your desired phase instead of only describing the present.",
    howAnswerIsUsed:
      "This shows the direction you want to grow, so recommendations aim toward your desired phase instead of only describing the present.",
    formatGuidance: "Select one option.",
  },
  {
    qId: "16007",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question:
      "When you want to improve something important in your life (health, relationships, confidence), what's usually your first move?",
    answerType: "single",
    options: [
      "Read, watch, or listen on my own",
      "Use a tool — an app, journal, or worksheet",
      "Sign up for a program or course",
      "Work with a professional (therapist, coach, etc.)",
      "I usually only act once it becomes urgent",
    ],
    required: true,
    guide:
      "Picture real moments of change you've actually made — what's your first step that genuinely gets you moving?",
    supportAndGuidance:
      "Picture real moments of change you've actually made — what's your first step that genuinely gets you moving?",
    comment:
      "This helps us decide whether your recommendations should feel more self-directed, relational, structured, or guided.",
    howAnswerIsUsed:
      "This helps us decide whether your recommendations should feel more self-directed, relational, structured, or guided.",
    formatGuidance: "Select one option.",
  },
  {
    qId: "16008",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question: "What kind of support would actually help you most with your top focus?",
    answerType: "multiple",
    options: [
      "Self-guided tools I can use on my own (prompts, exercises, reflections)",
      "A short, structured program over a few weeks",
      "A live group, workshop, or circle",
      "Support I can do together with the person I'm with",
      "1-on-1 work with a professional",
      "Not sure yet",
    ],
    required: true,
    guide:
      "Pick what would actually make your next step easier in real life — not what sounds most impressive.",
    supportAndGuidance:
      "Pick what would actually make your next step easier in real life — not what sounds most impressive.",
    comment:
      "This shapes the format of your recommendations—more practical, reflective, structured, or supportive.",
    howAnswerIsUsed:
      "This shapes the format of your recommendations—more practical, reflective, structured, or supportive.",
    formatGuidance: "Select all that apply.",
  },
  {
    qId: "16011",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question: "Which of these are already part of your life?",
    answerType: "multiple",
    options: [
      "Therapy, coaching, or counseling",
      "Books or other long reads",
      "Apps for things like meditation, sleep, or breathwork",
      "Paid subscriptions (streaming, podcasts, lifestyle apps)",
      "Online courses, programs, or paid communities",
      "None of these",
    ],
    required: true,
    guide:
      "Helps us recommend things that feel familiar and doable — not a whole new world for you to figure out.",
    supportAndGuidance:
      "Helps us recommend things that feel familiar and doable — not a whole new world for you to figure out.",
    comment:
      "This helps us understand the kinds of support tools and formats you already engage with.",
    howAnswerIsUsed:
      "This helps us understand the kinds of support tools and formats you already engage with.",
    formatGuidance: "Select all that apply.",
  },
  {
    qId: "16012",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question:
      "Roughly how much do you spend per year on personal growth — books, courses, therapy, coaching, apps?",
    answerType: "single",
    options: ["€0", "€1–99", "€100–299", "€300–699", "€700–1,499", "€1,500+"],
    required: true,
    guide:
      "A rough estimate is fine. Include both one-off purchases and ongoing subscriptions or memberships.",
    supportAndGuidance:
      "A rough estimate is fine. Include both one-off purchases and ongoing subscriptions or memberships.",
    comment:
      "This gives a rough sense of the level of depth and commitment that may feel realistic in your next-step suggestions.",
    howAnswerIsUsed:
      "This gives a rough sense of the level of depth and commitment that may feel realistic in your next-step suggestions.",
    formatGuidance: "Select one option.",
  },
  {
    qId: "16013",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question: "Understanding my sexuality is important to me.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Look at the bigger picture of your life. For some, sexuality is central; for others it matters but isn't the main focus.",
    supportAndGuidance:
      "Look at the bigger picture of your life. For some, sexuality is central; for others it matters but isn't the main focus.",
    scaleLabels: { low: "Not true at all", high: "Completely true" },
    comment:
      "This helps us decide how central this topic should be in your recommendations and how much depth to give it.",
    howAnswerIsUsed:
      "This helps us decide how central this topic should be in your recommendations and how much depth to give it.",
    hoverStates: {
      "1": "Not true at all: Understanding your sexuality does not feel central to your life right now.",
      "2": "Mostly not true: This matters a little, but it is not a major life priority for you.",
      "3": "Slightly not true understanding your sexuality has some value, though it is not yet especially central.",
      "4": "Mixed / depends: It matters, but it is one meaningful area among several in your life.",
      "5": "Slightly true: Understanding your sexuality feels meaningfully relevant to your wellbeing, relationships, or growth.",
      "6": "Mostly true: This feels like a strong area of importance for your life and self-understanding.",
      "7": "Completely true: Understanding your sexuality feels deeply important to your life, wellbeing, or growth.",
    },
  },
  {
    qId: "16014",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question: "What's actually getting in the way of improving your sexuality right now?",
    answerType: "multiple",
    options: [
      "I'm not sure what would actually help",
      "I don't have enough time or energy",
      "The person I'm with isn't on the same page or willing to engage",
      "It doesn't feel emotionally safe enough yet",
      "Shame, self-judgment, or inner pressure",
      "Physical pain or body issues",
      "Useful support feels too expensive or hard to access",
      "I struggle to keep going with things over time",
      "Nothing major is in the way right now",
      "Something else",
    ],
    required: true,
    guide: "What's truly blocking movement right now — not what sounds important in theory?",
    supportAndGuidance:
      "What's truly blocking movement right now — not what sounds important in theory?",
    comment:
      "This tells us which obstacles to prioritize first so the report focuses on what is actually blocking progress.",
    howAnswerIsUsed:
      "This tells us which obstacles to prioritize first so the report focuses on what is actually blocking progress.",
    formatGuidance: "Select all that apply.",
  },
  {
    qId: "16015",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question: "Would you like to receive free LoveIQ hints and insights?",
    answerType: "single",
    options: [
      "Yes, I want to keep learning about myself.",
      "No, I am not interested in this growth opportunity.",
    ],
    required: true,
    guide:
      "This includes insights on sexuality, intimacy, research papers, news and future advanced tests.",
    supportAndGuidance:
      "This includes insights on sexuality, intimacy, research papers, news and future advanced tests.",
    formatGuidance: "Select one option.",
  },
];
