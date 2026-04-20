import { describe, expect, it } from "vitest";
import {
  extractAttachmentSectionContent,
  ensureSexualStageHighlight,
  extractPracticeSectionIntroHtml,
  normalizeReportHtml,
  parsePracticeTendencyGroups,
} from "@/components/report/reportContent";
import { archetypeContent } from "@/data/report-archetypes";
import { reportSections } from "@/data/report-general";

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

  it("merges split strong-only heading paragraphs with their following body paragraph", () => {
    const normalized = normalizeReportHtml(
      "<p><strong>Silent (Assumed) Monogamy</strong></p><p>Monogamy is expected but never explicitly discussed.</p>"
    );

    expect(normalized).toBe(
      "<p><strong>Silent (Assumed) Monogamy<br /></strong>Monogamy is expected but never explicitly discussed.</p>"
    );
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

  it("extracts attachment intro prose, common patterns, and the archetype heading separately", () => {
    const attachmentHtml =
      reportSections.find(
        (section) =>
          section.id === "attachment_style_how_safety_closeness_and_distance_shape_desire"
      )?.generalContent ?? "";

    const content = extractAttachmentSectionContent(attachmentHtml);

    expect(content.introHtml).toContain("Attachment style describes how a person relates");
    expect(content.commonHeading).toBe("Common Attachment Style Patterns Across Archetypes");
    expect(content.patterns).toHaveLength(5);
    expect(content.patterns[0]).toMatchObject({
      title: "Secure attachment",
      examples: [
        "Sensual Connector",
        "Relational Nurturer",
        "Loyal Ritualist",
        "Spiritual Lover",
        "Curious Apprentice",
      ],
    });
    expect(content.patterns[1]).toMatchObject({
      title: "Anxious attachment",
      examples: ["Approval Seeker"],
    });
    expect(content.outroHtml).toContain("Attachment style is <strong>not static</strong>");
    expect(content.headingBlock).toContain("Attachment Style of the {{CORE_ARCHETYPE}}");
  });
});
