import { describe, expect, it } from "vitest";
import config from "@/data/report2-archetype-config.json";
import {
  RELATIONSHIP_FIT_BY_SLUG,
  RELATIONSHIP_FIT_SLUGS,
  getRelationshipFit,
} from "@/data/report2-relationship-fit";

const slugs = Object.keys(config as Record<string, unknown>).filter((s) => !s.startsWith("_"));

describe("report2 relationship fit", () => {
  it("covers all 14 archetypes", () => {
    expect(slugs).toHaveLength(14);
    for (const slug of slugs) {
      expect(getRelationshipFit(slug), `${slug} has no fit map`).toBeTruthy();
    }
  });

  it("reproduces the one real relationship_fit config exactly", () => {
    // Spiritual Lover is the only archetype with `relationship_fit` in config;
    // matching it is what makes the other 13 trustworthy.
    const withConfig = slugs.filter(
      (s) => !!(config as Record<string, { relationship_fit?: unknown }>)[s]?.relationship_fit
    );
    expect(withConfig).toEqual(["spiritual-lover"]);

    const real = (config as Record<string, { relationship_fit: Record<string, number> }>)[
      "spiritual-lover"
    ]!.relationship_fit;
    expect(getRelationshipFit("spiritual-lover")).toEqual(real);
  });

  it("scores every form on the supported half-step scale", () => {
    const allowed = new Set([0.5, 1, 1.5, 2, 2.5, 3]);
    for (const [slug, fit] of Object.entries(RELATIONSHIP_FIT_BY_SLUG)) {
      expect(Object.keys(fit).sort(), `${slug} form keys`).toEqual(
        [...RELATIONSHIP_FIT_SLUGS].sort()
      );
      for (const form of RELATIONSHIP_FIT_SLUGS) {
        expect(allowed.has(fit[form]), `${slug}.${form} = ${fit[form]}`).toBe(true);
      }
    }
  });

  it("never rates a priority-free form above a committed one", () => {
    // The nine forms run most-intentional → least-intentional. Every archetype
    // in this report is relationship-oriented, so the two "without emotional
    // priority" forms must never outrank plain monogamy — a sanity check that a
    // hand-authored vector was not entered out of order.
    for (const [slug, fit] of Object.entries(RELATIONSHIP_FIT_BY_SLUG)) {
      for (const form of ["open_no_priority", "polyamory_no_priority", "anarchy"] as const) {
        expect(fit[form], `${slug}.${form} vs monogamy`).toBeLessThan(fit.monogamy);
      }
    }
  });

  it("returns null for an unknown slug", () => {
    expect(getRelationshipFit("nope")).toBeNull();
    expect(getRelationshipFit(null)).toBeNull();
  });
});
