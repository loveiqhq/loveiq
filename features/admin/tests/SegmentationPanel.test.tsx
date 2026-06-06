// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import SegmentationPanel from "@features/admin/ui/analytics/SegmentationPanel";

afterEach(cleanup);

interface Row {
  label: string;
  count: number;
  pct: number;
}

const emptyDims = () => ({ archetype: [], country: [], gender: [], age: [] });

describe("SegmentationPanel", () => {
  it("does not crash when an 'Other' row is missing pct (the original white-screen bug)", () => {
    // Mirror the bug: topNWithOther used to emit an Other row with no pct, and
    // toBarItems called r.pct.toFixed(1) → undefined.toFixed → crash.
    const brokenCountry = [
      { label: "Germany", count: 50, pct: 50 },
      // pct intentionally omitted to simulate a malformed row
      { label: "Other", count: 50 } as unknown as Row,
    ];
    expect(() =>
      render(
        <SegmentationPanel
          completion={{ ...emptyDims(), country: brokenCountry }}
          paid={emptyDims()}
        />
      )
    ).not.toThrow();
    // The malformed row renders with a safe 0.0% rather than crashing.
    expect(screen.getByText(/Other \(0\.0%\)/)).toBeInTheDocument();
  });

  it("renders an empty state for every dimension when there is no data", () => {
    render(<SegmentationPanel completion={emptyDims()} paid={emptyDims()} />);
    expect(screen.getAllByText("No data for this window.").length).toBeGreaterThanOrEqual(1);
  });

  it("renders bars and a completion→paid conversion table for archetype", () => {
    const completion = {
      ...emptyDims(),
      archetype: [
        { label: "Spark Seeker", count: 40, pct: 66.7 },
        { label: "Tender Devotee", count: 20, pct: 33.3 },
      ],
    };
    const paid = {
      ...emptyDims(),
      archetype: [{ label: "Spark Seeker", count: 10, pct: 100 }],
    };
    render(<SegmentationPanel completion={completion} paid={paid} />);

    expect(screen.getByText("Completion → Paid conversion")).toBeInTheDocument();
    // Spark Seeker conversion = 10/40 = 25.0%
    expect(screen.getByText("25.0%")).toBeInTheDocument();
    // overall = 10/60 = 16.67%; Spark Seeker index = 0.25 / 0.1667 = 1.50×
    expect(screen.getByText("1.50×")).toBeInTheDocument();
  });

  it("flags small samples (<30 completions) with a footnote", () => {
    const completion = {
      ...emptyDims(),
      archetype: [
        { label: "Big Segment", count: 40, pct: 80 },
        { label: "Tiny Segment", count: 12, pct: 20 },
      ],
    };
    const paid = {
      ...emptyDims(),
      archetype: [{ label: "Big Segment", count: 8, pct: 100 }],
    };
    render(<SegmentationPanel completion={completion} paid={paid} />);
    expect(screen.getByText(/fewer than 30 completions/)).toBeInTheDocument();
  });

  it("degrades safely when a side is undefined", () => {
    // Defensive: a missing completion/paid object must not white-screen.
    expect(() =>
      render(<SegmentationPanel completion={undefined as never} paid={undefined as never} />)
    ).not.toThrow();
  });
});
