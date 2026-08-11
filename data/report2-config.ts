// Client-SAFE access to the Report 2.0 per-archetype config (accent, families,
// hero data, stats). This module imports ONLY the ~17KB config JSON, never the
// 634KB `report2-copy.ts`, so it is safe to import from client components.
// The large per-archetype COPY is resolved server-side and passed down as props
// (see `data/report2.ts`, used only in server code).
import report2ConfigJson from "./report2-archetype-config.json";

// The 14 archetype slugs (kebab-case). Duplicated as a bare string union here —
// rather than re-exported from the 634KB report2-copy.ts — so client components
// can type against it without pulling the copy data into their bundle.
export type Report2CopySlug =
  | "spiritual-lover"
  | "spark-seeker"
  | "sensual-connector"
  | "relational-nurturer"
  | "radiant-performer"
  | "explorer-of-edges"
  | "curious-apprentice"
  | "tender-devotee"
  | "authority-conductor"
  | "analytical-sexualist"
  | "emotional-voyeur"
  | "loyal-ritualist"
  | "minimalist-companion"
  | "quiet-withdrawer";

type Segments = 1 | 2 | 3;

export interface Report2HeroConfig {
  match_pct?: number | null;
  risk_segments?: Segments | null;
  confidence_segments?: Segments | null;
  traits?: {
    communication: string;
    initiation: string;
    attachment: string;
    power: string;
  } | null;
}

export interface Report2Families {
  energy: string;
  arousal: string;
  initiation: string;
  attachment: string;
  insecurity_cue: string;
  power_zone: string;
}

export interface Report2ImportanceStrip {
  /** Universal band that selects which Low/Medium/High description shows. */
  band: "Low" | "Medium" | "High";
  /** Fine dot x-position from Figma; only Spiritual Lover has one today. */
  you_dot_x?: number | null;
}

export interface Report2ArchetypeConfig {
  name: string;
  accent: { base: string; ink: string; tintBg: string };
  families?: Report2Families;
  hero?: Report2HeroConfig;
  importance_strip?: Report2ImportanceStrip | null;
  stats?: Record<string, string>;
  // Other section config (attachment_plane, insecurity_graph, reward_meters, …)
  // is loosely typed until each section is built out.
  [key: string]: unknown;
}

// The JSON has two leading meta keys (`_schema`, `_inferred_marker`) alongside
// the per-archetype objects; keyed access by slug never touches them.
const report2Config = report2ConfigJson as unknown as Record<string, Report2ArchetypeConfig>;

/** "Spiritual Lover" → "spiritual-lover" (the handoff's slug convention). */
export function archetypeSlug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

/** Visual/data-driven config for an archetype (accent, families, hero, stats). Null if unknown. */
export function getReport2Config(name: string): Report2ArchetypeConfig | null {
  return report2Config[archetypeSlug(name)] ?? null;
}
