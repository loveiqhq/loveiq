export const KNOWN_ARCHETYPES = [
  "Sensual Connector",
  "Spark Seeker",
  "Relational Nurturer",
  "Radiant Performer",
  "Explorer of Edges",
  "Curious Apprentice",
  "Spiritual Lover",
  "Minimalist Companion",
  "Emotional Voyeur",
  "Authority Conductor",
  "Loyal Ritualist",
  "Tender Devotee",
  "Analytical Sexualist",
  "Quiet Withdrawer",
] as const;

export type ArchetypeName = (typeof KNOWN_ARCHETYPES)[number];

const NAME_TO_SLUG = new Map<string, string>(
  KNOWN_ARCHETYPES.map((name) => [name, name.toLowerCase().replace(/\s+/g, "-")])
);

const SLUG_TO_NAME = new Map<string, ArchetypeName>(
  Array.from(NAME_TO_SLUG.entries()).map(([name, slug]) => [slug, name as ArchetypeName])
);

// V9 archetype renames: old report URLs and any cached external links continue
// to resolve to the renamed archetype. Old name strings still resolve too so
// any not-yet-migrated DB row maps to the current archetype.
const LEGACY_NAME_TO_NEW: Record<string, ArchetypeName> = {
  "Approval Seeker": "Tender Devotee",
  "Power Orchestrator": "Authority Conductor",
  "Exhibitionist Performer": "Radiant Performer",
};

const LEGACY_SLUG_TO_NAME: Record<string, ArchetypeName> = Object.fromEntries(
  Object.entries(LEGACY_NAME_TO_NEW).map(([oldName, newName]) => [
    oldName.toLowerCase().replace(/\s+/g, "-"),
    newName,
  ])
);

export function toArchetypeSlug(name: string): string | null {
  const direct = NAME_TO_SLUG.get(name);
  if (direct) return direct;
  const renamed = LEGACY_NAME_TO_NEW[name];
  return renamed ? (NAME_TO_SLUG.get(renamed) ?? null) : null;
}

export function fromArchetypeSlug(slug: string | null | undefined): ArchetypeName | null {
  if (!slug) return null;
  const lower = slug.toLowerCase();
  return SLUG_TO_NAME.get(lower) ?? LEGACY_SLUG_TO_NAME[lower] ?? null;
}

export function isArchetypeName(value: unknown): value is ArchetypeName {
  return typeof value === "string" && NAME_TO_SLUG.has(value);
}
