// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import BarChart, { type BarSeries } from "@features/admin/ui/BarChart";

afterEach(cleanup);

describe("BarChart single-series", () => {
  it("renders the raw value label by default", () => {
    render(<BarChart items={[{ label: "Alpha", value: 7 }]} />);
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });

  it("renders `display` in place of the value when provided (horizontal)", () => {
    render(<BarChart items={[{ label: "Alpha", value: 7, display: "42.0% (7)" }]} />);
    expect(screen.getByText("42.0% (7)")).toBeInTheDocument();
    expect(screen.queryByText("7")).not.toBeInTheDocument();
  });

  it("renders `display` in vertical mode too", () => {
    render(
      <BarChart items={[{ label: "S1", value: 3, display: "30.0% (3)" }]} direction="vertical" />
    );
    expect(screen.getByText("30.0% (3)")).toBeInTheDocument();
  });
});

describe("BarChart grouped multi-series", () => {
  const series: BarSeries[] = [
    { key: "Women", label: "Women", color: "bg-accent-purple" },
    { key: "Men", label: "Men", color: "bg-accent-orange" },
  ];

  it("renders a legend and one labelled bar per series per item", () => {
    render(
      <BarChart
        series={series}
        items={[{ label: "Answer A", value: 10, seriesData: { Women: 60, Men: 40 } }]}
      />
    );
    // Within-gender % labels.
    expect(screen.getByText("60.0%")).toBeInTheDocument();
    expect(screen.getByText("40.0%")).toBeInTheDocument();
    // Series labels appear (legend + per-row).
    expect(screen.getAllByText("Women").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Men").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Answer A")).toBeInTheDocument();
  });

  it("scales bar widths to the max series value (largest = 100%)", () => {
    const { container } = render(
      <BarChart
        series={series}
        items={[{ label: "Answer A", value: 10, seriesData: { Women: 60, Men: 30 } }]}
      />
    );
    const widths = Array.from(container.querySelectorAll<HTMLElement>("[style*='width']")).map(
      (el) => el.style.width
    );
    expect(widths).toContain("100%"); // Women (60) is the max → full width
    expect(widths).toContain("50%"); // Men (30) → 30/60 = 50%
  });

  it("falls back to single-series when no series prop is given (backward compat)", () => {
    const { container } = render(<BarChart items={[{ label: "X", value: 12 }]} />);
    expect(screen.getByText("12")).toBeInTheDocument();
    // No legend swatches rendered in single-series mode.
    expect(container.querySelectorAll(".rounded-sm").length).toBe(0);
  });
});
