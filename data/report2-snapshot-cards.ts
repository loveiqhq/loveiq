// Per-archetype values for the first two Snapshot cards ("Your hidden edge" and
// "Your arousal type", Figma 8719:8871). These are NOT in Mark's copy matrix
// (the snapshot section there only carries the compare stats + sublines), so
// they are captured here directly from the verified Figma frame — one entry per
// archetype. Card 3 (sexual stage) is fully data-driven from report2-config's
// `stage_default`, so it needs no entry here. Rendered only when present;
// archetypes without a verified entry fall back to no card 1/2 value (never
// fabricated).
import type { Report2CopySlug } from "./report2-config";

export interface SnapshotCards {
  /** Card 1 "YOUR HIDDEN EDGE" — big value + subtext. */
  hiddenEdge: { value: string; subtext: string };
  /** Card 2 "YOUR AROUSAL TYPE" subtext. The value is derived from config.families.arousal. */
  arousalSubtext: string;
}

export const snapshotCards: Partial<Record<Report2CopySlug, SnapshotCards>> = {
  // Spiritual Lover — verified from Figma node 8719:8871.
  "spiritual-lover": {
    hiddenEdge: {
      value: "1 in 3",
      subtext:
        "Spiritual Lovers carry a taboo craving they rarely admit. The full report maps yours.",
    },
    arousalSubtext:
      "Desire that warms up rather than switching on, so the conditions are your ignition.",
  },
};
