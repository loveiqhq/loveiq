// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseFilters } from "@features/admin/server/ap/filters";
import { buildMiraPage, type MiraData } from "@features/admin/server/ap/mira";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const view = vi.hoisted(() => ({ payload: null as unknown }));
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: () => ({ data: view.payload, loading: false, error: null, refetch: () => {} }),
}));
vi.mock("@features/admin/ui/ap/useApFilters", () => ({ useApFilters: () => ({ params: {} }) }));
vi.mock("@features/admin/ui/ap/ApFilterBar", () => ({ default: () => null }));

import ApMira from "@features/admin/ui/ap/ApMira";

afterEach(cleanup);

/** AP › Mira › "Challenges & goals": the card reads the reader's figures as they are. */

const TODAY = "2026-11-30";
const DATA: MiraData = {
  users: [
    {
      id: "u1",
      email: "a@example.com",
      created_at: "2026-11-02T09:00:00Z",
      style: {},
      use_assessment: false,
    },
    {
      id: "u2",
      email: "b@example.com",
      created_at: "2026-11-02T09:00:00Z",
      style: {},
      use_assessment: false,
    },
  ],
  events: [
    {
      name: "goal_suggested",
      anon_id: null,
      user_id: "u1",
      at: Date.parse("2026-11-10T09:00:00Z"),
      detail: null,
    },
  ],
  nudges: [],
  bodyChecks: [],
  withResult: new Set(),
  goals: {
    goals: [
      { id: "g1", user_id: "u1", via: "mira", created_at: "2026-11-10T10:00:00Z" },
      { id: "g2", user_id: "u1", via: "hand", created_at: "2026-11-11T10:00:00Z" },
    ],
    logs: [{ goal_id: "g1", user_id: "u1", created_at: "2026-11-12T10:00:00Z" }],
  },
};

const show = (data: MiraData) => {
  view.payload = buildMiraPage({
    data,
    filters: parseFilters({ period: "custom", from: "2026-11-09", to: "2026-11-15" }, TODAY),
    today: TODAY,
    now: new Date(`${TODAY}T12:00:00Z`),
  });
  render(<ApMira />);
  return screen.getByRole("region", { name: "Challenges & goals" });
};

describe("the Goals card on AP › Mira", () => {
  it("shows who has a goal, how goals were set, first-week ticks and weekly loggers", () => {
    const card = show(DATA);
    expect(within(card).getByText("50.0% of 2 accounts, by the range’s last day")).toBeTruthy();
    expect(
      within(card).getByText(/1 of 2 goals set in the range; 1 by hand\. Mira suggested 1/)
    ).toBeTruthy();
    expect(within(card).getByText("1 of 2 goals set in the range and a week old")).toBeTruthy();
    expect(within(card).getByText(/never what a goal says/)).toBeTruthy();
  });

  it("says the goals aren't measured when their tables can't be read", () => {
    const card = show({ ...DATA, goals: null });
    expect(within(card).getByText(/Not measured yet/)).toBeTruthy();
  });
});
