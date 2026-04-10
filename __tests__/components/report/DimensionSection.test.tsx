// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DimensionSection from "@/components/report/sections/DimensionSection";

describe("DimensionSection", () => {
  it("splits the LoveIQ concept intro into a lead paragraph and centered panel", () => {
    const { container } = render(
      <DimensionSection
        archetype="Spark Seeker"
        archetypeHtml={null}
        generalHtml="<p>Lead paragraph.</p><p>Panel paragraph one.</p><p>Panel paragraph two.</p>"
        isPremium={false}
        sectionId="the_loveiq_concept"
        sectionTitle="The LoveIQ Concept"
      />
    );

    const lead = container.querySelector(".report-prose--lead");
    const panel = container.querySelector(".report-flow__panel--centered");

    expect(lead).toBeInTheDocument();
    expect(lead).toHaveTextContent("Lead paragraph.");
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent("Panel paragraph one.");
    expect(panel).toHaveTextContent("Panel paragraph two.");
  });

  it("extracts the trailing archetype heading into its own centered panel stack", () => {
    const { container } = render(
      <DimensionSection
        archetype="Spark Seeker"
        archetypeHtml="<p>Archetype-specific narrative.</p>"
        generalHtml={[
          "<p>Intro paragraph one.</p>",
          "<p>Intro paragraph two.</p>",
          "<p>Intro paragraph three.</p>",
          "<p>Intro paragraph four.</p>",
          "<p>The motivation of the Spark Seeker</p>",
        ].join("")}
        isPremium={false}
        sectionId="core_motivation"
        sectionTitle="Core Motivation"
      />
    );

    const headings = container.querySelectorAll(".report-rich-heading");
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("The motivation of the Spark Seeker");
    expect(screen.getByText("Archetype-specific narrative.")).toBeInTheDocument();
  });
});
