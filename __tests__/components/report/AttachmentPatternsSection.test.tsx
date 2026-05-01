// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AttachmentPatternsSection from "@/components/report/sections/AttachmentPatternsSection";
import { reportSections } from "@/data/report-general";

const attachmentGeneralHtml =
  reportSections.find(
    (section) => section.id === "attachment_style_how_safety_closeness_and_distance_shape_desire"
  )?.generalContent ?? "";
const resolvedAttachmentGeneralHtml = attachmentGeneralHtml.replace(
  /\{\{CORE_ARCHETYPE\}\}/g,
  '<span class="report-archetype-name">Spark Seeker</span>'
);

describe("AttachmentPatternsSection", () => {
  it("renders the common attachment pattern block separately from the premium archetype content", () => {
    const { container } = render(
      <AttachmentPatternsSection
        archetype="Spark Seeker"
        archetypeHtml="<p>Attachment style of the Spark Seeker.</p>"
        generalHtml={resolvedAttachmentGeneralHtml}
        isPremium={true}
        sectionTitle="Attachment Style"
      />
    );

    expect(container.querySelector(".report-attachment-patterns")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Common Attachment Style Patterns Across Archetypes" })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Secure attachment" })).toBeInTheDocument();
    expect(screen.getByText(/Sensual Connector/i)).toBeInTheDocument();
    expect(screen.getByText(/Relational Nurturer/i)).toBeInTheDocument();
    // Locked premium HTML renders inside `.report-themed-block__blurred` so
    // the client can blur it visually behind the overlay (visual tease, not
    // byte-level paywall — see plan "whimsical-greeting-popcorn"). The
    // overlay sits absolutely on top.
    const blurred = container.querySelector(".report-themed-block__blurred");
    expect(blurred).toBeInTheDocument();
    expect(blurred?.getAttribute("aria-hidden")).toBe("true");
    expect(blurred).toHaveTextContent("Attachment style of the Spark Seeker");
    expect(container.querySelector(".report-premium-overlay")).toBeInTheDocument();
    expect(container.querySelector(".report-rich-heading")).toHaveTextContent(
      "Attachment Style of the Spark Seeker"
    );
    expect(container.querySelector(".report-attachment-patterns__outro")).toHaveTextContent(
      "Attachment style is not static"
    );
  });
});
