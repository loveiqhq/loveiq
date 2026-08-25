// One-line archetype descriptions for the opening primer's top-three rows.
//
// Added 2026-08-25. The rows showed rank, name, motto and a match bar, which
// tells a reader which three patterns came out on top and nothing at all about
// what they ARE. The motto is evocative, not descriptive: "Make it feel
// meaningful, like our bodies are saying something deeper" does not say what
// the Spiritual Lover pattern actually does.
//
// Deliberately DESCRIPTIVE rather than second-person: rows two and three are
// not the reader, so "you" would be wrong on two of the three lines. Each one
// follows the same shape — what the desire runs on, then what closes it — so
// the three rows can be read against each other at a glance, which is the whole
// point of showing three.
//
// Not in the copy matrix; see the note at the top of `report2-summary.ts` for
// why this layer lives in code.
import type { Report2CopySlug } from "./report2-config";

export const archetypeBlurbs: Partial<Record<Report2CopySlug, string>> = {
  "spiritual-lover":
    "Desire that runs on meaning and presence. It opens when the connection feels true, and closes quietly when something between you is left unrepaired.",
  "sensual-connector":
    "Desire that starts in being met, not in being touched. Warmth, attention and unhurried time do more here than anything technical.",
  "spark-seeker":
    "Desire that ignites on aliveness and novelty. It arrives fast, fades fast, and relights through play rather than effort.",
  "relational-nurturer":
    "Desire that runs through care. Being trusted and needed opens it; giving that never comes back the other way quietly drains it.",
  "radiant-performer":
    "Desire that switches on when you are visibly wanted. Attention feeds it, and silence reads to the body as a verdict.",
  "explorer-of-edges":
    "Desire that wants intensity with permission. The charge opens it in seconds; a flicker of judgement closes it just as fast.",
  "curious-apprentice":
    "Desire that needs safety before it shows up. Encouragement and room to try open it; feeling graded stalls it.",
  "minimalist-companion":
    "Desire that opens through ease rather than intensity. Simple, unhurried closeness works where pressure of any kind does not.",
  "emotional-voyeur":
    "Desire that begins in imagination and atmosphere. Privacy is what lets it reach the body; being put on the spot empties it out.",
  "authority-conductor":
    "Desire that locks in once the frame is clear. Clean roles and real consent open it; chaos and slipped respect shut it down.",
  "loyal-ritualist":
    "Desire that warms on repetition rather than novelty. A rhythm you can count on opens it; sudden change takes it with it.",
  "tender-devotee":
    "Desire that turns on being chosen out loud. Praise and clear signs of wanting open it; comparison closes it for days.",
  "analytical-sexualist":
    "Desire that starts in the mind. Understanding, clarity and honest feedback open it; vagueness keeps it off.",
  "quiet-withdrawer":
    "Desire that is present until pressure arrives. Calm and time to warm up open it; rush or demand switches it off.",
};
