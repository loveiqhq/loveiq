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
      "Please use an email address you can access easily, because this is where we will send your report and any important follow-up related to your results. A private email is often the best choice if you want to keep this experience separate from work or shared accounts. This question is purely practical, so just enter the address you want LoveIQ to use for delivery and communication.",
    supportAndGuidance:
      "Please use an email address you can access easily, because this is where we will send your report and any important follow-up related to your results. A private email is often the best choice if you want to keep this experience separate from work or shared accounts. This question is purely practical, so just enter the address you want LoveIQ to use for delivery and communication.",
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
      "Enter the name you would like us to use when addressing you in your report. This can be your name, a nickname, initials, or any label that feels comfortable and personal enough for you. The goal is simply to make the report feel more human and readable.",
    supportAndGuidance:
      "Enter the name you would like us to use when addressing you in your report. This can be your name, a nickname, initials, or any label that feels comfortable and personal enough for you. The goal is simply to make the report feel more human and readable.",
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
    question: "Overall, how satisfied are you with your sex life right now?",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Think about your overall experience during the past 4–8 weeks rather than one especially good or difficult moment. Include both the quality and frequency of your sexual life, but also how aligned it feels with what you actually want right now. If you are currently not sexually active, answer based on how satisfied you feel with that reality overall, not based on what you think “should” be happening.",
    supportAndGuidance:
      "Think about your overall experience during the past 4–8 weeks rather than one especially good or difficult moment. Include both the quality and frequency of your sexual life, but also how aligned it feels with what you actually want right now. If you are currently not sexually active, answer based on how satisfied you feel with that reality overall, not based on what you think “should” be happening.",
    scaleLabels: { low: "Very dissatisfied", high: "Very satisfied" },
    comment:
      "Provides baseline context for interpreting your report. This does not directly define your archetype.",
    howAnswerIsUsed:
      "Provides baseline context for interpreting your report. This does not directly define your archetype.",
    answerOptionsExplained: [
      {
        option: "1 = Very dissatisfied",
        explanation:
          "your current sexual life feels clearly unfulfilling, frustrating, painful, absent, or far from what you want",
      },
      {
        option: "2 = Fairly dissatisfied",
        explanation:
          "more of your current experience feels lacking than fulfilling, and dissatisfaction is a noticeable part of your reality",
      },
      {
        option: "3 = Slightly dissatisfied",
        explanation:
          "some parts may work, but there is enough frustration, inconsistency, or disappointment to pull your overall satisfaction down",
      },
      {
        option: "4 = Mixed / neutral",
        explanation:
          "some parts feel okay or satisfying, while others feel lacking, unclear, inconsistent, or only partly fulfilling",
      },
      {
        option: "5 = Slightly satisfied",
        explanation:
          "your sexual life feels more satisfying than not, even if some frustrations, gaps, or unmet needs remain",
      },
      {
        option: "6 = Fairly satisfied",
        explanation:
          "most of your sexual life feels good, aligned, and meaningfully fulfilling, with only limited dissatisfaction",
      },
      {
        option: "7 = Very satisfied",
        explanation:
          "your current sexual life feels deeply fulfilling, aligned, and broadly good for you overall",
      },
    ],
    hoverStates: {
      "1": "Very dissatisfied",
      "2": "Fairly dissatisfied",
      "3": "Slightly dissatisfied",
      "4": "Mixed / neutral",
      "5": "Slightly satisfied",
      "6": "Fairly satisfied",
      "7": "Very satisfied",
    },
    formatGuidance: "Select one value from 1–7.",
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
      "Present but often deprioritized",
      "Currently not a focus for me",
      "Unsure / still figuring it out",
    ],
    required: true,
    guide:
      "Choose the option that best reflects your current lived reality, not your ideal explanation or what sounds most flattering. If more than one partly fits, select the one that feels most central to your sexuality right now. This question is about your present season, not a permanent identity.",
    supportAndGuidance:
      "Choose the option that best reflects your current lived reality, not your ideal explanation or what sounds most flattering. If more than one partly fits, select the one that feels most central to your sexuality right now. This question is about your present season, not a permanent identity.",
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
        option: "Present but often deprioritized",
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
    question: "I often crave more novelty/variety in my sexual experiences.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Answer from your usual pattern rather than rare spikes of curiosity or boredom. Novelty can mean new activities, fantasies, pacing, settings, roles, energy, emotional tone, or simply changing familiar routines. If you feel the pull toward “something different” regularly, even without acting on it, that still counts.",
    supportAndGuidance:
      "Answer from your usual pattern rather than rare spikes of curiosity or boredom. Novelty can mean new activities, fantasies, pacing, settings, roles, energy, emotional tone, or simply changing familiar routines. If you feel the pull toward “something different” regularly, even without acting on it, that still counts.",
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
    formatGuidance: "Select one value from 1–7.",
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
      "Answer based on your typical experience in recent months, not just one isolated event. Include any sexual activity you engage in, not only penetration. If discomfort happens only in certain situations, such as dryness, tension, anxiety, positions, toys, timing, or specific forms of touch, still include that in your answer if it meaningfully shapes your sexual experience.",
    supportAndGuidance:
      "Answer based on your typical experience in recent months, not just one isolated event. Include any sexual activity you engage in, not only penetration. If discomfort happens only in certain situations, such as dryness, tension, anxiety, positions, toys, timing, or specific forms of touch, still include that in your answer if it meaningfully shapes your sexual experience.",
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
    formatGuidance: "Select one value from 1–7.",
  },
  {
    qId: "02001",
    cId: 2,
    chapter: "Spontaneous Desire VS Responsive Desire",
    question: "Which is most true for you?",
    answerType: "single",
    options: [
      "Spontaneous",
      "Responsive",
      "Planned window",
      "Varies by partner/context",
      "Desire has been low lately",
    ],
    required: true,
    guide:
      "Choose the option that best matches how desire usually begins for you in real life. If your pattern changes by partner, stress, relationship phase, or life season, answer from your most typical recent baseline. No option needs to fit perfectly; choose the one that captures the strongest overall pattern.",
    supportAndGuidance:
      "Choose the option that best matches how desire usually begins for you in real life. If your pattern changes by partner, stress, relationship phase, or life season, answer from your most typical recent baseline. No option needs to fit perfectly; choose the one that captures the strongest overall pattern.",
    comment:
      "Helps identify your primary desire activation pattern, which is important for archetype scoring and recommendation logic.",
    howAnswerIsUsed:
      "Helps identify your primary desire activation pattern, which is important for archetype scoring and recommendation logic.",
    answerOptionsExplained: [
      {
        option: "Spontaneous",
        explanation:
          "desire often appears internally before touch, initiation, or strong erotic cues",
      },
      {
        option: "Responsive",
        explanation:
          "desire usually grows after affection, erotic cues, or the right relational or physical conditions are already present",
      },
      {
        option: "Planned window",
        explanation:
          "desire tends to come more easily when intimacy has protected time, space, and lower pressure",
      },
      {
        option: "Varies by partner/context",
        explanation:
          "your desire pattern depends strongly on who you are with or the situation you are in",
      },
      {
        option: "Desire has been low lately",
        explanation:
          "your current desire feels meaningfully lower than your own usual baseline, regardless of style",
      },
    ],
    formatGuidance: "Select one option.",
  },
  {
    qId: "02002",
    cId: 2,
    chapter: "Spontaneous Desire VS Responsive Desire",
    question:
      "I usually don’t feel sexual desire until someone shows me affection or starts something intimate.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Think about your general pattern across situations, not one specific partner or one unusual day. Affectionate or erotic cues can include cuddling, kissing, softness, emotional closeness, flirtation, fantasy, romantic atmosphere, or sexual touch. This question is about how desire often begins, not whether you are capable of feeling desire at all.",
    supportAndGuidance:
      "Think about your general pattern across situations, not one specific partner or one unusual day. Affectionate or erotic cues can include cuddling, kissing, softness, emotional closeness, flirtation, fantasy, romantic atmosphere, or sexual touch. This question is about how desire often begins, not whether you are capable of feeling desire at all.",
    scaleLabels: { low: "Not at all true", high: "Very true" },
    comment:
      "A strong indicator of whether desire tends to be responsive rather than internally self-starting.",
    howAnswerIsUsed:
      "A strong indicator of whether desire tends to be responsive rather than internally self-starting.",
    answerOptionsExplained: [
      {
        option: "1 = Not at all true",
        explanation:
          "desire usually appears on its own, before someone else initiates or before affectionate cues are needed",
      },
      {
        option: "2 = Mostly not true",
        explanation:
          "affection or initiation can help sometimes, but desire often begins internally without much prompting",
      },
      {
        option: "3 = Slightly not true",
        explanation:
          "desire can be helped by affection, though it still often appears without needing much activation from someone else",
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
    formatGuidance: "Select one value from 1–7.",
  },
  {
    qId: "02003",
    cId: 2,
    chapter: "Spontaneous Desire VS Responsive Desire",
    question: "I enjoy intimacy more when it’s planned rather than spontaneous.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Focus on what actually leads to better intimacy for you, not what sounds most romantic in theory. Planned can mean a clearly scheduled time or simply an agreed, protected window where intimacy has space to unfold. If planning reduces pressure, helps your body relax, or gives desire time to build, let that shape your answer.",
    supportAndGuidance:
      "Focus on what actually leads to better intimacy for you, not what sounds most romantic in theory. Planned can mean a clearly scheduled time or simply an agreed, protected window where intimacy has space to unfold. If planning reduces pressure, helps your body relax, or gives desire time to build, let that shape your answer.",
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
          "planned intimacy often helps your enjoyment, even if spontaneity can still work sometimes",
      },
      {
        option: "6 = Mostly true",
        explanation:
          "planned intimacy usually feels easier, safer, or more successful for you than spontaneous intimacy",
      },
      {
        option: "7 = Very true",
        explanation:
          "planned intimacy usually feels easier, safer, more enjoyable, or more successful than spontaneous intimacy",
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
    formatGuidance: "Select one value from 1–7.",
  },
  {
    qId: "02004",
    cId: 2,
    chapter: "Spontaneous Desire VS Responsive Desire",
    question: "What kind of initiation tends to work best for you?",
    answerType: "single",
    options: [
      "I initiate",
      "My partner initiates",
      "We make space for it intentionally",
      "It unfolds naturally and either of us may begin",
    ],
    required: true,
    guide:
      "Choose the scenario that most often leads to your best sexual experience: relaxed, wanted, open, and connected. This is not about fairness, ideals, or who “should” initiate more. If multiple options fit, pick the one with the highest success rate in helping desire unfold well.",
    supportAndGuidance:
      "Choose the scenario that most often leads to your best sexual experience: relaxed, wanted, open, and connected. This is not about fairness, ideals, or who “should” initiate more. If multiple options fit, pick the one with the highest success rate in helping desire unfold well.",
    comment:
      "Helps distinguish self-starting, partner-led, mutual, and planned initiation patterns.",
    howAnswerIsUsed:
      "Helps distinguish self-starting, partner-led, mutual, and planned initiation patterns.",
    answerOptionsExplained: [
      {
        option: "I initiate",
        explanation: "initiation feels best when desire begins inside you and you open the door",
      },
      {
        option: "My partner initiates",
        explanation:
          "you often warm up best when someone else initiates and helps activate the moment",
      },
      {
        option: "We make space for it intentionally",
        explanation:
          "initiation works best when intimacy happens in an intentional time container rather than out of nowhere",
      },
      {
        option: "It unfolds naturally and either of us may begin",
        explanation: "the best initiation feels mutual, relaxed, light, and not overly structured",
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
      "Choose the setting that feels most naturally supportive, comfortable, or arousing for you when things are going well. If your preference varies, choose the one that most often helps your body and mind open. This is about your erotic environment, not about what you think is most socially acceptable.",
    supportAndGuidance:
      "Choose the setting that feels most naturally supportive, comfortable, or arousing for you when things are going well. If your preference varies, choose the one that most often helps your body and mind open. This is about your erotic environment, not about what you think is most socially acceptable.",
    comment:
      "Helps identify whether privacy, ritual, spontaneity, adventure, or edge is part of your arousal style.",
    howAnswerIsUsed:
      "Helps identify whether privacy, ritual, spontaneity, adventure, or edge is part of your arousal style.",
    answerOptionsExplained: [
      {
        option: "Private and protected",
        explanation:
          "a contained, safe, low-interruption setting helps you relax and turn toward intimacy",
      },
      {
        option: "Novel or adventurous",
        explanation:
          "different places, exploratory atmospheres, or a sense of discovery add energy for you",
      },
      {
        option: "Deliberate or ritualized",
        explanation:
          "familiar setup, repeated cues, sequence, or mood help your system settle into arousal",
      },
      {
        option: "Spontaneous or unplanned",
        explanation:
          "what feels most alive is something naturally arising in the moment without much setup",
      },
      {
        option: "Edge, taboo, or transgression",
        explanation:
          "taboo-flavored or boundary-testing context adds excitement, always within consent and safety",
      },
      {
        option: "Visible or semi-public",
        explanation:
          "near-exposure, being almost noticed, or risk-of-being-seen context adds excitement",
      },
      {
        option: "Something else",
        explanation:
          "your strongest preferred setting is more specific or does not fit these categories well",
      },
    ],
    formatGuidance: "Select all that apply.",
  },
  {
    qId: "03004",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: "How essential is emotional connection for your sexual desire?",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Emotional connection here means feeling safe, cared for, understood, and emotionally open with a partner. Answer based on how necessary that state is for genuine desire to emerge, not only for physical arousal to be possible. This is about the role of connection in your wanting, enjoyment, and deeper sexual openness.",
    supportAndGuidance:
      "Emotional connection here means feeling safe, cared for, understood, and emotionally open with a partner. Answer based on how necessary that state is for genuine desire to emerge, not only for physical arousal to be possible. This is about the role of connection in your wanting, enjoyment, and deeper sexual openness.",
    scaleLabels: { low: "Not important at all", high: "Essential" },
    comment:
      "Helps determine whether emotional closeness is optional, supportive, or close to a prerequisite for desire.",
    howAnswerIsUsed:
      "Helps determine whether emotional closeness is optional, supportive, or close to a prerequisite for desire.",
    answerOptionsExplained: [
      {
        option: "1 = Not important at all",
        explanation: "emotional closeness is not a major requirement for desire to show up for you",
      },
      {
        option: "2 = Slightly important",
        explanation:
          "connection can help a little, but desire usually does not depend much on emotional closeness",
      },
      {
        option: "3 = A little important",
        explanation:
          "emotional connection matters somewhat, though desire can still emerge without much of it",
      },
      {
        option: "4 = Moderately important",
        explanation:
          "connection often helps desire, but it is not always required for you to feel engaged",
      },
      {
        option: "5 = Quite important",
        explanation:
          "desire usually works better when you feel emotionally connected to the other person",
      },
      {
        option: "6 = Very important",
        explanation:
          "emotional closeness strongly supports your ability to access, sustain, or enjoy desire",
      },
      {
        option: "7 = Essential",
        explanation:
          "without emotional closeness, desire is often hard to access, sustain, or enjoy fully",
      },
    ],
    hoverStates: {
      "1": "Not important at all",
      "2": "Slightly important",
      "3": "A little important",
      "4": "Moderately important",
      "5": "Quite important",
      "6": "Very important",
      "7": "Essential",
    },
    formatGuidance: "Select one value from 1–7.",
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
      "Choose the option that feels like the clearest and most reliable starting point for your turn-on. This is about what most often moves your system from neutral into erotic openness, not every factor that matters. If several fit, choose the one that tends to switch things on first or most reliably.",
    supportAndGuidance:
      "Choose the option that feels like the clearest and most reliable starting point for your turn-on. This is about what most often moves your system from neutral into erotic openness, not every factor that matters. If several fit, choose the one that tends to switch things on first or most reliably.",
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
      "Choose the option that best reflects how you naturally like to learn, grow, or discover what works sexually. This is about your real learning style, not what sounds most evolved or intelligent. If you dislike turning sexuality into a project, that matters too.",
    supportAndGuidance:
      "Choose the option that best reflects how you naturally like to learn, grow, or discover what works sexually. This is about your real learning style, not what sounds most evolved or intelligent. If you dislike turning sexuality into a project, that matters too.",
    comment:
      "Helps distinguish guided, analytical, and intuitive approaches to sexual growth and exploration.",
    howAnswerIsUsed:
      "Helps distinguish guided, analytical, and intuitive approaches to sexual growth and exploration.",
    answerOptionsExplained: [
      {
        option: "Structure and feedback",
        explanation:
          "you learn best with structure, examples, language, and feedback that help you know what to try or refine",
      },
      {
        option: "Curiosity and experimentation",
        explanation:
          "experimentation helps you most; you prefer discovering through real experience, iteration, and noticing what actually works",
      },
      {
        option: "Natural flow and spontaneity",
        explanation:
          "you learn best when sexuality feels organic, embodied, and relational rather than heavily analyzed or turned into a project",
      },
      {
        option: "I prefer not to make it a deliberate process",
        explanation:
          "you prefer not to turn sexuality into a project; it should happen naturally without deliberate effort",
      },
    ],
    formatGuidance: "Select one option.",
  },
  {
    qId: "03008",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: "I usually want sex to feel more...",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Think about the overall energy or emotional temperature you most enjoy sexually. Answer based on your preferred erotic tone across your real life, not one specific mood or one specific partner. This is about what your system most often wants to move toward.",
    supportAndGuidance:
      "Think about the overall energy or emotional temperature you most enjoy sexually. Answer based on your preferred erotic tone across your real life, not one specific mood or one specific partner. This is about what your system most often wants to move toward.",
    scaleLabels: { low: "Very soft", high: "Very intense" },
    comment: "Helps position your erotic style on a calm-to-intense spectrum.",
    howAnswerIsUsed: "Helps position your erotic style on a calm-to-intense spectrum.",
    answerOptionsExplained: [
      {
        option: "1 = Very soft",
        explanation: "you tend to prefer slower, safer, softer, or more grounded sexual energy",
      },
      {
        option: "2 = Soft",
        explanation:
          "you usually lean toward gentle, low-pressure, tender, or calming sexual energy rather than strong intensity",
      },
      {
        option: "3 = Soft-leaning",
        explanation:
          "you can enjoy some activation, but overall you still prefer sexuality to stay more soft than intense",
      },
      {
        option: "4 = Balanced",
        explanation:
          "you enjoy a mix of softness and intensity, depending on context, mood, or partner dynamic",
      },
      {
        option: "5 = Intense-leaning",
        explanation:
          "you often prefer more charge, edge, or activation, even if some softness still matters",
      },
      {
        option: "6 = Intense",
        explanation: "you are usually drawn to stronger, faster, or more charged erotic energy",
      },
      {
        option: "7 = Very intense",
        explanation:
          "you tend to prefer stronger energy, more activation, or a higher-voltage erotic tone",
      },
    ],
    hoverStates: {
      "1": "Very soft",
      "2": "Soft",
      "3": "Soft-leaning",
      "4": "Balanced",
      "5": "Intense-leaning",
      "6": "Intense",
      "7": "Very intense",
    },
    formatGuidance: "Select one value from 1–7.",
  },
  {
    qId: "03009",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: "Tension, pursuit, or being ‘hard to get’ reliably turns me on.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Think about whether desire tends to grow through distance, teasing, anticipation, uncertainty, pursuit, or the energy of wanting and being wanted. Answer for what reliably works, not for occasional curiosity or fantasy that rarely matters in real life. This question is about erotic charge, not about unhealthy relationship dynamics.",
    supportAndGuidance:
      "Think about whether desire tends to grow through distance, teasing, anticipation, uncertainty, pursuit, or the energy of wanting and being wanted. Answer for what reliably works, not for occasional curiosity or fantasy that rarely matters in real life. This question is about erotic charge, not about unhealthy relationship dynamics.",
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
    formatGuidance: "Select one value from 1–7.",
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
      "This question is about your comfort zone for erotic edge. Choose the option that best reflects the level of uncertainty, intensity, and novelty that feels most alive for you when things are working well. Answer from your own preference, not from your partner’s style or what seems more “advanced.”",
    supportAndGuidance:
      "This question is about your comfort zone for erotic edge. Choose the option that best reflects the level of uncertainty, intensity, and novelty that feels most alive for you when things are working well. Answer from your own preference, not from your partner’s style or what seems more “advanced.”",
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
      "Sex feels most fulfilling when it has a sacred/meaningful/ritual quality (not just pleasure).",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Sacred or meaningful can refer to deep presence, reverence, intentionality, symbolism, spirituality, emotional depth, or a feeling that sex connects you to something larger than momentary pleasure. You do not need to be religious for this to fit. Answer from what makes sex feel most deeply fulfilling, not only most exciting.",
    supportAndGuidance:
      "Sacred or meaningful can refer to deep presence, reverence, intentionality, symbolism, spirituality, emotional depth, or a feeling that sex connects you to something larger than momentary pleasure. You do not need to be religious for this to fit. Answer from what makes sex feel most deeply fulfilling, not only most exciting.",
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
    formatGuidance: "Select one value from 1–7.",
  },
  {
    qId: "03012",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: "Without some edge/taboo/intensity, sex can feel flat.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Edge or taboo here can mean stronger energy, daringness, power play, transgressive fantasy, risk flavor, intensity, or a sense of “charge” that goes beyond soft connection alone. Answer based on what keeps your sexuality engaged over time, not just what occasionally sounds exciting.",
    supportAndGuidance:
      "Edge or taboo here can mean stronger energy, daringness, power play, transgressive fantasy, risk flavor, intensity, or a sense of “charge” that goes beyond soft connection alone. Answer based on what keeps your sexuality engaged over time, not just what occasionally sounds exciting.",
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
    formatGuidance: "Select one value from 1–7.",
  },
  {
    qId: "03013",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: "Which of the following sounds most arousing to you?",
    answerType: "single",
    options: [
      "Being watched / admired",
      "Watching my partner",
      "Absorbed in sensation / connection",
      "Not sure",
    ],
    required: true,
    guide:
      "Choose what feels most erotic in fantasy or in real life when sexuality is working well for you. This is about your strongest natural pull, not about what feels most acceptable or what you think should turn you on. If none fit perfectly, choose the one that comes closest.",
    supportAndGuidance:
      "Choose what feels most erotic in fantasy or in real life when sexuality is working well for you. This is about your strongest natural pull, not about what feels most acceptable or what you think should turn you on. If none fit perfectly, choose the one that comes closest.",
    comment: "Helps distinguish being seen, watching, and inward/relational arousal patterns.",
    howAnswerIsUsed:
      "Helps distinguish being seen, watching, and inward/relational arousal patterns.",
    answerOptionsExplained: [
      {
        option: "Being watched / admired",
        explanation: "arousal rises when you feel seen, desired, noticed, or a little performative",
      },
      {
        option: "Watching my partner",
        explanation:
          "observing their body, expressions, responses, or pleasure is what most strongly turns you on",
      },
      {
        option: "Absorbed in sensation / connection",
        explanation:
          "your turn-on is less about seeing or being seen and more about disappearing into feeling, body, and connection",
      },
      { option: "Not sure", explanation: "none of these patterns clearly stands out right now" },
    ],
    formatGuidance: "Select one option.",
  },
  {
    qId: "03014",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: "I can usually reach orgasm with a partner when I want to.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Answer based on your typical partnered experience in recent months under reasonably good conditions. Include whatever kinds of stimulation you usually rely on or enjoy, such as manual, oral, toys, penetration, rhythm, or other forms of touch. This question is not about performance or success as a person, only about how orgasm tends to work in your real life.",
    supportAndGuidance:
      "Answer based on your typical partnered experience in recent months under reasonably good conditions. Include whatever kinds of stimulation you usually rely on or enjoy, such as manual, oral, toys, penetration, rhythm, or other forms of touch. This question is not about performance or success as a person, only about how orgasm tends to work in your real life.",
    scaleLabels: { low: "Rarely or never", high: "Always" },
    comment:
      "Used to tailor pacing, expectations, and guidance around orgasm and partnered pleasure. It does not directly define your archetype.",
    howAnswerIsUsed:
      "Used to tailor pacing, expectations, and guidance around orgasm and partnered pleasure. It does not directly define your archetype.",
    answerOptionsExplained: [
      {
        option: "1 = rarely or never",
        explanation:
          "orgasm with a partner is very uncommon for you, even when you want it and conditions are reasonably supportive",
      },
      {
        option: "2 = in exceptional cases",
        explanation:
          "orgasm with a partner is possible, but only in rare or unusually favorable situations",
      },
      {
        option: "3 = occasionally",
        explanation:
          "orgasm with a partner happens from time to time, but it is not something you can generally count on",
      },
      {
        option: "4 = somewhat regularly",
        explanation:
          "orgasm with a partner happens with some consistency, though it still feels variable and not fully dependable",
      },
      {
        option: "5 = regularly",
        explanation:
          "orgasm with a partner is available to you fairly often and feels like a recurring part of partnered sex",
      },
      {
        option: "6 = usually",
        explanation: "orgasm with a partner happens in most supportive situations when you want it",
      },
      {
        option: "7 = always",
        explanation:
          "orgasm with a partner is highly accessible and reliably available to you when you want it",
      },
    ],
    hoverStates: {
      "1": "Rarely or never",
      "2": "In exceptional cases",
      "3": "Occasionally",
      "4": "Somewhat regularly",
      "5": "Regularly",
      "6": "Usually",
      "7": "Always",
    },
    formatGuidance: "Select one value from 1–7.",
  },
  {
    qId: "08002",
    cId: 8,
    chapter: "Attachment Style & Emotional Safety",
    question: "I generally feel secure in relationships.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Think about your broader pattern across relationships, not only your current relationship on a difficult week. Feeling secure usually means closeness feels possible without losing yourself, distance does not automatically trigger panic, and conflict does not make you collapse or fully shut down. Answer from your most typical relational baseline.",
    supportAndGuidance:
      "Think about your broader pattern across relationships, not only your current relationship on a difficult week. Feeling secure usually means closeness feels possible without losing yourself, distance does not automatically trigger panic, and conflict does not make you collapse or fully shut down. Answer from your most typical relational baseline.",
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
    formatGuidance: "Select one value from 1–7.",
  },
  {
    qId: "08003",
    cId: 8,
    chapter: "Attachment Style & Emotional Safety",
    question: "When my partner pulls away, I usually…",
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
      "Think about a typical moment when you sense less contact, affection, responsiveness, or emotional presence than you want. Choose your most common first reaction, not the reaction you think is most mature. If your response changes a lot by partner or context, choose the one that most often comes first in your body or behavior.",
    supportAndGuidance:
      "Think about a typical moment when you sense less contact, affection, responsiveness, or emotional presence than you want. Choose your most common first reaction, not the reaction you think is most mature. If your response changes a lot by partner or context, choose the one that most often comes first in your body or behavior.",
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
    question:
      "In relationships, I usually want more closeness and togetherness than space and independence.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Answer from your deeper relational tendency, not from what you think a healthy relationship should look like. If you move between closeness and distance, choose the side that tends to dominate under real emotional conditions.",
    supportAndGuidance:
      "Answer from your deeper relational tendency, not from what you think a healthy relationship should look like. If you move between closeness and distance, choose the side that tends to dominate under real emotional conditions.",
    scaleLabels: { low: "Strongly disagree", high: "Strongly agree" },
    comment:
      "Places you on a closeness-versus-independence dimension that shapes intimacy recommendations.",
    howAnswerIsUsed:
      "Places you on a closeness-versus-independence dimension that shapes intimacy recommendations.",
    hoverStates: {
      1: "Strongly disagree",
      2: "Disagree",
      3: "Slightly disagree",
      4: "Neutral",
      5: "Slightly agree",
      6: "Agree",
      7: "Strongly agree",
    },
    formatGuidance: "Rate on a scale of 1 (Strongly disagree) to 7 (Strongly agree).",
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
      "Emotional repair means a real moment of reconnection after tension: honesty, empathy, feeling seen, apology, reassurance, or mutual softening. Answer based on what actually happens in your system after repair, not what you wish would happen or what sounds ideal. This question is about whether reconnection genuinely reopens your body and desire.",
    supportAndGuidance:
      "Emotional repair means a real moment of reconnection after tension: honesty, empathy, feeling seen, apology, reassurance, or mutual softening. Answer based on what actually happens in your system after repair, not what you wish would happen or what sounds ideal. This question is about whether reconnection genuinely reopens your body and desire.",
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
    formatGuidance: "Select one value from 1–7.",
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
      "Pressure can be obvious or subtle: being expected to perform, talk more, move faster, orgasm, reassure, respond the “right” way, or stay sexually open when your system is not there. Shut down can mean numbness, tension, losing desire, wanting to stop, disconnecting, or needing distance. Answer from what reliably happens in your nervous system, not from what you think should happen.",
    supportAndGuidance:
      "Pressure can be obvious or subtle: being expected to perform, talk more, move faster, orgasm, reassure, respond the “right” way, or stay sexually open when your system is not there. Shut down can mean numbness, tension, losing desire, wanting to stop, disconnecting, or needing distance. Answer from what reliably happens in your nervous system, not from what you think should happen.",
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
    formatGuidance: "Select one value from 1–7.",
  },
  {
    qId: "08012",
    cId: 8,
    chapter: "Attachment Style & Emotional Safety",
    question: "I lose interest when my partner becomes too emotionally dependent.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Think about your typical response when a partner relies on you heavily for reassurance, stability, identity, or emotional regulation. This is not about normal closeness or healthy need; it is about moments when their dependence starts to feel like pressure, responsibility, or emotional over-reliance. Answer from what usually happens in your attraction and desire, not from what you think should happen.",
    supportAndGuidance:
      "Think about your typical response when a partner relies on you heavily for reassurance, stability, identity, or emotional regulation. This is not about normal closeness or healthy need; it is about moments when their dependence starts to feel like pressure, responsibility, or emotional over-reliance. Answer from what usually happens in your attraction and desire, not from what you think should happen.",
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
    formatGuidance: "Select one value from 1–7.",
  },
  {
    qId: "09013",
    cId: 9,
    chapter: "Relational Patterns & Boundaries",
    question: "I sometimes use flirtation/sex to influence the dynamic or get needs met.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "This question is about whether sexuality sometimes becomes a way of shaping the emotional dynamic: for example to gain closeness, reduce tension, get reassurance, avoid conflict, feel more secure, restore connection, or increase influence. It does not mean you are manipulative or “bad”; many people do this under stress without fully realizing it. Answer based on recognizable behavior patterns, not just your intentions or self-image.",
    supportAndGuidance:
      "This question is about whether sexuality sometimes becomes a way of shaping the emotional dynamic: for example to gain closeness, reduce tension, get reassurance, avoid conflict, feel more secure, restore connection, or increase influence. It does not mean you are manipulative or “bad”; many people do this under stress without fully realizing it. Answer based on recognizable behavior patterns, not just your intentions or self-image.",
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
    formatGuidance: "Select one value from 1–7.",
  },
  {
    qId: "10002",
    cId: 10,
    chapter: "Communication Style",
    question: "During intimacy, how do you most naturally communicate what you want?",
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
      "Answer for what feels most natural and effective for you in real intimate moments, not what you think good communication “should” look like. Some people communicate mainly through body language, some through brief words, and some through ongoing verbal exchange. If more than one fits, choose the style that best reflects your default or most comfortable way of communicating when you are relatively relaxed.",
    supportAndGuidance:
      "Answer for what feels most natural and effective for you in real intimate moments, not what you think good communication “should” look like. Some people communicate mainly through body language, some through brief words, and some through ongoing verbal exchange. If more than one fits, choose the style that best reflects your default or most comfortable way of communicating when you are relatively relaxed.",
    comment:
      "This tells us whether your communication style is more quiet, embodied, concise, expressive, or emotionally transparent.",
    howAnswerIsUsed:
      "This tells us whether your communication style is more quiet, embodied, concise, expressive, or emotionally transparent.",
    answerOptionsExplained: [
      {
        option: "Touch and body cues",
        explanation:
          "your body language, repositioning, guiding touch, and physical response do most of the communicating",
      },
      {
        option: "Brief direct words",
        explanation:
          "you prefer simple, clear prompts that guide the moment without overtalking it",
      },
      {
        option: "Ongoing verbal feedback",
        explanation:
          "frequent spoken communication feels natural, grounding, or helpful during intimacy",
      },
      {
        option: "Emotional check-ins",
        explanation:
          "emotional clarity, reassurance, and checking how both people feel matter most to you during sex",
      },
      {
        option: "Mostly nonverbal cues",
        explanation:
          "you communicate mainly through sounds, pauses, facial expression, presence, and subtle cues rather than many words",
      },
      {
        option: "I communicate very little",
        explanation:
          "you tend to stay quiet during intimacy and let the experience unfold without much communication",
      },
    ],
    formatGuidance: "Select all that apply.",
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
      "Think about your comfort in real situations: during sex, before sex, in texts, in conversation, or through guiding touch. This is about whether you can share your desires without strong shame, inhibition, embarrassment, or fear of being judged. Answer from your usual level of comfort, not from your most confident day or your ideal self-image.",
    supportAndGuidance:
      "Think about your comfort in real situations: during sex, before sex, in texts, in conversation, or through guiding touch. This is about whether you can share your desires without strong shame, inhibition, embarrassment, or fear of being judged. Answer from your usual level of comfort, not from your most confident day or your ideal self-image.",
    scaleLabels: { low: "Not comfortable at all", high: "Very comfortable" },
    comment:
      "This shows how easily you can name and voice what turns you on, which changes the communication style we recommend.",
    howAnswerIsUsed:
      "This shows how easily you can name and voice what turns you on, which changes the communication style we recommend.",
    answerOptionsExplained: [
      {
        option: "1 = Not comfortable at all",
        explanation:
          "expressing what turns you on feels difficult, vulnerable, or highly inhibited",
      },
      {
        option: "2 = Quite uncomfortable",
        explanation:
          "you can sometimes sense what you want, but saying it out loud often feels awkward, exposed, or hard",
      },
      {
        option: "3 = Slightly uncomfortable",
        explanation:
          "you can express some desires, though it still takes effort and often comes with hesitation",
      },
      {
        option: "4 = Mixed / depends",
        explanation:
          "you can express some desires in certain situations, but not always with ease or consistency",
      },
      {
        option: "5 = Slightly comfortable",
        explanation:
          "you can often communicate what turns you on, even if some inhibition or self-consciousness remains",
      },
      {
        option: "6 = Quite comfortable",
        explanation:
          "you are usually able to name, signal, or communicate what turns you on with relatively little hesitation",
      },
      {
        option: "7 = Very comfortable",
        explanation:
          "you can usually name, signal, or communicate what turns you on with relative ease and low shame",
      },
    ],
    hoverStates: {
      "1": "Not comfortable at all",
      "2": "Quite uncomfortable",
      "3": "Slightly uncomfortable",
      "4": "Mixed / depends",
      "5": "Slightly comfortable",
      "6": "Quite comfortable",
      "7": "Very comfortable",
    },
    formatGuidance: "Select one value from 1–7.",
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
      "This is about your ability to state limits clearly in real time: saying no, slowing something down, redirecting, pausing, or naming a boundary without freezing, fawning, apologizing excessively, or feeling responsible for the other person’s reaction. Think especially about in-the-moment sexual situations, not only what you believe intellectually about boundaries.",
    supportAndGuidance:
      "This is about your ability to state limits clearly in real time: saying no, slowing something down, redirecting, pausing, or naming a boundary without freezing, fawning, apologizing excessively, or feeling responsible for the other person’s reaction. Think especially about in-the-moment sexual situations, not only what you believe intellectually about boundaries.",
    scaleLabels: { low: "Not comfortable at all", high: "Very comfortable" },
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
        option: "2 = Quite uncomfortable",
        explanation:
          "you may know your limits internally, but voicing them clearly often feels hard, risky, or guilt-provoking",
      },
      {
        option: "3 = Slightly uncomfortable",
        explanation:
          "you can sometimes name boundaries, though it still takes effort or comes with noticeable hesitation",
      },
      {
        option: "4 = Mixed / depends",
        explanation:
          "you can express limits in some situations, but not always clearly, easily, or consistently",
      },
      {
        option: "5 = Slightly comfortable",
        explanation:
          "you can often communicate what you do not want, even if some discomfort or self-consciousness remains",
      },
      {
        option: "6 = Quite comfortable",
        explanation:
          "you are usually able to name limits and protect your boundaries with relatively little hesitation",
      },
      {
        option: "7 = Very comfortable",
        explanation:
          "you can usually express what you do not want clearly and protect your boundaries without major shutdown or guilt",
      },
    ],
    hoverStates: {
      "1": "Not comfortable at all",
      "2": "Quite uncomfortable",
      "3": "Slightly uncomfortable",
      "4": "Mixed / depends",
      "5": "Slightly comfortable",
      "6": "Quite comfortable",
      "7": "Very comfortable",
    },
    formatGuidance: "Select one value from 1–7.",
  },
  {
    qId: "10005",
    cId: 10,
    chapter: "Communication Style",
    question: "If my partner is quiet/neutral during sex, my arousal drops.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Quiet or neutral here means little visible feedback, few sounds, minimal expression, or being hard to read. Answer based on your nervous system response: does your body lose confidence, momentum, or erotic engagement when you are not getting much feedback? This is not about blaming your partner; it is about understanding how much your arousal depends on visible response and reciprocity.",
    supportAndGuidance:
      "Quiet or neutral here means little visible feedback, few sounds, minimal expression, or being hard to read. Answer based on your nervous system response: does your body lose confidence, momentum, or erotic engagement when you are not getting much feedback? This is not about blaming your partner; it is about understanding how much your arousal depends on visible response and reciprocity.",
    scaleLabels: { low: "Not at all true", high: "Very true" },
    comment:
      "This is one of the strongest clues for whether your arousal depends on visible feedback, enthusiasm, and feeling responded to.",
    howAnswerIsUsed:
      "This is one of the strongest clues for whether your arousal depends on visible feedback, enthusiasm, and feeling responded to.",
    answerOptionsExplained: [
      {
        option: "1 = Not at all true",
        explanation:
          "your arousal does not depend much on visible feedback or expressiveness from your partner",
      },
      {
        option: "2 = Mostly not true",
        explanation:
          "a quiet or neutral partner may register a little, but it usually does not lower your arousal much",
      },
      {
        option: "3 = Slightly not true",
        explanation:
          "feedback matters somewhat, though you can usually stay engaged even if your partner is hard to read",
      },
      {
        option: "4 = Mixed / depends",
        explanation:
          "a quiet or neutral partner can affect your arousal in some situations, but not always strongly",
      },
      {
        option: "5 = Slightly true",
        explanation:
          "when your partner is hard to read, your arousal often drops at least somewhat",
      },
      {
        option: "6 = Mostly true",
        explanation:
          "visible feedback is usually important for your arousal, and neutrality often reduces your engagement",
      },
      {
        option: "7 = Very true",
        explanation: "when your partner is hard to read, your arousal often drops noticeably",
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
    formatGuidance: "Select one value from 1–7.",
  },
  {
    qId: "11001",
    cId: 11,
    chapter: "Partner-Related Needs",
    question: "Which dynamic feels most natural?",
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
      "This question is about the flow of influence during sex: who tends to guide, lead, receive, follow, or shape the experience. Choose what feels easiest, most natural, and most energizing in your body, not what feels ideologically correct or what you think should be true in a modern relationship. If your answer changes by partner or mood, choose the pattern that most often feels sexually alive and natural.",
    supportAndGuidance:
      "This question is about the flow of influence during sex: who tends to guide, lead, receive, follow, or shape the experience. Choose what feels easiest, most natural, and most energizing in your body, not what feels ideologically correct or what you think should be true in a modern relationship. If your answer changes by partner or mood, choose the pattern that most often feels sexually alive and natural.",
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
          "you feel most alive when receiving, following, or allowing someone else to steer",
      },
      {
        option: "Switch",
        explanation:
          "you enjoy moving between leading and following depending on mood, context, or partner",
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
    question: "I enjoy clear structure/protocol/rules in sexual dynamics.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Structure can mean something light, such as a routine, an agreed sequence, or asking before escalation, or something more explicit, such as rituals, roles, scripts, or clearly defined expectations. Answer based on whether structure tends to make intimacy feel easier, safer, hotter, or more freeing for you. This is about what supports your experience, not about being rigid or controlling.",
    supportAndGuidance:
      "Structure can mean something light, such as a routine, an agreed sequence, or asking before escalation, or something more explicit, such as rituals, roles, scripts, or clearly defined expectations. Answer based on whether structure tends to make intimacy feel easier, safer, hotter, or more freeing for you. This is about what supports your experience, not about being rigid or controlling.",
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
    formatGuidance: "Select one value from 1–7.",
  },
  {
    qId: "11003",
    cId: 11,
    chapter: "Partner-Related Needs",
    question:
      "In sex, my attention naturally goes more toward my partner\u2019s experience than toward my own.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Answer from what feels most natural in real intimate situations, not from what sounds generous, fair, or desirable. This is about whether your attention tends to focus more on your partner’s experience or your own.",
    supportAndGuidance:
      "Answer from what feels most natural in real intimate situations, not from what sounds generous, fair, or desirable. This is about whether your attention tends to focus more on your partner’s experience or your own.",
    scaleLabels: { low: "Strongly disagree", high: "Strongly agree" },
    comment:
      "This helps us understand whether your attention during sex tends toward your partner’s experience or your own.",
    howAnswerIsUsed:
      "This helps us understand whether your attention during sex tends toward your partner’s experience or your own.",
    hoverStates: {
      1: "Strongly disagree",
      2: "Disagree",
      3: "Slightly disagree",
      4: "Neutral",
      5: "Slightly agree",
      6: "Agree",
      7: "Strongly agree",
    },
    formatGuidance: "Rate on a scale of 1 (Strongly disagree) to 7 (Strongly agree).",
  },
  {
    qId: "11004",
    cId: 11,
    chapter: "Partner-Related Needs",
    question:
      "I feel most connected sexually when I’m soothing or stabilizing my partner’s emotions.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Soothing or stabilizing means calming, reassuring, grounding, emotionally holding, or helping your partner feel safer and more regulated. For some people this deepens connection; for others it pulls them out of erotic energy and into caregiving. Answer based on what usually happens in your system when this dynamic shows up.",
    supportAndGuidance:
      "Soothing or stabilizing means calming, reassuring, grounding, emotionally holding, or helping your partner feel safer and more regulated. For some people this deepens connection; for others it pulls them out of erotic energy and into caregiving. Answer based on what usually happens in your system when this dynamic shows up.",
    scaleLabels: { low: "Not true at all", high: "Very true" },
    comment:
      "This is a very strong clue for whether caregiving and emotional soothing are part of what makes sex feel connecting for you.",
    howAnswerIsUsed:
      "This is a very strong clue for whether caregiving and emotional soothing are part of what makes sex feel connecting for you.",
    answerOptionsExplained: [
      {
        option: "1 = Not true at all",
        explanation:
          "soothing or emotionally stabilizing your partner does not usually increase sexual connection for you",
      },
      {
        option: "2 = Mostly not true",
        explanation:
          "caregiving may matter relationally, but it is usually not what creates sexual connection for you",
      },
      {
        option: "3 = Slightly not true",
        explanation:
          "this can feel connecting at times, though it is not usually a major source of erotic closeness",
      },
      {
        option: "4 = Mixed / depends",
        explanation: "this can feel connecting in some contexts, but not consistently",
      },
      {
        option: "5 = Slightly true",
        explanation:
          "caregiving, calming, or emotional holding often adds some sense of sexual connection for you",
      },
      {
        option: "6 = Mostly true",
        explanation:
          "soothing or stabilizing your partner’s emotions is often part of what helps you feel sexually connected",
      },
      {
        option: "7 = Very true",
        explanation:
          "caregiving, calming, or emotionally holding your partner often deepens your sense of sexual connection",
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
    formatGuidance: "Select one value from 1–7.",
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
      "Pick the option that most consistently pulls your desire online. Many people are motivated by more than one thing, but this question asks for your strongest recurring driver, not every reason that sex can matter to you. Choose what feels most primary in real life, especially when your sexuality is working relatively well.",
    supportAndGuidance:
      "Pick the option that most consistently pulls your desire online. Many people are motivated by more than one thing, but this question asks for your strongest recurring driver, not every reason that sex can matter to you. Choose what feels most primary in real life, especially when your sexuality is working relatively well.",
    comment:
      "This is one of the most important direct questions in the survey because it tells us what actually pulls desire online for you: bonding, play, novelty, power, meaning, repair, comfort, intensity, escape, or service.",
    howAnswerIsUsed:
      "This is one of the most important direct questions in the survey because it tells us what actually pulls desire online for you: bonding, play, novelty, power, meaning, repair, comfort, intensity, escape, or service.",
    answerOptionsExplained: [
      {
        option: "Bonding and closeness",
        explanation:
          "closeness, affection, and emotional connection are the strongest pull toward sex",
      },
      {
        option: "Pleasure and play",
        explanation: "fun, enjoyment, sensation, and lightness motivate you most",
      },
      {
        option: "Novelty and discovery",
        explanation: "desire rises through discovery, experimentation, and variety",
      },
      {
        option: "Intensity and edge",
        explanation: "risk, adrenaline, taboo flavor, or stronger charge add core erotic energy",
      },
      {
        option: "Feeling desired",
        explanation: "feeling wanted, chosen, admired, or longed for is a major driver",
      },
      {
        option: "Power and polarity",
        explanation:
          "polarity, control, surrender, or directional energy are central to your turn-on",
      },
      {
        option: "Meaning and devotion",
        explanation: "sex feels most compelling when it carries depth, devotion, or transcendence",
      },
      {
        option: "Comfort and familiarity",
        explanation: "familiarity, ease, and steady connection are most motivating",
      },
      {
        option: "Giving and service",
        explanation:
          "giving pleasure or being deeply attentive to a partner is itself highly rewarding",
      },
      {
        option: "Healing and soothing",
        explanation: "sex helps regulate, reconnect, restore, or soften emotional strain",
      },
      {
        option: "Escape and relief",
        explanation: "sex functions partly as relief from stress, numbness, or overthinking",
      },
    ],
    formatGuidance: "Select all that apply.",
  },
  {
    qId: "14021",
    cId: 14,
    chapter: "Identity & Conditioning",
    question: "I seek intense sex to escape numbness/stress or to feel something.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "This question is about whether intensity sometimes functions as a regulator for you: a way to break through stress, emotional flatness, numbness, boredom, disconnection, or mental overload. It does not define your sexuality or mean something is wrong. Answer based on a recurring pattern, especially under stress, not on a one-off experience or occasional fantasy.",
    supportAndGuidance:
      "This question is about whether intensity sometimes functions as a regulator for you: a way to break through stress, emotional flatness, numbness, boredom, disconnection, or mental overload. It does not define your sexuality or mean something is wrong. Answer based on a recurring pattern, especially under stress, not on a one-off experience or occasional fantasy.",
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
    formatGuidance: "Select one value from 1–7.",
  },
  {
    qId: "15001",
    cId: 15,
    chapter: "Background & Lifestyle",
    question: "Which country do you live in?",
    answerType: "country",
    options: [],
    required: true,
    guide:
      "Choose the country where you mainly live now. This does not need to capture your full identity, nationality, or cultural background perfectly; it simply gives us a broad practical context for language, norms, examples, and support relevance. If you split your time between places, choose the one that most reflects your current day-to-day life.",
    supportAndGuidance:
      "Choose the country where you mainly live now. This does not need to capture your full identity, nationality, or cultural background perfectly; it simply gives us a broad practical context for language, norms, examples, and support relevance. If you split your time between places, choose the one that most reflects your current day-to-day life.",
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
      "Enter the postal code of your main residence. This is used only as broad regional context and does not require a perfect or highly precise location history. If you live between places, use the postal code that best reflects where you currently spend most of your time.",
    supportAndGuidance:
      "Enter the postal code of your main residence. This is used only as broad regional context and does not require a perfect or highly precise location history. If you live between places, use the postal code that best reflects where you currently spend most of your time.",
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
    guide:
      "Choose the age range that fits your current age. This question is not about reducing you to a life stage, but about adding context around energy, responsibilities, hormones, relationship patterns, and developmental priorities that may shape your experience.",
    supportAndGuidance:
      "Choose the age range that fits your current age. This question is not about reducing you to a life stage, but about adding context around energy, responsibilities, hormones, relationship patterns, and developmental priorities that may shape your experience.",
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
      "Relationship structures can be nuanced, evolving, and hard to label perfectly. Choose the option that comes closest to your current reality, even if your situation is in transition or contains some ambiguity. This question helps us avoid giving advice that assumes the wrong relational context.",
    supportAndGuidance:
      "Relationship structures can be nuanced, evolving, and hard to label perfectly. Choose the option that comes closest to your current reality, even if your situation is in transition or contains some ambiguity. This question helps us avoid giving advice that assumes the wrong relational context.",
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
      "If you have children of different ages, choose based on your youngest child, since that often shapes time, energy, sleep, logistics, and caregiving intensity most strongly. If this question feels personal, answer in the way that feels most comfortable. It is included because caregiving load can meaningfully shape desire, privacy, stress, and sexual timing.",
    supportAndGuidance:
      "If you have children of different ages, choose based on your youngest child, since that often shapes time, energy, sleep, logistics, and caregiving intensity most strongly. If this question feels personal, answer in the way that feels most comfortable. It is included because caregiving load can meaningfully shape desire, privacy, stress, and sexual timing.",
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
      "Think about your general baseline, not just this week or one especially hard period. This question is about the level of stress your system usually carries in day-to-day life, because stress often shapes desire, arousal, patience, sensitivity, and bandwidth more than people realize.",
    supportAndGuidance:
      "Think about your general baseline, not just this week or one especially hard period. This question is about the level of stress your system usually carries in day-to-day life, because stress often shapes desire, arousal, patience, sensitivity, and bandwidth more than people realize.",
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
      "Answer based on how you typically feel on waking before coffee, motivation, or a good morning routine change the picture. This is not about one especially bad or especially good night, but about your usual baseline. Rest and sleep quality can strongly affect desire, regulation, energy, and patience.",
    supportAndGuidance:
      "Answer based on how you typically feel on waking before coffee, motivation, or a good morning routine change the picture. This is not about one especially bad or especially good night, but about your usual baseline. Rest and sleep quality can strongly affect desire, regulation, energy, and patience.",
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
      "This refers to ongoing conditions that meaningfully affect day-to-day life, not short illnesses or brief rough patches. You do not need to share diagnoses here. If you are unsure whether something “counts,” choose the option that comes closest or select “I’m not sure.”",
    supportAndGuidance:
      "This refers to ongoing conditions that meaningfully affect day-to-day life, not short illnesses or brief rough patches. You do not need to share diagnoses here. If you are unsure whether something “counts,” choose the option that comes closest or select “I’m not sure.”",
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
      "Answer based on your own lived observation, not only on what you have heard or what the medication is “supposed” to do. Include prescriptions, hormones, contraception, HRT, antidepressants, testosterone, or other substances you believe may affect your energy, mood, or sexuality. If you take something but cannot tell its effect, “not sure” is the best answer.",
    supportAndGuidance:
      "Answer based on your own lived observation, not only on what you have heard or what the medication is “supposed” to do. Include prescriptions, hormones, contraception, HRT, antidepressants, testosterone, or other substances you believe may affect your energy, mood, or sexuality. If you take something but cannot tell its effect, “not sure” is the best answer.",
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
    guide:
      "Choose the option that best reflects how you identify now. This question is included so the language and examples in your report can feel more relevant and respectful, not to box you into a rigid category. If none of the labels fit well, choose the one that feels closest or the option that allows more openness.",
    supportAndGuidance:
      "Choose the option that best reflects how you identify now. This question is included so the language and examples in your report can feel more relevant and respectful, not to box you into a rigid category. If none of the labels fit well, choose the one that feels closest or the option that allows more openness.",
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
      "Choose the label that best fits your enduring pattern of attraction as you currently understand it. This does not need to be perfect or final. If your orientation is fluid, emerging, or hard to name, choose the closest option or the one that best reflects how you relate to attraction today.",
    supportAndGuidance:
      "Choose the label that best fits your enduring pattern of attraction as you currently understand it. This does not need to be perfect or final. If your orientation is fluid, emerging, or hard to name, choose the closest option or the one that best reflects how you relate to attraction today.",
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
      "Feeling more pleasure or orgasm",
      "Less pain or physical discomfort",
      "Feeling more connected & close",
      "Communicating needs more clearly",
      "More excitement & novelty",
      "Feeling more confident in my body",
      "Healing past hurt or blocks",
      "Being more aligned with my partner",
      "Something else",
    ],
    required: true,
    guide:
      "Select all changes that would meaningfully improve your sex life over the next 3 months. Choose the ones that feel genuinely relevant right now, even if they connect to each other. If several apply, select the few that would create the biggest positive ripple effects or make other areas easier to improve. This question is about your most meaningful current levers for change, not your full story.",
    supportAndGuidance:
      "Select all changes that would meaningfully improve your sex life over the next 3 months. Choose the ones that feel genuinely relevant right now, even if they connect to each other. If several apply, select the few that would create the biggest positive ripple effects or make other areas easier to improve. This question is about your most meaningful current levers for change, not your full story.",
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
        option: "Feeling more pleasure or orgasm",
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
        option: "Communicating needs more clearly",
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
        option: "Healing past hurt or blocks",
        explanation:
          "shame, fear, grief, hurt, or unresolved emotional blocks need attention first",
      },
      {
        option: "Being more aligned with my partner",
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
    question: "How important is it for you to work on this right now?",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "This is about your real priorities, not what you think you should care about. Some things matter deeply but are not workable right now; others are emotionally urgent and ready for attention. Answer from your genuine sense of importance in this season of life.",
    supportAndGuidance:
      "This is about your real priorities, not what you think you should care about. Some things matter deeply but are not workable right now; others are emotionally urgent and ready for attention. Answer from your genuine sense of importance in this season of life.",
    scaleLabels: { low: "Not important at all", high: "Essential" },
    comment:
      "This tells us whether to make your recommendations more immediate and action-oriented or more exploratory and low-pressure.",
    howAnswerIsUsed:
      "This tells us whether to make your recommendations more immediate and action-oriented or more exploratory and low-pressure.",
    answerOptionsExplained: [
      {
        option: "1 = Not important at all",
        explanation: "this is not a priority right now, and other parts of life clearly come first",
      },
      {
        option: "2 = Slightly important",
        explanation: "this matters a little, but it is still low on your list of priorities",
      },
      {
        option: "3 = A little important",
        explanation: "this has some relevance for you, though it is not yet a strong focus",
      },
      {
        option: "4 = Moderately important",
        explanation: "this matters, but it is one priority among several rather than the main one",
      },
      {
        option: "5 = Quite important",
        explanation:
          "this feels meaningfully worth your attention and is becoming a clear area to work on",
      },
      {
        option: "6 = Very important",
        explanation:
          "this feels like a strong current priority and something you genuinely want to address",
      },
      {
        option: "7 = Essential",
        explanation: "this feels urgent, central, or highly important to focus on now",
      },
    ],
    hoverStates: {
      "1": "Not important at all",
      "2": "Slightly important",
      "3": "A little important",
      "4": "Moderately important",
      "5": "Quite important",
      "6": "Very important",
      "7": "Essential",
    },
    formatGuidance: "Select one value from 1–7.",
  },
  {
    qId: "16003",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question: "How possible does change feel in the next 3–6 months?",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Imagine the next 3–6 months with your real schedule, stress load, relationship dynamics, energy, and support level included. This question is not about hope alone; it is about how realistic and reachable change feels in your actual life right now.",
    supportAndGuidance:
      "Imagine the next 3–6 months with your real schedule, stress load, relationship dynamics, energy, and support level included. This question is not about hope alone; it is about how realistic and reachable change feels in your actual life right now.",
    scaleLabels: { low: "Feels out of reach", high: "Feels genuinely doable" },
    comment:
      "This helps us decide whether to emphasize momentum-building, confidence-building, or a slower, steadier path.",
    howAnswerIsUsed:
      "This helps us decide whether to emphasize momentum-building, confidence-building, or a slower, steadier path.",
    answerOptionsExplained: [
      {
        option: "1 = Feels out of reach",
        explanation: "meaningful change currently feels unlikely, blocked, or hard to imagine",
      },
      {
        option: "2 = Very hard to imagine",
        explanation:
          "change feels technically possible, but it is difficult to picture it happening in your current circumstances",
      },
      {
        option: "3 = Slightly possible",
        explanation:
          "some progress seems conceivable, though it still feels uncertain, limited, or hard to trust",
      },
      {
        option: "4 = Maybe possible",
        explanation:
          "some movement feels realistic, but there are still clear uncertainties or obstacles",
      },
      {
        option: "5 = Fairly possible",
        explanation:
          "change feels reasonably within reach if the right effort, support, or conditions come together",
      },
      {
        option: "6 = Very possible",
        explanation: "meaningful change feels realistic and achievable in your current life",
      },
      {
        option: "7 = Feels genuinely doable",
        explanation: "progress feels believable, reachable, and workable in your current life",
      },
    ],
    hoverStates: {
      "1": "Feels out of reach",
      "2": "Very hard to imagine",
      "3": "Slightly possible",
      "4": "Maybe possible",
      "5": "Fairly possible",
      "6": "Very possible",
      "7": "Feels genuinely doable",
    },
    formatGuidance: "Select one value from 1–7.",
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
      "Assume the plan is clear, realistic, and aligned with your life. Then answer from your real calendar and real behavior, not from a fantasy version of yourself with more time, energy, and focus. This question helps us understand your likely action timing, not your intentions in the abstract.",
    supportAndGuidance:
      "Assume the plan is clear, realistic, and aligned with your life. Then answer from your real calendar and real behavior, not from a fantasy version of yourself with more time, energy, and focus. This question helps us understand your likely action timing, not your intentions in the abstract.",
    comment: "We use this to match recommendations to your real timing, not an ideal timeline.",
    howAnswerIsUsed:
      "We use this to match recommendations to your real timing, not an ideal timeline.",
    answerOptionsExplained: [
      { option: "Within 7 days", explanation: "you would likely begin almost immediately" },
      {
        option: "Within 30 days",
        explanation:
          "you would likely start soon, but not right away. 1–3 months = change feels relevant, but not yet immediate. 3–6 months = this matters, though it is more of a medium-term step. 6–12 months = action feels more distant for now",
      },
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
      "Think of this as your current season, not a fixed identity or permanent label. Choose the phase that best describes your baseline most days lately, especially over the past 4–8 weeks. Even if you fluctuate, select the option that feels closest to where your sexuality is organizing itself right now.",
    supportAndGuidance:
      "Think of this as your current season, not a fixed identity or permanent label. Choose the phase that best describes your baseline most days lately, especially over the past 4–8 weeks. Even if you fluctuate, select the option that feels closest to where your sexuality is organizing itself right now.",
    comment:
      "This helps us locate the season you are in now—paused, repairing, awakening, expanding, grounded, or evolving—so the report meets you where you are.",
    howAnswerIsUsed:
      "This helps us locate the season you are in now—paused, repairing, awakening, expanding, grounded, or evolving—so the report meets you where you are.",
    answerOptionsExplained: [
      {
        option: "Recharging / Pausing",
        explanation:
          "sexuality feels quieter right now, and rest, lower pressure, or recovery matter most",
      },
      {
        option: "Repairing / Reconnecting",
        explanation:
          "you are rebuilding trust, safety, openness, or connection after stress, pain, shame, or disconnection",
      },
      {
        option: "Awakening / Exploring",
        explanation:
          "desire feels curious and alive, and you are discovering what fits with lower-pressure exploration",
      },
      {
        option: "Expanding / Experimenting",
        explanation:
          "you feel more confident and want greater expression, communication, novelty, or play",
      },
      {
        option: "Grounded / Integrated",
        explanation:
          "sexuality feels steadier and more established, with fulfillment coming through consistency, rhythm, and presence",
      },
      {
        option: "Evolving / Transcending",
        explanation:
          "sexuality feels expansive, meaningful, and connected to deeper emotional, creative, or spiritual dimensions",
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
      "Now choose your realistic north star for the next 3–6 months. This can be aspirational, but try to keep it believable for your real life. The point is not to choose the “highest” stage, but the direction that feels most meaningful and true for you.",
    supportAndGuidance:
      "Now choose your realistic north star for the next 3–6 months. This can be aspirational, but try to keep it believable for your real life. The point is not to choose the “highest” stage, but the direction that feels most meaningful and true for you.",
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
      "Be honest about what actually gets you moving, not what sounds most disciplined or ideal. Think about real examples from your life: when you have successfully made change, what kind of first step did you naturally take? This helps us match recommendations to your real action style.",
    supportAndGuidance:
      "Be honest about what actually gets you moving, not what sounds most disciplined or ideal. Think about real examples from your life: when you have successfully made change, what kind of first step did you naturally take? This helps us match recommendations to your real action style.",
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
      "Select the kinds of support that would genuinely make your next step easier or more workable. You can choose more than one. Try to answer from what would truly support you now, not from what sounds most impressive or what you feel you “should” choose.",
    supportAndGuidance:
      "Select the kinds of support that would genuinely make your next step easier or more workable. You can choose more than one. Try to answer from what would truly support you now, not from what sounds most impressive or what you feel you “should” choose.",
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
        explanation:
          "support that includes your partner would be most helpful. 1:1 professional support = individualized help from a trained professional would fit best",
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
    question: "Which of the following do you regularly use?",
    answerType: "multiple",
    options: [
      "Therapy / coaching",
      "Books",
      "Meditation apps",
      "Music or streaming subscriptions",
      "Other paid subscriptions",
      "Other",
      "None",
    ],
    required: true,
    guide:
      "Choose any that are genuinely part of your regular life right now. This helps us understand what kinds of tools, rhythms, and support formats you already relate to, so recommendations can feel more familiar and realistic rather than abstract.",
    supportAndGuidance:
      "Choose any that are genuinely part of your regular life right now. This helps us understand what kinds of tools, rhythms, and support formats you already relate to, so recommendations can feel more familiar and realistic rather than abstract.",
    comment:
      "This helps us understand the kinds of support tools and formats you already engage with.",
    howAnswerIsUsed:
      "This helps us understand the kinds of support tools and formats you already engage with.",
    answerOptionsExplained: [
      {
        option: "Therapy / coaching",
        explanation:
          "you currently use paid support such as therapy, coaching, counseling, or mentoring on a reasonably regular basis",
      },
      {
        option: "Books",
        explanation:
          "books are one of the ways you regularly learn, reflect, or support your growth",
      },
      {
        option: "Meditation apps",
        explanation:
          "you use mindfulness, breathwork, meditation, sleep, or nervous-system support apps",
      },
      {
        option: "Music or streaming subscriptions",
        explanation:
          "you already use paid digital subscriptions for audio, video, or lifestyle content in everyday life",
      },
      {
        option: "Other paid subscriptions",
        explanation:
          "you use other recurring paid tools, memberships, courses, or digital services not covered above",
      },
      {
        option: "Other",
        explanation:
          "another regular support tool, format, or subscription fits better than the listed options",
      },
      { option: "None", explanation: "none of these are a regular part of your life right now" },
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
      "A rough estimate is enough. Include both one-off and recurring spending on things like books, courses, therapy, coaching, apps, memberships, or related tools that support your growth. This is not about judgment; it simply helps estimate what level of depth and commitment may feel realistic to you.",
    supportAndGuidance:
      "A rough estimate is enough. Include both one-off and recurring spending on things like books, courses, therapy, coaching, apps, memberships, or related tools that support your growth. This is not about judgment; it simply helps estimate what level of depth and commitment may feel realistic to you.",
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
    question: "How important is understanding your sexuality for your life?",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Answer from the bigger picture of your life, not only from short-term curiosity. For some people sexuality is meaningful but not central right now; for others it is deeply tied to identity, wellbeing, relationships, vitality, or personal growth. Go with your broad sense of importance.",
    supportAndGuidance:
      "Answer from the bigger picture of your life, not only from short-term curiosity. For some people sexuality is meaningful but not central right now; for others it is deeply tied to identity, wellbeing, relationships, vitality, or personal growth. Go with your broad sense of importance.",
    scaleLabels: { low: "Not important at all", high: "Essential" },
    comment:
      "This helps us decide how central this topic should be in your recommendations and how much depth to give it.",
    howAnswerIsUsed:
      "This helps us decide how central this topic should be in your recommendations and how much depth to give it.",
    answerOptionsExplained: [
      {
        option: "1 = Not important at all",
        explanation: "understanding your sexuality does not feel central to your life right now",
      },
      {
        option: "2 = Slightly important",
        explanation: "this matters a little, but it is not a major life priority for you",
      },
      {
        option: "3 = A little important",
        explanation:
          "understanding your sexuality has some value, though it is not yet especially central",
      },
      {
        option: "4 = Moderately important",
        explanation: "it matters, but it is one meaningful area among several in your life",
      },
      {
        option: "5 = Quite important",
        explanation:
          "understanding your sexuality feels meaningfully relevant to your wellbeing, relationships, or growth",
      },
      {
        option: "6 = Very important",
        explanation:
          "this feels like a strong area of importance for your life and self-understanding",
      },
      {
        option: "7 = Essential",
        explanation:
          "understanding your sexuality feels deeply important to your life, wellbeing, or growth",
      },
    ],
    hoverStates: {
      "1": "Not important at all",
      "2": "Slightly important",
      "3": "A little important",
      "4": "Moderately important",
      "5": "Quite important",
      "6": "Very important",
      "7": "Essential",
    },
    formatGuidance: "Select one value from 1–7.",
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
      "My partner isn’t aligned or engaged",
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
      "Select anything that is genuinely in the way right now. This is not a verdict about you, your partner, or your relationship. It is simply a map of the real obstacles so we can focus recommendations on what is actually blocking movement instead of offering advice that sounds good but does not fit.",
    supportAndGuidance:
      "Select anything that is genuinely in the way right now. This is not a verdict about you, your partner, or your relationship. It is simply a map of the real obstacles so we can focus recommendations on what is actually blocking movement instead of offering advice that sounds good but does not fit.",
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
        option: "My partner isn’t aligned or engaged",
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
