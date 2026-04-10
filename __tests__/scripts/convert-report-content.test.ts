import { describe, expect, it } from "vitest";

const { cleanHtml, splitByArchetype } = require("../../scripts/convert-report-content.js");

describe("convert-report-content splitByArchetype", () => {
  it("keeps recommendation sections aligned when empty h2 or h3 tags precede the heading paragraph", () => {
    const html = [
      "<p>Recommendations for the Sensual Connector</p>",
      "<h3><strong>Mindful book</strong></h3>",
      "<ul><li>Connector copy.</li></ul>",
      "<h2></h2>",
      "<p>Recommendations for the Explorer of Edges</p>",
      "<h3></h3>",
      "<h3><strong>Edge book</strong></h3>",
      "<ul><li>Explorer copy.</li></ul>",
      "<h2></h2>",
      "<p>Recommendations for the Quiet Withdrawer</p>",
      "<h3></h3>",
      "<h3><strong>Quiet book</strong></h3>",
      "<ul><li>Withdrawer copy.</li></ul>",
    ].join("");

    const result = splitByArchetype(html);

    expect(result["Sensual Connector"]).toContain("Mindful book");
    expect(result["Explorer of Edges"]).toContain("Edge book");
    expect(result["Explorer of Edges"]).toContain("Explorer copy.");
    expect(result["Explorer of Edges"]).not.toBe("<h2></h2>");
    expect(result["Quiet Withdrawer"]).toContain("Quiet book");
  });

  it("strips Google Docs footnote references during docx cleanup", () => {
    const cleaned = cleanHtml(
      '<p><strong>Common Thought:</strong> "What do I actually like?"<a href="https://docs.google.com/document/d/example/edit">1</a></p>'
    );

    expect(cleaned).toContain('"What do I actually like?"');
    expect(cleaned).not.toContain(">1</a>");
    expect(cleaned).not.toContain("docs.google.com/document");
  });
});
