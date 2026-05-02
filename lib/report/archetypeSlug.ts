export const KNOWN_ARCHETYPES = [
  "Sensual Connector",
  "Spark Seeker",
  "Relational Nurturer",
  "Exhibitionist Performer",
  "Explorer of Edges",
  "Curious Apprentice",
  "Spiritual Lover",
  "Minimalist Companion",
  "Emotional Voyeur",
  "Power Orchestrator",
  "Loyal Ritualist",
  "Approval Seeker",
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

export function toArchetypeSlug(name: string): string | null {
  return NAME_TO_SLUG.get(name) ?? null;
}

export function fromArchetypeSlug(slug: string | null | undefined): ArchetypeName | null {
  if (!slug) return null;
  return SLUG_TO_NAME.get(slug.toLowerCase()) ?? null;
}

export function isArchetypeName(value: unknown): value is ArchetypeName {
  return typeof value === "string" && NAME_TO_SLUG.has(value);
}
