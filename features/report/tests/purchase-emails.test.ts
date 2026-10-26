import { describe, expect, it } from "vitest";
import { reportFullEmail } from "@features/report/server/emails/report-full";
import { reportAllEmail } from "@features/report/server/emails/report-all";
import { initialUnlockEmail } from "@features/report/server/emails/initial-unlock";

const base = {
  firstName: "Ada",
  reportUrl: "https://www.loveiq.org/report/rpt_ABCDEFGHIJKLMNOPQRST?from=email",
  siteUrl: "https://www.loveiq.org",
};

/** Figma 1382:2556 (single report) and 1382:2554 (All 14): the Pricing 3.0 thank-you mails. */
describe("purchase emails — Pricing 3.0 copy", () => {
  it("thanks a buyer of their own report the way the frame does", () => {
    const { html, text, subject } = reportFullEmail({ ...base, unlockedArchetype: null });
    expect(html).toContain("You&rsquo;ve unlocked your full report.");
    expect(html).toContain("Your Full Report is unlocked.");
    expect(html).toContain("every dimension we analyse");
    expect(html).toContain("Dimensions of insight you can actually use");
    expect(html).toContain("View your full report&nbsp;&rarr;");
    // The old heading and the dimension count the copy no longer claims.
    expect(html).not.toContain("You went deeper");
    expect(html).not.toMatch(/18 (analysed )?dimensions/);
    expect(text).toContain("Your Full Report is unlocked.");
    expect(text).toContain("View your full report: https://www.loveiq.org/report/");
    expect(subject).toBe("Your full report is ready, Ada");
  });

  it("still names an archetype bought from another archetype's tile", () => {
    const { html, text } = reportFullEmail({ ...base, unlockedArchetype: "Spark Seeker" });
    expect(html).toContain("You&rsquo;ve unlocked the Spark Seeker full report.");
    expect(html).toContain("Your Spark Seeker Full Report is unlocked.");
    expect(html).toContain("archetype=spark-seeker");
    expect(text).toContain("View your Spark Seeker full report:");
  });

  it("heads the All 14 mail with what was bought", () => {
    const { html, subject } = reportAllEmail(base);
    expect(html).toContain("You&rsquo;ve unlocked all 14 reports.");
    expect(html).not.toContain("You went deeper");
    expect(subject).toBe("All 14 archetypes are now yours, Ada");
  });
});

/** E06 (Figma 1669:2703): the EUR 1.99 Core Archetype's thank-you mail, copy as the frame has it. */
describe("E06 — your Core Archetype is unlocked", () => {
  it("says what was unlocked, in the frame's words and bold", () => {
    const { html, subject } = initialUnlockEmail(base);
    expect(subject).toBe("Your Core Archetype is unlocked");
    expect(html).toContain("Find out which archetype leads for you.");
    expect(html).toContain("You&rsquo;ve unlocked your Core Archetype.");
    expect(html).toContain("Hi Ada,");
    expect(html).toContain(
      "Thank you for trusting us with something this personal. That means a lot to us."
    );
    expect(html).toMatch(/<strong[^>]*>Your Core Archetype is ready\.<\/strong>/);
    expect(html).toMatch(
      /Inside, you&rsquo;ll find <strong[^>]*>which archetype leads for you<\/strong> and how your whole constellation fits together, scored across all 14 archetypes\./
    );
    expect(html).toMatch(
      /You can read <strong[^>]*>five chapters in full<\/strong>\. Four featured chapters are partly open:/
    );
    expect(html).toContain(
      "Every other chapter opens with a preview, so you can see what&rsquo;s waiting for you."
    );
  });

  it("lists the four partly open chapters, each name in bold", () => {
    const { html } = initialUnlockEmail(base);
    for (const [name, rest] of [
      ["Typical Beliefs:", "the rules about sex you never agreed to"],
      ["Accelerators &amp; Brakes:", "what turns you on, and what shuts you down"],
      ["Challenges in Partnerships:", "where partners misread you"],
      ["Fantasy vs. Reality:", "what your fantasies say about what you want"],
    ]) {
      expect(html).toMatch(new RegExp(`<li[^>]*><strong[^>]*>${name}</strong> ${rest}</li>`));
    }
  });

  it("links the button to the report and offers the EUR 10", () => {
    const { html } = initialUnlockEmail(base);
    expect(html).toContain(`href="${base.reportUrl.replace(/&/g, "&amp;")}"`);
    expect(html).toContain("See your Core Archetype&nbsp;&rarr;");
    expect(html).toMatch(
      /Want the rest\? You have <strong[^>]*>&euro;10 off the full report<\/strong> whenever you&rsquo;re ready\./
    );
    expect(html).toContain("We&rsquo;ll get you back in.");
  });

  it("reads the same in plain text", () => {
    const { text } = initialUnlockEmail(base);
    expect(text).toContain("Your Core Archetype is ready.");
    expect(text).toContain("- Typical Beliefs: the rules about sex you never agreed to");
    expect(text).toContain(`See your Core Archetype: ${base.reportUrl}`);
    expect(text).toContain(
      "Want the rest? You have €10 off the full report whenever you're ready."
    );
  });

  it("greets a reader without a name, and never trusts the name it is given", () => {
    expect(initialUnlockEmail({ ...base, firstName: null }).html).toContain("Hi there,");
    const { html } = initialUnlockEmail({ ...base, firstName: "<b>Ada</b>" });
    expect(html).toContain("Hi &lt;b&gt;Ada&lt;/b&gt;,");
    expect(html).not.toContain("<b>Ada</b>");
  });
});
