import { describe, expect, it } from "vitest";
import { expandBusinessVocabulary } from "@features/brain/server/vocabulary";

/**
 * Measured 2026-09-09 over 465 questions written the way colleagues actually ask them:
 * 39% returned a confidently-cited source about something else, and for founder-shaped
 * questions it was 55%. The corpus held the answer in every case below -- the question
 * just did not use its words.
 */
describe("plain English reaches the numbers", () => {
  const reaches = (q: string, term: string) => {
    const out = expandBusinessVocabulary(q);
    expect(out.startsWith(q)).toBe(true); // appended, never substituted
    expect(out).toMatch(new RegExp(`\\b${term}\\b`));
  };

  it("translates the words that were measured to fail", () => {
    // Each of these returned something absurd before: a PostHog newsletter titled
    // "We made a horror film", an ad network's cold outreach, a duplicated calendar
    // meeting, and report copy about "bids and repair".
    reaches("how much money have we made", "revenue");
    reaches("how much have we earned", "revenue");
    reaches("what is our traffic", "visits");
    reaches("is the funnel working", "conversion");
    reaches("how are we doing", "revenue");
    reaches("how many new users ever", "signups");
    reaches("are we profitable", "revenue");
    reaches("are we growing", "signups");
  });

  it("does not fire on the trigger word used in a non-metric sense", () => {
    for (const q of [
      "which candidate did we speak to about running growth at the end of March 2026",
      "who is the Growth Lead",
      "what is our growth direction",
      "New user has been added to the workspace",
      "who argued that a simpler interface drives conversion",
    ]) {
      expect(expandBusinessVocabulary(q), `misfired on: ${q}`).toBe(q);
    }
  });

  it("leaves a question that already speaks the house language alone", () => {
    // Adding a word the asker already used would double its weight on a question that
    // never needed the help.
    for (const q of [
      "how much revenue did we make in August 2026",
      "how many signups in July 2026",
      "how many visits last week",
      "what is the pricing model",
      "who is on the team",
      "how do I add a new landing section",
    ]) {
      expect(expandBusinessVocabulary(q)).toBe(q);
    }
  });

  it("never adds more than a handful of words", () => {
    // `word_similarity` scores the best contiguous extent of a title, so a query that
    // balloons dilutes every extent and makes the ranking WORSE -- the same mechanism
    // that made verbose month questions beat terse ones.
    const worst = expandBusinessVocabulary(
      "how are we doing on money, traffic, growth, profitability, new users and the funnel"
    );
    const added =
      worst.split(/\s+/).length -
      "how are we doing on money, traffic, growth, profitability, new users and the funnel".split(
        /\s+/
      ).length;
    expect(added).toBeLessThanOrEqual(4);
  });
});
