// Per-archetype "yours: …" trait subtexts shown under each behavioural-tendency
// value in the Report 2.0 hero card (Figma 8427:801). These are NOT in Mark's
// copy matrix (the core-archetype section there is a single chart-note).
//
// Spiritual Lover's entry is verbatim from the Figma hero variant. Per-archetype
// hero variants were never drawn for the other 13, so their entries are written
// from that archetype's OWN report copy rather than invented: each one elaborates
// the trait value already rendered above it (`reportTheme`), using
//   attachment  → `getReport2Section(name, "attachment").result`
//                 (e.g. "Secure (anxious under imbalance)")
//   initiation  → `getReport2Section(name, "initiation").result`
//                 (e.g. "Care-led / Responsive")
//   power       → `getReport2Section(name, "power")["body.p1"]`
//   communication → that archetype's voice as established across those sections
// as the source. The anchor for each is quoted in the comment above its entry, so
// a reviewer can check the phrasing against the copy it came from. Kept in the
// Figma entry's register: lowercase, three to seven words, an em-dash caveat on
// attachment. Rendered only when present, so a missing entry drops the line
// rather than showing a fabricated one.
import type { Report2CopySlug } from "./report2-config";

export interface HeroTraitSubtexts {
  communication: string;
  initiation: string;
  attachment: string;
  power: string;
}

export const heroTraitSubtexts: Partial<Record<Report2CopySlug, HeroTraitSubtexts>> = {
  // Spiritual Lover — verified from Figma node 8427:801.
  "spiritual-lover": {
    communication: "honest, emotionally real talk",
    initiation: "opening when invited, not pursuing",
    attachment: "safe — until distance goes unrepaired",
    power: "either, decided by presence",
  },

  // Charming · Active/Playful · Secure (avoidant under pressure) · flirtatious
  // both ways, "leading happens when momentum grabs you".
  "spark-seeker": {
    communication: "playful, teasing, light on its feet",
    initiation: "starting things for the fun of starting",
    attachment: "easy — until pressure turns you breezy",
    power: "both ways, whichever keeps the game alive",
  },

  // Authentic · Responsive/Inviting · Secure (anxious under strain) · "yielding
  // softly when your partner is fully there".
  "sensual-connector": {
    communication: "warm, unguarded, said through the body",
    initiation: "inviting rather than asking outright",
    attachment: "steady — until strain makes you hold on",
    power: "yielding when your partner is fully there",
  },

  // Gentle · Care-led/Responsive · Secure (anxious under imbalance) · "you lead
  // by tending and yield when you feel supported".
  "relational-nurturer": {
    communication: "gentle, always minding the other person",
    initiation: "offering care, then waiting to be met",
    attachment: "secure — until the giving runs one way",
    power: "leading by tending, yielding when supported",
  },

  // Expressive · Expressive/Conditional · Secure (contextual under strain) ·
  // "you lead through seduction: teasing, display".
  "radiant-performer": {
    communication: "said out loud, wanting made visible",
    initiation: "starting when you can feel it landing",
    attachment: "secure — while being chosen stays visible",
    power: "leading by seduction, yielding to real desire",
  },

  // Honest · Active/Intensity-led · Secure (flips under strain) · "you reach for
  // power to build charge, not status".
  "explorer-of-edges": {
    communication: "blunt, unshockable, no polite edits",
    initiation: "moving first, toward the edge",
    attachment: "close — until judgment flips you away",
    power: "either, whichever raises the charge",
  },

  // Open · Tentative/Inviting · Secure (anxious when judged) · "you lead in small
  // steps, as confidence grows".
  "curious-apprentice": {
    communication: "open questions, asked without pretending",
    initiation: "testing the water, hoping to be met",
    attachment: "trusting — until you feel graded",
    power: "small steps forward, easy yielding",
  },

  // Calm · Comfort-led/Subtle · Secure (avoidant under overwhelm) · "power, for
  // you, is barely about roles at all".
  "minimalist-companion": {
    communication: "few words, low volume, no drama",
    initiation: "drifting closer rather than declaring",
    attachment: "easy — until closeness gets loud",
    power: "neither pole; roles barely register",
  },

  // Reserved · Atmosphere-led/Indirect · Secure (withdraws under exposure) ·
  // "you lead quietly, through mood, pacing, and what you reveal".
  "emotional-voyeur": {
    communication: "held back, shown more than said",
    initiation: "setting a mood instead of asking",
    attachment: "close — until being seen costs too much",
    power: "leading by mood, yielding when unwatched",
  },

  // Commanding · Active/Directive · Secure (avoidant under disrespect) · "mostly
  // that means taking clear command".
  "authority-conductor": {
    communication: "direct instruction, nothing left implied",
    initiation: "setting the frame, then starting it",
    attachment: "solid — until respect slips",
    power: "leading, yielding only where it is earned",
  },

  // Consistent · Ritual-led/Returning · Secure (guarded when unstable) · "you
  // lead through steady presence: dependable initiation, familiar pacing".
  "loyal-ritualist": {
    communication: "the same words, kept and repeated",
    initiation: "returning to what already works",
    attachment: "secure — until the ground keeps moving",
    power: "steady presence, neither pole needed",
  },

  // Adaptive · Responsive/Reassurance-led · Secure, anxious when criticised ·
  // "you yield easily once you feel wanted".
  "tender-devotee": {
    communication: "shaped to keep the warmth in the room",
    initiation: "opening once you are told you are wanted",
    attachment: "warm — until criticism enters",
    power: "yielding easily, leading only when reassured",
  },

  // Precise · Planned/Coordinating · Secure (avoidant under chaos) · "your power
  // lives in words: naming the roles, agreeing the pace".
  "analytical-sexualist": {
    communication: "precise words, nothing left to guess",
    initiation: "planned, agreed, put in the diary",
    attachment: "steady — until chaos arrives",
    power: "naming the roles and the pace out loud",
  },

  // Reserved · Receptive/Low-visibility · Avoidant (secure when pressure stays
  // low) · "you lead by slowing things down: a pause, a gentler pace".
  "quiet-withdrawer": {
    communication: "quiet, and only when it feels safe",
    initiation: "receptive, rarely visible",
    attachment: "guarded — steady while pressure stays low",
    power: "slowing things down, yielding easily",
  },
};
