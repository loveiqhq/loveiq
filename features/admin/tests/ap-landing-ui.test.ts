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
import ApLanding from "@features/admin/ui/ap/ApLanding";

import { factsFixture } from "./ap-fixtures";

afterEach(cleanup);

/** The first run of the hero test (7 to 13 Oct), the running one and the rebuild outside it. */
function firstRun(over: Partial<Parameters<typeof buildLanding>[0]> = {}) {
  return buildLanding({
    facts: factsFixture({ from: "2026-10-07", to: "2026-10-13", visits: [], starts: [], subs: [] }),
    previous: null,
    filters: parseFilters({ period: "custom", from: "2026-10-07", to: "2026-10-13" }, "2026-10-14"),
    today: "2026-10-14",
    now: new Date("2026-10-14T10:00:00Z"),
    armEngagement: {},
    engagement: null,
    ...over,
  });
}

const name = (key: string) => LANDING_TESTS.find((t) => t.key === key)!.name;

describe("landing page tests table", () => {
  it("names each test one way: its rows and the line of tests not in range", () => {
    screenData.payload = firstRun();
    render(createElement(ApLanding));
    const table = screen.getByRole("table", { name: "Landing tests and variants" });
    const shown = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((r) => within(r).getAllByRole("cell")[0]!.firstElementChild!.textContent);
    expect(shown).toEqual([name("hero-first-run"), name("hero-first-run")]);
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
    // The design's 200 and 90px for the test and its status, then its eight figures.
    expect(row.style.gridTemplateColumns).toBe(
      "minmax(200px, 2fr) minmax(90px, 0.8fr) repeat(8, minmax(84px, 1fr))"
    );
    expect(table.style.minWidth).toBe("1080px");
  });

  it("says why an arm's engagement is blank when PostHog could not be read", () => {
    const error = "PostHog could not be read just now. Try again in a minute.";
    screenData.payload = firstRun({
      armEngagement: { "hero-first-run": { ok: false, error } },
    });
    render(createElement(ApLanding));
    expect(
      screen.getByText(
        `${name("hero-first-run")}: bounce, avg. time, CTA clicks and scroll are blank. ${error}`
      )
    ).toHaveClass("text-ap-bad-ink");
    expect(screen.queryByText("PostHog saw too few visits")).toBeNull();
  });
});
