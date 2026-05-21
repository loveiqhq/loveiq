// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AttachmentPatternsSection from "@features/report/ui/sections/AttachmentPatternsSection";
import { reportSections } from "@/data/report-general";

const attachmentGeneralHtml =
  reportSections.find((section) => section.id === "attachment_style")?.generalContent ?? "";
const resolvedAttachmentGeneralHtml = attachmentGeneralHtml.replace(
  /\{\{CORE_ARCHETYPE\}\}/g,
  '<span class="report-archetype-name">Spark Seeker</span>'
);

describe("AttachmentPatternsSection", () => {
  it("renders the intro + premium archetype content; the 'Common Attachment Style Patterns' grid is no longer in the V3 template", () => {
    const { container } = render(
      <AttachmentPatternsSection
        archetype="Spark Seeker"
        archetypeHtml="<p>Attachment style of the Spark Seeker.</p>"
        generalHtml={resolvedAttachmentGeneralHtml}
        isPremium={true}
        sectionTitle="Attachment Style"
      />
    );

    // V3 template dropped the "Common Attachment Style Patterns Across Archetypes"
    // subsection entirely. Component gracefully renders no patterns container.
    expect(container.querySelector(".report-attachment-patterns")).not.toBeInTheDocument();
    expect(container.querySelector(".report-attachment-patterns__grid")).not.toBeInTheDocument();

    // Locked premium HTML still renders inside `.report-themed-block__blurred` so
    // the client can blur it visually behind the overlay.
    const blurred = container.querySelector(".report-themed-block__blurred");
    expect(blurred).toBeInTheDocument();
    expect(blurred?.getAttribute("aria-hidden")).toBe("true");
    expect(blurred).toHaveTextContent("Attachment style of the Spark Seeker");
    expect(container.querySelector(".report-premium-overlay")).toBeInTheDocument();
    expect(container.querySelector(".report-rich-heading")).toHaveTextContent(
      "Attachment Style of the Spark Seeker"
    );
  });
});
