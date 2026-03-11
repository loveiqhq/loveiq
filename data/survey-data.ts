// Auto-generated from data/survey-source.csv — do not edit manually
// Run: node scripts/update-survey.js

export type AnswerType = "open" | "scale" | "single" | "multiple" | "country";

export interface SurveyQuestion {
  qId: string;
  cId: number;
  chapter: string;
  question: string;
  answerType: AnswerType;
  options: string[];
  required: boolean;
  guide: string;
  scaleLabels?: { low: string; high: string };
  inputType?: "email" | "text";
  placeholder?: string;
  comment?: string;
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
      "Use an email you check regularly and can access on this device. Double-check spelling (no spaces). If you’re using a work email that filters messages, consider a personal one so you don’t miss your report or login link. Examples: max@example.com; nikola@example.com; banana.bandit@example.com",
    inputType: "email",
    placeholder: "your@email.com",
  },
  {
    qId: "00001",
    cId: 15,
    chapter: "Background & Lifestyle",
    question: "What is your first name?",
    answerType: "open",
    options: ["Free text"],
    required: true,
    guide:
      "Enter the name you’d like to be addressed by in your results (it can be a nickname). Keep it short and recognizable so your report feels personal. Examples: Max; NikolaT; Banana Bandit",
    inputType: "text",
    placeholder: "Type your answer...",
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
      "Think about the last 4–8 weeks overall. Include both quality and frequency, plus how aligned it feels with what you want. Try to rate your real experience (not what you think “should” be true). If you’re currently not sexually active, rate your satisfaction with how things are for you right now.",
    scaleLabels: { low: "Completely dissatisfied", high: "Completely satisfied" },
    comment: "prevents over-pathologizing low desire",
  },
  {
    qId: "01003",
    cId: 1,
    chapter: "Current Sexual Wellbeing & Pain Points",
    question: "Which statement best describes your relationship with sexuality right now?",
    answerType: "single",
    options: [
      "It’s genuinely not a priority for me (stable preference)",
      "It’s temporarily deprioritized (stress / life load)",
      "It feels complicated (pain, shame, resentment, disconnection)",
      "I’m not sure",
    ],
    required: true,
    guide:
      "Choose the biggest factor right now. If a few apply, pick the one that’s most responsible.",
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
      "“Novelty/variety” can mean new activities, new scenarios, different pacing, different locations, new fantasies, or simply changing routines. Answer for your usual pattern: do you regularly feel a pull toward “something different,” even if you don’t act on it?",
    scaleLabels: { low: "Strongly Disagree", high: "Strongly Agree" },
    comment: "intensity vs stability axis",
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
      "Answer based on your typical experience over the past few months. “Sex” here includes any sexual activity you engage in (not only penetration). If pain happens only in specific situations (certain positions, dryness, anxiety, condoms, toys, certain timing in your cycle), still factor that in when choosing your rating.",
    scaleLabels: { low: "Strongly Disagree", high: "Strongly Agree" },
    comment: "important for recommendations and practical guidance",
  },
  {
    qId: "02001",
    cId: 2,
    chapter: "Spontaneous Desire VS Responsive Desire",
    question: "Which is most true for you?",
    answerType: "single",
    options: [
      "I often feel desire spontaneously (it starts inside me)",
      "I usually warm up after affectionate/erotic cues (responsive)",
      "I need a planned ‘window’ to get into it",
      "It varies a lot by partner/context",
      "Desire has been low lately",
    ],
    required: true,
    guide:
      "Pick the option that fits you most of the time in your current life (last 3–6 months). “Spontaneous” means desire appears before touch/attention. “Responsive” means desire often shows up after flirting, touch, closeness, or erotic cues. “Planned window” means you do best when you intentionally set aside time and let things build. If it truly depends heavily on partner/context, choose that. If desire has been noticeably low lately compared to your usual baseline, choose “low lately.”",
    comment:
      "high-signal self-classification that frames the whole chapter (spontaneous vs responsive vs planned vs context-dependent vs low desire)",
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
      "“Affectionate or erotic cues” can be kissing, cuddling, feeling emotionally close, flirting, erotic talk, touch, a date night vibe, or seeing your partner in a sexy context. Rate how often this is true for you generally, not just with a specific partner on a specific day.",
    scaleLabels: { low: "Strongly Disagree", high: "Strongly Agree" },
    comment: "Higher agreement supports responsive-leaning onset",
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
      "“Planned time” means intentionally setting a window (even loosely) where intimacy could happen. “Spur-of-the-moment” means unplanned initiation in everyday life. Answer based on what reliably leads to enjoyable sex for you (less pressure, easier arousal, better experience), not what sounds most romantic.",
    scaleLabels: { low: "Strongly Disagree", high: "Strongly Agree" },
    comment:
      "ritualist vs hunter/seducer;\nshifts intensity toward Structure (high scores) or toward Play/Novelty (low scores)",
  },
  {
    qId: "02004",
    cId: 2,
    chapter: "Spontaneous Desire VS Responsive Desire",
    question: "In a good scenario, initiation feels best when…",
    answerType: "single",
    options: [
      "I start it",
      "My partner starts and I warm up",
      "We plan a window and see what happens",
      "Either of us, in a playful moment",
    ],
    required: true,
    guide:
      "Choose the scenario that most often creates your best, most relaxed, most turned-on experience. This is about what works (emotionally and physically), not about fairness or what you wish were true. If multiple feel true, pick the one that has the highest success rate.",
    comment:
      "directly maps to Initiation Style;\nconfirms onset: “I start it” supports Spontaneous; “partner starts/I warm up” supports Responsive;\nthe best single discriminator we have",
  },
  {
    qId: "03003",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: "What is your preferred setting of sexual connection?",
    answerType: "single",
    options: [
      "Private",
      "Adventurous",
      "Ritualized",
      "Spontaneous",
      "Public risk",
      "Other (please specify)",
    ],
    required: true,
    guide:
      "Answer for your ideal setting when you can choose freely. “Private” = safe, closed-door, low chance of interruption. “Adventurous” = different locations or a sense of exploring. “Ritualized” = a familiar setup/sequence (music, lighting, routine) that helps you drop in. “Spontaneous” = unplanned, in-the-moment. “Public risk” = the thrill of being noticed or almost caught (without breaking consent or laws). Choose “Other” if your preference is something like nature, travel, mornings-only, etc.",
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
      "“Emotional connection” means feeling safe, cared for, understood, and emotionally close. Rate how necessary that feeling is for your desire to show up with a partner. This is not about whether you can physically get aroused, but whether you genuinely want sex and enjoy it.",
    scaleLabels: { low: "Not at all essential", high: "Extremely essential" },
    comment: "sensual connector / spiritual lover / caregiver",
  },
  {
    qId: "03005",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: "Which description best fits what gets you from neutral to turned-on most often?",
    answerType: "single",
    options: [
      "Sensation-led (touch/tempo/teasing)",
      "Safety/context-led (privacy, low stress, no interruptions)",
      "Connection-led (warmth, affection, closeness)",
      "Novelty/adventure-led (new ideas, toys, new settings)",
      "Mastery/competence-led (technique, skill-building)",
      "Fantasy/imagination-led (role-play, mental imagery, erotica/audio/visual)",
      "Not sure / varies a lot",
    ],
    required: true,
    guide:
      "Pick the main “on switch” that most reliably moves you from neutral to aroused. “Sensation-led” = touch, rhythm, teasing, physical buildup. “Safety/context-led” = privacy, low stress, time, no interruptions. “Connection-led” = warmth, affection, emotional closeness. “Novelty/adventure-led” = new ideas, new settings, toys, experimentation. “Mastery/competence-led” = skill, technique, getting better together, learning what works. “Fantasy/imagination-led” = mental imagery, role play, erotica, audio/visual cues. Choose “varies” if there is no consistent pattern.",
  },
  {
    qId: "03006",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: 'Which "learning mode" best fits you?',
    answerType: "single",
    options: [
      "“I like being taught/guided step-by-step.”",
      "“I like optimizing/understanding the system.”",
      "“I don’t want ‘learning mode’ during sex.”",
    ],
    required: true,
    guide:
      "“Learning mode” means treating sex partly like exploration or skill-building. “Taught/guided” = you enjoy instruction, demonstration, or step-by-step guidance in the moment. “Optimizing/system” = you like understanding patterns, feedback, and what works (like experimenting and refining). “Don’t want learning mode” = you prefer it to feel natural/instinctive in the moment and not like a lesson. Pick what feels most comfortable, not what you think is most mature.",
    comment:
      "specifically separates Curious Apprentice vs Analytical Sexualist without contaminating “communication style” scoring",
  },
  {
    qId: "03008",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: "I usually want sex to feel...",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "“Calm and nourishing” means gentle, soothing, connected, regulated. “Charged and intense” means high energy, strong build, urgency, edge, heat. Rate your preferred emotional/physical intensity level most of the time.",
    scaleLabels: { low: "calm and nourishing", high: "charged and intense" },
    comment: "Energy threshold",
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
      "“Tension/pursuit” means flirtation with distance, chase energy, teasing, anticipation, power dynamics of wanting/being wanted, or earning access. Answer for what reliably works for you (not occasional curiosity).",
    scaleLabels: { low: "Strongly Disagree", high: "Strongly Agree" },
  },
  {
    qId: "03010",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: "In erotic contexts, I prefer:",
    answerType: "single",
    options: [
      "Very safe/private/predictable",
      "Mostly safe with small novelty",
      "Balanced",
      "Adventurous but still controlled",
      "High-risk / edgy / taboo-leaning (within consent)",
    ],
    required: true,
    guide:
      "This is about your comfort zone for “edginess.” “Safe/private/predictable” = minimal uncertainty, low vulnerability. “Small novelty” = gentle experiments within a safe container. “Balanced” = equal comfort with familiar and new. “Adventurous but controlled” = you like intensity/novelty but with clear boundaries. “High-risk/edgy/taboo-leaning” = you enjoy a strong thrill/edge, while still staying within consent and agreed limits. Choose the option that best matches your preferred level, not your partner’s.",
    comment:
      "Risk orientation (safe ↔ edgy);\nReason: it’s basically “brakes vs accelerator” and “conditions for openness,” without going into explicit kink content.",
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
      "“Sacred/meaningful/ritual” can mean deep presence, emotional reverence, intentionality, symbolism, spirituality, or feeling like it connects you to something bigger than pleasure. You don’t need to be religious for this. Rate how important that meaning layer is for sex to feel truly fulfilling.",
    scaleLabels: { low: "Strongly Disagree", high: "Strongly Agree" },
    comment: "Spiritual Lover vs Sensual Connector (sometimes Nurturing Healer too)",
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
      "“Edge/taboo/intensity” can mean strong energy, transgression fantasy, power play, risk flavor, or anything that feels a bit daring (always within consent). Rate whether you typically need that extra charge to stay engaged, versus being satisfied with gentle connection or straightforward pleasure.",
    scaleLabels: { low: "Strongly Disagree", high: "Strongly Agree" },
  },
  {
    qId: "03013",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: "What sounds most arousing?",
    answerType: "single",
    options: [
      "Being watched/admired (mirror, performance vibe)",
      "Watching my partner / observing is hottest",
      "Neither—being absorbed in sensation/connection is hottest",
      "Not sure",
    ],
    required: true,
    guide:
      "Choose what is most arousing in fantasy or real life when things are going well. “Being watched/admired” can include mirrors, feeling seen, or performance energy. “Watching my partner” means your arousal rises from observing their body, reactions, or pleasure. “Absorbed in sensation/connection” means attention is inward or relational, not observer-focused. Pick “Not sure” if none consistently stands out.",
    comment:
      "This separates Exhibitionist Performer vs Emotional Voyeur vs Sensual/Spiritual types.",
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
      "Answer based on your typical experience with a partner over the last several months. “When I want to” means when you’re aiming for orgasm and conditions are reasonably good. Include whatever stimulation you usually use (manual, oral, toys, penetration, etc.). This is not a test of “normal,” just a practical signal for recommendations.",
    scaleLabels: { low: "Strongly Disagree", high: "Strongly Agree" },
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
      "“Secure” means you usually feel worthy of love and trust that closeness is safe; you can handle distance without panic and handle conflict without shutting down completely. Answer based on your overall pattern across relationships, not only your current partner on a bad week.",
    scaleLabels: { low: "Strongly Disagree", high: "Strongly Agree" },
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
      "Self-soothe and stay grounded",
      "Varies",
    ],
    required: true,
    guide:
      "Think of a typical moment when you feel less contact/attention than you want (less texting, less affection, emotionally distant). Choose your most common first response. “Protest/get angry” means you react with frustration, criticism, or conflict to regain connection. “Self-soothe” means you can calm yourself and respond thoughtfully. Choose “Varies” only if there’s no dominant pattern.",
  },
  {
    qId: "08004",
    cId: 8,
    chapter: "Attachment Style & Emotional Safety",
    question: "Regarding interdependence in relationships, I tend to...",
    answerType: "single",
    options: ["Crave closeness", "Keep distance", "Balance both"],
    required: true,
    guide:
      "“Interdependence” means being close while still being your own person. “Crave closeness” = you prefer lots of emotional/physical togetherness. “Keep distance” = you prefer more independence and space. “Balance both” = closeness feels good, and space feels good, without either being threatening. Answer for your usual preference, not your partner’s.",
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
      "“Emotional repair” means resolving tension through honesty, empathy, apology, reassurance, or feeling understood again. Rate whether desire tends to return or increase after that kind of reconnection. Think of real examples, not what you hope happens.",
    scaleLabels: { low: "Strongly Disagree", high: "Strongly Agree" },
    comment: "Repair eroticism;\nThis is a strong Nurturing Healer discriminator.",
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
      "“Pressure” can be explicit (“we should have sex,” “are you close?”) or subtle (expectations, time pressure, feeling evaluated). “Shut down/withdraw” can mean going numb, losing arousal, wanting to stop, or emotionally checking out. Rate how reliably pressure triggers that response for you.",
    scaleLabels: { low: "Strongly Disagree", high: "Strongly Agree" },
    comment:
      "This cleanly separates:\n\nQuiet Withdrawer = high\nMinimalist Companion = low–mid (prefers simple, but not necessarily shutdown)\nLoyal Ritualist = low (structure helps them stay engaged)",
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
      "“Emotionally dependent” means your partner relies on you heavily for reassurance, mood regulation, or identity, in a way that feels like pressure or responsibility. Rate your typical reaction: does increased dependence reduce attraction/interest for you? Answer honestly; this is used to tailor relationship and intimacy guidance.",
    scaleLabels: { low: "Strongly Disagree", high: "Strongly Agree" },
    comment: "avoidant marker",
  },
  {
    qId: "09013",
    cId: 9,
    chapter: "Relational Patterns & Boundaries",
    question: "I sometimes use flirtation/sex to influence the dynamic or get needs met.”",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "This is about using sexuality as leverage (to gain closeness, avoid conflict, get reassurance, feel secure, gain power, or steer the relationship). It doesn’t mean you’re “bad”; it’s a pattern some people use under stress. Answer based on real behavior, not intention. If it happens rarely, choose a lower number.",
    scaleLabels: { low: "Strongly Disagree", high: "Strongly Agree" },
    comment: "“instrumental” / “strategy” flag (Strategic Manipulator)",
  },
  {
    qId: "10002",
    cId: 10,
    chapter: "Communication Style",
    question: "During intimacy, how do you prefer to communicate your needs and desires?",
    answerType: "single",
    options: [
      "Mostly nonverbal / quiet",
      "Mainly through touch/movement",
      "Short clear phrases (“slower / like that”)",
      "Expressive, ongoing verbal feedback",
      "Emotionally transparent + relational check-ins",
    ],
    required: true,
    guide:
      "Answer for what feels best and most natural in the moment (not what you think you should do). “Nonverbal/quiet” = little talking. “Touch/movement” = guiding hands, pressure, pace. “Short phrases” = brief cues like “slower,” “yes,” “right there.” “Ongoing verbal feedback” = frequent talking about what feels good. “Relational check-ins” = naming feelings and connection needs (comfort, reassurance, emotional attunement) during intimacy.",
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
      "Rate your comfort in real situations: can you share desires (words, texts, guiding touch) without strong embarrassment or fear of judgment? Include both during sex and outside of sex. Answer based on typical comfort, not your best-day confidence.",
    scaleLabels: { low: "Strongly Disagree", high: "Strongly Agree" },
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
      "This is about stating limits clearly (saying no, slowing down, redirecting, naming boundaries) without freezing, fawning, or feeling guilty. Rate your usual ability, especially in the moment.",
    scaleLabels: { low: "Strongly Disagree", high: "Strongly Agree" },
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
      "“Quiet/neutral” means minimal reaction, little sound, little feedback, hard to read. Rate whether you reliably lose arousal in that situation, even if touch continues. This is about your nervous system response, not about blaming your partner.",
    scaleLabels: { low: "Strongly Disagree", high: "Strongly Agree" },
    comment:
      "Admiration dependency;\nExhibitionist Performer, Approval Seeker;\nit’s a feedback/expressiveness dependency signal (very relevant to scripts & communication recommendations)",
  },
  {
    qId: "11001",
    cId: 11,
    chapter: "Partner-Related Needs",
    question: "Which dynamic feels most natural?",
    answerType: "single",
    options: [
      "I like to lead/direct",
      "I like to surrender/be led",
      "I like switching depending on mood",
      "I prefer egalitarian/no roles",
      "Not sure / depends a lot",
    ],
    required: true,
    guide:
      "This is about the flow of influence during sex (who initiates, guides, sets pace). “Lead/direct” can be gentle or firm. “Surrender/be led” means you relax more when someone else guides. “Switching” means you genuinely like both depending on mood/partner. “Egalitarian/no roles” means you prefer co-leading without clear roles. Choose what feels easiest and most energizing, not what feels politically correct.",
    comment: "Power preference",
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
      "“Structure/protocol/rules” can be light (a routine, a sequence, agreements like “ask before escalation”) or more formal (roles, rituals, clear scripts). Rate whether clear structure makes sex feel safer, hotter, or easier for you.",
    scaleLabels: { low: "Strongly Disagree", high: "Strongly Agree" },
  },
  {
    qId: "11003",
    cId: 11,
    chapter: "Partner-Related Needs",
    question: "In sex I most naturally…",
    answerType: "single",
    options: [
      "Focus on my partner’s pleasure first",
      "Focus on mutual balance",
      "Prefer receiving/being guided",
      "It varies a lot",
    ],
    required: true,
    guide:
      "Choose what you tend to do by default when you’re not overthinking. “Partner’s pleasure first” means you prioritize their experience and often take responsibility for it. “Mutual balance” means you track both equally. “Prefer receiving/being guided” means you relax and enjoy more when you’re the focus or when you’re being led. Choose “Varies” only if there’s no clear default across time/partners.",
    comment: "Caregiver vs healer vs approval-seeker (big confusion cluster)",
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
      "“Soothing/stabilizing” means calming, reassuring, grounding, helping your partner feel safe, regulated, or emotionally held. Rate whether that role increases your sense of sexual connection and desire, versus pulling you out of erotic energy.",
    scaleLabels: { low: "Strongly Disagree", high: "Strongly Agree" },
    comment: "Healer vs Caregiver discriminator",
  },
  {
    qId: "14020",
    cId: 14,
    chapter: "Identity & Conditioning",
    question: "What most reliably motivates you to want sex?",
    answerType: "single",
    options: [
      "Bonding / intimacy",
      "Pleasure / play",
      "Novelty / exploration",
      "Intensity / edge / taboo energy",
      "Validation / being desired",
      "Power (leading or surrendering)",
      "Meaning / spiritual union",
      "Comfort / routine closeness",
      "Service (giving pleasure)",
      "Healing / repair / nervous-system soothing",
      "Escape / shutting off the world",
    ],
    required: true,
    guide:
      "Pick the main reason you seek sex when it’s at its best for you (your primary driver). “Motivates” means what pulls you toward sex, not what makes sex good once you’re already in it. If two feel true, choose the one that most consistently initiates your desire. Quick definitions: Bonding = closeness; Pleasure/play = fun/body enjoyment; Novelty = newness; Intensity/edge = charge/thrill; Validation = feeling desired; Power = leading/surrendering; Meaning = sacred/union; Comfort = routine closeness; Service = giving pleasure; Healing/repair = soothing after stress/conflict; Escape = turning off your mind/world.",
    comment: "This maps cleanly to “Sexual Motivation Category” across archetypes.",
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
      "This is about using intensity as a regulator: when stressed, disconnected, or numb, do you look for stronger stimulation to shift your state? Answer based on a recurring pattern (especially under stress), not a one-off experience.",
    scaleLabels: { low: "Strongly Disagree", high: "Strongly Agree" },
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
      "Choose the country where you currently live most of the time (your main residence). If you split time between countries, pick the one you spend the majority of the year in.",
  },
  {
    qId: "15002",
    cId: 15,
    chapter: "Background & Lifestyle",
    question: "Which ZIP / postal code do you live in?",
    answerType: "open",
    options: ["Free text"],
    required: true,
    guide:
      "Enter your current postal code for your main residence. If you’re privacy-conscious, you can enter only the first part (for example, first 3–4 characters) as long as it still represents your area. Avoid adding extra address details. Examples: 11000; 94110; SW1A 1AA",
    inputType: "text",
    placeholder: "11000; 94110; SW1A 1AA",
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
      "This helps normalize results across life stages (for example, hormonal changes, stress load, relationship phase), not to judge you.",
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
      "Choose what best describes your current structure. Quick definitions: Monogamous = exclusive; Monogamish = mostly exclusive with limited exceptions; Open = non-exclusive with agreements; Polyamorous = multiple committed relationships are possible; Solo-poly = poly while prioritizing personal autonomy (not nesting/merging lives); Fluid/Undefined = not clearly defined right now. Pick the closest match.",
  },
  {
    qId: "15005",
    cId: 15,
    chapter: "Background & Lifestyle",
    question: "Do you have children?",
    answerType: "single",
    options: [
      "No",
      "Yes, youngest child is 0–3 years",
      "Yes, youngest child is 4–10 years",
      "Yes, youngest child is 11–17 years",
      "Yes, children are 18+ and live with me",
      "Yes, children are 18+ and do not live with me",
      "Prefer not to answer",
    ],
    required: true,
    guide:
      "Choose the option that reflects your current caregiving load. If you have multiple children, answer based on your youngest child (since that most affects time, sleep, stress, and intimacy logistics).",
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
      "Think of your baseline stress across most days in the last month (workload, worry, nervous-system tension). “High” means stress noticeably affects your mood, energy, or patience; “Very high” means it often feels overwhelming or hard to come down from.",
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
      "Answer for a typical morning over the last 2–4 weeks, not your best or worst night. Consider both physical rest and mental freshness. If your sleep varies, pick the most common option.",
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
      "This is about ongoing conditions (not a short cold) that meaningfully affect your daily functioning. You don’t need to share diagnoses here. If you’re uncertain whether something “counts,” choose “I’m not sure.” Choose “Prefer not to answer” if you’d rather not share.",
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
      "Yes, and I feel they lower my drive",
      "Yes, and I feel they increase my drive",
      "Yes, but I’m not sure how they affect my drive",
      "Prefer not to answer",
    ],
    required: true,
    guide:
      "Answer based on your own observation, not what you’ve heard. Include prescriptions, hormonal contraception, HRT, testosterone, SSRIs/SNRIs, etc. If you take something but you can’t tell its effect, choose “I’m not sure.” No need to list the medication here.",
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
      "Choose the option that best matches how you identify now. If none fits, choose “Other” (if you’ll be able to specify later) or “Prefer not to say.” Answering is optional and won’t change your value or access to results.",
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
    guide:
      "Choose the label that best fits your enduring pattern of attraction. If you’re unsure or your label is different, choose “Queer” or “Other” (depending on what fits you best). This is for tailoring language and norms, not for assumptions about behavior.",
  },
  {
    qId: "16001",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question:
      "If ONE thing changed in the next 3 months, your sex life would feel meaningfully better. Which is closest?",
    answerType: "single",
    options: [
      "Desire & arousal (wanting sex more / getting turned on more easily)",
      "Pleasure & orgasm (enjoying sex more / reaching orgasm)",
      "Pain, discomfort, or physical barriers",
      "Emotional safety & connection",
      "Communication (naming needs, limits, fantasies)",
      "Novelty & excitement",
      "Confidence & body comfort",
      "Healing / repair from past experiences",
      "Partner alignment (mismatched desire, roles, expectations)",
      "Other (short text)",
    ],
    required: true,
    guide:
      "Choose the one shift that would create the biggest ripple effect over the next 3 months. If multiple options feel true, pick the one that would make everything else easier. ‘Other’ is great if your real goal doesn’t fit the list.",
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
      "This is about your priorities—not what you think you should want. Go with your gut: 1 = not a priority right now, 7 = top of mind / deeply important.",
    scaleLabels: { low: "Not important", high: "Extremely important" },
    comment: "Motivation / urgency",
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
      "Imagine the next 3–6 months with your real schedule, energy, and relationship dynamics included. 1 = feels out of reach, 7 = feels genuinely doable (even if it’s not easy).",
    scaleLabels: { low: "Not possible", high: "Very possible" },
    comment: "Change belief / hope",
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
      "Assume you had a plan that feels like a good fit—clear, doable, and aligned. When would you actually begin in your real calendar (not a fantasy week)? Choose the closest option.",
  },
  {
    qId: "16005",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question:
      "When you reflect on your current sexuality and pleasure, which description feels most true for you?",
    answerType: "single",
    options: [
      "Recharging / Pausing – I’m in a quieter, restorative phase of my sexual life. Desire feels gentle or distant, and that’s okay. I sense I’m gathering energy, letting my body and mind rest before passion naturally reawakens.",
      "Repairing / Reconnecting – I’m rebuilding my relationship to sexuality, healing from past pain, shame, or disconnection. My focus is on safety, trust, and emotional openness — learning to feel at home in my body again.",
      "Awakening / Exploring – I feel curious and alive with possibility. I’m discovering what turns me on, learning through play and experimentation, and beginning to express my desires with more ease and honesty.",
      "Expanding / Experimenting – I feel confident and expressive in my sexuality. I enjoy exploring new experiences, sensations, and dynamics, communicating openly about my desires, and co-creating pleasure with my partner(s).",
      "Grounded / Integrated - I experience sexuality as a stable, integrated part of my life. Desire feels steady and familiar. Pleasure arises naturally in connection, routine, or self-care. This phase is about maintaining fulfillment with presence and appreciation, rather than chasing newness or repair.",
      "Evolving / Transcending – I experience sexuality as a deeper, transformative force — a way to connect with creativity, love, and spirituality. Pleasure feels like presence, flow, and expansion beyond the physical.",
    ],
    required: true,
    guide:
      "Think of this as your current season, not a permanent label. Choose the phase that best describes your baseline most days lately (past 4–8 weeks), even if you sometimes fluctuate.",
  },
  {
    qId: "16006",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question: "Where would you like your sexuality to be in 3–6 months?",
    answerType: "single",
    options: [
      "Recharging / Pausing – I’m in a quieter, restorative phase of my sexual life. Desire feels gentle or distant, and that’s okay. I sense I’m gathering energy, letting my body and mind rest before passion naturally reawakens.",
      "Repairing / Reconnecting – I’m rebuilding my relationship to sexuality, healing from past pain, shame, or disconnection. My focus is on safety, trust, and emotional openness — learning to feel at home in my body again.",
      "Awakening / Exploring – I feel curious and alive with possibility. I’m discovering what turns me on, learning through play and experimentation, and beginning to express my desires with more ease and honesty.",
      "Expanding / Experimenting – I feel confident and expressive in my sexuality. I enjoy exploring new experiences, sensations, and dynamics, communicating openly about my desires, and co-creating pleasure with my partner(s).",
      "Grounded / Integrated - I experience sexuality as a stable, integrated part of my life. Desire feels steady and familiar. Pleasure arises naturally in connection, routine, or self-care. This phase is about maintaining fulfillment with presence and appreciation, rather than chasing newness or repair.",
      "Evolving / Transcending – I experience sexuality as a deeper, transformative force — a way to connect with creativity, love, and spirituality. Pleasure feels like presence, flow, and expansion beyond the physical.",
    ],
    required: true,
    guide:
      "Now pick your north star—where you’d like to be in 3–6 months if things improved. It can be aspirational, but try to keep it believable for your life. This helps tailor the recommendations and pacing.",
  },
  {
    qId: "16007",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question:
      "When you want to improve something important in your life (health, relationships, confidence), what do you usually do first?",
    answerType: "single",
    options: [
      "I research on my own (articles/videos/free resources)",
      "I use a structured tool/app/journal to guide me",
      "I follow a program/course with steps",
      "I prefer working with a professional (coach/therapist/mentor)",
      "I usually don’t take action unless it becomes urgent",
    ],
    required: true,
    guide:
      "Be honest about what actually gets you moving—not what sounds ideal. Think of past changes you’ve stuck with: what typically helps you go from ‘I should’ to ‘I’m doing’?",
    comment:
      "Option 4 → +15% price tolerance\nOption 1 or 5 → -10–20%\nOption 2–3 → neutral to +5%",
  },
  {
    qId: "16008",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question: "What kind of support would feel most helpful for your top focus?",
    answerType: "multiple",
    options: [
      "Self-guided tools & exercises",
      "Short structured program (2–4 weeks)",
      "Live group experience",
      "Partner-inclusive guidance",
      "1:1 professional support",
      "Not sure yet",
    ],
    required: true,
    guide:
      "Select the kinds of support that would make this easier. If you can, choose what would help most right now (not what you ‘should’ want). ‘Not sure yet’ is a completely valid answer.",
  },
  {
    qId: "16011",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question: "Which of the following do you regularly use?",
    answerType: "multiple",
    options: [
      "Spotify Premium",
      "Therapy / coaching",
      "Meditation apps",
      "Other paid subscriptions (e.g., Netflix, paid apps)",
      "Other (please specify)",
      "None",
    ],
    required: true,
    guide:
      "Select what you use regularly (at least monthly). This helps us understand what types of support/subscriptions you’re already comfortable with.",
  },
  {
    qId: "16012",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question:
      "About how much do you typically invest per year in personal growth (books, courses, therapy/coaching, apps)?",
    answerType: "single",
    options: ["€0", "Up to €50", "Up to €200", "€1,000+"],
    required: true,
    guide:
      "A rough estimate is fine. Include books, courses, therapy/coaching, and paid apps/subscriptions (one-offs + ongoing).",
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
      "Rate how central this feels for you right now. 1 = not important, 7 = extremely important.",
    scaleLabels: { low: "Not important", high: "Extremely important" },
  },
  {
    qId: "16014",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question: "Which things are in the way? (Select all that apply)",
    answerType: "multiple",
    options: [
      "I’m not sure what would help",
      "Time/energy is limited",
      "Partner isn’t aligned/engaged",
      "Emotional safety isn’t there yet",
      "Shame / pressure / self-judgment",
      "Physical pain/body issues",
      "Cost/access",
      "I lose motivation over time",
      "No major obstacles",
      "Other",
    ],
    required: true,
    guide:
      "Select anything that’s genuinely in the way right now. This isn’t a verdict—it’s a map. The more real you are here, the more precisely we can tailor your next steps. If none fit well, choose ‘Other.’",
  },
];

export const chapterIntros: ChapterIntro[] = [
  {
    cId: 2,
    chapter: "Spontaneous Desire VS Responsive Desire",
    text: "Desire can appear before stimulation (spontaneous) or build after affectionate/erotic cues (responsive). Both are common and healthy.",
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
