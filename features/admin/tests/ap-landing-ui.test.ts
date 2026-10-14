// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
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
import { buildLanding, LANDING_TESTS } from "@features/admin/server/ap/landing";
import type { LandingArmEngagement } from "@features/admin/server/ap/posthog";
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

/** The first run of the hero test (7 to 13 Oct), the running one and the rebuild outside it. */
function firstRun(over: Partial<Parameters<typeof buildLanding>[0]> = {}) {
  return buildLanding({
    facts: factsFixture({ from: "2026-10-07", to: "2026-10-13", visits: [], starts: [], subs: [] }),
    filters: parseFilters({ period: "custom", from: "2026-10-07", to: "2026-10-13" }, "2026-10-14"),
    today: "2026-10-14",
    now: new Date("2026-10-14T10:00:00Z"),
    armEngagement: {},
    engagement: null,
    sections: null,
    ...over,
  });
}

const name = (key: string) => LANDING_TESTS.find((t) => t.key === key)!.name;

describe("landing page tests table", () => {
  it("names each test one way: its rows, the compare title and the line of tests not in range", () => {
    screenData.payload = firstRun();
    render(createElement(ApLanding));
    const table = screen.getByRole("table", { name: "Landing tests and variants" });
    const shown = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((r) => within(r).getAllByRole("cell")[0]!.firstElementChild!.textContent);
    expect(shown).toEqual([name("hero-first-run"), name("hero-first-run")]);
    expect(screen.getByRole("heading", { level: 2, name: name("hero-first-run") })).toBeTruthy();
    expect(screen.getByText(/^Not in this range: /).textContent).toBe(
      `Not in this range: ${name("hero")} (from 14 Oct 2026) · ${name("rebuild")} (25 Aug – 19 Sep 2026).`
    );
  });

  it("writes test names at 14px semibold, and on a phone leaves part of Visits in view", () => {
    screenData.payload = firstRun();
    render(createElement(ApLanding));
    const table = screen.getByRole("table", { name: "Landing tests and variants" });
    const row = within(table).getAllByRole("row")[1]!;
    expect(within(row).getAllByRole("cell")[0]!.firstElementChild).toHaveClass(
      "text-sm",
      "font-semibold"
    );
    // The design's 200 and 90px for the test and its status: 290px of a 390px phone's
    // 314px table, where 220 and 96 filled it.
    expect(row.style.gridTemplateColumns).toBe(
      "minmax(200px, 2fr) minmax(90px, 0.8fr) repeat(7, minmax(84px, 1fr))"
    );
    expect(table.style.minWidth).toBe("980px");
  });

  it("says why bounce and avg. time are blank when PostHog could not be read", () => {
    const error = "PostHog could not be read just now. Try again in a minute.";
    screenData.payload = firstRun({
      armEngagement: { "hero-first-run": { ok: false, error } },
    });
    render(createElement(ApLanding));
    expect(
      screen.getByText(`${name("hero-first-run")}: bounce and avg. time are blank. ${error}`)
    ).toHaveClass("text-ap-bad-ink");
    // The compare cards say the same, not "too few visits".
    expect(screen.getAllByText(error)).toHaveLength(2);
    expect(screen.queryByText("PostHog saw too few visits")).toBeNull();
  });
});

describe("landing page engagement boxes", () => {
  it("fit their figures to the box: the design's 22px with room, smaller in a narrow box", () => {
    // Every visit bounced: "100.0%", the widest figure a box can hold.
    const all = (arm: string): LandingArmEngagement => ({
      arm,
      sessions: 40,
      bounced: 40,
      cta: 0,
      leaves: 40,
      scroll: [40, 0, 0, 0],
      medianSeconds: 3,
      meanSeconds: 2.9,
      timed: 40,
      sqSeconds: 400,
    });
    screenData.payload = firstRun({ engagement: { ok: true, value: [all("white_card")] } });
    render(createElement(ApLanding));
    const value = within(screen.getByRole("region", { name: "Engagement" })).getByText("100.0%");
    // Sized by its box (a container): a quarter of the box's width, at most 22px, which "100.0%"
    // (about 3.7 times its size wide in Lora) fits at 375 and 390px.
    expect(value).toHaveClass("text-[length:min(22px,25cqi)]");
    expect(value.parentElement).toHaveClass("[container-type:inline-size]");
  });
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
