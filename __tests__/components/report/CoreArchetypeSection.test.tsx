// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CoreArchetypeSection from "@/components/report/sections/CoreArchetypeSection";
import { reportThemes } from "@/components/report/reportTheme";

describe("CoreArchetypeSection", () => {
  it("renders the archetype-specific theme content", () => {
    render(
      <CoreArchetypeSection
        archetypeHtml="<p>Power-specific narrative.</p>"
        matchScore={88}
        theme={reportThemes["Power Orchestrator"]}
      />
    );

    expect(screen.getByRole("heading", { name: /power orchestrator/i })).toBeInTheDocument();
    expect(screen.getByText(/i set the frame.and we play inside it/i)).toBeInTheDocument();
    expect(screen.getByText(/^power$/i)).toBeInTheDocument();
    expect(screen.getByText(/commanding/i)).toBeInTheDocument();
    expect(screen.getByText(/dominant/i)).toBeInTheDocument();
    expect(screen.getByText(/power-specific narrative/i)).toBeInTheDocument();
  });

  it("uses the dedicated 16x14 attachment heart icon footprint", () => {
    render(
      <CoreArchetypeSection
        archetypeHtml={null}
        matchScore={76}
        theme={reportThemes["Explorer of Edges"]}
      />
    );

    const attachmentLabel = screen
      .getAllByText(/^attachment$/i)
      .find((node) => node.closest(".report-trait__label"))
      ?.closest(".report-trait__label");
    const icon = attachmentLabel?.querySelector("svg");

    expect(icon).toBeInTheDocument();
    expect(icon).toHaveClass("report-trait__icon", "report-trait__icon--attachment");
    expect(icon).toHaveAttribute("viewBox", "0 0 16 14");
  });
});
