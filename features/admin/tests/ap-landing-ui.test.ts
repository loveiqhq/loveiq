// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The screen test draws a payload the builder made, without the network or the URL.
const screenData = vi.hoisted(() => ({ payload: null as unknown }));
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: () => ({
    data: screenData.payload,
    loading: false,
    error: null,
    refetch: () => {},
  }),
}));
vi.mock("@features/admin/ui/ap/useApFilters", () => ({ useApFilters: () => ({ params: {} }) }));
vi.mock("@features/admin/ui/ap/ApFilterBar", () => ({ default: () => null }));

import { parseFilters } from "@features/admin/server/ap/filters";
import { buildLanding } from "@features/admin/server/ap/landing";
import ApLanding from "@features/admin/ui/ap/ApLanding";

import { factsFixture } from "./ap-fixtures";

const TODAY = "2026-10-13";
const payload = buildLanding({
  facts: factsFixture(),
  filters: parseFilters({ period: "custom", from: "2026-10-01", to: "2026-10-07" }, TODAY),
  today: TODAY,
  now: new Date("2026-10-13T10:00:00Z"),
  armEngagement: {},
  engagement: null,
  sections: null,
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("landing page reviews card", () => {
  it("says no rating exists while Trustpilot is off, and never makes one up", () => {
    vi.stubEnv("NEXT_PUBLIC_TRUSTPILOT_SCORE", "4.6");
    vi.stubEnv("NEXT_PUBLIC_TRUSTPILOT_REVIEW_COUNT", "");
    screenData.payload = payload;
    render(createElement(ApLanding));
    expect(screen.getByText("No reviews collected yet")).toBeInTheDocument();
    expect(screen.queryByText(/reviews on Trustpilot/)).toBeNull();
  });

  it("shows the site's own Trustpilot score once both numbers are set", () => {
    vi.stubEnv("NEXT_PUBLIC_TRUSTPILOT_SCORE", "4.6");
    vi.stubEnv("NEXT_PUBLIC_TRUSTPILOT_REVIEW_COUNT", "12");
    vi.stubEnv("NEXT_PUBLIC_TRUSTPILOT_DOMAIN", "loveiq.org");
    screenData.payload = payload;
    render(createElement(ApLanding));
    expect(screen.getByText("4.6")).toBeInTheDocument();
    expect(screen.getByText(/12 reviews on Trustpilot/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the profile" })).toHaveAttribute(
      "href",
      "https://www.trustpilot.com/review/loveiq.org"
    );
  });
});
