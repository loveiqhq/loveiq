// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseFilters } from "@features/admin/server/ap/filters";
import { buildMiraPage, type MiraEventRow } from "@features/admin/server/ap/mira";

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

const ev = (name: string, user: string, at: string): MiraEventRow => ({
  name,
  anon_id: null,
  user_id: user,
  at: Date.parse(at),
  detail: null,
});

describe("AP › Mira's Weekly sessions card", () => {
  it("shows the booked, in place, reminded, joined and cancelled figures", () => {
    view.payload = buildMiraPage({
      data: {
        users: [],
        events: [
          ev("session_scheduled", "a", "2026-11-22T10:00:00Z"),
          ev("session_reminder_sent", "a", "2026-11-24T17:02:00Z"),
          ev("session_attended", "a", "2026-11-24T18:03:00Z"),
          ev("session_scheduled", "b", "2026-11-22T11:00:00Z"),
          ev("session_reminder_sent", "b", "2026-11-24T17:17:00Z"),
          ev("session_cancelled", "b", "2026-11-25T10:00:00Z"),
        ],
        nudges: [],
        bodyChecks: [],
        withResult: new Set(),
      },
      filters: parseFilters(
        { period: "custom", from: "2026-11-21", to: "2026-11-30" },
        "2026-12-01"
      ),
      today: "2026-12-01",
      now: new Date("2026-12-01T12:00:00Z"),
    });
    render(<ApMira />);
    const card = screen.getByRole("region", { name: "Weekly sessions" });
    const box = (label: string) => within(card).getByText(label).closest("div")!;
    expect(box("Booked")).toHaveTextContent("2");
    expect(box("In place")).toHaveTextContent("1");
    expect(box("Reminders sent")).toHaveTextContent("2");
    expect(box("Joined on time")).toHaveTextContent("50");
    expect(box("Joined on time")).toHaveTextContent("1 of 2 reminded sessions");
    expect(box("Cancelled")).toHaveTextContent("1");
  });
});
