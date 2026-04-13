// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PracticeTendenciesSection from "@/components/report/sections/PracticeTendenciesSection";

describe("PracticeTendenciesSection", () => {
  it("renders the figma-style practice panel with the new structured intro and groups", () => {
    const { container } = render(
      <PracticeTendenciesSection
        archetype="Spark Seeker"
        archetypeHtml={null}
        generalHtml=""
        isPremium={false}
        sectionTitle="Typical Sexual Fantasy & Practice Tendencies"
      />
    );

    expect(
      screen.getByText(/Typical Sexual Fantasy & Practice Tendencies of the/i)
    ).toBeInTheDocument();
    expect(screen.getByText("Spark Seeker")).toBeInTheDocument();
    expect(
      screen.getByText(/probability-based estimates derived from aggregated research/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Core Relational & Embodied" })).toBeInTheDocument();
    expect(screen.getByText("Romantic lovemaking")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Technology & Distance" })).toBeInTheDocument();
    expect(container.querySelector(".report-practice-table")).toBeInTheDocument();
    expect(screen.getAllByText("60%").length).toBeGreaterThan(0);
  });

  it("opens and closes explanation popovers from the row info affordance", async () => {
    const user = userEvent.setup();

    render(
      <PracticeTendenciesSection
        archetype="Spark Seeker"
        archetypeHtml={null}
        generalHtml=""
        isPremium={false}
        sectionTitle="Typical Sexual Fantasy & Practice Tendencies"
      />
    );

    const infoButton = screen.getAllByRole("button", {
      name: /What Romantic lovemaking tends to organize/i,
    })[0];

    await user.click(infoButton);
    await waitFor(() => {
      expect(screen.getByText(/chemistry, freedom, and playful connection/i)).toBeInTheDocument();
    });

    await user.click(document.body);

    await waitFor(() => {
      expect(
        screen.queryByText(/chemistry, freedom, and playful connection/i)
      ).not.toBeInTheDocument();
    });

    await user.hover(infoButton);
    expect(screen.getByText(/chemistry, freedom, and playful connection/i)).toBeInTheDocument();

    await user.unhover(infoButton);

    await waitFor(() => {
      expect(
        screen.queryByText(/chemistry, freedom, and playful connection/i)
      ).not.toBeInTheDocument();
    });
  }, 15000);

  it("renders the premium overlay preview when the section is locked", () => {
    const { container } = render(
      <PracticeTendenciesSection
        archetype="Spark Seeker"
        archetypeHtml={null}
        generalHtml=""
        isPremium={true}
        sectionTitle="Typical Sexual Fantasy & Practice Tendencies"
      />
    );

    expect(container.querySelector(".report-themed-block__blurred")).toBeInTheDocument();
    expect(container.querySelector(".report-themed-block__preview--practice")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /unlock full report/i })).toBeInTheDocument();
  }, 15000);
});
