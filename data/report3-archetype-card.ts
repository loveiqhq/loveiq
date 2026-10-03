/**
 * Report V4 — archetype card copy.
 *
 * Figma: "Report V4 — MOBILE" (1:165), Archetype card 15:815, and the
 * "Archetype dimension deck" component 15:1136 / 15:1236 / 15:1336.
 *
 * Spark Seeker's card is the frame's; since 03.10 every archetype's values and supportive
 * sentences come from Sanjin's five card docs (one table per dimension, a row per
 * archetype), Spark Seeker's included. The meters are the archetype table's
 * (`reportThemes` risk and confidence). The tagline is Spark Seeker's own line; the
 * others show their V2 motto (`reportThemes.motto`) until Sanjin writes card lines.
 * `missingReport3CardCopy()` is asserted by a test so a new archetype's gap closes loudly.
 *
 * Keyed by the display name used in `archetypePresentation` / `archetypeSlug`.
 */
import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";

/** The four dimensions of the deck, in the fixed order the frames draw them. */
export type Report3DimensionKey = "communication" | "initiation" | "attachment" | "power";

/** Three-step meters ("Risk orientation", "Typical confidence"). The level sets both
 * how many of the three segments fill and which label is highlighted. */
export type Report3MeterLevel = "low" | "medium" | "high";

export interface Report3Dimension {
  key: Report3DimensionKey;
  /** Eyebrow, e.g. "Communication". */
  title: string;
  /** Second eyebrow line, e.g. "how desire gets spoken". */
  subtitle: string;
  /** The verdict, set in Lora, e.g. "Charming". */
  value: string;
  body: string;
}

export interface Report3CardCopy {
  /**
   * The card's pull-quote. NOTE: this is NOT `archetypePresentation.tagline` — that
   * is a first-person motto ("Tease me, surprise me, chase me a little...") and the
   * frame shows a different, third-person line. Both now exist; Mark needs to say
   * whether this replaces the motto or is a second slot.
   *
   * The frame opens this with U+201D (a RIGHT double quote) on both sides, which is
   * a typo in the file; it is written correctly here as U+201C ... U+201D.
   */
  tagline: string;
  coreMotivation: { value: string; body: string };
  dimensions: readonly Report3Dimension[];
  meters: readonly { label: string; level: Report3MeterLevel }[];
}

export const report3ArchetypeCard: Readonly<Record<string, Report3CardCopy>> = {
  "Spark Seeker": {
    tagline: "\u201CFind the spark. Fuel the fire. Keep the heat\u201D",
    coreMotivation: {
      value: "Pleasure & Play",
      body: "Sex is about a sense of aliveness, not milestones. The moment it starts feeling like a duty, sex loses its point.",
    },
    // Supportive sentences as reworked by Sanjin and approved by Mark on
    // 2026-09-23 (Figma thread 1937163962, "Good! Please make the changes"),
    // re-read from 15:1136 / 15:1236 / 15:1336.
    dimensions: [
      {
        key: "communication",
        title: "Communication",
        subtitle: "How Desire Gets Spoken",
        value: "Charming",
        body: "Words are part of the foreplay, and so is a little tease. Charm and wit are ways attraction is built and intimacy is initiated.",
      },
      {
        key: "initiation",
        title: "Initiation",
        subtitle: "Who Makes the First Move",
        value: "Active",
        body: "You make the first move often, and the move itself is part of the pleasure. What matters most is feeling that your interest is met with genuine enthusiasm.",
      },
      {
        key: "attachment",
        title: "Attachment",
        subtitle: "How Closeness Is Held",
        value: "Avoidant / Secure",
        body: "Closeness is comfortable while it stays voluntary. When it starts to feel owed, heavy, or restrictive, you may begin to pull back or create some distance.",
      },
      {
        key: "power",
        title: "Power",
        subtitle: "Who Takes the Lead",
        value: "Switch",
        body: "You will take the lead or hand it over, and the choosing is part of the turn-on. What you avoid is a position that never moves.",
      },
    ],
    meters: [
      { label: "Risk Orientation", level: "high" },
      { label: "Typical Confidence", level: "high" },
    ],
  },
  // Sanjin's five card docs (03.10), one row per archetype. The meters are the archetype
  // table's (reportThemes); the tagline is the archetype's V2 motto until Sanjin writes card
  // lines (Fatih, 03.10).
  "Sensual Connector": {
    tagline: "“Touch me with presence and meet me with heart.”",
    coreMotivation: {
      value: "Intimacy & Bonding",
      body: "Sex is a way to feel emotionally close, not just physically satisfied. Without warmth, presence, and genuine connection, something important is missing.",
    },
    dimensions: [
      {
        key: "communication",
        title: "Communication",
        subtitle: "How Desire Gets Spoken",
        value: "Authentic",
        body: "Feelings often speak before instructions do. Desire is expressed through honesty, emotional cues, and closeness, with the hope that a partner understands what is needed.",
      },
      {
        key: "initiation",
        title: "Initiation",
        subtitle: "Who Makes the First Move",
        value: "Responsive",
        body: "You are more likely to open into desire once connection is already there. Feeling emotionally close, wanted, and gently invited makes it easier for you to respond.",
      },
      {
        key: "attachment",
        title: "Attachment",
        subtitle: "How Closeness Is Held",
        value: "Secure",
        body: "Closeness tends to feel safe and natural. You can let someone in without losing yourself, especially when care, honesty, and emotional presence are mutual.",
      },
      {
        key: "power",
        title: "Power",
        subtitle: "Who Takes the Lead",
        value: "Switch",
        body: "You are comfortable leading or following, depending on the moment. What matters most is feeling connected enough to move naturally between the two.",
      },
    ],
    meters: [
      { label: "Risk Orientation", level: "low" },
      { label: "Typical Confidence", level: "medium" },
    ],
  },
  "Relational Nurturer": {
    tagline: "“Your comfort and pleasure matter—so do mine.”",
    coreMotivation: {
      value: "Healing",
      body: "Sex is a way to restore closeness and feel that the relationship is okay again. Care, reassurance, and emotional repair make desire feel worthwhile.",
    },
    dimensions: [
      {
        key: "communication",
        title: "Communication",
        subtitle: "How Desire Gets Spoken",
        value: "Gentle",
        body: "Desire is spoken with warmth and care. Needs are often expressed softly, with connection and emotional harmony taking priority over being completely direct.",
      },
      {
        key: "initiation",
        title: "Initiation",
        subtitle: "Who Makes the First Move",
        value: "Responsive",
        body: "You tend to respond when warmth and connection are already present. Feeling cared for and emotionally safe makes it easier for desire to emerge and move forward.",
      },
      {
        key: "attachment",
        title: "Attachment",
        subtitle: "How Closeness Is Held",
        value: "Secure",
        body: "You are comfortable building closeness through care, trust, and emotional responsiveness. Connection feels strongest when both people can depend on each other without losing themselves.",
      },
      {
        key: "power",
        title: "Power",
        subtitle: "Who Takes the Lead",
        value: "Submissive / Switch",
        body: "You often enjoy responding to someone else’s lead, but can step forward when it feels right. Power works best when it stays caring and flexible.",
      },
    ],
    meters: [
      { label: "Risk Orientation", level: "low" },
      { label: "Typical Confidence", level: "medium" },
    ],
  },
  "Radiant Performer": {
    tagline: "“Watch me shine.”",
    coreMotivation: {
      value: "Validation",
      body: "Sex feels most powerful when it confirms that you are wanted. Being admired, desired, and responded to makes the experience feel deeply rewarding.",
    },
    dimensions: [
      {
        key: "communication",
        title: "Communication",
        subtitle: "How Desire Gets Spoken",
        value: "Expressive",
        body: "Desire comes through vividly. Enthusiasm, storytelling, and visible reactions build attraction, especially when that expression is met with attention and appreciation.",
      },
      {
        key: "initiation",
        title: "Initiation",
        subtitle: "Who Makes the First Move",
        value: "Active",
        body: "You are comfortable making the first move, especially when you feel attractive and noticed. Initiating becomes more exciting when your confidence is met with visible desire.",
      },
      {
        key: "attachment",
        title: "Attachment",
        subtitle: "How Closeness Is Held",
        value: "Mixed",
        body: "You can want closeness strongly while also protecting parts of yourself from exposure. Feeling admired may draw you in, while criticism or rejection can quickly create distance.",
      },
      {
        key: "power",
        title: "Power",
        subtitle: "Who Takes the Lead",
        value: "Switch",
        body: "You can enjoy being in control or being the focus of someone else’s attention. The excitement often comes from the exchange between the two.",
      },
    ],
    meters: [
      { label: "Risk Orientation", level: "high" },
      { label: "Typical Confidence", level: "high" },
    ],
  },
  "Explorer of Edges": {
    tagline: "“Let’s find the edge—and keep going.”",
    coreMotivation: {
      value: "Intensity & Transformation",
      body: "Sex is a place to go beyond the ordinary. Intensity, surrender, challenge, and new experiences help you feel changed rather than simply satisfied.",
    },
    dimensions: [
      {
        key: "communication",
        title: "Communication",
        subtitle: "How Desire Gets Spoken",
        value: "Honest",
        body: "Desire is usually spoken directly, even when it is intense or unconventional. Clear conversations about wants, fantasies, and boundaries make exploration feel more possible.",
      },
      {
        key: "initiation",
        title: "Initiation",
        subtitle: "Who Makes the First Move",
        value: "Active",
        body: "You are often willing to make the first move and take things forward. Initiation feels best when there is openness to intensity, experimentation, and clear mutual interest.",
      },
      {
        key: "attachment",
        title: "Attachment",
        subtitle: "How Closeness Is Held",
        value: "Disorganized",
        body: "Closeness can feel intensely attractive and threatening at the same time. You may move toward deep intimacy quickly, then pull back when vulnerability starts to feel overwhelming.",
      },
      {
        key: "power",
        title: "Power",
        subtitle: "Who Takes the Lead",
        value: "Dominant / Switch",
        body: "You are comfortable taking control and pushing the energy forward, but may also enjoy handing power over when the intensity and trust feel right.",
      },
    ],
    meters: [
      { label: "Risk Orientation", level: "high" },
      { label: "Typical Confidence", level: "high" },
    ],
  },
  "Curious Apprentice": {
    tagline: "“Teach me everything.”",
    coreMotivation: {
      value: "Growth",
      body: "Sex is something to discover and get better at. Learning what works, trying new things, and understanding each other are part of the pleasure.",
    },
    dimensions: [
      {
        key: "communication",
        title: "Communication",
        subtitle: "How Desire Gets Spoken",
        value: "Open",
        body: "Questions are part of intimacy. Desire is explored through curiosity, feedback, and conversation, with a natural eagerness to understand what feels good.",
      },
      {
        key: "initiation",
        title: "Initiation",
        subtitle: "Who Makes the First Move",
        value: "Shared",
        body: "You are comfortable with either person starting. Initiation works best when it feels collaborative, giving both of you room to signal interest, ask, and explore together.",
      },
      {
        key: "attachment",
        title: "Attachment",
        subtitle: "How Closeness Is Held",
        value: "Secure",
        body: "Closeness tends to feel safe when there is openness and room to learn together. You can stay connected while asking questions, adjusting, and discovering each other over time.",
      },
      {
        key: "power",
        title: "Power",
        subtitle: "Who Takes the Lead",
        value: "Switch",
        body: "You can lead or follow, especially when there is room to explore together. Power feels best when it is flexible rather than fixed.",
      },
    ],
    meters: [
      { label: "Risk Orientation", level: "medium" },
      { label: "Typical Confidence", level: "medium" },
    ],
  },
  "Spiritual Lover": {
    tagline: "“Make love to my soul.”",
    coreMotivation: {
      value: "Meaning",
      body: "Sex matters most when it feels like more than physical pleasure. Emotional depth, intention, and genuine connection are what make it feel significant.",
    },
    dimensions: [
      {
        key: "communication",
        title: "Communication",
        subtitle: "How Desire Gets Spoken",
        value: "Deep",
        body: "Desire is often expressed through meaning and emotion rather than blunt requests. Words matter most when they make intimacy feel sincere and deeply connected.",
      },
      {
        key: "initiation",
        title: "Initiation",
        subtitle: "Who Makes the First Move",
        value: "Responsive",
        body: "You are more likely to respond than push things forward quickly. Desire tends to grow when the moment feels emotionally meaningful, connected, and naturally right.",
      },
      {
        key: "attachment",
        title: "Attachment",
        subtitle: "How Closeness Is Held",
        value: "Secure",
        body: "You are comfortable with deep emotional closeness when it feels sincere and meaningful. Trust makes it easier to soften, open up, and experience intimacy as something shared.",
      },
      {
        key: "power",
        title: "Power",
        subtitle: "Who Takes the Lead",
        value: "Switch",
        body: "You can move between leading and following depending on the emotional tone. What matters most is that the exchange feels connected and meaningful.",
      },
    ],
    meters: [
      { label: "Risk Orientation", level: "low" },
      { label: "Typical Confidence", level: "medium" },
    ],
  },
  "Minimalist Companion": {
    tagline: "“Simple is enough.”",
    coreMotivation: {
      value: "Connection",
      body: "Sex is less about intensity and more about simply being close. Affection, comfort, and shared presence matter more than excitement or performance.",
    },
    dimensions: [
      {
        key: "communication",
        title: "Communication",
        subtitle: "How Desire Gets Spoken",
        value: "Calm",
        body: "Desire does not always need many words. Presence, affection, and simple gestures often communicate more, with conversation staying calm, practical, and low-pressure.",
      },
      {
        key: "initiation",
        title: "Initiation",
        subtitle: "Who Makes the First Move",
        value: "Passive",
        body: "You rarely feel a strong need to make the first move. It is easier to join when intimacy develops naturally, without pressure, urgency, or expectations to perform.",
      },
      {
        key: "attachment",
        title: "Attachment",
        subtitle: "How Closeness Is Held",
        value: "Avoidant",
        body: "Closeness feels best when it is calm and low-pressure. Too much emotional intensity or demand can make you retreat, even when you still care deeply.",
      },
      {
        key: "power",
        title: "Power",
        subtitle: "Who Takes the Lead",
        value: "Submissive",
        body: "You are often more comfortable letting the other person lead. Following can make intimacy feel easier when the direction is gentle and pressure stays low.",
      },
    ],
    meters: [
      { label: "Risk Orientation", level: "low" },
      { label: "Typical Confidence", level: "low" },
    ],
  },
  "Emotional Voyeur": {
    tagline: "“I feel more from observing.”",
    coreMotivation: {
      value: "Emotional Fantasy",
      body: "Much of the excitement begins in your inner world. Anticipation, imagination, and emotional tension can be as important as what actually happens physically.",
    },
    dimensions: [
      {
        key: "communication",
        title: "Communication",
        subtitle: "How Desire Gets Spoken",
        value: "Reserved",
        body: "Much of desire happens internally before it is spoken. Attraction is often communicated through hints, imagination, and observation rather than direct requests.",
      },
      {
        key: "initiation",
        title: "Initiation",
        subtitle: "Who Makes the First Move",
        value: "Passive",
        body: "You often prefer to watch the tension build before stepping in. Being approached gives you space to feel, imagine, and decide whether you want to move closer.",
      },
      {
        key: "attachment",
        title: "Attachment",
        subtitle: "How Closeness Is Held",
        value: "Avoidant",
        body: "You may prefer some emotional distance even when attraction is strong. Observing, imagining, and opening slowly can feel safer than being fully exposed too quickly.",
      },
      {
        key: "power",
        title: "Power",
        subtitle: "Who Takes the Lead",
        value: "Submissive",
        body: "You may prefer to be drawn into the experience rather than direct it. Letting someone else lead can make it easier to stay receptive and immersed.",
      },
    ],
    meters: [
      { label: "Risk Orientation", level: "low" },
      { label: "Typical Confidence", level: "low" },
    ],
  },
  "Authority Conductor": {
    tagline: "“I set the frame—and we play inside it.”",
    coreMotivation: {
      value: "Power",
      body: "Sex becomes most compelling when there is a clear exchange of control. Leading, directing, and shaping the experience are central to what makes it exciting.",
    },
    dimensions: [
      {
        key: "communication",
        title: "Communication",
        subtitle: "How Desire Gets Spoken",
        value: "Commanding",
        body: "Desire is spoken with clarity and direction. Setting the pace, naming what is wanted, and taking the lead can become part of the tension itself.",
      },
      {
        key: "initiation",
        title: "Initiation",
        subtitle: "Who Makes the First Move",
        value: "Active",
        body: "You are comfortable making the first move and setting the direction. Taking initiative can itself be part of the attraction, especially when the other person responds willingly.",
      },
      {
        key: "attachment",
        title: "Attachment",
        subtitle: "How Closeness Is Held",
        value: "Disorganized",
        body: "You may want closeness while still needing to stay in control of it. Deep vulnerability can be appealing, but it may also trigger a need to regain distance or structure.",
      },
      {
        key: "power",
        title: "Power",
        subtitle: "Who Takes the Lead",
        value: "Dominant",
        body: "Taking the lead feels natural. Setting the pace, creating structure, and directing what happens can be a central part of the attraction itself.",
      },
    ],
    meters: [
      { label: "Risk Orientation", level: "high" },
      { label: "Typical Confidence", level: "high" },
    ],
  },
  "Loyal Ritualist": {
    tagline: "“Routine is intimacy.”",
    coreMotivation: {
      value: "Stability",
      body: "Sex is reassuring when it feels dependable and familiar. Trusted patterns, consistency, and knowing what works help desire feel safe enough to return.",
    },
    dimensions: [
      {
        key: "communication",
        title: "Communication",
        subtitle: "How Desire Gets Spoken",
        value: "Consistent",
        body: "Desire is easier to discuss when there is trust and familiarity. Communication tends to be steady, thoughtful, and predictable rather than spontaneous or emotionally charged.",
      },
      {
        key: "initiation",
        title: "Initiation",
        subtitle: "Who Makes the First Move",
        value: "Shared",
        body: "Initiation feels most natural when it follows a familiar rhythm. Either person can begin, especially when both know the signals and the moment feels comfortable and expected.",
      },
      {
        key: "attachment",
        title: "Attachment",
        subtitle: "How Closeness Is Held",
        value: "Secure",
        body: "Closeness grows through reliability, familiarity, and trust. You tend to feel safest when connection is steady, predictable, and reinforced through repeated shared experiences.",
      },
      {
        key: "power",
        title: "Power",
        subtitle: "Who Takes the Lead",
        value: "Switch",
        body: "You can lead or follow, especially when the dynamic feels familiar. Power works best when both people understand the rhythm and know what to expect.",
      },
    ],
    meters: [
      { label: "Risk Orientation", level: "low" },
      { label: "Typical Confidence", level: "medium" },
    ],
  },
  "Tender Devotee": {
    tagline: "“Tell me I’m enough.”",
    coreMotivation: {
      value: "Validation",
      body: "Sex feels most meaningful when it reassures you that you are truly wanted. Feeling chosen, accepted, and desired makes it easier to fully open up.",
    },
    dimensions: [
      {
        key: "communication",
        title: "Communication",
        subtitle: "How Desire Gets Spoken",
        value: "Adaptive",
        body: "Desire is often shaped around the other person first. Responding and pleasing can feel easier than clearly stating personal wants, limits, or preferences.",
      },
      {
        key: "initiation",
        title: "Initiation",
        subtitle: "Who Makes the First Move",
        value: "Responsive",
        body: "You are more likely to open when the other person shows clear interest first. Feeling wanted and welcomed helps you move from uncertainty into participation and desire.",
      },
      {
        key: "attachment",
        title: "Attachment",
        subtitle: "How Closeness Is Held",
        value: "Anxious",
        body: "Closeness matters deeply, and signs of distance can feel especially important. Reassurance, consistency, and feeling clearly wanted help you relax into intimacy.",
      },
      {
        key: "power",
        title: "Power",
        subtitle: "Who Takes the Lead",
        value: "Submissive",
        body: "You are often more comfortable following the other person’s lead. Clear care and reassurance make it easier to relax into that role without losing your own voice.",
      },
    ],
    meters: [
      { label: "Risk Orientation", level: "low" },
      { label: "Typical Confidence", level: "low" },
    ],
  },
  "Analytical Sexualist": {
    tagline: "“Explain the system.”",
    coreMotivation: {
      value: "Mastery",
      body: "Sex is rewarding when you understand how to make it work well. Learning, improving, and knowing how to please create confidence and satisfaction.",
    },
    dimensions: [
      {
        key: "communication",
        title: "Communication",
        subtitle: "How Desire Gets Spoken",
        value: "Precise",
        body: "Desire becomes easier to express when it can be understood clearly. Questions, feedback, and specific information help make intimacy feel more manageable and rewarding.",
      },
      {
        key: "initiation",
        title: "Initiation",
        subtitle: "Who Makes the First Move",
        value: "Shared",
        body: "Either person can make the first move, especially when interest is clear. Initiation feels easier when signals are understandable and there is little need to guess.",
      },
      {
        key: "attachment",
        title: "Attachment",
        subtitle: "How Closeness Is Held",
        value: "Avoidant",
        body: "You may stay connected while keeping some emotional distance. Understanding the situation can feel easier than exposing yourself, especially when feelings become intense or unclear.",
      },
      {
        key: "power",
        title: "Power",
        subtitle: "Who Takes the Lead",
        value: "Switch",
        body: "You can take either role depending on what works best in the moment. A clear sense of what each person wants makes switching feel natural.",
      },
    ],
    meters: [
      { label: "Risk Orientation", level: "medium" },
      { label: "Typical Confidence", level: "medium" },
    ],
  },
  "Quiet Withdrawer": {
    tagline: "“I disappear to survive.”",
    coreMotivation: {
      value: "Avoidance",
      body: "Desire depends heavily on not feeling pressured or overwhelmed. Sex becomes possible when you feel safe, unhurried, and free to choose without consequence.",
    },
    dimensions: [
      {
        key: "communication",
        title: "Communication",
        subtitle: "How Desire Gets Spoken",
        value: "Reserved",
        body: "Desire can be difficult to put into words, especially under pressure. Gentle questions, patience, and room to say no make honest expression much easier.",
      },
      {
        key: "initiation",
        title: "Initiation",
        subtitle: "Who Makes the First Move",
        value: "Passive",
        body: "You may rarely feel comfortable making the first move yourself. Desire is easier to access when there is no pressure and you have plenty of room to choose.",
      },
      {
        key: "attachment",
        title: "Attachment",
        subtitle: "How Closeness Is Held",
        value: "Avoidant",
        body: "Closeness can become difficult when it brings pressure or emotional exposure. You may pull back to feel safe, especially when you are unsure what is expected of you.",
      },
      {
        key: "power",
        title: "Power",
        subtitle: "Who Takes the Lead",
        value: "Submissive",
        body: "You are more likely to let the other person lead, especially when the pace feels gentle. Pressure or forcefulness can quickly make you pull back.",
      },
    ],
    meters: [
      { label: "Risk Orientation", level: "low" },
      { label: "Typical Confidence", level: "low" },
    ],
  },
};

/** Archetypes still waiting on V4 card copy. Asserted by a test so the gap closes
 * loudly rather than silently shipping a card with holes in it. */
export function missingReport3CardCopy(): string[] {
  return KNOWN_ARCHETYPES.filter((name) => !report3ArchetypeCard[name]);
}
