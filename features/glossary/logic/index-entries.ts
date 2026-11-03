import type { GlossaryTerm } from "@/data/glossary-data";

/**
 * What the /glossary index needs per term: the name and link it shows, the
 * group its filter pills match, and the definition its search box matches.
 * About a tenth of the full term data, which stays on the server.
 */
export interface GlossaryIndexEntry {
  term: string;
  slug: string;
  category: string;
  definition: string;
}

// One explicit collation, so the server HTML and the browser can't order the
// list differently (a browser's default locale may sort accents or dashes
// another way, which would be a hydration mismatch).
const collator = new Intl.Collator("en");

/** The slim, A–Z sorted list the index page renders. */
export function toIndexEntries(terms: readonly GlossaryTerm[]): GlossaryIndexEntry[] {
  return terms
    .map(({ term, slug, category, definition }) => ({ term, slug, category, definition }))
    .sort((a, b) => collator.compare(a.term, b.term));
}

/** Groups entries by first letter and keeps their order: the list arrives sorted. */
export function groupByLetter(
  entries: readonly GlossaryIndexEntry[]
): Record<string, GlossaryIndexEntry[]> {
  const grouped = new Map<string, GlossaryIndexEntry[]>();
  for (const entry of entries) {
    const letter = entry.term.charAt(0).toUpperCase();
    const group = grouped.get(letter);
    if (group) group.push(entry);
    else grouped.set(letter, [entry]);
  }
  return Object.fromEntries(grouped);
}

/** Entries whose name or definition contains the query, within one filter group ("all" = every group). */
export function filterEntries(
  entries: readonly GlossaryIndexEntry[],
  query: string,
  category: string
): GlossaryIndexEntry[] {
  const q = query.trim().toLowerCase();
  return entries.filter(
    (entry) =>
      (category === "all" || entry.category === category) &&
      (q === "" ||
        entry.term.toLowerCase().includes(q) ||
        entry.definition.toLowerCase().includes(q))
  );
}
