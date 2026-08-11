// Per-archetype "yours: …" trait subtexts shown under each behavioural-tendency
// value in the Report 2.0 hero card (Figma 8427:801). These are NOT in Mark's
// copy matrix (the core-archetype section there is a single chart-note), so they
// are captured here directly from the verified Figma frames — one entry per
// archetype, read from that archetype's hero variant. Rendered only when present;
// archetypes without a verified entry fall back to no subtext (never fabricated).
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
};
