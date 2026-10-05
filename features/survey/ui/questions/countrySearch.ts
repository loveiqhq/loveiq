import { COUNTRIES } from "@/data/countries";

/** Lowercase, no accents, one kind of apostrophe, single spaces. */
export function normalizeCountry(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[’`]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * What people type for a country the list names differently. Without these, "UK" and
 * Enter picked Ukraine (its only match), and "USA", "England", "Holland" or
 * "Deutschland" found nothing at all. Keys are normalized.
 */
export const COUNTRY_ALIASES: ReadonlyMap<string, string> = new Map<string, string>([
  ["uk", "United Kingdom"],
  ["u.k.", "United Kingdom"],
  ["great britain", "United Kingdom"],
  ["britain", "United Kingdom"],
  ["england", "United Kingdom"],
  ["scotland", "United Kingdom"],
  ["wales", "United Kingdom"],
  ["northern ireland", "United Kingdom"],
  ["us", "United States"],
  ["u.s.", "United States"],
  ["usa", "United States"],
  ["u.s.a.", "United States"],
  ["america", "United States"],
  ["united states of america", "United States"],
  ["holland", "Netherlands"],
  ["the netherlands", "Netherlands"],
  ["nederland", "Netherlands"],
  ["czechia", "Czech Republic"],
  ["turkiye", "Turkey"],
  ["cote d'ivoire", "Ivory Coast"],
  ["uae", "United Arab Emirates"],
  ["emirates", "United Arab Emirates"],
  ["burma", "Myanmar"],
  ["swaziland", "Eswatini"],
  ["cape verde", "Cabo Verde"],
  ["timor-leste", "East Timor"],
  ["macedonia", "North Macedonia"],
  ["holy see", "Vatican City"],
  ["drc", "Democratic Republic of the Congo"],
  ["korea", "South Korea"],
  ["deutschland", "Germany"],
  ["espana", "Spain"],
  ["osterreich", "Austria"],
  ["schweiz", "Switzerland"],
  ["suisse", "Switzerland"],
  ["italia", "Italy"],
  ["polska", "Poland"],
  ["hrvatska", "Croatia"],
  ["srbija", "Serbia"],
  ["bosna i hercegovina", "Bosnia and Herzegovina"],
  ["bih", "Bosnia and Herzegovina"],
  ["sverige", "Sweden"],
  ["norge", "Norway"],
  ["danmark", "Denmark"],
  ["suomi", "Finland"],
]);

/** The country the typed text names outright, by its name or an alias, or null. */
export function exactCountry(query: string): string | null {
  const q = normalizeCountry(query);
  if (!q) return null;
  const alias = COUNTRY_ALIASES.get(q);
  if (alias && COUNTRIES.includes(alias)) return alias;
  return COUNTRIES.find((c) => normalizeCountry(c) === q) ?? null;
}

/**
 * The countries matching the typed text, best first: the exact name or alias, then names
 * that start with it, then a word that does (or an alias that does), then any name
 * containing it. A plain substring filter put "Ukraine" alone under "uk".
 */
export function searchCountries(query: string): string[] {
  const q = normalizeCountry(query);
  if (!q) return COUNTRIES;
  const rank = new Map<string, number>();
  const offer = (country: string, r: number) => {
    if (COUNTRIES.includes(country) && (rank.get(country) ?? Infinity) > r) rank.set(country, r);
  };
  for (const [alias, country] of COUNTRY_ALIASES) {
    if (alias === q) offer(country, 0);
    else if (q.length >= 3 && alias.startsWith(q)) offer(country, 2);
  }
  for (const country of COUNTRIES) {
    const name = normalizeCountry(country);
    if (name === q) offer(country, 0);
    else if (name.startsWith(q)) offer(country, 1);
    else if (name.split(/[\s-]+/).some((word) => word.startsWith(q))) offer(country, 2);
    else if (name.includes(q)) offer(country, 3);
  }
  return [...rank]
    .sort((a, b) => a[1] - b[1] || COUNTRIES.indexOf(a[0]) - COUNTRIES.indexOf(b[0]))
    .map(([country]) => country);
}
