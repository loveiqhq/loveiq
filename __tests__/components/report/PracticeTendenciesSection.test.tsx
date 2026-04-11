// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PracticeTendenciesSection from "@/components/report/sections/PracticeTendenciesSection";
import { archetypeContent } from "@/data/report-archetypes";

const generalHtml = [
  "<p>Intro paragraph one.</p>",
  "<p>Intro paragraph two.</p>",
  '<p>Typical Sexual Fantasy &amp; Practice Tendencies of the <span class="report-archetype-name">Spark Seeker</span><img src="data:image/png;base64,ABC" /></p>',
].join("");

describe("PracticeTendenciesSection", () => {
  it("renders grouped tendency cards while keeping the intro prose outside the cards", () => {
    render(
      <PracticeTendenciesSection
        archetype="Spark Seeker"
        archetypeHtml={archetypeContent.practices["Spark Seeker"]}
        generalHtml={generalHtml}
        isPremium={false}
        sectionTitle="Typical Sexual Fantasy & Practice Tendencies"
      />
    );

    expect(screen.getByText("Intro paragraph one.")).toBeInTheDocument();
    expect(screen.getByText("Intro paragraph two.")).toBeInTheDocument();
    expect(
      screen.queryByText(/Typical Sexual Fantasy & Practice Tendencies of the/i)
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Core Relational & Embodied" })).toBeInTheDocument();
    expect(screen.getByText("Romantic lovemaking")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Technology & Distance" })).toBeInTheDocument();
  });

  it("keeps the practice cards behind the premium overlay until unlocked", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <PracticeTendenciesSection
        archetype="Spark Seeker"
        archetypeHtml={archetypeContent.practices["Spark Seeker"]}
        generalHtml={generalHtml}
        isPremium={true}
        sectionTitle="Typical Sexual Fantasy & Practice Tendencies"
      />
    );

    expect(container.querySelector(".report-themed-block__blurred")).toBeInTheDocument();
    expect(container.querySelector(".report-themed-block__preview--practice")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /unlock full report/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /unlock full report/i }));

    expect(container.querySelector(".report-themed-block__blurred")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /unlock full report/i })).not.toBeInTheDocument();
  });
});
