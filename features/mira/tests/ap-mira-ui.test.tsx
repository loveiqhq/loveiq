// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseFilters } from "@features/admin/server/ap/filters";
import { buildMiraPage, type MiraData, type MiraPayload } from "@features/admin/server/ap/mira";

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

const TODAY = "2026-11-20";
const at = (iso: string) => Date.parse(iso);

/** Four nudges sent in the range, one clicked and followed by a message within the day. */
const DATA: MiraData = {
  users: [
    {
      id: "u1",
      email: "a@example.com",
      created_at: "2026-11-02T09:00:00Z",
      style: {},
      use_assessment: true,
    },
  ],
  events: [
    {
      name: "chat_started",
      anon_id: null,
      user_id: "u1",
      at: at("2026-11-10T10:00:00Z"),
      rating: null,
    },
    {
      name: "message_sent",
      anon_id: null,
      user_id: "u1",
      at: at("2026-11-10T10:00:00Z"),
      rating: null,
    },
  ],
  nudges: [
    {
      user_id: "u1",
      type: "agreement",
      sent_at: "2026-11-10T07:00:00Z",
      clicked_at: "2026-11-10T09:30:00Z",
    },
    { user_id: "u1", type: "share", sent_at: "2026-11-11T07:00:00Z", clicked_at: null },
    { user_id: "u1", type: "progress", sent_at: "2026-11-12T07:00:00Z", clicked_at: null },
    { user_id: "u1", type: "celebrate", sent_at: "2026-11-13T07:00:00Z", clicked_at: null },
  ],
  withResult: new Set(),
};

function show(): MiraPayload {
  const payload = buildMiraPage({
    data: DATA,
    filters: parseFilters({ period: "custom", from: "2026-11-09", to: "2026-11-15" }, TODAY),
    today: TODAY,
    now: new Date(`${TODAY}T12:00:00Z`),
  });
  view.payload = payload;
  render(<ApMira />);
  return payload;
}

describe("the Mira staff page's nudge figures", () => {
  it("measures nudge reactivation now that the nudges exist, and promises no opens or depth", () => {
    const payload = show();
    expect(payload.tiles.nudgeStarted!.value).toBe(0.25);
    expect(screen.queryByText(/aren.t built yet/)).toBeNull();
    expect(screen.queryByText(/how deep/i)).toBeNull();

    const box = screen.getByText("Reactivated by nudges").closest("div")!;
    expect(within(box).queryByText(/Not measured yet/)).toBeNull();
    expect(within(box).getByText("1 of 4 led to a message within 24 h of the click")).toBeTruthy();

    const nudges = screen.getByRole("region", { name: "Daily nudge emails" });
    expect(within(nudges).getByText(/Opens aren.t tracked\./)).toBeTruthy();
  });
});
