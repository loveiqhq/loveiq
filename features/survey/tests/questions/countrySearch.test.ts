import { describe, expect, it } from "vitest";

import { COUNTRIES, getCountryFlagUrl } from "@/data/countries";
import {
  COUNTRY_ALIASES,
  exactCountry,
  normalizeCountry,
  searchCountries,
} from "@features/survey/ui/questions/countrySearch";

describe("country search", () => {
  // "UK" and Enter picked Ukraine, its only substring match.
  it("puts the United Kingdom first for UK, Ukraine after it", () => {
    const found = searchCountries("uk");
    expect(found[0]).toBe("United Kingdom");
    expect(found).toContain("Ukraine");
    expect(exactCountry("UK")).toBe("United Kingdom");
  });

  // These found nothing at all.
  it.each([
    ["USA", "United States"],
    ["america", "United States"],
    ["England", "United Kingdom"],
    ["Holland", "Netherlands"],
    ["Deutschland", "Germany"],
    ["Czechia", "Czech Republic"],
    ["Côte d’Ivoire", "Ivory Coast"],
    ["Türkiye", "Turkey"],
    ["Bosna i Hercegovina", "Bosnia and Herzegovina"],
  ])("finds %s as %s, first", (typed, country) => {
    expect(searchCountries(typed)[0]).toBe(country);
    expect(exactCountry(typed)).toBe(country);
  });

  it("ranks names that start with the text above names that only contain it", () => {
    const found = searchCountries("ger");
    expect(found[0]).toBe("Germany");
    expect(found.indexOf("Algeria")).toBeGreaterThan(found.indexOf("Germany"));
  });

  it("matches a word inside a name ('kong', 'rico')", () => {
    expect(searchCountries("kong")[0]).toBe("Hong Kong");
    expect(searchCountries("rico")[0]).toBe("Puerto Rico");
  });

  // Readers there could not find their place.
  it.each(["Hong Kong", "Macau", "Puerto Rico"])("lists %s, with its flag", (place) => {
    expect(COUNTRIES).toContain(place);
    expect(getCountryFlagUrl(place)).toMatch(/^https:\/\/flagcdn\.com\/w40\/[a-z]{2}\.png$/);
  });

  it("names a real country for every alias", () => {
    for (const [alias, country] of COUNTRY_ALIASES) {
      expect(COUNTRIES, `alias "${alias}"`).toContain(country);
      expect(normalizeCountry(alias), `alias "${alias}" is stored normalized`).toBe(alias);
    }
  });

  it("is not exact for a partial name, and returns every country for nothing typed", () => {
    expect(exactCountry("germ")).toBeNull();
    expect(searchCountries("  ")).toEqual(COUNTRIES);
  });
});
