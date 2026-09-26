import { describe, expect, it } from "vitest";
import { ESSENTIALS_SECTION_IDS } from "@features/report/server/access";
import { reportEssentialsEmail } from "@features/report/server/emails/report-essentials";

/**
 * The words the email uses for each section Essentials unlocks. It is sent to someone who
 * has just paid, so it may promise only what they got: until 2026-09-26 it named three
 * sections that are free to everyone or need the full report, and none of these six.
 */
const EMAIL_WORDS: Record<(typeof ESSENTIALS_SECTION_IDS)[number], string> = {
  summary: "summary",
  attachment_style: "attachment style",
  core_insecurities: "core insecurities",
  confidence_level: "confidence level",
  typical_beliefs: "typical beliefs",
  typical_arousal_accelerators_turn_ons_of_the_core_archetype: "turn-ons",
};

const email = reportEssentialsEmail({
  firstName: "Ana",
  reportUrl: "https://www.loveiq.org/report/abc",
  siteUrl: "https://www.loveiq.org",
  unlockedArchetype: "Spiritual Lover",
});

describe("the Essentials purchase email", () => {
  it("names every section Essentials unlocks, in the HTML and the plain text", () => {
    // A section added to or removed from Essentials fails here until the email follows.
    expect(Object.keys(EMAIL_WORDS).sort()).toEqual([...ESSENTIALS_SECTION_IDS].sort());
    for (const words of Object.values(EMAIL_WORDS)) {
      expect(email.text.toLowerCase()).toContain(words);
      expect(email.html.toLowerCase()).toContain(words);
    }
  });

  it("promises nothing Essentials does not unlock", () => {
    for (const body of [email.text, email.html]) {
      expect(body).not.toMatch(/archetype probabilities|core motivation|relational stage/i);
    }
  });
});
