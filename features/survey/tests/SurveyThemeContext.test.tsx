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

  it("defaults to WHITE when rendered outside any provider", () => {
    // Was dark, which meant a consumer outside the provider silently fell back to
    // the arm that lost. White is what every visitor now gets, so the fallback
    // matches the only theme in use.
    const { container } = render(<ChoiceCard label="Yes" selected={false} onClick={() => {}} />);
    // Positive, like its two siblings: `not.toContain` also passes when the card
    // renders no background at all, which would hide a real regression.
    expect(cardClass(container)).toContain("bg-[#f5f6f8]");
    expect(cardClass(container)).not.toContain("bg-white/[0.05]");
  });

  it("uses the rating scale's purple selected tint in BOTH arms (accent preserved)", () => {
    // Purple like the 1–7 scale (Hana, 04.11; the survey's clickable colour is purple,
    // 02.11). Orange stays for the Next button and the progress bar.
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
    expect(cardClass(w)).toContain("bg-[rgba(107,91,149,0.1)]"); // white selected tint, #6b5b95
    expect(cardClass(d)).toContain("bg-[rgba(167,139,250,0.1)]"); // dark selected tint, #a78bfa
    expect(cardClass(w)).not.toContain("254,104,57");
    expect(cardClass(d)).not.toContain("254,104,57");
  });
});
