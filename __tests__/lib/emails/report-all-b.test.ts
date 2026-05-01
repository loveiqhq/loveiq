import { describe, expect, it } from "vitest";
import { reportAllBEmail } from "../../../lib/emails/report-all-b";

const SITE_URL = "https://loveiq.org";
const REPORT_URL = "https://loveiq.org/report/abc";

describe("reportAllBEmail", () => {
  it("uses empathy framing with all-archetype intro", () => {
    const result = reportAllBEmail({
      firstName: "Alice",
      reportUrl: REPORT_URL,
      siteUrl: SITE_URL,
    });
    expect(result.subject).toContain("all 14 archetypes");
    expect(result.subject).toContain("Alice");
    expect(result.html).toContain("Not just who you are");
    expect(result.html).toContain("Most people find at least two or three");
  });

  it("renders 14 archetype links in the body", () => {
    const { html } = reportAllBEmail({
      firstName: "Alice",
      reportUrl: REPORT_URL,
      siteUrl: SITE_URL,
    });
    // 14 archetype names — sample the first and last in display order.
    expect(html).toContain("Spark Seeker");
    expect(html).toContain("Approval Seeker");
    expect(html).toContain("Analytical Sexualist");
    expect(html).toMatch(/archetype=spark-seeker/);
  });

  it("uses generic greeting when firstName missing", () => {
    const { html } = reportAllBEmail({ reportUrl: REPORT_URL, siteUrl: SITE_URL });
    expect(html).toContain("Hi there,");
  });
});
