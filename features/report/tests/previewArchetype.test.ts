import { describe, expect, it } from "vitest";

import { resolvePreviewArchetype } from "../server/previewArchetype";

/**
 * `?preview_archetype=` lets staging render one submission's report as another
 * archetype's, which means it decides WHICH archetype's paid chapters a request
 * gets back. The production guard is the whole safety story, so it is tested
 * first and from both directions.
 */
describe("resolvePreviewArchetype", () => {
  const SCORED = "Relational Nurturer";

  it("is inert on production, even for a valid archetype", () => {
    for (const site of [
      "https://www.loveiq.org",
      "https://loveiq.org",
      "https://www.loveiq.org/",
    ]) {
      expect(resolvePreviewArchetype("Spark Seeker", SCORED, site)).toBe(SCORED);
    }
  });

  it("works on staging and on a preview deployment", () => {
    for (const site of [
      "https://staging.loveiq.org",
      "https://loveiq-staging-git-report-spark-seeker-doc-pass-loveiq.vercel.app",
      "http://localhost:3000",
      "",
      undefined,
    ]) {
      expect(resolvePreviewArchetype("Spark Seeker", SCORED, site)).toBe("Spark Seeker");
    }
  });

  it("ignores anything that is not exactly a known archetype", () => {
    for (const bad of [
      "spark-seeker",
      "SPARK SEEKER",
      "Spark Seeker ",
      "Sparky",
      "__proto__",
      "constructor",
      "",
    ]) {
      expect(resolvePreviewArchetype(bad, SCORED, "https://staging.loveiq.org")).toBe(SCORED);
    }
  });

  it("passes the scored archetype through when the parameter is absent", () => {
    expect(resolvePreviewArchetype(null, SCORED, "https://staging.loveiq.org")).toBe(SCORED);
  });

  it("accepts every archetype the product has, so no chapter is unreviewable", () => {
    for (const name of ["Spark Seeker", "Spiritual Lover", "Quiet Withdrawer", "Tender Devotee"]) {
      expect(resolvePreviewArchetype(name, SCORED, "https://staging.loveiq.org")).toBe(name);
    }
  });
});
