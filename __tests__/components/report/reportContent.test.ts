import { describe, expect, it } from "vitest";
import {
  ensureSexualStageHighlight,
  extractPracticeSectionIntroHtml,
  normalizeReportHtml,
  parsePracticeTendencyGroups,
} from "@/components/report/reportContent";
import { archetypeContent } from "@/data/report-archetypes";

describe("reportContent normalization", () => {
  it("removes leaked Google Docs footnote links from prose", () => {
    const normalized = normalizeReportHtml(
      '<p><strong>Common Thought:</strong> "What do I actually like?"<a href="https://docs.google.com/document/d/example/edit">1</a></p>'
    );

    expect(normalized).toContain('"What do I actually like?"');
    expect(normalized).not.toContain(">1</a>");
    expect(normalized).not.toContain("docs.google.com/document");
  });

  it("preserves real resource links while removing footnote artifacts", () => {
    const normalized = normalizeReportHtml(
      '<p><a href="https://example.com/books">What you can read next</a></p><p>Curious, warming up, uncertain but alive<a href="https://docs.google.com/document/d/example/edit">1</a></p>'
    );

    expect(normalized).toContain('href="https://example.com/books"');
    expect(normalized).toContain("What you can read next");
    expect(normalized).toContain("Curious, warming up, uncertain but alive");
    expect(normalized).not.toContain("docs.google.com/document");
  });

  it("converts the sexual stage summary into the themed highlight block", () => {
    const normalized = ensureSexualStageHighlight(
      "<p><strong>Your likely current sexual stage: </strong>Grounded / Integrated</p><p>(A snapshot of how your sexuality is organized right now, not a permanent identity.)</p>"
    );

    expect(normalized).toContain('class="report-stage-highlight"');
    expect(normalized).toContain('class="report-stage-highlight__label"');
    expect(normalized).toContain("Grounded / Integrated");
    expect(normalized).toContain('class="report-stage-highlight__meta"');
  });

  it("removes the DOCX image heading from the practice tendencies intro flow", () => {
    const introHtml = extractPracticeSectionIntroHtml(
      [
        "<p>Over time, most people develop recurring sexual scripts.</p>",
        "<p>Looking at both dimensions together helps distinguish themes.</p>",
        '<p>Typical Sexual Fantasy &amp; Practice Tendencies of the <span class="report-archetype-name">Spark Seeker</span><img src="data:image/png;base64,ABC" /></p>',
      ].join("")
    );

    expect(introHtml).toContain("Over time, most people develop recurring sexual scripts.");
    expect(introHtml).toContain("Looking at both dimensions together helps distinguish themes.");
    expect(introHtml).not.toContain("data:image/png");
    expect(introHtml).not.toContain("Typical Sexual Fantasy");
  });

  it("parses grouped practice tendency tables into structured row data", () => {
    const groups = parsePracticeTendencyGroups(archetypeContent.practices["Spark Seeker"]);

    expect(groups[0]?.title).toBe("Core Relational & Embodied");
    expect(groups[0]?.rows[0]).toEqual({
      practice: "Romantic lovemaking",
      fantasyPull: 6,
      actualPleasure: 6,
    });
    expect(groups.some((group) => group.title === "Technology & Distance")).toBe(true);
  });
});
