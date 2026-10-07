import { describe, expect, it } from "vitest";
import { reportFullEmail } from "@features/report/server/emails/report-full";
import { reportAllEmail } from "@features/report/server/emails/report-all";

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
