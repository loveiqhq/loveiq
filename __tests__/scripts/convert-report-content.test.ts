import { describe, expect, it } from "vitest";

const { splitByArchetype } = require("../../scripts/convert-report-content.js");

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
});
