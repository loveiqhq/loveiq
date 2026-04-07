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
        theme={reportThemes["Power Orchestrator"]}
      />
    );

    expect(screen.getByRole("heading", { name: /power orchestrator/i })).toBeInTheDocument();
    expect(screen.getByText(/i set the frame-and we play inside it/i)).toBeInTheDocument();
    expect(screen.getByText(/^power$/i)).toBeInTheDocument();
    expect(screen.getByText(/commanding/i)).toBeInTheDocument();
    expect(screen.getByText(/dominant/i)).toBeInTheDocument();
    expect(screen.getByText(/power-specific narrative/i)).toBeInTheDocument();
  });
});
