// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DimensionSection from "@/components/report/sections/DimensionSection";
import { archetypeContent } from "@/data/report-archetypes";

describe("DimensionSection", () => {
  it("splits the LoveIQ concept intro into a lead paragraph and left-aligned body flow", () => {
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
    const proseBlocks = container.querySelectorAll(".report-prose");

    expect(lead).toBeInTheDocument();
    expect(lead).toHaveTextContent("Lead paragraph.");
    expect(proseBlocks).toHaveLength(2);
    expect(proseBlocks[1]).toHaveTextContent("Panel paragraph one.");
    expect(proseBlocks[1]).toHaveTextContent("Panel paragraph two.");
  });

  it("extracts the trailing archetype heading into its own left-aligned stack", () => {
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
    expect(container.querySelector(".report-flow__panel")).not.toBeInTheDocument();
  });

  it("keeps long paid sections in the same left-aligned text column", () => {
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

    expect(container.querySelector(".report-flow__panel")).not.toBeInTheDocument();
    expect(container.querySelector(".report-rich-heading")).toHaveTextContent(
      "Core Insecurities of the Spark Seeker"
    );
  });

  it("keeps attachment style content in the standard left text flow", () => {
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

    expect(container.querySelector(".report-flow__panel")).not.toBeInTheDocument();
    expect(container.querySelector(".report-flow > .report-prose")).toHaveTextContent(
      "Common Attachment Style Patterns Across Archetypes"
    );
  });

  it("keeps the sexual stage model content in the left-aligned prose flow", () => {
    const { container } = render(
      <DimensionSection
        archetype="Spark Seeker"
        archetypeHtml={null}
        generalHtml={[
          "<p>Intro one.</p>",
          "<p>Intro two.</p>",
          '<div class="report-stage-highlight"><p class="report-stage-highlight__label">Your likely current sexual stage:</p><p class="report-stage-highlight__value">Grounded / Integrated</p></div>',
          "<p>The LoveIQ Sexual Stages (6-Stage Model)</p>",
          "<p><strong>Recharging / Pausing</strong></p>",
          "<p><strong>How it Feels:</strong> Quieter, lower-drive, restoring</p>",
        ].join("")}
        isPremium={false}
        sectionId="sexual_stage"
        sectionTitle="Sexual Stage"
      />
    );

    expect(container.querySelector(".report-flow__panel")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".report-prose")).toHaveLength(2);
    expect(container.querySelectorAll(".report-prose")[1]).toHaveTextContent(
      "The LoveIQ Sexual Stages (6-Stage Model)"
    );
  });

  it("upgrades the sexual stage summary paragraphs into the themed stage highlight block", () => {
    const { container } = render(
      <DimensionSection
        archetype="Explorer of Edges"
        archetypeHtml={null}
        generalHtml={[
          "<p>Human sexuality is dynamic.</p>",
          "<p><strong>Your likely current sexual stage: </strong>Awakening / Exploring</p>",
          "<p>(A snapshot of how your sexuality is organized right now, not a permanent identity.)</p>",
          "<p>The LoveIQ Sexual Stages (6-Stage Model)</p>",
        ].join("")}
        isPremium={false}
        sectionId="sexual_stage"
        sectionTitle="Sexual Stage"
      />
    );

    const highlight = container.querySelector(".report-stage-highlight");

    expect(highlight).toBeInTheDocument();
    expect(highlight).toHaveTextContent("Your likely current sexual stage:");
    expect(highlight).toHaveTextContent("Awakening / Exploring");
    expect(highlight).toHaveTextContent(
      "(A snapshot of how your sexuality is organized right now, not a permanent identity.)"
    );
  });

  it("reveals the restored Explorer of Edges recommendations after unlock", async () => {
    const user = userEvent.setup();

    const { container } = render(
      <DimensionSection
        archetype="Explorer of Edges"
        archetypeHtml={archetypeContent.recommendations["Explorer of Edges"]}
        generalHtml="<p>A curated set of resources to deepen understanding and support practical growth.</p>"
        isPremium={true}
        sectionId="recommendations"
        sectionTitle="Recommendations"
      />
    );

    const scoped = within(container);

    await user.click(scoped.getByRole("button", { name: /unlock report/i }));

    expect(scoped.queryByRole("button", { name: /unlock report/i })).not.toBeInTheDocument();
    expect(scoped.getByText(/The Deep Psychology of BDSM and Kink/i)).toBeInTheDocument();
  });

  it("shows a placeholder note instead of a blank unlocked recommendations panel", async () => {
    const user = userEvent.setup();

    const { container } = render(
      <DimensionSection
        archetype="Explorer of Edges"
        archetypeHtml="<h2></h2>"
        generalHtml="<p>A curated set of resources to deepen understanding and support practical growth.</p>"
        isPremium={true}
        sectionId="recommendations"
        sectionTitle="Recommendations"
      />
    );

    const scoped = within(container);

    await user.click(scoped.getByRole("button", { name: /unlock report/i }));

    expect(
      scoped.getByText(/Recommendations for this archetype are being finalized/i)
    ).toBeInTheDocument();
  });
});
