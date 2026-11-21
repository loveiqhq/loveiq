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

const ev = (
  name: string,
  user: string,
  at: string,
  detail: string | null = null
): MiraEventRow => ({
  name,
  anon_id: null,
  user_id: user,
  at: Date.parse(at),
  detail,
});

describe("AP › Mira's “Coaches & picks” card", () => {
  it("shows who people want next, and the guide's practices that led to a chat", () => {
    view.payload = buildMiraPage({
      data: {
        users: [
          {
            id: "u1",
            email: "lea@example.com",
            created_at: "2026-11-20T09:00:00Z",
            style: {},
            use_assessment: false,
          },
        ],
        events: [
          ev("coaches_viewed", "u1", "2026-11-23T10:00:00Z"),
          ev("notify_me", "u1", "2026-11-23T10:01:00Z", "lena"),
          ev("guide_ask", "u1", "2026-11-24T10:00:00Z", "2"),
          ev("chat_started", "u1", "2026-11-24T10:05:00Z", "-1"),
        ],
        nudges: [],
        bodyChecks: [],
        withResult: new Set(),
      },
      filters: parseFilters(
        { period: "custom", from: "2026-11-22", to: "2026-11-30" },
        "2026-12-01"
      ),
      today: "2026-12-01",
      now: new Date("2026-12-01T12:00:00Z"),
    });
    render(<ApMira />);
    const card = screen.getByRole("region", { name: "Coaches & picks" });
    const notify = within(card).getByRole("table", { name: "Notify me, per coach" });
    const lena = within(notify).getByRole("rowheader", { name: /Lena/ }).closest('[role="row"]')!;
    expect([...lena.querySelectorAll('[role="cell"]')].map((c) => c.textContent)).toEqual([
      "1",
      "1",
    ]);
    const guide = within(card).getByRole("table", { name: "“Ask Mira about this”, per practice" });
    const bodyScan = within(guide)
      .getByRole("rowheader", { name: /2\. Body scan/ })
      .closest('[role="row"]')!;
    expect([...bodyScan.querySelectorAll('[role="cell"]')].map((c) => c.textContent)).toEqual([
      "1",
      "1",
    ]);
  });
});
