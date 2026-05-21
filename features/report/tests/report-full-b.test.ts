import { describe, expect, it } from "vitest";
import { reportFullBEmail } from "@features/report/server/emails/report-full-b";

const SITE_URL = "https://loveiq.org";
const REPORT_URL = "https://loveiq.org/report/abc";

describe("reportFullBEmail", () => {
  it("uses discovery framing with All-Reports cross-sell", () => {
    const result = reportFullBEmail({
      firstName: "Alice",
      reportUrl: REPORT_URL,
      siteUrl: SITE_URL,
    });
    expect(result.subject).toContain("Something specific");
    expect(result.html).toContain("Not because it&rsquo;s unusual");
    expect(result.html).toContain("Eighteen analysed dimensions");
    expect(result.html).toContain("All Reports unlocks all 14 archetypes");
    expect(result.html).toContain("six complimentary months");
  });

  it("appends archetype query when unlockedArchetype provided", () => {
    const { html } = reportFullBEmail({
      firstName: "Alice",
      reportUrl: REPORT_URL,
      siteUrl: SITE_URL,
      unlockedArchetype: "Spark Seeker",
    });
    expect(html).toMatch(/[?&]archetype=spark-seeker/);
  });

  it("escapes HTML in firstName", () => {
    const { html } = reportFullBEmail({
      firstName: "<x>",
      reportUrl: REPORT_URL,
      siteUrl: SITE_URL,
    });
    expect(html).not.toContain("<x>");
  });
});
