// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import ChoiceCard from "@features/survey/ui/questions/ChoiceCard";
import { SurveyThemeProvider } from "@features/survey/ui/SurveyThemeContext";

function cardClass(node: HTMLElement): string {
  return node.querySelector("button")?.className ?? "";
}

describe("Survey theme (white A/B) — scoped theming", () => {
  it("renders the WHITE choice-card surface under the white provider", () => {
    const { container } = render(
      <SurveyThemeProvider variant="white">
        <ChoiceCard label="Yes" selected={false} onClick={() => {}} />
      </SurveyThemeProvider>
    );
    const cls = cardClass(container);
    expect(cls).toContain("bg-[#f5f6f8]"); // white unselected surface
    expect(cls).not.toContain("bg-white/[0.05]"); // not the dark surface
  });

  it("renders the EXACT dark choice-card surface under the dark provider (control arm unchanged)", () => {
    const { container } = render(
      <SurveyThemeProvider variant="dark">
        <ChoiceCard label="Yes" selected={false} onClick={() => {}} />
      </SurveyThemeProvider>
    );
    const cls = cardClass(container);
    expect(cls).toContain("bg-white/[0.05]");
    expect(cls).toContain("border-white/10");
    expect(cls).not.toContain("bg-[#f5f6f8]");
  });

  it("defaults to DARK when rendered outside any provider (safe default)", () => {
    const { container } = render(<ChoiceCard label="Yes" selected={false} onClick={() => {}} />);
    expect(cardClass(container)).toContain("bg-white/[0.05]");
  });

  it("uses the orange selected tint in BOTH arms (accent preserved)", () => {
    const { container: w } = render(
      <SurveyThemeProvider variant="white">
        <ChoiceCard label="Yes" selected onClick={() => {}} />
      </SurveyThemeProvider>
    );
    const { container: d } = render(
      <SurveyThemeProvider variant="dark">
        <ChoiceCard label="Yes" selected onClick={() => {}} />
      </SurveyThemeProvider>
    );
    expect(cardClass(w)).toContain("rgba(254,104,57,0.08)"); // white selected tint
    expect(cardClass(d)).toContain("rgba(254,104,57,0.1)"); // dark selected tint
  });
});
