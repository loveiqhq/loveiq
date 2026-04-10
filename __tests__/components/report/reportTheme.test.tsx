// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getReportThemeIconStyle, reportThemes } from "@/components/report/reportTheme";

describe("reportTheme archetype icons", () => {
  it("passes wrapper classes through to every archetype svg", () => {
    for (const theme of Object.values(reportThemes)) {
      const { container, unmount } = render(<theme.Icon className="report-icon-probe" />);
      expect(container.querySelector("svg.report-icon-probe")).toBeInTheDocument();
      unmount();
    }
  });

  it("exposes icon fit variables for hero and row contexts", () => {
    const heroStyle = getReportThemeIconStyle(reportThemes["Curious Apprentice"], "hero");
    const rowStyle = getReportThemeIconStyle(reportThemes["Minimalist Companion"], "row");

    expect(heroStyle["--report-icon-width" as keyof typeof heroStyle]).toBe("46px");
    expect(heroStyle["--report-icon-height-mobile" as keyof typeof heroStyle]).toBe("50px");
    expect(rowStyle["--report-icon-width" as keyof typeof rowStyle]).toBe("12px");
    expect(rowStyle["--report-icon-height-mobile" as keyof typeof rowStyle]).toBe("38px");
  });
});
