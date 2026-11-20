import crisisJson from "@features/mira/content/crisis-lines.json";

/** "Where are you based?" offers exactly the countries Sanjin's crisis list covers, plus "somewhere else". */
export const CRISIS_COUNTRY_OPTIONS = (
  crisisJson as unknown as { countries: Array<{ code: string; name: string }> }
).countries.map(({ code, name }) => ({ code, name }));

export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  if (code === "OTHER") return "Somewhere else";
  return CRISIS_COUNTRY_OPTIONS.find((c) => c.code === code)?.name ?? code;
}
