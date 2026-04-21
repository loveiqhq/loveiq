import { describe, expect, it } from "vitest";
import {
  KNOWN_ARCHETYPES,
  fromArchetypeSlug,
  isArchetypeName,
  toArchetypeSlug,
} from "@/lib/report/archetypeSlug";

describe("archetypeSlug", () => {
  it("round-trips every known archetype", () => {
    for (const name of KNOWN_ARCHETYPES) {
      const slug = toArchetypeSlug(name);
      expect(slug).not.toBeNull();
      expect(fromArchetypeSlug(slug)).toBe(name);
    }
  });

  it("produces kebab-case slugs", () => {
    expect(toArchetypeSlug("Sensual Connector")).toBe("sensual-connector");
    expect(toArchetypeSlug("Explorer of Edges")).toBe("explorer-of-edges");
    expect(toArchetypeSlug("Quiet Withdrawer")).toBe("quiet-withdrawer");
  });

  it("returns null for unknown archetype names", () => {
    expect(toArchetypeSlug("Totally Fake Archetype")).toBeNull();
    expect(toArchetypeSlug("")).toBeNull();
  });

  it("returns null for unknown or empty slugs", () => {
    expect(fromArchetypeSlug(null)).toBeNull();
    expect(fromArchetypeSlug(undefined)).toBeNull();
    expect(fromArchetypeSlug("")).toBeNull();
    expect(fromArchetypeSlug("not-a-real-archetype")).toBeNull();
  });

  it("fromArchetypeSlug is case-insensitive for slugs", () => {
    expect(fromArchetypeSlug("SENSUAL-CONNECTOR")).toBe("Sensual Connector");
    expect(fromArchetypeSlug("Spark-Seeker")).toBe("Spark Seeker");
  });

  it("isArchetypeName accepts known names only", () => {
    expect(isArchetypeName("Sensual Connector")).toBe(true);
    expect(isArchetypeName("sensual connector")).toBe(false);
    expect(isArchetypeName("")).toBe(false);
    expect(isArchetypeName(42)).toBe(false);
    expect(isArchetypeName(null)).toBe(false);
  });
});
