import { describe, expect, it } from "vitest";
import config from "@/data/report2-archetype-config.json";
import {
  LOVE_LANGUAGE_ORDER_BY_SLUG,
  LOVE_LANGUAGE_SLUGS,
  getLoveLanguageOrder,
} from "@/data/report2-love-languages";

const slugs = Object.keys(config as Record<string, unknown>).filter((s) => !s.startsWith("_"));

describe("report2 love language order", () => {
  it("covers all 14 archetypes", () => {
    expect(slugs).toHaveLength(14);
    for (const slug of slugs) {
      expect(getLoveLanguageOrder(slug), `${slug} has no order`).toBeTruthy();
    }
  });

  it("reproduces the one real love_language_order config exactly", () => {
    const withConfig = slugs.filter(
      (s) => !!(config as Record<string, { love_language_order?: unknown }>)[s]?.love_language_order
    );
    expect(withConfig).toEqual(["spiritual-lover"]);

    const real = (config as Record<string, { love_language_order: string[] }>)["spiritual-lover"]!
      .love_language_order;
    expect(getLoveLanguageOrder("spiritual-lover")).toEqual(real);
  });

  it("ranks each of the five languages exactly once", () => {
    for (const [slug, order] of Object.entries(LOVE_LANGUAGE_ORDER_BY_SLUG)) {
      expect(order, `${slug} length`).toHaveLength(LOVE_LANGUAGE_SLUGS.length);
      expect([...order].sort(), `${slug} is a permutation`).toEqual(
        [...LOVE_LANGUAGE_SLUGS].sort()
      );
    }
  });

  it("returns null for an unknown slug", () => {
    expect(getLoveLanguageOrder("nope")).toBeNull();
    expect(getLoveLanguageOrder(null)).toBeNull();
  });
});
