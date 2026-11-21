// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseFilters } from "@features/admin/server/ap/filters";
import {
  buildMiraPage,
  type MiraData,
  type MiraEventRow,
  type MiraUserRow,
} from "@features/admin/server/ap/mira";

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

/** AP › Mira's "Self-checks" card (features/admin/server/ap/mira.ts selfChecks, ui/ap/ApMira.tsx). */

const TODAY = "2026-12-20";
const ev = (name: string, user: string, at: string): MiraEventRow => ({
  name,
  anon_id: null,
  user_id: user,
  at: Date.parse(at),
  detail: null,
});
const account = (id: string, email: string, over: Partial<MiraUserRow> = {}): MiraUserRow => ({
  id,
  email,
  created_at: "2026-10-01T10:00:00Z",
  style: {},
  use_assessment: false,
  ...over,
});
const take = (check: string, user: string, at: string, done = true) => [
  ev(`${check}_check_started`, user, at),
  ...(done ? [ev(`${check}_check_done`, user, at.replace(/:00Z$/, ":30Z"))] : []),
];

const DATA: MiraData = {
  users: [
    account("u1", "lea@example.com", { use_checks: true }),
    account("u2", "max@example.com"),
    account("u3", "ana@example.com", { use_checks: true }),
    account("u4", "kim@example.com", { use_checks: true }), // never finished a check
    account("s1", "eman@loveiq.org", { use_checks: true }),
  ],
  events: [
    ...take("anxiety", "u1", "2026-11-03T10:00:00Z"),
    ...take("mood", "u1", "2026-11-05T10:00:00Z", false), // started, never finished
    ...take("mood", "u2", "2026-11-06T10:00:00Z"),
    ev("check_support_shown", "u2", "2026-11-06T10:00:20Z"),
    ...take("loneliness", "u3", "2026-10-20T10:00:00Z"), // before the range: their first
    ...take("anxiety", "u1", "2026-11-18T10:00:00Z"), // a retake
    ...take("loneliness", "u3", "2026-11-20T10:00:00Z"), // a retake
    ...take("anxiety", "s1", "2026-11-04T10:00:00Z"), // the team's: left out
    ev("check_support_shown", "s1", "2026-11-04T10:00:20Z"),
  ],
  nudges: [],
  bodyChecks: [],
  withResult: new Set(),
};

const page = (from: string, to: string, data = DATA) =>
  buildMiraPage({
    data,
    filters: parseFilters({ period: "custom", from, to }, TODAY),
    today: TODAY,
    now: new Date(`${TODAY}T12:00:00Z`),
  });

describe("AP › Mira › Self-checks", () => {
  it("counts starts, finishes, completion and retakes per check in the range, the team left out", () => {
    const { selfChecks } = page("2026-11-02", "2026-11-29");
    expect(selfChecks.checks).toEqual([
      { id: "anxiety", title: "Anxiety check", started: 2, finished: 2, completion: 1, retakes: 1 },
      { id: "mood", title: "Mood check", started: 2, finished: 1, completion: 0.5, retakes: 0 },
      {
        id: "loneliness",
        title: "Loneliness check",
        started: 1,
        finished: 1,
        completion: 1,
        retakes: 1,
      },
    ]);
    expect(selfChecks.supportShown).toBe(1);
  });

  it("counts only what happened in the range", () => {
    const { selfChecks } = page("2026-11-02", "2026-11-08");
    expect(selfChecks.checks.map((c) => [c.id, c.started, c.finished, c.retakes])).toEqual([
      ["anxiety", 1, 1, 0],
      ["mood", 2, 1, 0],
      ["loneliness", 0, 0, 0],
    ]);
    expect(selfChecks.checks[2]!.completion).toBeNull();
    expect(selfChecks.supportShown).toBe(1);
    expect(page("2026-11-10", "2026-11-29").selfChecks.supportShown).toBe(0);
  });

  it("reads the share who let Mira use their results from today's accounts that finished a check", () => {
    // u1, u2 and u3 finished one; u1 and u3 turned the switch on. u4 never finished one, and the
    // team's account is left out.
    expect(page("2026-11-02", "2026-11-08").selfChecks.miraUse).toEqual({ on: 2, of: 3 });
  });
});

describe("the Self-checks card", () => {
  it("shows each check's row, the Mira share and the question-9 count", () => {
    view.payload = page("2026-11-02", "2026-11-29");
    render(<ApMira />);
    const card = within(screen.getByRole("region", { name: "Self-checks" }));
    const mood = card.getByRole("row", { name: /Mood check/ });
    expect(
      within(mood)
        .getAllByRole("cell")
        .map((c) => c.textContent)
    ).toEqual(["2", "1", "50.0%", "0"]);
    expect(card.getByText(/let Mira use their results/).textContent).toMatch(/^66\.7% \(2 of 3\)/);
    expect(card.getByText(/opened by the mood check/).textContent).toMatch(/^1 support-line panel/);
  });
});
