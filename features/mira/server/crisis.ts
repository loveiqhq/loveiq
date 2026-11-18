import crisisJson from "../content/crisis-lines.json";

/**
 * Support lines by country, from Sanjin's "Crisis resources" tab (Mira data v1.5), which still
 * needs the team's OK on which countries to cover. The country is the account's "Where you're
 * based", else the visitor's location from Vercel's edge header, else the fallback list.
 */
export type CrisisLine = { name: string; phone?: string; hours?: string; url?: string };
export type CrisisCountry = { code: string; name: string; lines: CrisisLine[]; emergency?: string };

type CrisisData = { countries: CrisisCountry[]; fallback: CrisisCountry };

const DATA = crisisJson as unknown as CrisisData;

export const CRISIS_COUNTRIES = DATA.countries;

export function crisisFor(country: string | null | undefined): CrisisCountry {
  const code = country?.toUpperCase();
  return DATA.countries.find((c) => c.code === code) ?? DATA.fallback;
}

/** The visitor's country from Vercel's geo header (two letters), when present. */
export function requestCountry(request: Request): string | null {
  const code = request.headers.get("x-vercel-ip-country");
  return code && /^[A-Z]{2}$/.test(code) ? code : null;
}
