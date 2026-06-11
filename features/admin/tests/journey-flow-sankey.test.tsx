// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import JourneyFlowSankey, {
  type FlowNode,
  type FlowLink,
} from "@features/admin/ui/journey/JourneyFlowSankey";

// Representative payload mirroring /api/admin/journey/flow output (two sources,
// the full nested spine, and every drop sink).
const nodes: FlowNode[] = [
  { id: "src:Direct", label: "Direct", count: 400, kind: "source" },
  { id: "src:Google Ads", label: "Google Ads", count: 139, kind: "source" },
  { id: "submitted", label: "Completed survey", count: 539, kind: "stage" },
  { id: "viewed", label: "Viewed report", count: 520, kind: "stage" },
  { id: "paywall", label: "Saw paywall", count: 288, kind: "stage" },
  { id: "checkout", label: "Started checkout", count: 32, kind: "stage" },
  { id: "purchased", label: "Purchased", count: 23, kind: "stage" },
  { id: "retained", label: "Retained", count: 22, kind: "outcome" },
  { id: "drop_view", label: "Never opened report", count: 19, kind: "drop" },
  { id: "drop_paywall", label: "No paywall reached", count: 232, kind: "drop" },
  { id: "drop_checkout", label: "Left at paywall", count: 256, kind: "drop" },
  { id: "drop_purchase", label: "Abandoned checkout", count: 9, kind: "drop" },
  { id: "refunded", label: "Refunded", count: 1, kind: "drop" },
];

const links: FlowLink[] = [
  { source: "src:Direct", target: "submitted", value: 400, kind: "source" },
  { source: "src:Google Ads", target: "submitted", value: 139, kind: "source" },
  { source: "submitted", target: "viewed", value: 520, kind: "flow" },
  { source: "submitted", target: "drop_view", value: 19, kind: "drop" },
  { source: "viewed", target: "paywall", value: 288, kind: "flow" },
  { source: "viewed", target: "drop_paywall", value: 232, kind: "drop" },
  { source: "paywall", target: "checkout", value: 32, kind: "flow" },
  { source: "paywall", target: "drop_checkout", value: 256, kind: "drop" },
  { source: "checkout", target: "purchased", value: 23, kind: "flow" },
  { source: "checkout", target: "drop_purchase", value: 9, kind: "drop" },
  { source: "purchased", target: "retained", value: 22, kind: "outcome" },
  { source: "purchased", target: "refunded", value: 1, kind: "drop" },
];

describe("JourneyFlowSankey", () => {
  it("renders an SVG with stage labels and the biggest-leak badge for a real payload", () => {
    const { container, getAllByText, getByText } = render(
      <JourneyFlowSankey nodes={nodes} links={links} />
    );
    // d3-sankey computed a layout and produced an SVG with node rects + link paths.
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(container.querySelectorAll("rect").length).toBeGreaterThanOrEqual(nodes.length);
    expect(container.querySelectorAll("path").length).toBeGreaterThanOrEqual(links.length);
    // Labels render (appear in both <title> and <text>, hence getAllByText).
    expect(getAllByText(/Completed survey/).length).toBeGreaterThan(0);
    expect(getAllByText(/Purchased/).length).toBeGreaterThan(0);
    // Biggest leak = "Left at paywall" (256, the largest drop).
    expect(getByText(/Biggest leak: Left at paywall/)).toBeTruthy();
  });

  it("renders an empty state when there are no nodes/links", () => {
    const { getByText } = render(<JourneyFlowSankey nodes={[]} links={[]} />);
    expect(getByText(/No journeys in this segment yet/)).toBeTruthy();
  });
});
