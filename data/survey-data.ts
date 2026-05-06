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

export interface ChapterIntro {
  cId: number;
  chapter: string;
  text: string;
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
      "Use an email you can access easily. We’ll send your report here, so a private address may feel best if you want to keep this separate from work or shared accounts.",
    supportAndGuidance:
      "Use an email you can access easily. We’ll send your report here, so a private address may feel best if you want to keep this separate from work or shared accounts.",
    inputType: "email",
    placeholder: "nickname@example.com",
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
      "Enter the name you’d like us to use in your report. It can be your first name, initials, a nickname, or anything that feels comfortable and personal.",
    supportAndGuidance:
      "Enter the name you’d like us to use in your report. It can be your first name, initials, a nickname, or anything that feels comfortable and personal.",
    inputType: "text",
    placeholder: "Banana Bandit",
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
      "Think about the past 4–8 weeks, not one unusually good or hard moment. If you’re not sexually active right now, answer based on how satisfied you feel with that reality overall.",
    supportAndGuidance:
      "Think about the past 4–8 weeks, not one unusually good or hard moment. If you’re not sexually active right now, answer based on how satisfied you feel with that reality overall.",
    scaleLabels: { low: "Not at all true", high: "Very true" },
    comment:
      "Provides baseline context for interpreting your report. This does not directly define your archetype.",
    howAnswerIsUsed:
      "Provides baseline context for interpreting your report. This does not directly define your archetype.",
    answerOptionsExplained: [
      {
        option: "1 = Not at all true",
        explanation:
          "your current sexual life feels clearly unfulfilling, frustrating, painful, absent, or far from what you want",
      },
      {
        option: "2 = Mostly not true",
        explanation:
          "more of your current experience feels lacking than fulfilling, and dissatisfaction is a noticeable part of your reality",
      },
      {
        option: "3 = Slightly not true",
        explanation:
          "some parts may work, but there is enough frustration, inconsistency, or disappointment to pull your overall satisfaction down",
      },
      {
        option: "4 = Mixed / depends",
        explanation:
          "some parts feel okay or satisfying, while others feel lacking, unclear, inconsistent, or only partly fulfilling",
      },
      {
        option: "5 = Slightly true",
        explanation:
          "your sexual life feels more satisfying than not, even if some frustrations, gaps, or unmet needs remain",
      },
      {
        option: "6 = Mostly true",
        explanation:
          "most of your sexual life feels good, aligned, and meaningfully fulfilling, with only limited dissatisfaction",
      },
      {
        option: "7 = Very true",
        explanation:
          "your current sexual life feels deeply fulfilling, aligned, and broadly good for you overall",
      },
    ],
    hoverStates: {
      "1": "Not at all true",
      "2": "Mostly not true",
      "3": "Slightly not true",
      "4": "Mixed / depends",
      "5": "Slightly true",
      "6": "Mostly true",
      "7": "Very true",
    },
    formatGuidance: "Select how true this statement is for you.",
  },
  {
    qId: "01003",
    cId: 1,
    chapter: "Current Sexual Wellbeing & Pain Points",
    question: "Which statement best describes your relationship with sexuality right now?",
    answerType: "single",
    options: [
      "Satisfied & actively engaged",
      "Want more than I currently have",
      "Frustrated or unfulfilled",
      "Feels complicated or inconsistent",
      "Present, but not a priority right now",
      "Currently not a focus for me",
      "Unsure / still figuring it out",
    ],
    required: true,
    guide:
      "Think about your current season, not your ideal self. If more than one partly fits, focus on the one that feels most central right now.",
    supportAndGuidance:
      "Think about your current season, not your ideal self. If more than one partly fits, focus on the one that feels most central right now.",
    comment:
      "Helps distinguish whether lower sexual engagement reflects preference, life load, or emotional/relational difficulty.",
    howAnswerIsUsed:
      "Helps distinguish whether lower sexual engagement reflects preference, life load, or emotional/relational difficulty.",
    answerOptionsExplained: [
      {
        option: "Satisfied & actively engaged",
        explanation:
          "sexuality currently feels alive, available, and broadly working for you; you are not mainly in a problem-solving mode right now",
      },
      {
        option: "Want more than I currently have",
        explanation:
          "sexuality matters to you, and you feel a meaningful gap between what you want and what you are currently experiencing",
      },
      {
        option: "Frustrated or unfulfilled",
        explanation:
          "your current sexual reality feels clearly lacking, disappointing, stuck, or far from what you want",
      },
      {
        option: "Feels complicated or inconsistent",
        explanation:
          "sexuality is present, but mixed signals, changing desire, shame, pain, mismatch, or emotional difficulty make it hard to feel simple and steady",
      },
      {
        option: "Present, but not a priority right now",
        explanation:
          "sexuality matters, but stress, work, parenting, health, grief, logistics, or general life load often push it lower on the list",
      },
      {
        option: "Currently not a focus for me",
        explanation:
          "sexuality is genuinely lower priority for you right now by preference or life stage, not mainly because something is wrong",
      },
      {
        option: "Unsure / still figuring it out",
        explanation:
          "your current relationship with sexuality feels mixed, unclear, or still in discovery, and no single option fully captures it",
      },
    ],
    formatGuidance: "Select one option.",
  },
  {
    qId: "01005",
    cId: 1,
    chapter: "Current Sexual Wellbeing & Pain Points",
    question: "I often crave more novelty and variety in my sexual life.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Answer from your usual pattern. Novelty can mean new activities, fantasies, roles, pacing, settings, or simply wanting things to feel less same-same.",
    supportAndGuidance:
      "Answer from your usual pattern. Novelty can mean new activities, fantasies, roles, pacing, settings, or simply wanting things to feel less same-same.",
    scaleLabels: { low: "Not at all true", high: "Very true" },
    comment:
      "Helps estimate whether your erotic style leans more toward novelty-seeking or familiarity and steadiness.",
    howAnswerIsUsed:
      "Helps estimate whether your erotic style leans more toward novelty-seeking or familiarity and steadiness.",
    answerOptionsExplained: [
      {
        option: "1 = Not at all true",
        explanation:
          "familiarity, steadiness, and known patterns usually feel more satisfying to you than novelty or change",
      },
      {
        option: "2 = Mostly not true",
        explanation:
          "you may enjoy occasional variation, but novelty is usually not an important driver of your sexuality",
      },
      {
        option: "3 = Slightly not true",
        explanation:
          "some variety appeals to you at times, though you generally lean more toward familiarity than change",
      },
      {
        option: "4 = Mixed / depends",
        explanation:
          "variety matters in some situations, but it is not a major or consistent driver of your sexuality",
      },
      {
        option: "5 = Slightly true",
        explanation:
          "novelty does matter to you, and some freshness or variation can noticeably improve your sexual experience",
      },
      {
        option: "6 = Mostly true",
        explanation:
          "newness, change, or experimentation are often important parts of what keeps sexuality engaging for you",
      },
      {
        option: "7 = Very true",
        explanation:
          "novelty, variety, experimentation, or freshness are strong and recurring parts of what keeps sexuality alive for you",
      },
    ],
    hoverStates: {
      "1": "Not at all true",
      "2": "Mostly not true",
      "3": "Slightly not true",
      "4": "Mixed / depends",
      "5": "Slightly true",
      "6": "Mostly true",
      "7": "Very true",
    },
    formatGuidance: "Select how true this statement is for you.",
  },
  {
    qId: "01006",
    cId: 1,
    chapter: "Current Sexual Wellbeing & Pain Points",
    question: "Sex is often uncomfortable or painful for me.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Answer from your typical recent experience, not one isolated event. Include any kind of sexual contact, not only penetration.",
    supportAndGuidance:
      "Answer from your typical recent experience, not one isolated event. Include any kind of sexual contact, not only penetration.",
    scaleLabels: { low: "Not at all true", high: "Very true" },
    comment:
      "Used to tailor guidance more safely and realistically around comfort, pacing, and pain sensitivity.",
    howAnswerIsUsed:
      "Used to tailor guidance more safely and realistically around comfort, pacing, and pain sensitivity.",
    answerOptionsExplained: [
      {
        option: "1 = Not at all true",
        explanation:
          "sex is generally physically comfortable for you, without pain being a meaningful part of the experience",
      },
      {
        option: "2 = Mostly not true",
        explanation:
          "discomfort may happen occasionally, but it is uncommon and not a major pattern for you",
      },
      {
        option: "3 = Slightly not true",
        explanation:
          "discomfort shows up sometimes, but not often enough to define your sexual experience overall",
      },
      {
        option: "4 = Mixed / depends",
        explanation:
          "discomfort or pain shows up in some contexts and matters, but it is not always present",
      },
      {
        option: "5 = Slightly true",
        explanation:
          "discomfort is a noticeable part of your experience in certain situations, even if it is not constant",
      },
      {
        option: "6 = Mostly true",
        explanation:
          "pain or physical discomfort happens fairly often and meaningfully shapes how sex feels for you",
      },
      {
        option: "7 = Very true",
        explanation:
          "discomfort or pain is a frequent, important, or defining part of your sexual experience",
      },
    ],
    hoverStates: {
      "1": "Not at all true",
      "2": "Mostly not true",
      "3": "Slightly not true",
      "4": "Mixed / depends",
      "5": "Slightly true",
      "6": "Mostly true",
      "7": "Very true",
    },
    formatGuidance: "Select how true this statement is for you.",
  },
  {
    qId: "02001",
    cId: 2,
    chapter: "Spontaneous Desire VS Responsive Desire",
    question:
      "When you think about times you’ve wanted sex, what usually happened before the desire showed up?",
    answerType: "single",
    options: [
      "Spontaneous",
      "Responsive",
      "Planned window",
      "Varies by person or context",
      "Desire has been low lately",
    ],
    required: true,
    guide:
      "Think about your recent usual pattern, not one unusual moment. Choose the option that best describes what tends to come before desire becomes available.",
    supportAndGuidance:
      "Think about your recent usual pattern, not one unusual moment. Choose the option that best describes what tends to come before desire becomes available.",
    comment:
      "Helps identify your primary desire activation pattern, which is important for archetype scoring and recommendation logic.",
    howAnswerIsUsed:
      "Helps identify your primary desire activation pattern, which is important for archetype scoring and recommendation logic.",
    answerOptionsExplained: [
      {
        option: "Spontaneous",
        explanation: "Nothing much had to happen first; desire often appeared on its own",
      },
      {
        option: "Responsive",
        explanation:
          "Desire usually appeared after affection, closeness, touch, flirting, or erotic cues",
      },
      {
        option: "Planned window",
        explanation:
          "Desire tends to come more easily when sex has protected time, space, and lower pressure",
      },
      {
        option: "Varies by person or context",
        explanation:
          "What happened before desire showed up changed depending on the person or situation",
      },
      {
        option: "Desire has been low lately",
        explanation: "Desire has been low enough recently that no clear pattern stands out",
      },
    ],
    formatGuidance: "Select one option.",
  },
  {
    qId: "02002",
    cId: 2,
    chapter: "Spontaneous Desire VS Responsive Desire",
    question: "My sexual desire usually builds only after affection, touch, or other erotic cues.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Think about how desire usually starts for you. Cues can include affection, flirtation, fantasy, emotional closeness, or erotic touch.",
    supportAndGuidance:
      "Think about how desire usually starts for you. Cues can include affection, flirtation, fantasy, emotional closeness, or erotic touch.",
    scaleLabels: { low: "Not at all true", high: "Very true" },
    comment:
      "A strong indicator of whether desire tends to be responsive rather than internally self-starting.",
    howAnswerIsUsed:
      "A strong indicator of whether desire tends to be responsive rather than internally self-starting.",
    answerOptionsExplained: [
      {
        option: "1 = Not at all true",
        explanation:
          "desire usually appears on its own, before another person initiates or before affectionate cues are needed",
      },
      {
        option: "2 = Mostly not true",
        explanation:
          "affection or initiation can help sometimes, but desire often begins internally without much prompting",
      },
      {
        option: "3 = Slightly not true",
        explanation:
          "desire can be helped by affection, though it still often appears without needing much activation from another person",
      },
      {
        option: "4 = Mixed / depends",
        explanation:
          "affection or initiation often helps, but desire also begins on its own in other situations",
      },
      {
        option: "5 = Slightly true",
        explanation:
          "desire often comes more easily after affection or initiation, even if it does not always require it",
      },
      {
        option: "6 = Mostly true",
        explanation:
          "desire usually needs affectionate, relational, or erotic cues before it really starts to build",
      },
      {
        option: "7 = Very true",
        explanation:
          "desire usually needs affectionate, relational, or erotic activation before it comes online",
      },
    ],
    hoverStates: {
      "1": "Not at all true",
      "2": "Mostly not true",
      "3": "Slightly not true",
      "4": "Mixed / depends",
      "5": "Slightly true",
      "6": "Mostly true",
      "7": "Very true",
    },
    formatGuidance: "Select how true this statement is for you.",
  },
  {
    qId: "02003",
    cId: 2,
    chapter: "Spontaneous Desire VS Responsive Desire",
    question: "I enjoy sex more when it’s planned rather than spontaneous.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Answer from what genuinely feels better, not what sounds most romantic. Planned can mean scheduled or simply expected.",
    supportAndGuidance:
      "Answer from what genuinely feels better, not what sounds most romantic. Planned can mean scheduled or simply expected.",
    scaleLabels: { low: "Not at all true", high: "Very true" },
    comment:
      "Helps determine whether anticipation and structure support desire better than spontaneity.",
    howAnswerIsUsed:
      "Helps determine whether anticipation and structure support desire better than spontaneity.",
    answerOptionsExplained: [
      {
        option: "1 = Not at all true",
        explanation:
          "spontaneity usually feels better, freer, or more energizing to you than planning",
      },
      {
        option: "2 = Mostly not true",
        explanation:
          "planning may help occasionally, but spontaneous intimacy is still usually more enjoyable for you",
      },
      {
        option: "3 = Slightly not true",
        explanation:
          "you can appreciate planning in some contexts, though you still tend to prefer spontaneity overall",
      },
      {
        option: "4 = Mixed / depends",
        explanation:
          "both planning and spontaneity can work, depending on stress, timing, or context",
      },
      {
        option: "5 = Slightly true",
        explanation:
          "planned sex often helps your enjoyment, even if spontaneity can still work sometimes",
      },
      {
        option: "6 = Mostly true",
        explanation:
          "planned sex usually feels easier, safer, or more successful for you than spontaneous intimacy",
      },
      {
        option: "7 = Very true",
        explanation:
          "planned sex usually feels easier, safer, more enjoyable, or more successful than spontaneous intimacy",
      },
    ],
    hoverStates: {
      "1": "Not at all true",
      "2": "Mostly not true",
      "3": "Slightly not true",
      "4": "Mixed / depends",
      "5": "Slightly true",
      "6": "Mostly true",
      "7": "Very true",
    },
    formatGuidance: "Select how true this statement is for you.",
  },
  {
    qId: "02004",
    cId: 2,
    chapter: "Spontaneous Desire VS Responsive Desire",
    question: "What kind of sexual initiation tends to work best for you?",
    answerType: "single",
    options: [
      "I initiate",
      "I’m usually not the one to initiate",
      "A planned opening works best for me",
      "Initiation flows organically, without a set role or expectation",
    ],
    required: true,
    guide:
      "Think about what most often leads to good experiences. Initiation can mean who makes the first move, signals interest, or creates the opening.",
    supportAndGuidance:
      "Think about what most often leads to good experiences. Initiation can mean who makes the first move, signals interest, or creates the opening.",
    comment:
      "Helps distinguish self-starting, partner-led, mutual, and planned initiation patterns.",
    howAnswerIsUsed:
      "Helps distinguish self-starting, partner-led, mutual, and planned initiation patterns.",
    answerOptionsExplained: [
      {
        option: "I initiate",
        explanation: "You usually like starting things or clearly signaling interest first",
      },
      {
        option: "I’m usually not the one to initiate",
        explanation:
          "You tend to respond better when the other person starts or signals interest first",
      },
      {
        option: "A planned opening works best for me",
        explanation:
          "Intimacy works better when there is time, privacy, and some shared expectation",
      },
      {
        option: "Initiation flows organically, without a set role or expectation",
        explanation: "Intimacy tends to emerge naturally, without anyone being expected to start",
      },
    ],
    formatGuidance: "Select one option.",
  },
  {
    qId: "03003",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: "What kinds of erotic settings or atmosphere feel most alive or activating for you?",
    answerType: "multiple",
    options: [
      "Private and protected",
      "Novel or adventurous",
      "Deliberate or ritualized",
      "Spontaneous or unplanned",
      "Edge, taboo, or transgression",
      "Visible or semi-public",
      "Something else",
    ],
    required: true,
    guide:
      "Focus on the settings or atmospheres that most reliably help your arousal open. This is about what genuinely works for you, not what sounds most adventurous or evolved.",
    supportAndGuidance:
      "Focus on the settings or atmospheres that most reliably help your arousal open. This is about what genuinely works for you, not what sounds most adventurous or evolved.",
    comment:
      "Helps identify whether privacy, ritual, spontaneity, adventure, or edge is part of your arousal style.",
    howAnswerIsUsed:
      "Helps identify whether privacy, ritual, spontaneity, adventure, or edge is part of your arousal style.",
    answerOptionsExplained: [
      { option: "Private and protected", explanation: "Safety and privacy help me open" },
      { option: "Novel or adventurous", explanation: "Newness adds erotic charge" },
      { option: "Deliberate or ritualized", explanation: "Preparation and intention matter" },
      { option: "Spontaneous or unplanned", explanation: "Unplanned moments feel hottest" },
      { option: "Edge, taboo, or transgression", explanation: "Rule-bending or edge adds charge" },
      { option: "Visible or semi-public", explanation: "Being seen, or almost seen, adds charge" },
      { option: "Something else", explanation: "My strongest cue is different" },
    ],
    formatGuidance: "Select up to 3 options.",
    maxSelections: 3,
  },
  {
    qId: "03004",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: "Emotional connection is important for me to feel sexual desire.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Answer from your real pattern. This is about whether emotional connection helps your desire open, not whether you value connection in general.",
    supportAndGuidance:
      "Answer from your real pattern. This is about whether emotional connection helps your desire open, not whether you value connection in general.",
    scaleLabels: { low: "Not at all true", high: "Very true" },
    comment:
      "Helps determine whether emotional closeness is optional, supportive, or close to a prerequisite for desire.",
    howAnswerIsUsed:
      "Helps determine whether emotional closeness is optional, supportive, or close to a prerequisite for desire.",
    answerOptionsExplained: [
      {
        option: "1 = Not at all true",
        explanation: "emotional closeness is not a major requirement for desire to show up for you",
      },
      {
        option: "2 = Mostly not true",
        explanation:
          "connection can help a little, but desire usually does not depend much on emotional closeness",
      },
      {
        option: "3 = Slightly not true",
        explanation:
          "emotional connection matters somewhat, though desire can still emerge without much of it",
      },
      {
        option: "4 = Mixed / depends",
        explanation:
          "connection often helps desire, but it is not always required for you to feel engaged",
      },
      {
        option: "5 = Slightly true",
        explanation:
          "desire usually works better when you feel emotionally connected to the other person",
      },
      {
        option: "6 = Mostly true",
        explanation:
          "emotional closeness strongly supports your ability to access, sustain, or enjoy desire",
      },
      {
        option: "7 = Very true",
        explanation:
          "without emotional closeness, desire is often hard to access, sustain, or enjoy fully",
      },
    ],
    hoverStates: {
      "1": "Not at all true",
      "2": "Mostly not true",
      "3": "Slightly not true",
      "4": "Mixed / depends",
      "5": "Slightly true",
      "6": "Mostly true",
      "7": "Very true",
    },
    formatGuidance: "Select how true this statement is for you.",
  },
  {
    qId: "03005",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: "Which description best fits what gets you from neutral to turned-on most often?",
    answerType: "single",
    options: [
      "Sensation-led",
      "Safety/context-led",
      "Connection-led",
      "Novelty/adventure-led",
      "Mastery/competence-led",
      "Fantasy/imagination-led",
      "Not sure / varies",
    ],
    required: true,
    guide:
      "Think about how you usually move from neutral to turned on in real life, not what sounds nicest in theory.",
    supportAndGuidance:
      "Think about how you usually move from neutral to turned on in real life, not what sounds nicest in theory.",
    comment: "One of the clearest direct indicators of your primary arousal pathway.",
    howAnswerIsUsed: "One of the clearest direct indicators of your primary arousal pathway.",
    answerOptionsExplained: [
      {
        option: "Sensation-led",
        explanation:
          "touch, physical buildup, rhythm, teasing, or body-based stimulation most reliably opens desire",
      },
      {
        option: "Safety/context-led",
        explanation: "low stress, privacy, enough time, and a protected context matter most",
      },
      {
        option: "Connection-led",
        explanation:
          "warmth, affection, emotional closeness, or relational openness are your main on-switch",
      },
      {
        option: "Novelty/adventure-led",
        explanation: "newness, experimentation, surprise, or exploration create arousal",
      },
      {
        option: "Mastery/competence-led",
        explanation:
          "skill, technique, refinement, and “getting it right” are especially activating for you",
      },
      {
        option: "Fantasy/imagination-led",
        explanation:
          "mental imagery, role play, erotic thinking, audio/visual stimulation, or imagined scenarios are the strongest entry point",
      },
      {
        option: "Not sure / varies",
        explanation: "there is no single starting point that clearly dominates across situations",
      },
    ],
    formatGuidance: "Select one option.",
  },
  {
    qId: "03006",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question:
      "When it comes to figuring out what works for you sexually, which approach fits you best?",
    answerType: "single",
    options: [
      "Structure and feedback",
      "Curiosity and experimentation",
      "Natural flow and spontaneity",
      "I prefer not to make it a deliberate process",
    ],
    required: true,
    guide:
      "This is about how you usually discover what works for you sexually, not the method you think you should prefer.",
    supportAndGuidance:
      "This is about how you usually discover what works for you sexually, not the method you think you should prefer.",
    comment:
      "Helps distinguish guided, analytical, and intuitive approaches to sexual growth and exploration.",
    howAnswerIsUsed:
      "Helps distinguish guided, analytical, and intuitive approaches to sexual growth and exploration.",
    answerOptionsExplained: [
      {
        option: "Structure and feedback",
        explanation:
          "You tend to learn best when there is clarity, guidance, language, or feedback that helps you understand what to try and what is or is not working",
      },
      {
        option: "Curiosity and experimentation",
        explanation:
          "You tend to learn best by actively exploring, trying different things, and discovering through trial, response, and adjustment",
      },
      {
        option: "Natural flow and spontaneity",
        explanation:
          "You tend to learn best by following what feels natural in the moment, without needing much planning, analysis, or deliberate experimentation",
      },
      {
        option: "I prefer not to make it a deliberate process",
        explanation:
          "You generally do not want sexuality to feel like something you have to study, improve, or intentionally work out, and prefer it to unfold without much deliberate effort",
      },
    ],
    formatGuidance: "Select one option.",
  },
  {
    qId: "03008",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question:
      "I usually prefer sex to feel intense, charged, or high-energy rather than soft, gentle, or calm.",
    answerType: "scale",
    options: [],
    required: true,
    guide: "Answer from the erotic energy you usually prefer, not one mood or experience.",
    supportAndGuidance:
      "Answer from the erotic energy you usually prefer, not one mood or experience.",
    scaleLabels: { low: "Not at all true", high: "Very true" },
    comment: "Helps position your erotic style on a calm-to-intense spectrum.",
    howAnswerIsUsed: "Helps position your erotic style on a calm-to-intense spectrum.",
    answerOptionsExplained: [
      {
        option: "1 = Not at all true",
        explanation:
          "You strongly prefer sex to feel softer, gentler, calmer, or more grounded than intense",
      },
      {
        option: "2 = Mostly not true",
        explanation: "You usually lean toward gentle, tender, calm, or slower sexual energy",
      },
      {
        option: "3 = Slightly not true",
        explanation:
          "You can enjoy some activation, but generally prefer sex to stay more soft than intense",
      },
      {
        option: "4 = Mixed / depends",
        explanation:
          "You enjoy both softness and intensity, depending on context, mood, or dynamic",
      },
      {
        option: "5 = Slightly true",
        explanation:
          "You often prefer more charge, edge, or activation, though softness still matters",
      },
      {
        option: "6 = Mostly true",
        explanation: "You are usually drawn to stronger, faster, or more charged erotic energy",
      },
      {
        option: "7 = Very true",
        explanation:
          "You strongly prefer high-intensity, high-charge, or high-activation erotic energy",
      },
    ],
    hoverStates: {
      "1": "Not at all true",
      "2": "Mostly not true",
      "3": "Slightly not true",
      "4": "Mixed / depends",
      "5": "Slightly true",
      "6": "Mostly true",
      "7": "Very true",
    },
    formatGuidance: "Select how true this statement is for you.",
  },
  {
    qId: "03009",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: "Sexual tension, anticipation, or pursuit reliably turns me on.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Think about what reliably creates erotic pull for you over time, not just what sounds exciting once in a while.",
    supportAndGuidance:
      "Think about what reliably creates erotic pull for you over time, not just what sounds exciting once in a while.",
    scaleLabels: { low: "Not at all true", high: "Very true" },
    comment:
      "Helps identify whether tension, pursuit, and anticipation are meaningful arousal drivers for you.",
    howAnswerIsUsed:
      "Helps identify whether tension, pursuit, and anticipation are meaningful arousal drivers for you.",
    answerOptionsExplained: [
      {
        option: "1 = Not at all true",
        explanation:
          "chase energy, tension, or pursuit are not important ingredients in your turn-on",
      },
      {
        option: "2 = Mostly not true",
        explanation:
          "you may notice some spark from anticipation now and then, but it is usually not central for you",
      },
      {
        option: "3 = Slightly not true",
        explanation:
          "tension or pursuit can add something in certain moments, though they are not major turn-on drivers",
      },
      {
        option: "4 = Mixed / depends",
        explanation:
          "anticipation or pursuit can add spark, but they are not central or consistently important",
      },
      {
        option: "5 = Slightly true",
        explanation: "some tension, teasing, or pursuit often helps create erotic charge for you",
      },
      {
        option: "6 = Mostly true",
        explanation:
          "anticipation, longing, teasing, or pursuit are often meaningful parts of what turns you on",
      },
      {
        option: "7 = Very true",
        explanation:
          "tension, longing, teasing, or the energy of pursuit are strong and recurring parts of what turns you on",
      },
    ],
    hoverStates: {
      "1": "Not at all true",
      "2": "Mostly not true",
      "3": "Slightly not true",
      "4": "Mixed / depends",
      "5": "Slightly true",
      "6": "Mostly true",
      "7": "Very true",
    },
    formatGuidance: "Select how true this statement is for you.",
  },
  {
    qId: "03010",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: "Which erotic atmosphere feels best for you most often?",
    answerType: "single",
    options: [
      "Very safe and predictable",
      "Mostly safe, with a little novelty",
      "Balanced",
      "Adventurous, with clear boundaries",
      "Strong edge or taboo energy",
    ],
    required: true,
    guide:
      "Think about the level of uncertainty, novelty, and edge that feels most alive for you when things are going well.",
    supportAndGuidance:
      "Think about the level of uncertainty, novelty, and edge that feels most alive for you when things are going well.",
    comment:
      "Strong signal for whether your style stays mostly safe and private or includes more edge, novelty, or taboo energy.",
    howAnswerIsUsed:
      "Strong signal for whether your style stays mostly safe and private or includes more edge, novelty, or taboo energy.",
    answerOptionsExplained: [
      {
        option: "Very safe and predictable",
        explanation: "you feel best in a highly secure, contained, low-uncertainty erotic space",
      },
      {
        option: "Mostly safe, with a little novelty",
        explanation:
          "a safe base matters most, but some light experimentation or freshness feels good",
      },
      {
        option: "Balanced",
        explanation: "familiar and novel, soft and edgy, both have a place for you",
      },
      {
        option: "Adventurous, with clear boundaries",
        explanation:
          "you enjoy more exploration, intensity, or edge when limits are clear and the container feels safe",
      },
      {
        option: "Strong edge or taboo energy",
        explanation:
          "thrill, transgression, or stronger taboo-flavored energy add major arousal for you, always within consent and agreed limits",
      },
    ],
    formatGuidance: "Select one option.",
  },
  {
    qId: "03011",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question:
      "Sex feels most fulfilling when it has a sacred, meaningful, or ritual quality (not just pleasure).",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "You do not need to be religious for this to fit. Answer from whether sex feels most fulfilling when it carries depth, intention, or a sense of meaning.",
    supportAndGuidance:
      "You do not need to be religious for this to fit. Answer from whether sex feels most fulfilling when it carries depth, intention, or a sense of meaning.",
    scaleLabels: { low: "Not at all true", high: "Very true" },
    comment:
      "Helps identify whether meaning, ritual, and depth are central to sexual fulfillment for you.",
    howAnswerIsUsed:
      "Helps identify whether meaning, ritual, and depth are central to sexual fulfillment for you.",
    answerOptionsExplained: [
      {
        option: "1 = Not at all true",
        explanation:
          "sexual fulfillment is not strongly tied to ritual, meaning, or sacredness for you",
      },
      {
        option: "2 = Mostly not true",
        explanation:
          "meaning can be nice, but it is usually not a major factor in whether sex feels fulfilling",
      },
      {
        option: "3 = Slightly not true",
        explanation:
          "depth or significance may enrich sex sometimes, though it is not usually central for you",
      },
      {
        option: "4 = Mixed / depends",
        explanation:
          "meaning or ritual can enrich sex in some situations, but they are not always central",
      },
      {
        option: "5 = Slightly true",
        explanation:
          "sex often feels more fulfilling when it carries some emotional, symbolic, or meaningful depth",
      },
      {
        option: "6 = Mostly true",
        explanation:
          "significance, ritual, or a deeper sense of meaning are often important parts of fulfillment for you",
      },
      {
        option: "7 = Very true",
        explanation:
          "sex feels most fulfilling when it carries significance, ritual, reverence, or a deeper sense of meaning",
      },
    ],
    hoverStates: {
      "1": "Not at all true",
      "2": "Mostly not true",
      "3": "Slightly not true",
      "4": "Mixed / depends",
      "5": "Slightly true",
      "6": "Mostly true",
      "7": "Very true",
    },
    formatGuidance: "Select how true this statement is for you.",
  },
  {
    qId: "03012",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: "Without some degree of edge, taboo, or intensity, sex can feel flat.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Edge can mean intensity, taboo, daringness, pursuit, or a stronger charge. Answer from what keeps your sexuality engaged over time.",
    supportAndGuidance:
      "Edge can mean intensity, taboo, daringness, pursuit, or a stronger charge. Answer from what keeps your sexuality engaged over time.",
    scaleLabels: { low: "Not at all true", high: "Very true" },
    comment:
      "Key indicator of whether edge or taboo is part of your erotic baseline rather than occasional curiosity.",
    howAnswerIsUsed:
      "Key indicator of whether edge or taboo is part of your erotic baseline rather than occasional curiosity.",
    answerOptionsExplained: [
      {
        option: "1 = Not at all true",
        explanation:
          "gentle, straightforward, or emotionally connected sex can feel fully alive for you without strong edge or taboo",
      },
      {
        option: "2 = Mostly not true",
        explanation:
          "some intensity may be enjoyable at times, but it is usually not needed for sex to feel engaging",
      },
      {
        option: "3 = Slightly not true",
        explanation:
          "edge can add spark sometimes, though sex does not generally depend on it to feel alive",
      },
      {
        option: "4 = Mixed / depends",
        explanation:
          "edge, taboo, or intensity can add excitement, but they are not required in every context",
      },
      {
        option: "5 = Slightly true",
        explanation:
          "some edge or erotic intensity often helps sex feel more alive, even if it is not always necessary",
      },
      {
        option: "6 = Mostly true",
        explanation:
          "without enough charge, edge, or intensity, sex often feels less engaging or less alive for you",
      },
      {
        option: "7 = Very true",
        explanation:
          "without some intensity, taboo flavor, or erotic charge, sex often feels less alive or less engaging for you",
      },
    ],
    hoverStates: {
      "1": "Not at all true",
      "2": "Mostly not true",
      "3": "Slightly not true",
      "4": "Mixed / depends",
      "5": "Slightly true",
      "6": "Mostly true",
      "7": "Very true",
    },
    formatGuidance: "Select how true this statement is for you.",
  },
  {
    qId: "03013",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: "Which erotic perspective most strongly turns you on?",
    answerType: "single",
    options: [
      "Being watched / admired",
      "Watching or observing another person",
      "Absorbed in sensation / connection",
      "Not sure",
    ],
    required: true,
    guide:
      "Answer from fantasy or real experience; choose the perspective with the strongest erotic pull.",
    supportAndGuidance:
      "Answer from fantasy or real experience; choose the perspective with the strongest erotic pull.",
    comment: "Helps distinguish being seen, watching, and inward/relational arousal patterns.",
    howAnswerIsUsed:
      "Helps distinguish being seen, watching, and inward/relational arousal patterns.",
    answerOptionsExplained: [
      {
        option: "Being watched / admired",
        explanation: "Arousal rises when you feel seen, desired, noticed, or a little performative",
      },
      {
        option: "Watching or observing another person",
        explanation:
          "Arousal rises from seeing another person’s body, expressions, reactions, pleasure, or erotic energy",
      },
      {
        option: "Absorbed in sensation / connection",
        explanation:
          "Your turn-on is less about seeing or being seen and more about disappearing into feeling, body, or connection",
      },
      { option: "Not sure", explanation: "None of these patterns clearly stands out right now" },
    ],
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
      "Answer from your typical partnered experience in recent months under reasonably good conditions. This is about pattern, not pressure or performance.",
    supportAndGuidance:
      "Answer from your typical partnered experience in recent months under reasonably good conditions. This is about pattern, not pressure or performance.",
    scaleLabels: { low: "Not at all true", high: "Very true" },
    comment:
      "Used to tailor pacing, expectations, and guidance around orgasm and partnered pleasure. It does not directly define your archetype.",
    howAnswerIsUsed:
      "Used to tailor pacing, expectations, and guidance around orgasm and partnered pleasure. It does not directly define your archetype.",
    answerOptionsExplained: [
      {
        option: "1 = Not at all true",
        explanation:
          "orgasm with a partner is very uncommon for you, even when you want it and conditions are reasonably supportive",
      },
      {
        option: "2 = Mostly not true",
        explanation:
          "orgasm with a partner is possible, but only in rare or unusually favorable situations",
      },
      {
        option: "3 = Slightly not true",
        explanation:
          "orgasm with a partner happens from time to time, but it is not something you can generally count on",
      },
      {
        option: "4 = Mixed / depends",
        explanation:
          "orgasm with a partner happens with some consistency, though it still feels variable and not fully dependable",
      },
      {
        option: "5 = Slightly true",
        explanation:
          "orgasm with a partner is available to you fairly often and feels like a recurring part of partnered sex",
      },
      {
        option: "6 = Mostly true",
        explanation: "orgasm with a partner happens in most supportive situations when you want it",
      },
      {
        option: "7 = Very true",
        explanation:
          "orgasm with a partner is highly accessible and reliably available to you when you want it",
      },
    ],
    hoverStates: {
      "1": "Not at all true",
      "2": "Mostly not true",
      "3": "Slightly not true",
      "4": "Mixed / depends",
      "5": "Slightly true",
      "6": "Mostly true",
      "7": "Very true",
    },
    formatGuidance: "Select how true this statement is for you.",
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
      "Answer from your current relational baseline, not from one difficult week or an old chapter that no longer fits. If this relationship reflects a real shift in how secure you feel, let that count.",
    supportAndGuidance:
      "Answer from your current relational baseline, not from one difficult week or an old chapter that no longer fits. If this relationship reflects a real shift in how secure you feel, let that count.",
    scaleLabels: { low: "Not at all true", high: "Very true" },
    comment:
      "Gives baseline context for how safe and settled you tend to feel in closeness and attachment.",
    howAnswerIsUsed:
      "Gives baseline context for how safe and settled you tend to feel in closeness and attachment.",
    answerOptionsExplained: [
      {
        option: "1 = Not at all true",
        explanation: "relationships often feel unstable, threatening, or hard to trust for you",
      },
      {
        option: "2 = Mostly not true",
        explanation:
          "security is often hard to sustain, and worry, distrust, or withdrawal tend to show up more than steadiness",
      },
      {
        option: "3 = Slightly not true",
        explanation:
          "some parts of you can feel secure, but insecurity still outweighs steadiness overall",
      },
      {
        option: "4 = Mixed / depends",
        explanation:
          "some parts of you feel secure, but worry, withdrawal, or instability still show up in meaningful ways",
      },
      {
        option: "5 = Slightly true",
        explanation:
          "you often can feel secure, even though certain triggers or patterns still shake that steadiness",
      },
      {
        option: "6 = Mostly true",
        explanation:
          "you usually feel relatively safe, trusting, and steady in relationships, even if not perfectly all the time",
      },
      {
        option: "7 = Very true",
        explanation:
          "you generally feel worthy of love, able to trust closeness, and able to stay relatively steady through distance or conflict",
      },
    ],
    hoverStates: {
      "1": "Not at all true",
      "2": "Mostly not true",
      "3": "Slightly not true",
      "4": "Mixed / depends",
      "5": "Slightly true",
      "6": "Mostly true",
      "7": "Very true",
    },
    formatGuidance: "Select how true this statement is for you.",
  },
  {
    qId: "08003",
    cId: 8,
    chapter: "Attachment Style & Emotional Safety",
    question: "When someone I feel close to pulls away, I usually…",
    answerType: "single",
    options: [
      "Seek reassurance / pursue",
      "Shut down / withdraw",
      "Protest / get angry",
      "Self-soothe / stay grounded",
      "Varies",
    ],
    required: true,
    guide:
      "Think about a typical moment when you sense less contact, warmth, or responsiveness than you want. Focus on your most common first reaction.",
    supportAndGuidance:
      "Think about a typical moment when you sense less contact, warmth, or responsiveness than you want. Focus on your most common first reaction.",
    comment:
      "Helps identify pursuit, withdrawal, protest, or self-regulation patterns that shape intimacy dynamics.",
    howAnswerIsUsed:
      "Helps identify pursuit, withdrawal, protest, or self-regulation patterns that shape intimacy dynamics.",
    answerOptionsExplained: [
      {
        option: "Seek reassurance / pursue",
        explanation:
          "you move toward the person for contact, clarity, closeness, or confirmation that things are okay",
      },
      {
        option: "Shut down / withdraw",
        explanation: "you protect yourself by pulling back, going quiet, or creating distance",
      },
      {
        option: "Protest / get angry",
        explanation:
          "fear or frustration tends to come out as irritation, criticism, anger, or protest behavior",
      },
      {
        option: "Self-soothe / stay grounded",
        explanation: "you can usually regulate your feelings without escalating or disconnecting",
      },
      {
        option: "Varies",
        explanation:
          "your first response depends strongly on the person, context, or how safe the relationship feels",
      },
    ],
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
      "If current relationship reflects a lasting shift in how you do closeness and independence, let that matter.",
    supportAndGuidance:
      "If current relationship reflects a lasting shift in how you do closeness and independence, let that matter.",
    scaleLabels: { low: "Not at all true", high: "Very true" },
    comment:
      "Places you on a closeness-versus-distance pattern that shapes intimacy recommendations.",
    howAnswerIsUsed:
      "Places you on a closeness-versus-distance pattern that shapes intimacy recommendations.",
    answerOptionsExplained: [
      {
        option: "1 = Not at all true",
        explanation:
          "you typically value autonomy and space; togetherness can feel constraining or overwhelming",
      },
      {
        option: "2 = Mostly not true",
        explanation:
          "you generally prefer independence; closeness matters less to you than freedom",
      },
      {
        option: "3 = Slightly not true",
        explanation:
          "you appreciate some closeness, but independence and personal space feel more important",
      },
      {
        option: "4 = Mixed / depends",
        explanation:
          "you value closeness and independence equally, or your preference shifts depending on the person or life stage",
      },
      {
        option: "5 = Slightly true",
        explanation:
          "you usually prefer more togetherness than space, though independence still matters to you",
      },
      {
        option: "6 = Mostly true",
        explanation:
          "you strongly prefer closeness and togetherness; you feel less satisfied without frequent connection",
      },
      {
        option: "7 = Very true",
        explanation:
          "you strongly prefer closeness and togetherness; independence feels much less important than connection",
      },
    ],
    hoverStates: {
      "1": "Not at all true",
      "2": "Mostly not true",
      "3": "Slightly not true",
      "4": "Mixed / depends",
      "5": "Slightly true",
      "6": "Mostly true",
      "7": "Very true",
    },
    formatGuidance: "Select how true this statement is for you.",
  },
  {
    qId: "08005",
    cId: 8,
    chapter: "Attachment Style & Emotional Safety",
    question: "After emotional repair (a good vulnerable talk), I often feel more desire.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Emotional repair means a real moment of reconnection after tension. Answer from what usually happens in your body and desire after that kind of repair.",
    supportAndGuidance:
      "Emotional repair means a real moment of reconnection after tension. Answer from what usually happens in your body and desire after that kind of repair.",
    scaleLabels: { low: "Not at all true", high: "Very true" },
    comment: "Strong clue for whether emotional reconnection reliably reopens desire for you.",
    howAnswerIsUsed:
      "Strong clue for whether emotional reconnection reliably reopens desire for you.",
    answerOptionsExplained: [
      {
        option: "1 = Not at all true",
        explanation: "even after repair, desire usually does not increase much for you",
      },
      {
        option: "2 = Mostly not true",
        explanation:
          "emotional repair may help a little at times, but it usually does not shift desire very much",
      },
      {
        option: "3 = Slightly not true",
        explanation:
          "repair can help in some moments, though it does not reliably bring desire back for you",
      },
      {
        option: "4 = Mixed / depends",
        explanation: "emotional repair helps in some situations, but not consistently",
      },
      {
        option: "5 = Slightly true",
        explanation: "a good repair conversation often helps desire return at least somewhat",
      },
      {
        option: "6 = Mostly true",
        explanation:
          "when repair happens well, desire usually increases or becomes more accessible for you",
      },
      {
        option: "7 = Very true",
        explanation: "when emotional repair happens well, desire often returns or rises noticeably",
      },
    ],
    hoverStates: {
      "1": "Not at all true",
      "2": "Mostly not true",
      "3": "Slightly not true",
      "4": "Mixed / depends",
      "5": "Slightly true",
      "6": "Mostly true",
      "7": "Very true",
    },
    formatGuidance: "Select how true this statement is for you.",
  },
  {
    qId: "08006",
    cId: 8,
    chapter: "Attachment Style & Emotional Safety",
    question:
      "When I feel pressure (to perform, talk, or escalate), I shut down or want to withdraw.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Pressure can be obvious or subtle. Answer from what reliably happens in your system when you feel pushed, rushed, or expected to stay open.",
    supportAndGuidance:
      "Pressure can be obvious or subtle. Answer from what reliably happens in your system when you feel pushed, rushed, or expected to stay open.",
    scaleLabels: { low: "Not at all true", high: "Very true" },
    comment:
      "High-weight indicator of pressure sensitivity, which strongly affects pacing, safety, and the kinds of recommendations that are likely to be useful.",
    howAnswerIsUsed:
      "High-weight indicator of pressure sensitivity, which strongly affects pacing, safety, and the kinds of recommendations that are likely to be useful.",
    answerOptionsExplained: [
      {
        option: "1 = Not at all true",
        explanation: "pressure does not usually make you shut down, withdraw, or lose openness",
      },
      {
        option: "2 = Mostly not true",
        explanation:
          "some pressure may be unpleasant, but it usually does not cause a strong shutdown response",
      },
      {
        option: "3 = Slightly not true",
        explanation:
          "pressure affects you at times, though it does not usually lead to major withdrawal",
      },
      {
        option: "4 = Mixed / depends",
        explanation: "some forms of pressure affect you, but not always strongly or consistently",
      },
      {
        option: "5 = Slightly true",
        explanation: "pressure often reduces your openness and can start to make you pull back",
      },
      {
        option: "6 = Mostly true",
        explanation:
          "pressure fairly often makes your body or mind close down, withdraw, or lose desire",
      },
      {
        option: "7 = Very true",
        explanation:
          "pressure reliably makes your body or mind close down, pull back, or lose openness",
      },
    ],
    hoverStates: {
      "1": "Not at all true",
      "2": "Mostly not true",
      "3": "Slightly not true",
      "4": "Mixed / depends",
      "5": "Slightly true",
      "6": "Mostly true",
      "7": "Very true",
    },
    formatGuidance: "Select how true this statement is for you.",
  },
  {
    qId: "08012",
    cId: 8,
    chapter: "Attachment Style & Emotional Safety",
    question:
      "I tend to lose sexual interest when another person becomes too emotionally dependent on me.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Answer from what usually happens when a partner’s dependence starts to feel like pressure or too much responsibility, not from what you think should happen.",
    supportAndGuidance:
      "Answer from what usually happens when a partner’s dependence starts to feel like pressure or too much responsibility, not from what you think should happen.",
    scaleLabels: { low: "Not at all true", high: "Very true" },
    comment:
      "We use this to tell whether too much emotional dependence or neediness tends to cool desire for you.",
    howAnswerIsUsed:
      "We use this to tell whether too much emotional dependence or neediness tends to cool desire for you.",
    answerOptionsExplained: [
      {
        option: "1 = Not at all true",
        explanation:
          "a partner’s increased emotional dependence does not usually reduce your attraction or desire",
      },
      {
        option: "2 = Mostly not true",
        explanation:
          "emotional dependence may feel challenging sometimes, but it does not usually cool your erotic interest",
      },
      {
        option: "3 = Slightly not true",
        explanation:
          "too much dependence can affect attraction occasionally, though it is not a strong pattern for you",
      },
      {
        option: "4 = Mixed / depends",
        explanation:
          "in some situations, too much dependence can cool desire, but not consistently",
      },
      {
        option: "5 = Slightly true",
        explanation:
          "when a partner becomes more emotionally dependent, your attraction can start to drop in noticeable ways",
      },
      {
        option: "6 = Mostly true",
        explanation:
          "emotional overdependence fairly often reduces your erotic interest or sense of attraction",
      },
      {
        option: "7 = Very true",
        explanation:
          "when a partner becomes too emotionally dependent, your attraction or erotic interest often drops noticeably",
      },
    ],
    hoverStates: {
      "1": "Not at all true",
      "2": "Mostly not true",
      "3": "Slightly not true",
      "4": "Mixed / depends",
      "5": "Slightly true",
      "6": "Mostly true",
      "7": "Very true",
    },
    formatGuidance: "Select how true this statement is for you.",
  },
  {
    qId: "09013",
    cId: 9,
    chapter: "Relational Patterns & Boundaries",
    question:
      "I sometimes use flirtation or sex to influence the relationship dynamic or get my needs met.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Think about recognizable patterns under stress in close relationships. If this has become a stable way you manage closeness or tension now, include it. If it feels unique to this relationship, answer closer to your broader pattern.",
    supportAndGuidance:
      "Think about recognizable patterns under stress in close relationships. If this has become a stable way you manage closeness or tension now, include it. If it feels unique to this relationship, answer closer to your broader pattern.",
    scaleLabels: { low: "Not at all true", high: "Very true" },
    comment:
      "We use this carefully to tell apart ordinary flirtation from a more strategic or influence-based dynamic, so we do not over-read it.",
    howAnswerIsUsed:
      "We use this carefully to tell apart ordinary flirtation from a more strategic or influence-based dynamic, so we do not over-read it.",
    answerOptionsExplained: [
      {
        option: "1 = Not at all true",
        explanation:
          "flirtation or sex is rarely used by you to influence the relationship dynamic or get needs met indirectly",
      },
      {
        option: "2 = Mostly not true",
        explanation:
          "this may happen once in a while, but it is not usually part of how you navigate the relationship",
      },
      {
        option: "3 = Slightly not true",
        explanation:
          "under stress or in certain situations, you might do this a little, though it is not a strong pattern",
      },
      {
        option: "4 = Mixed / depends",
        explanation:
          "this may happen in certain situations, especially under stress, but it is not a dominant pattern",
      },
      {
        option: "5 = Slightly true",
        explanation:
          "you sometimes use flirtation or sexuality to shape the dynamic, gain reassurance, or get needs met",
      },
      {
        option: "6 = Mostly true",
        explanation:
          "using flirtation or sexuality to influence the dynamic or secure something relational is a fairly common pattern for you",
      },
      {
        option: "7 = Very true",
        explanation:
          "using flirtation or sexuality to shape the dynamic, secure closeness, or steer the relationship is a recurring pattern for you",
      },
    ],
    hoverStates: {
      "1": "Not at all true",
      "2": "Mostly not true",
      "3": "Slightly not true",
      "4": "Mixed / depends",
      "5": "Slightly true",
      "6": "Mostly true",
      "7": "Very true",
    },
    formatGuidance: "Select how true this statement is for you.",
  },
  {
    qId: "10002",
    cId: 10,
    chapter: "Communication Style",
    question: "During sex, how do you most naturally communicate what you want?",
    answerType: "multiple",
    options: [
      "Touch and body cues",
      "Brief direct words",
      "Ongoing verbal feedback",
      "Emotional check-ins",
      "Mostly nonverbal cues",
      "I communicate very little",
    ],
    required: true,
    guide:
      "You may have more than one natural style. Focus on what tends to happen most easily when you are relatively relaxed and in the moment.",
    supportAndGuidance:
      "You may have more than one natural style. Focus on what tends to happen most easily when you are relatively relaxed and in the moment.",
    comment:
      "This tells us whether your communication style is more quiet, embodied, concise, expressive, or emotionally transparent.",
    howAnswerIsUsed:
      "This tells us whether your communication style is more quiet, embodied, concise, expressive, or emotionally transparent.",
    answerOptionsExplained: [
      { option: "Touch and body cues", explanation: "I signal mainly through touch or movement" },
      { option: "Brief direct words", explanation: "I use short, clear verbal cues" },
      {
        option: "Ongoing verbal feedback",
        explanation: "I keep communicating throughout the experience",
      },
      { option: "Emotional check-ins", explanation: "I check connection, safety, or reassurance" },
      {
        option: "Mostly nonverbal cues",
        explanation:
          "I communicate mainly through touch, movement, tone, or response rather than words",
      },
      {
        option: "I communicate very little",
        explanation: "I say or signal very little in real time",
      },
    ],
    formatGuidance: "Select up to 3 options.",
    maxSelections: 3,
  },
  {
    qId: "10003",
    cId: 10,
    chapter: "Communication Style",
    question: "I’m comfortable expressing what turns me on.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Think about real situations, not just private thoughts. This is about whether you can share what turns you on without strong shame, fear, or inhibition.",
    supportAndGuidance:
      "Think about real situations, not just private thoughts. This is about whether you can share what turns you on without strong shame, fear, or inhibition.",
    scaleLabels: { low: "Not at all true", high: "Very true" },
    comment:
      "This shows how easily you can name and voice what turns you on, which changes the communication style we recommend.",
    howAnswerIsUsed:
      "This shows how easily you can name and voice what turns you on, which changes the communication style we recommend.",
    answerOptionsExplained: [
      {
        option: "1 = Not true at all",
        explanation:
          "expressing what turns you on feels difficult, vulnerable, or highly inhibited",
      },
      {
        option: "2 = Mostly not true",
        explanation:
          "you can sometimes sense what you want, but saying it out loud often feels awkward, exposed, or hard",
      },
      {
        option: "3 = Slightly not true",
        explanation:
          "you can express some desires, though it still takes effort and often comes with hesitation",
      },
      {
        option: "4 = Mixed / depends",
        explanation:
          "you can express some desires in certain situations, but not always with ease or consistency",
      },
      {
        option: "5 = Slightly true",
        explanation:
          "you can often communicate what turns you on, even if some inhibition or self-consciousness remains",
      },
      {
        option: "6 = Mostly true",
        explanation:
          "you are usually able to name, signal, or communicate what turns you on with relatively little hesitation",
      },
      {
        option: "7 = Very true",
        explanation:
          "you can usually name, signal, or communicate what turns you on with relative ease and low shame",
      },
    ],
    hoverStates: {
      "1": "Not at all true",
      "2": "Mostly not true",
      "3": "Slightly not true",
      "4": "Mixed / depends",
      "5": "Slightly true",
      "6": "Mostly true",
      "7": "Very true",
    },
    formatGuidance: "Select how true this statement is for you.",
  },
  {
    qId: "10004",
    cId: 10,
    chapter: "Communication Style",
    question: "I’m comfortable expressing what I don’t want.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Think about in-the-moment situations. This is about how easily you can slow, stop, redirect, or name a limit when something does not feel right.",
    supportAndGuidance:
      "Think about in-the-moment situations. This is about how easily you can slow, stop, redirect, or name a limit when something does not feel right.",
    scaleLabels: { low: "Not at all true", high: "Very true" },
    comment:
      "This shows how easily you can protect your boundaries in sexual moments, which helps us avoid advice that assumes over-accommodating is fine.",
    howAnswerIsUsed:
      "This shows how easily you can protect your boundaries in sexual moments, which helps us avoid advice that assumes over-accommodating is fine.",
    answerOptionsExplained: [
      {
        option: "1 = Not comfortable at all",
        explanation:
          "expressing limits or saying no feels very difficult, especially in the moment",
      },
      {
        option: "2 = Mostly not true",
        explanation:
          "you may know your limits internally, but voicing them clearly often feels hard, risky, or guilt-provoking",
      },
      {
        option: "3 = Slightly not true",
        explanation:
          "you can sometimes name boundaries, though it still takes effort or comes with noticeable hesitation",
      },
      {
        option: "4 = Mixed / depends",
        explanation:
          "you can express limits in some situations, but not always clearly, easily, or consistently",
      },
      {
        option: "5 = Slightly true",
        explanation:
          "you can often communicate what you do not want, even if some discomfort or self-consciousness remains",
      },
      {
        option: "6 = Mostly true",
        explanation:
          "you are usually able to name limits and protect your boundaries with relatively little hesitation",
      },
      {
        option: "7 = Very true",
        explanation:
          "you can usually express what you do not want clearly and protect your boundaries without major shutdown or guilt",
      },
    ],
    hoverStates: {
      "1": "Not at all true",
      "2": "Mostly not true",
      "3": "Slightly not true",
      "4": "Mixed / depends",
      "5": "Slightly true",
      "6": "Mostly true",
      "7": "Very true",
    },
    formatGuidance: "Select how true this statement is for you.",
  },
  {
    qId: "10005",
    cId: 10,
    chapter: "Communication Style",
    question: "If the other person is quiet or neutral during sex, my arousal drops.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Answer from your nervous system response. Does low feedback make you lose momentum, confidence, or erotic engagement?",
    supportAndGuidance:
      "Answer from your nervous system response. Does low feedback make you lose momentum, confidence, or erotic engagement?",
    scaleLabels: { low: "Not at all true", high: "Very true" },
    comment:
      "This is one of the strongest clues for whether your arousal depends on visible feedback, enthusiasm, and feeling responded to.",
    howAnswerIsUsed:
      "This is one of the strongest clues for whether your arousal depends on visible feedback, enthusiasm, and feeling responded to.",
    answerOptionsExplained: [
      {
        option: "1 = Not at all true",
        explanation:
          "your arousal does not depend much on visible feedback or expressiveness from the other person",
      },
      {
        option: "2 = Mostly not true",
        explanation:
          "a quiet or neutral counterpart may register a little, but it usually does not lower your arousal much",
      },
      {
        option: "3 = Slightly not true",
        explanation:
          "feedback matters somewhat, though you can usually stay engaged even if the other person is hard to read",
      },
      {
        option: "4 = Mixed / depends",
        explanation:
          "a quiet or neutral counterpart can affect your arousal in some situations, but not always strongly",
      },
      {
        option: "5 = Slightly true",
        explanation:
          "whenthe other person is hard to read, your arousal often drops at least somewhat",
      },
      {
        option: "6 = Mostly true",
        explanation:
          "visible feedback is usually important for your arousal, and neutrality often reduces your engagement",
      },
      {
        option: "7 = Very true",
        explanation: "when the other person is hard to read, your arousal often drops noticeably",
      },
    ],
    hoverStates: {
      "1": "Not at all true",
      "2": "Mostly not true",
      "3": "Slightly not true",
      "4": "Mixed / depends",
      "5": "Slightly true",
      "6": "Mostly true",
      "7": "Very true",
    },
    formatGuidance: "Select how true this statement is for you.",
  },
  {
    qId: "11001",
    cId: 11,
    chapter: "Partner-Related Needs",
    question: "Which power dynamic most naturally activates desire for you?",
    answerType: "single",
    options: [
      "Lead / direct",
      "Surrender / be led",
      "Switch",
      "Egalitarian / no roles",
      "Not sure / depends",
    ],
    required: true,
    guide:
      "Focus on the dynamic that feels most natural and energizing in your body. This is about what activates desire, not what sounds right in theory.",
    supportAndGuidance:
      "Focus on the dynamic that feels most natural and energizing in your body. This is about what activates desire, not what sounds right in theory.",
    comment:
      "This gives us a direct clue about whether your energy tends toward leading, surrendering, switching, or staying mostly role-light.",
    howAnswerIsUsed:
      "This gives us a direct clue about whether your energy tends toward leading, surrendering, switching, or staying mostly role-light.",
    answerOptionsExplained: [
      {
        option: "Lead / direct",
        explanation: "you naturally enjoy guiding pace, structure, intensity, or direction",
      },
      {
        option: "Surrender / be led",
        explanation:
          "you feel most alive when receiving, following, or allowing another person to steer",
      },
      {
        option: "Switch",
        explanation:
          "you enjoy moving between leading and following depending on mood, context, or who is involved",
      },
      {
        option: "Egalitarian / no roles",
        explanation: "you prefer a more mutual dynamic without clear directional roles",
      },
      {
        option: "Not sure / depends",
        explanation: "no single pattern feels dominant or consistent across situations",
      },
    ],
    formatGuidance: "Select one option.",
  },
  {
    qId: "11002",
    cId: 11,
    chapter: "Partner-Related Needs",
    question: "I enjoy clear structure, protocol, or rules in sexual dynamics.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Structure can be light or explicit. Answer from whether clear expectations, roles, or agreed rules tend to make sex feel easier, safer, or hotter.",
    supportAndGuidance:
      "Structure can be light or explicit. Answer from whether clear expectations, roles, or agreed rules tend to make sex feel easier, safer, or hotter.",
    scaleLabels: { low: "Not at all true", high: "Very true" },
    comment:
      "We use this to tell whether rules, roles, and explicit agreements make sex feel freer for you rather than restrictive.",
    howAnswerIsUsed:
      "We use this to tell whether rules, roles, and explicit agreements make sex feel freer for you rather than restrictive.",
    answerOptionsExplained: [
      {
        option: "1 = Not at all true",
        explanation:
          "structure, protocols, or explicit rules usually feel unnecessary or restrictive for you",
      },
      {
        option: "2 = Mostly not true",
        explanation:
          "some clarity may help occasionally, but formal structure is usually not part of what makes sex work for you",
      },
      {
        option: "3 = Slightly not true",
        explanation:
          "you can appreciate a little structure in some contexts, though you generally do not rely on it much",
      },
      {
        option: "4 = Mixed / depends",
        explanation:
          "some degree of structure can help, depending on context, mood, or partner dynamic",
      },
      {
        option: "5 = Slightly true",
        explanation:
          "clear roles, agreements, or structure often improve the experience, even if you do not always need them",
      },
      {
        option: "6 = Mostly true",
        explanation:
          "clear rules, roles, or agreed structure usually make sex feel easier, safer, or more erotically alive for you",
      },
      {
        option: "7 = Very true",
        explanation:
          "clear rules, roles, or agreed structure often make sex feel more open, safe, or erotically alive for you",
      },
    ],
    hoverStates: {
      "1": "Not at all true",
      "2": "Mostly not true",
      "3": "Slightly not true",
      "4": "Mixed / depends",
      "5": "Slightly true",
      "6": "Mostly true",
      "7": "Very true",
    },
    formatGuidance: "Select how true this statement is for you.",
  },
  {
    qId: "11003",
    cId: 11,
    chapter: "Partner-Related Needs",
    question: "In sex, my attention naturally goes more toward who I’m with than toward myself.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Answer from your current sexual baseline. Think about where your attention tends to go most naturally during sex, not where you think it should go.",
    supportAndGuidance:
      "Answer from your current sexual baseline. Think about where your attention tends to go most naturally during sex, not where you think it should go.",
    scaleLabels: { low: "Not at all true", high: "Very true" },
    comment:
      "This helps us distinguish giving-focused, balanced, and receiving-or-guided dynamics in the way you naturally relate during sex.",
    howAnswerIsUsed:
      "This helps us distinguish giving-focused, balanced, and receiving-or-guided dynamics in the way you naturally relate during sex.",
    answerOptionsExplained: [
      {
        option: "1 = Not at all true",
        explanation:
          "my attention is usually much more on my own experience than the other person’s",
      },
      {
        option: "2 = Mostly not true",
        explanation: "my attention tends to stay more on my own experience than the other person’s",
      },
      {
        option: "3 = Slightly not true",
        explanation: "my attention is somewhat more on my own experience than the other person’s",
      },
      {
        option: "4 = Mixed / depends",
        explanation:
          "my attention feels fairly balanced, or it depends on the context or who I'm with",
      },
      {
        option: "5 = Slightly true",
        explanation:
          "my attention tends to go somewhat more toward the other person’s experience than toward my own",
      },
      {
        option: "6 = Mostly true",
        explanation:
          "my attention usually goes more toward the other person’s experience than toward my own",
      },
      {
        option: "7 = Very true",
        explanation:
          "my attention strongly and naturally goes more toward the other person’s experience than toward my own",
      },
    ],
    hoverStates: {
      "1": "Not at all true",
      "2": "Mostly not true",
      "3": "Slightly not true",
      "4": "Mixed / depends",
      "5": "Slightly true",
      "6": "Mostly true",
      "7": "Very true",
    },
    formatGuidance: "Select how true this statement is for you.",
  },
  {
    qId: "11004",
    cId: 11,
    chapter: "Partner-Related Needs",
    question:
      "When my the other person feels emotionally vulnerable or unsettled, soothing or reassuring them can deepen my sexual connection.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "This can include insecurity, anxiety, shame, or overwhelm—not just checking if the person is enjoying sex.",
    supportAndGuidance:
      "This can include insecurity, anxiety, shame, or overwhelm—not just checking if the person is enjoying sex.",
    scaleLabels: { low: "Not true at all", high: "Very true" },
    comment:
      "This is a very strong clue for whether caregiving and emotional soothing are part of what makes sex feel connecting for you.",
    howAnswerIsUsed:
      "This is a very strong clue for whether caregiving and emotional soothing are part of what makes sex feel connecting for you.",
    answerOptionsExplained: [
      {
        option: "1 = Not true at all",
        explanation: "This does not deepen connection and may pull you out of desire",
      },
      {
        option: "2 = Mostly not true",
        explanation: "You care, but soothing them usually does not increase sexual connection",
      },
      {
        option: "3 = Slightly not true",
        explanation: "It may help occasionally, but it is not usually connecting for you",
      },
      {
        option: "4 = Mixed / depends",
        explanation: "It depends on who I'm with, situation, intensity, or timing",
      },
      {
        option: "5 = Slightly true",
        explanation: "It can add some warmth or closeness, but is not central",
      },
      {
        option: "6 = Mostly true",
        explanation: "Reassuring or grounding them often deepens your sexual connection",
      },
      {
        option: "7 = Very true",
        explanation:
          "Helping them feel emotionally safe strongly increases intimacy and connection",
      },
    ],
    hoverStates: {
      "1": "Not true at all",
      "2": "Mostly not true",
      "3": "Slightly not true",
      "4": "Mixed / depends",
      "5": "Slightly true",
      "6": "Mostly true",
      "7": "Very true",
    },
    formatGuidance: "Select how true this statement is for you.",
  },
  {
    qId: "14020",
    cId: 14,
    chapter: "Identity & Conditioning",
    question: "What most reliably motivates you to want sex?",
    answerType: "multiple",
    options: [
      "Bonding and closeness",
      "Pleasure and play",
      "Novelty and discovery",
      "Intensity and edge",
      "Feeling desired",
      "Power and polarity",
      "Meaning and devotion",
      "Comfort and familiarity",
      "Giving and service",
      "Healing and soothing",
      "Escape and relief",
    ],
    required: true,
    guide:
      "Several motives may fit. Focus on the recurring drivers that bring your desire online most reliably, not every reason sex can matter.",
    supportAndGuidance:
      "Several motives may fit. Focus on the recurring drivers that bring your desire online most reliably, not every reason sex can matter.",
    comment:
      "This is one of the most important direct questions in the assessment because it tells us what actually pulls desire online for you: bonding, play, novelty, power, meaning, repair, comfort, intensity, escape, or service.",
    howAnswerIsUsed:
      "This is one of the most important direct questions in the assessment because it tells us what actually pulls desire online for you: bonding, play, novelty, power, meaning, repair, comfort, intensity, escape, or service.",
    answerOptionsExplained: [
      { option: "Bonding and closeness", explanation: "Feeling emotionally close opens desire" },
      {
        option: "Pleasure and play",
        explanation: "Sex feels appealing when it promises fun and enjoyment",
      },
      {
        option: "Novelty and discovery",
        explanation: "Newness and exploration make things come alive",
      },
      {
        option: "Intensity and edge",
        explanation: "Strong charge, tension, or edge makes it feel compelling",
      },
      { option: "Feeling desired", explanation: "Being wanted or chosen turns something on" },
      {
        option: "Power and polarity",
        explanation: "Clear directional energy or roles create the spark",
      },
      {
        option: "Meaning and devotion",
        explanation: "It matters more when it feels deep, purposeful, or sacred",
      },
      {
        option: "Comfort and familiarity",
        explanation: "Ease, safety, and what is known make room for desire",
      },
      {
        option: "Giving and service",
        explanation: "Pleasing or caring for the other person is a key part of the pull",
      },
      {
        option: "Healing and soothing",
        explanation: "It feels valuable when it comforts, regulates, or restores",
      },
      {
        option: "Escape and relief",
        explanation: "It offers a break from pressure, stress, or mental overload",
      },
    ],
    formatGuidance: "Select up to 3 options.",
    maxSelections: 3,
  },
  {
    qId: "14021",
    cId: 14,
    chapter: "Identity & Conditioning",
    question: "I seek intense sex to escape numbness, stress or to feel something.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Answer from your current sexual baseline. If intensity has become a stable way you move through stress, numbness, or disconnection in recent years, let that count. If it is specific to this dynamic, lean toward your broader pattern.",
    supportAndGuidance:
      "Answer from your current sexual baseline. If intensity has become a stable way you move through stress, numbness, or disconnection in recent years, let that count. If it is specific to this dynamic, lean toward your broader pattern.",
    scaleLabels: { low: "Not true at all", high: "Very true" },
    comment:
      "This does not define who you are sexually. We use it to notice when sex may be functioning more as stress relief or escape, so the recommendations stay supportive.",
    howAnswerIsUsed:
      "This does not define who you are sexually. We use it to notice when sex may be functioning more as stress relief or escape, so the recommendations stay supportive.",
    answerOptionsExplained: [
      {
        option: "1 = Not true at all",
        explanation:
          "intense sex is not usually something you seek to regulate stress, numbness, or disconnection",
      },
      {
        option: "2 = Mostly not true",
        explanation:
          "intensity may appeal for other reasons sometimes, but it is usually not about escaping numbness or stress",
      },
      {
        option: "3 = Slightly not true",
        explanation:
          "under certain conditions intensity might serve that function a little, though it is not a strong pattern",
      },
      {
        option: "4 = Mixed / depends",
        explanation:
          "under certain conditions, intensity can serve that role for you, but it is not a major pattern",
      },
      {
        option: "5 = Slightly true",
        explanation:
          "when stressed, numb, or disconnected, you sometimes seek stronger sexual intensity to shift your state",
      },
      {
        option: "6 = Mostly true",
        explanation:
          "intense sex fairly often functions as a way to feel more alive or move out of stress, numbness, or disconnection",
      },
      {
        option: "7 = Very true",
        explanation:
          "when stressed, numb, or disconnected, you often seek stronger sexual intensity to shift your state or feel more alive",
      },
    ],
    hoverStates: {
      "1": "Not true at all",
      "2": "Mostly not true",
      "3": "Slightly not true",
      "4": "Mixed / depends",
      "5": "Slightly true",
      "6": "Mostly true",
      "7": "Very true",
    },
    formatGuidance: "Select how true this statement is for you.",
  },
  {
    qId: "15001",
    cId: 15,
    chapter: "Background & Lifestyle",
    question: "Which country do you live in?",
    answerType: "country",
    options: [],
    required: true,
    guide: "This gives us practical context for language, norms, and support relevance.",
    supportAndGuidance:
      "This gives us practical context for language, norms, and support relevance.",
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
    guide:
      "Enter the postal code of your main residence. This is used only as broad regional context, not precise tracking.",
    supportAndGuidance:
      "Enter the postal code of your main residence. This is used only as broad regional context, not precise tracking.",
    inputType: "text",
    placeholder: "11000; 94110; SW1A 1AA",
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
    guide: "This helps us add life-stage context without reducing you to a number.",
    supportAndGuidance: "This helps us add life-stage context without reducing you to a number.",
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
    question: "What relationship structure are you currently in?",
    answerType: "single",
    options: [
      "Single",
      "Monogamous",
      "Monogamish",
      "Open",
      "Polyamorous",
      "Solo-poly",
      "Fluid / Undefined",
    ],
    required: true,
    guide:
      "Your situation does not need to fit perfectly into a label; closeness to your current reality matters more than precision.",
    supportAndGuidance:
      "Your situation does not need to fit perfectly into a label; closeness to your current reality matters more than precision.",
    comment:
      "This changes which scripts and advice make sense for you—single, monogamous, open, poly, or another structure.",
    howAnswerIsUsed:
      "This changes which scripts and advice make sense for you—single, monogamous, open, poly, or another structure.",
    answerOptionsExplained: [
      {
        option: "Single",
        explanation: "you are not currently in a committed romantic or sexual structure",
      },
      {
        option: "Monogamous",
        explanation: "you and your partner agree to be romantically and sexually exclusive",
      },
      {
        option: "Monogamish",
        explanation:
          "the relationship is mostly exclusive but allows limited exceptions under agreed conditions",
      },
      {
        option: "Open",
        explanation:
          "the relationship is non-exclusive with agreed boundaries around outside connection",
      },
      {
        option: "Polyamorous",
        explanation:
          "multiple romantic and/or committed relationships are possible with everyone’s knowledge and consent",
      },
      {
        option: "Solo-poly",
        explanation:
          "a polyamorous style that prioritizes autonomy and usually does not center household or life-merging",
      },
      {
        option: "Fluid / Undefined",
        explanation:
          "your relationship structure is evolving, unlabeled, or does not fit neatly into one category",
      },
    ],
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
      "If you have children of different ages, answer based on your youngest. This helps us estimate caregiving load, time, energy, and privacy.",
    supportAndGuidance:
      "If you have children of different ages, answer based on your youngest. This helps us estimate caregiving load, time, energy, and privacy.",
    comment:
      "This helps us factor in time, fatigue, and caregiving load so suggestions feel realistic in daily life.",
    howAnswerIsUsed:
      "This helps us factor in time, fatigue, and caregiving load so suggestions feel realistic in daily life.",
    answerOptionsExplained: [
      { option: "No", explanation: "you do not currently have children" },
      {
        option: "Yes, youngest is 0–3",
        explanation:
          "your youngest child is in early years, often associated with high physical caregiving load",
      },
      {
        option: "Yes, youngest is 4–10",
        explanation: "your youngest child is in the younger school-age stage",
      },
      { option: "Yes, youngest is 11–17", explanation: "your youngest child is in adolescence" },
      {
        option: "Yes, children are 18+ and live with me",
        explanation: "you have adult children who still share your home",
      },
      {
        option: "Yes, children are 18+ and do not live with me",
        explanation: "you have adult children living independently",
      },
      { option: "Prefer not to answer", explanation: "you would rather keep this private" },
    ],
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
      "Think about your usual baseline, not just this week. Stress often shapes desire, patience, arousal, and emotional bandwidth more than people realize.",
    supportAndGuidance:
      "Think about your usual baseline, not just this week. Stress often shapes desire, patience, arousal, and emotional bandwidth more than people realize.",
    comment:
      "We use this to avoid recommending high-effort or novelty-heavy steps when your bandwidth is already low.",
    howAnswerIsUsed:
      "We use this to avoid recommending high-effort or novelty-heavy steps when your bandwidth is already low.",
    answerOptionsExplained: [
      {
        option: "Very low",
        explanation: "you usually feel calm, resourced, and not heavily burdened",
      },
      { option: "Low", explanation: "some stress is present, but it generally feels manageable" },
      {
        option: "Medium",
        explanation:
          "stress is a regular part of life and meaningfully affects your system at times",
      },
      {
        option: "High",
        explanation:
          "stress often feels strong and shapes your energy, attention, or emotional availability",
      },
      {
        option: "Very high",
        explanation:
          "your nervous system is carrying a heavy and persistent stress load most of the time",
      },
    ],
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
      "Answer from how you usually feel on waking, before coffee or routine shifts the picture. We’re looking for your typical baseline.",
    supportAndGuidance:
      "Answer from how you usually feel on waking, before coffee or routine shifts the picture. We’re looking for your typical baseline.",
    comment: "This helps us judge whether low energy, not low desire, may be part of the picture.",
    howAnswerIsUsed:
      "This helps us judge whether low energy, not low desire, may be part of the picture.",
    answerOptionsExplained: [
      {
        option: "Very rested",
        explanation: "you usually wake up feeling physically and mentally restored",
      },
      {
        option: "Rather rested",
        explanation: "you often wake up in decent shape, even if not fully recharged",
      },
      {
        option: "In between",
        explanation: "mornings are mixed and your restedness is inconsistent",
      },
      { option: "Rather tired", explanation: "you often wake up already low on energy" },
      {
        option: "Very tired",
        explanation: "waking up depleted is a common part of your daily baseline",
      },
    ],
    formatGuidance: "Select one option.",
  },
  {
    qId: "15008",
    cId: 15,
    chapter: "Background & Lifestyle",
    question:
      "Do you live with any long-term physical or mental health conditions that affect your energy, mood or everyday functioning?",
    answerType: "single",
    options: [
      "No",
      "Yes, mainly physical health",
      "Yes, mainly mental health",
      "Yes, both physical and mental health",
      "I’m not sure",
      "Prefer not to answer",
    ],
    required: true,
    guide:
      "This refers to ongoing conditions that meaningfully affect daily life, not brief rough patches. You do not need to share diagnoses here.",
    supportAndGuidance:
      "This refers to ongoing conditions that meaningfully affect daily life, not brief rough patches. You do not need to share diagnoses here.",
    comment:
      "We use this to pace the report more gently when health, energy, or mood are affecting sexuality.",
    howAnswerIsUsed:
      "We use this to pace the report more gently when health, energy, or mood are affecting sexuality.",
    answerOptionsExplained: [
      {
        option: "No",
        explanation:
          "no long-term condition currently stands out as meaningfully affecting daily functioning",
      },
      {
        option: "Yes, mainly physical health",
        explanation: "the main ongoing challenge is physical",
      },
      {
        option: "Yes, mainly mental health",
        explanation: "the main ongoing challenge is emotional, psychological, or psychiatric",
      },
      {
        option: "Yes, both physical and mental health",
        explanation: "both play a meaningful role in your life",
      },
      { option: "I’m not sure", explanation: "the picture feels mixed or hard to classify" },
      { option: "Prefer not to answer", explanation: "you would rather keep this private" },
    ],
    formatGuidance: "Select one option.",
  },
  {
    qId: "15009",
    cId: 15,
    chapter: "Background & Lifestyle",
    question:
      "Are you currently taking any medication or hormones that you feel might influence your energy, mood or sexual drive (for example antidepressants, hormonal contraception, testosterone, etc.)?",
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
      "This is about what you notice in your own life, not only what a medication or hormone is supposed to do.",
    supportAndGuidance:
      "This is about what you notice in your own life, not only what a medication or hormone is supposed to do.",
    comment:
      "This helps us separate your personal pattern from possible medication or hormone effects and make the advice more realistic.",
    howAnswerIsUsed:
      "This helps us separate your personal pattern from possible medication or hormone effects and make the advice more realistic.",
    answerOptionsExplained: [
      {
        option: "No",
        explanation:
          "you are not currently taking anything you believe affects your energy, mood, or sexual drive",
      },
      {
        option: "Yes, lowers my drive",
        explanation: "you believe it tends to reduce desire, arousal, or related energy",
      },
      {
        option: "Yes, increases my drive",
        explanation: "you believe it tends to increase desire, arousal, or related energy",
      },
      {
        option: "Yes, not sure how it affects me",
        explanation: "you take something that may matter, but the effect is unclear to you",
      },
      { option: "Prefer not to answer", explanation: "you would rather not share this" },
    ],
    formatGuidance: "Select one option.",
  },
  {
    qId: "15010",
    cId: 15,
    chapter: "Background & Lifestyle",
    question: "What is your gender identity?",
    answerType: "single",
    options: ["Woman", "Man", "Nonbinary", "Other", "I’d rather not label this"],
    required: true,
    guide: "This helps us keep language respectful and more relevant to you.",
    supportAndGuidance: "This helps us keep language respectful and more relevant to you.",
    comment: "We use this to make the language and examples in your report fit you better.",
    howAnswerIsUsed: "We use this to make the language and examples in your report fit you better.",
    answerOptionsExplained: [
      { option: "Woman", explanation: "you identify as a woman" },
      { option: "Man", explanation: "you identify as a man" },
      { option: "Nonbinary", explanation: "your gender identity is not exclusively woman or man" },
      { option: "Other", explanation: "another identity fits you better" },
      {
        option: "I’d rather not label this",
        explanation: "you prefer not to define your gender identity through a set label here",
      },
    ],
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
      "I don’t use a label",
    ],
    required: true,
    guide:
      "This reflects how you currently understand your pattern of attraction; it does not need to feel final or perfect.",
    supportAndGuidance:
      "This reflects how you currently understand your pattern of attraction; it does not need to feel final or perfect.",
    comment:
      "We use this to avoid assumptions and make the language and examples more relevant to your context.",
    howAnswerIsUsed:
      "We use this to avoid assumptions and make the language and examples more relevant to your context.",
    answerOptionsExplained: [
      { option: "Heterosexual", explanation: "primarily attracted to a different gender" },
      { option: "Homosexual", explanation: "primarily attracted to the same gender" },
      {
        option: "Bisexual",
        explanation:
          "attracted to more than one gender, often including both same and different genders",
      },
      {
        option: "Pansexual",
        explanation: "attraction is not limited by gender and may be experienced across genders",
      },
      {
        option: "Queer",
        explanation: "a broader identity that does not fit neatly into traditional labels",
      },
      { option: "Questioning / exploring", explanation: "you are still figuring it out" },
      { option: "Other", explanation: "another label fits your experience better" },
      {
        option: "I don’t use a label",
        explanation: "you prefer not to define your orientation through a fixed term",
      },
    ],
    formatGuidance: "Select one option.",
  },
  {
    qId: "16001",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question: "Which changes would meaningfully improve your sex life over the next 3 months?",
    answerType: "multiple",
    options: [
      "Wanting sex more often (desire)",
      "More pleasure or orgasm",
      "Less pain or physical discomfort",
      "Feeling more connected & close",
      "Communicating more clearly",
      "More excitement & novelty",
      "Feeling more confident in my body",
      "Improving connection to my own sexuality",
      "Healing past hurt or blocks",
      "Being more aligned with someone I’m involved with",
      "Something else",
    ],
    required: true,
    guide:
      "Think about what would make the biggest positive difference over the next 3 months. Focus on what feels genuinely relevant now.",
    supportAndGuidance:
      "Think about what would make the biggest positive difference over the next 3 months. Focus on what feels genuinely relevant now.",
    comment:
      "This sets the main focus of your next-step suggestions, so the report starts with what matters most to you now.",
    howAnswerIsUsed:
      "This sets the main focus of your next-step suggestions, so the report starts with what matters most to you now.",
    answerOptionsExplained: [
      {
        option: "Wanting sex more often (desire)",
        explanation:
          "wanting sex more often or getting turned on more easily would make the biggest difference right now",
      },
      {
        option: "More pleasure or orgasm",
        explanation:
          "greater enjoyment, responsiveness, or orgasm access feels like the main lever for improvement",
      },
      {
        option: "Less pain or physical discomfort",
        explanation:
          "reducing pain, discomfort, or body-level barriers would improve your sexual life most",
      },
      {
        option: "Feeling more connected & close",
        explanation:
          "more emotional safety, closeness, and openness would make the biggest difference",
      },
      {
        option: "Communicating more clearly",
        explanation:
          "clearer expression of needs, boundaries, and desires would improve things most",
      },
      {
        option: "More excitement & novelty",
        explanation: "more aliveness, freshness, playfulness, or erotic energy feels most needed",
      },
      {
        option: "Feeling more confident in my body",
        explanation:
          "feeling more at ease in your body and sexual self would make the biggest difference",
      },
      {
        option: "Improving connection to my own sexuality",
        explanation: "feeling more in touch with my own desire, pleasure, and sexual aliveness",
      },
      {
        option: "Healing past hurt or blocks",
        explanation:
          "shame, fear, grief, hurt, or unresolved emotional blocks need attention first",
      },
      {
        option: "Being more aligned with someone I’m involved with",
        explanation:
          "mismatch in desire, timing, expectations, roles, or relational rhythm feels like the main issue",
      },
      {
        option: "Something else",
        explanation:
          "your most important lever for change is something different from the options listed here",
      },
    ],
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
      "Answer from your real priorities in this season of life, not from what you think you should care about.",
    supportAndGuidance:
      "Answer from your real priorities in this season of life, not from what you think you should care about.",
    scaleLabels: { low: "Not true at all", high: "Very true" },
    comment:
      "This tells us whether to make your recommendations more immediate and action-oriented or more exploratory and grounded.",
    howAnswerIsUsed:
      "This tells us whether to make your recommendations more immediate and action-oriented or more exploratory and grounded.",
    answerOptionsExplained: [
      {
        option: "1 = Not true at all",
        explanation: "this is not a priority right now, and other parts of life clearly come first",
      },
      {
        option: "2 = Mostly not true",
        explanation: "this matters a little, but it is still low on your list of priorities",
      },
      {
        option: "3 = Slightly not true",
        explanation: "this has some relevance for you, though it is not yet a strong focus",
      },
      {
        option: "4 = Mixed / depends",
        explanation: "this matters, but it is one priority among several rather than the main one",
      },
      {
        option: "5 = Slightly true",
        explanation:
          "this feels meaningfully worth your attention and is becoming a clear area to work on",
      },
      {
        option: "6 = Mostly true",
        explanation:
          "this feels like a strong current priority and something you genuinely want to address",
      },
      {
        option: "7 = Very true",
        explanation: "this feels urgent, central, or highly important to focus on now",
      },
    ],
    hoverStates: {
      "1": "Not true at all",
      "2": "Mostly not true",
      "3": "Slightly not true",
      "4": "Mixed / depends",
      "5": "Slightly true",
      "6": "Mostly true",
      "7": "Very true",
    },
    formatGuidance: "Select how true this statement is for you.",
  },
  {
    qId: "16003",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question: "Meaningful change in my sexuality feels possible for me in the next 3–6 months.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Think about your real schedule, energy, support, and relationship context. This is about what feels possible in actual life, not only in theory.",
    supportAndGuidance:
      "Think about your real schedule, energy, support, and relationship context. This is about what feels possible in actual life, not only in theory.",
    scaleLabels: { low: "Not true at all", high: "Very true" },
    comment:
      "This helps us decide whether to emphasize momentum-building, confidence-building, or a slower, steadier path.",
    howAnswerIsUsed:
      "This helps us decide whether to emphasize momentum-building, confidence-building, or a slower, steadier path.",
    answerOptionsExplained: [
      {
        option: "1 = Not true at all",
        explanation: "meaningful change currently feels unlikely, blocked, or hard to imagine",
      },
      {
        option: "2 = Mostly not true",
        explanation:
          "change feels technically possible, but it is difficult to picture it happening in your current circumstances",
      },
      {
        option: "3 = Slightly not true",
        explanation:
          "some progress seems conceivable, though it still feels uncertain, limited, or hard to trust",
      },
      {
        option: "4 = Mixed / depends",
        explanation:
          "some movement feels realistic, but there are still clear uncertainties or obstacles",
      },
      {
        option: "5 = Slightly true",
        explanation:
          "change feels reasonably within reach if the right effort, support, or conditions come together",
      },
      {
        option: "6 = Mostly true",
        explanation: "meaningful change feels realistic and achievable in your current life",
      },
      {
        option: "7 = Very true",
        explanation: "progress feels believable, reachable, and workable in your current life",
      },
    ],
    hoverStates: {
      "1": "Not true at all",
      "2": "Mostly not true",
      "3": "Slightly not true",
      "4": "Mixed / depends",
      "5": "Slightly true",
      "6": "Mostly true",
      "7": "Very true",
    },
    formatGuidance: "Select how true this statement is for you.",
  },
  {
    qId: "16004",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question:
      "If you had a clear plan that felt like a good fit, when would you realistically start?",
    answerType: "single",
    options: [
      "Within 7 days",
      "Within 30 days",
      "1–3 months",
      "3–6 months",
      "6–12 months",
      "Later than 12 months",
      "Not sure yet",
    ],
    required: true,
    guide:
      "Assume the plan is clear and genuinely fits you. Then answer from your real timing, not your fantasy self with more time and energy.",
    supportAndGuidance:
      "Assume the plan is clear and genuinely fits you. Then answer from your real timing, not your fantasy self with more time and energy.",
    comment: "We use this to match recommendations to your real timing, not an ideal timeline.",
    howAnswerIsUsed:
      "We use this to match recommendations to your real timing, not an ideal timeline.",
    answerOptionsExplained: [
      { option: "Within 7 days", explanation: "you would likely begin almost immediately" },
      { option: "Within 30 days", explanation: "you would likely start soon, but not right away" },
      { option: "1–3 months", explanation: "change feels relevant, but not yet immediate" },
      {
        option: "3–6 months",
        explanation: "this matters, though it is more of a medium-term step",
      },
      { option: "6–12 months", explanation: "action feels more distant for now" },
      {
        option: "Later than 12 months",
        explanation: "this is not something you see yourself beginning soon",
      },
      { option: "Not sure yet", explanation: "your timing feels unclear or undecided" },
    ],
    formatGuidance: "Select one option.",
  },
  {
    qId: "16005",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question:
      "When you reflect on your current sexuality and pleasure, which description feels most true for you?",
    answerType: "single",
    options: [
      "Recharging / Pausing",
      "Repairing / Reconnecting",
      "Awakening / Exploring",
      "Expanding / Experimenting",
      "Grounded / Integrated",
      "Evolving / Transcending",
    ],
    required: true,
    guide:
      "Think of this as your current season, not a fixed identity. Focus on the phase that feels closest to your baseline over the past 4–8 weeks.",
    supportAndGuidance:
      "Think of this as your current season, not a fixed identity. Focus on the phase that feels closest to your baseline over the past 4–8 weeks.",
    comment:
      "This helps us locate the season you are in now—paused, repairing, awakening, expanding, grounded, or evolving—so the report meets you where you are.",
    howAnswerIsUsed:
      "This helps us locate the season you are in now—paused, repairing, awakening, expanding, grounded, or evolving—so the report meets you where you are.",
    answerOptionsExplained: [
      {
        option: "Recharging / Pausing",
        explanation:
          "Sex or desire feels quieter right now, and rest, space, or lower pressure matters most",
      },
      {
        option: "Repairing / Reconnecting",
        explanation:
          "You are rebuilding safety, trust, closeness, or openness after stress, hurt, shame, or disconnection",
      },
      {
        option: "Awakening / Exploring",
        explanation:
          "You are beginning to feel more curiosity, aliveness, or interest in what you like and want",
      },
      {
        option: "Expanding / Experimenting",
        explanation:
          "You feel ready for more play, novelty, confidence, communication, or erotic range",
      },
      {
        option: "Grounded / Integrated",
        explanation:
          "Sexuality feels relatively steady, natural, and integrated into your life or relationship",
      },
      {
        option: "Evolving / Transcending",
        explanation:
          "Sexuality feels connected to deeper intimacy, meaning, growth, creativity, or spirituality",
      },
    ],
    formatGuidance: "Select one option.",
  },
  {
    qId: "16006",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question: "Where would you like your sexuality to be in 3–6 months?",
    answerType: "single",
    options: [
      "Recharging / Pausing",
      "Repairing / Reconnecting",
      "Awakening / Exploring",
      "Expanding / Experimenting",
      "Grounded / Integrated",
      "Evolving / Transcending",
    ],
    required: true,
    guide:
      "Several may appeal, but pick the direction that would make the biggest positive difference for you right now.",
    supportAndGuidance:
      "Several may appeal, but pick the direction that would make the biggest positive difference for you right now.",
    comment:
      "This shows the direction you want to grow, so recommendations aim toward your desired phase instead of only describing the present.",
    howAnswerIsUsed:
      "This shows the direction you want to grow, so recommendations aim toward your desired phase instead of only describing the present.",
    answerOptionsExplained: [
      {
        option: "Recharging / Pausing",
        explanation:
          "I want less pressure around sex, with more rest, space, ease, or permission to slow down",
      },
      {
        option: "Repairing / Reconnecting",
        explanation:
          "I want to rebuild trust, safety, closeness, or openness after stress, hurt, shame, distance, or disconnection",
      },
      {
        option: "Awakening / Exploring",
        explanation:
          "I want to feel more curious, alive, and in touch with what I like, want, or might enjoy",
      },
      {
        option: "Expanding / Experimenting",
        explanation: "I want more play, novelty, confidence, communication, or erotic range",
      },
      {
        option: "Grounded / Integrated",
        explanation:
          "I want sexuality to feel steadier, more natural, and more consistently part of my life or relationship",
      },
      {
        option: "Evolving / Transcending",
        explanation:
          "I want sexuality to feel deeper, more meaningful, more intimate, or connected to growth, devotion, creativity, or spirituality",
      },
    ],
    formatGuidance: "Select one option.",
  },
  {
    qId: "16007",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question:
      "When you want to improve something important in your life (health, relationships, confidence), what do you usually do first?",
    answerType: "single",
    options: [
      "Research on my own",
      "Structured tool/app/journal",
      "Program/course",
      "Professional support",
      "Act only when urgent",
    ],
    required: true,
    guide:
      "Think of real moments of change in your life and focus on the first step that genuinely gets you moving.",
    supportAndGuidance:
      "Think of real moments of change in your life and focus on the first step that genuinely gets you moving.",
    comment:
      "This helps us decide whether your recommendations should feel more self-directed, relational, structured, or guided.",
    howAnswerIsUsed:
      "This helps us decide whether your recommendations should feel more self-directed, relational, structured, or guided.",
    answerOptionsExplained: [
      {
        option: "Research on my own",
        explanation:
          "you usually begin by reading, watching, listening, or exploring free resources independently",
      },
      {
        option: "Structured tool/app/journal",
        explanation:
          "guided prompts, frameworks, trackers, or self-led systems help you get started",
      },
      {
        option: "Program/course",
        explanation: "you prefer a more defined path with steps, progression, or curriculum",
      },
      {
        option: "Professional support",
        explanation:
          "working with a coach, therapist, mentor, or expert is your most natural first move",
      },
      {
        option: "Act only when urgent",
        explanation:
          "you tend to delay action until the issue becomes pressing enough that it cannot be ignored",
      },
    ],
    formatGuidance: "Select one option.",
  },
  {
    qId: "16008",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question: "What kind of support would feel most helpful for your top focus?",
    answerType: "multiple",
    options: [
      "Self-guided tools",
      "Short structured program",
      "Live group experience",
      "Partner-inclusive guidance",
      "1:1 professional support",
      "Not sure yet",
    ],
    required: true,
    guide:
      "Focus on the kinds of support that would make your next step feel easier in real life, not just what sounds impressive.",
    supportAndGuidance:
      "Focus on the kinds of support that would make your next step feel easier in real life, not just what sounds impressive.",
    comment:
      "This shapes the format of your recommendations—more practical, reflective, structured, or supportive.",
    howAnswerIsUsed:
      "This shapes the format of your recommendations—more practical, reflective, structured, or supportive.",
    answerOptionsExplained: [
      {
        option: "Self-guided tools",
        explanation: "worksheets, prompts, reflections, or practices you can do independently",
      },
      {
        option: "Short structured program",
        explanation: "a guided sequence over a few weeks helps you move forward",
      },
      {
        option: "Live group experience",
        explanation: "workshops, circles, or group support feel appealing or useful",
      },
      {
        option: "Partner-inclusive guidance",
        explanation: "support that includes your partner would be most helpful",
      },
      {
        option: "1:1 professional support",
        explanation: "individualized help from a trained professional would fit best",
      },
      {
        option: "Not sure yet",
        explanation: "you are open, but not yet clear on what format would serve you best",
      },
    ],
    formatGuidance: "Select all that apply.",
  },
  {
    qId: "16011",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question: "Which support formats are already part of your life?",
    answerType: "multiple",
    options: [
      "Therapy, coaching, or counseling",
      "Books or long-form reading",
      "Apps for wellbeing or self-regulation",
      "Digital content subscriptions",
      "Courses, programs, or memberships",
      "None of these",
    ],
    required: true,
    guide:
      "This helps us recommend next steps that feel familiar and realistic in your life right now.",
    supportAndGuidance:
      "This helps us recommend next steps that feel familiar and realistic in your life right now.",
    comment:
      "This helps us understand the kinds of support tools and formats you already engage with.",
    howAnswerIsUsed:
      "This helps us understand the kinds of support tools and formats you already engage with.",
    answerOptionsExplained: [
      {
        option: "Therapy, coaching, or counseling",
        explanation:
          "You regularly use paid 1:1 or guided support such as therapy, coaching, or mentoring",
      },
      {
        option: "Books or long-form reading",
        explanation:
          "You regularly use books or similar long-form content for learning, reflection, or personal growth",
      },
      {
        option: "Apps for wellbeing or self-regulation",
        explanation:
          "You use apps for mindfulness, meditation, sleep, breathwork, or nervous system support",
      },
      {
        option: "Digital content subscriptions",
        explanation:
          "You regularly use paid subscriptions for content such as music, video, podcasts, or lifestyle platforms",
      },
      {
        option: "Courses, programs, or memberships",
        explanation:
          "You use structured programs, online courses, or paid communities for learning or growth",
      },
      {
        option: "None of these",
        explanation: "None of these are a regular part of your life right now",
      },
    ],
    formatGuidance: "Select all that apply.",
  },
  {
    qId: "16012",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question:
      "About how much do you typically invest per year in personal growth (books, courses, therapy/coaching, apps)?",
    answerType: "single",
    options: ["€0", "€1–99", "€100–299", "€300–699", "€700–1,499", "€1,500+"],
    required: true,
    guide:
      "A rough estimate is enough. Include both one-off and recurring spending on things like books, therapy, courses, apps, coaching, or memberships.",
    supportAndGuidance:
      "A rough estimate is enough. Include both one-off and recurring spending on things like books, therapy, courses, apps, coaching, or memberships.",
    comment:
      "This gives a rough sense of the level of depth and commitment that may feel realistic in your next-step suggestions.",
    howAnswerIsUsed:
      "This gives a rough sense of the level of depth and commitment that may feel realistic in your next-step suggestions.",
    answerOptionsExplained: [
      {
        option: "€0",
        explanation:
          "you currently spend little or nothing on paid personal-growth resources.\n\n€1-99 = you make occasional smaller investments when something feels useful or timely.\n\n€100-299 = you are willing to invest at a modest but real level over time.\n\n€300-699 = personal growth is important enough that you invest in it fairly consistently.\n\n€700-1,499 = you are willing to make a substantial yearly investment in your growth.\n\n€1,500+ = personal growth is something you are willing to invest in seriously and at a high level",
      },
    ],
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
      "Answer from the bigger picture of your life. For some people sexuality is central; for others it matters, but is not the main focus right now.",
    supportAndGuidance:
      "Answer from the bigger picture of your life. For some people sexuality is central; for others it matters, but is not the main focus right now.",
    scaleLabels: { low: "Not true at all", high: "Very true" },
    comment:
      "This helps us decide how central this topic should be in your recommendations and how much depth to give it.",
    howAnswerIsUsed:
      "This helps us decide how central this topic should be in your recommendations and how much depth to give it.",
    answerOptionsExplained: [
      {
        option: "1 = Not true at all",
        explanation: "understanding your sexuality does not feel central to your life right now",
      },
      {
        option: "2 = Mostly not true",
        explanation: "this matters a little, but it is not a major life priority for you",
      },
      {
        option: "4 = Mixed / depends",
        explanation: "it matters, but it is one meaningful area among several in your life",
      },
      {
        option: "5 = Slightly true",
        explanation:
          "understanding your sexuality feels meaningfully relevant to your wellbeing, relationships, or growth",
      },
      {
        option: "6 = Mostly true",
        explanation:
          "this feels like a strong area of importance for your life and self-understanding",
      },
      {
        option: "7 = Very true",
        explanation:
          "understanding your sexuality feels deeply important to your life, wellbeing, or growth",
      },
    ],
    hoverStates: {
      "1": "Not true at all",
      "2": "Mostly not true",
      "3": "Slightly not true",
      "4": "Mixed / depends",
      "5": "Slightly true",
      "6": "Mostly true",
      "7": "Very true",
    },
    formatGuidance: "Select how true this statement is for you.",
  },
  {
    qId: "16014",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question: "What most gets in the way of improving your sexuality?",
    answerType: "multiple",
    options: [
      "I’m not sure what would actually help",
      "I don’t have enough time or energy",
      "Someone I’m involved with isn’t aligned or engaged",
      "It doesn’t feel emotionally safe yet",
      "Shame, pressure, or self-judgment get in the way",
      "Physical pain or body-related issues",
      "Support feels too expensive or hard to access",
      "I struggle to stay consistent over time",
      "Nothing major is in the way right now",
      "Something else",
    ],
    required: true,
    guide:
      "Think about what is truly blocking movement right now, not just what sounds important in theory.",
    supportAndGuidance:
      "Think about what is truly blocking movement right now, not just what sounds important in theory.",
    comment:
      "This tells us which obstacles to prioritize first so the report focuses on what is actually blocking progress.",
    howAnswerIsUsed:
      "This tells us which obstacles to prioritize first so the report focuses on what is actually blocking progress.",
    answerOptionsExplained: [
      {
        option: "I’m not sure what would actually help",
        explanation: "the path forward feels unclear, even if the need for change feels real",
      },
      {
        option: "I don’t have enough time or energy",
        explanation: "life load leaves too little bandwidth for focus, repair, or experimentation",
      },
      {
        option: "Someone I’m involved with isn’t aligned or engaged",
        explanation:
          "your partner does not feel available, willing, or on the same page enough for meaningful progress",
      },
      {
        option: "It doesn’t feel emotionally safe yet",
        explanation: "trust, softness, openness, or felt safety are not strong enough yet",
      },
      {
        option: "Shame, pressure, or self-judgment get in the way",
        explanation: "inner criticism, embarrassment, fear, or pressure are major blockers",
      },
      {
        option: "Physical pain or body-related issues",
        explanation:
          "discomfort, health factors, or body-level obstacles are significantly in the way",
      },
      {
        option: "Support feels too expensive or hard to access",
        explanation: "useful help feels financially out of reach, unavailable, or hard to find",
      },
      {
        option: "I struggle to stay consistent over time",
        explanation: "starting is easier than sustaining effort, attention, or follow-through",
      },
      {
        option: "Nothing major is in the way right now",
        explanation: "no significant obstacle currently seems to be blocking improvement",
      },
      {
        option: "Something else",
        explanation: "another meaningful blocker matters more than the options listed here",
      },
    ],
    formatGuidance: "Select all that apply.",
  },
];

export const chapterIntros: ChapterIntro[] = [
  {
    cId: 2,
    chapter: "Spontaneous Desire VS Responsive Desire",
    text: "Desire can appear before stimulation (spontaneous) or build after affectionate/erotic cues (responsive), like touch or fantasy. Both are common and healthy.",
  },
  {
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    text: "An arousal style is the mix of cues and conditions that move you toward or away from arousal. It’s not a diagnosis; it shifts with context, and consent sets the boundary for what actually happens.",
  },
  {
    cId: 8,
    chapter: "Attachment Style & Emotional Safety",
    text: "How we bond shapes how safe our body feels in sex. When closeness, distance, and repair work for us, desire can unfold instead of going into defense.",
  },
  {
    cId: 10,
    chapter: "Communication Style",
    text: "Great sex is easier when we can name what we like and hear each other clearly. Communication is a skill, not a personality trait, and tiny scripts help.",
  },
  {
    cId: 15,
    chapter: "Background & Lifestyle",
    text: "This section covers basic background information and daily habits. These details help us understand how lifestyle factors shape wellbeing and how you prefer to learn/grow.",
  },
  {
    cId: 16,
    chapter: "Next Steps & Preferences",
    text: "These final questions help tailor your next-step suggestions and how we present them.",
  },
];
