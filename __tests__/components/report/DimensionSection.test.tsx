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
    expect(container.querySelector(".report-flow__panel--editorial")).not.toBeInTheDocument();
  });

  it("does not push long paid sections into the editorial right-column layout by default", () => {
    const { container } = render(
      <DimensionSection
        archetype="Spark Seeker"
        archetypeHtml="<p>Paid narrative.</p>"
        generalHtml={[
          "<p>Intro one.</p>",
          "<p>Intro two.</p>",
          "<p>Intro three.</p>",
          "<p>Core insecurities help answer questions like:</p>",
          "<p><em>Question one</em></p>",
          "<p><em>Question two</em></p>",
          "<p><em>Question three</em></p>",
          "<p><em>Question four</em></p>",
          "<p><em>Question five</em></p>",
          "<p>Core Insecurities of the Spark Seeker</p>",
        ].join("")}
        isPremium={true}
        sectionId="core_insecurities_the_hidden_fears_that_shape_desire_protection_and_erotic_expression"
        sectionTitle="Core Insecurities"
      />
    );

    expect(container.querySelector(".report-flow__panel--editorial")).not.toBeInTheDocument();
    expect(container.querySelector(".report-flow__panel--centered")).toBeInTheDocument();
  });

  it("keeps attachment style content on the standard centered layout instead of shifting right", () => {
    const { container } = render(
      <DimensionSection
        archetype="Spark Seeker"
        archetypeHtml="<p>Attachment narrative.</p>"
        generalHtml={[
          "<p>Attachment intro one.</p>",
          "<p>Attachment intro two.</p>",
          "<p>Attachment intro three.</p>",
          "<p>Common Attachment Style Patterns Across Archetypes</p>",
          "<p><strong>Secure attachment</strong></p>",
          "<p>Secure copy.</p>",
          "<p><strong>Avoidant attachment</strong></p>",
          "<p>Avoidant copy.</p>",
          "<p>Attachment Style of the Spark Seeker</p>",
        ].join("")}
        isPremium={true}
        sectionId="attachment_style_how_safety_closeness_and_distance_shape_desire"
        sectionTitle="Attachment Style"
      />
    );

    expect(container.querySelector(".report-flow__panel--editorial")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".report-flow__panel--centered")).toHaveLength(1);
    expect(container.querySelector(".report-flow > .report-prose")).toHaveTextContent(
      "Common Attachment Style Patterns Across Archetypes"
    );
  });
});
