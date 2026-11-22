// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseFilters } from "@features/admin/server/ap/filters";
import { buildMiraPage, type MiraData, type MiraEventRow } from "@features/admin/server/ap/mira";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const view = vi.hoisted(() => ({ payload: null as unknown, team: null as unknown }));
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: (url: string) => ({
    data: url === "/api/admin/ap/team-browser" ? view.team : view.payload,
    loading: false,
    error: null,
    refetch: () => {},
  }),
}));
vi.mock("@features/admin/ui/ap/useApFilters", () => ({ useApFilters: () => ({ params: {} }) }));
vi.mock("@features/admin/ui/ap/ApFilterBar", () => ({ default: () => null }));
vi.mock("@shared/http/csrf-client", () => ({ getCsrfToken: () => "csrf-1" }));
const site = vi.hoisted(() => ({ production: false }));
vi.mock("@shared/env/is-non-prod-deploy", async (actual) => ({
  ...(await actual<typeof import("@shared/env/is-non-prod-deploy")>()),
  isProductionSite: () => site.production,
}));

import ApMira from "@features/admin/ui/ap/ApMira";

const TODAY = "2026-11-30";
const opened = (anon: string, at: string, source?: string): MiraEventRow => ({
  name: "chat_opened",
  anon_id: anon,
  user_id: null,
  at: Date.parse(at),
  detail: null,
  ...(source ? { source } : {}),
});
const DATA: MiraData = {
  users: [],
  events: [
    opened("a", "2026-11-22T10:00:00Z", "instagram"),
    opened("b", "2026-11-22T11:00:00Z", "instagram"),
    opened("c", "2026-11-23T10:00:00Z", "direct"),
    opened("d", "2026-11-23T11:00:00Z"),
  ],
  nudges: [],
  bodyChecks: [],
  withResult: new Set(),
};

const fetchMock = vi.fn(
  async (_url: string, init: RequestInit = {}) =>
    ({
      ok: true,
      status: 200,
      json: async () => JSON.parse(String(init.body)) as unknown,
    }) as Response
);

beforeEach(() => {
  view.payload = buildMiraPage({
    data: DATA,
    filters: parseFilters({ period: "custom", from: "2026-11-21", to: "2026-11-27" }, TODAY),
    today: TODAY,
    now: new Date(`${TODAY}T12:00:00Z`),
  });
  view.team = { team: false };
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockClear();
});

describe("AP › Mira, 21 Nov 2026", () => {
  it("shows where people came from, Direct and the unrecorded named as such", () => {
    render(<ApMira />);
    const table = screen.getByRole("table", { name: "Where people came from" });
    const cells = (name: string) =>
      within(within(table).getByRole("rowheader", { name }).parentElement!)
        .getAllByRole("cell")
        .map((c) => c.textContent);
    expect(cells("instagram")).toEqual(["2", "0", "0", "0.0%"]);
    expect(cells("Direct")).toEqual(["1", "0", "0", "0.0%"]);
    expect(cells("Not recorded")).toEqual(["1", "0", "0", "0.0%"]);
  });

  it("marks this browser as team through the admin route, with the CSRF token", async () => {
    render(<ApMira />);
    const box = screen.getByRole("checkbox", { name: "This browser counts as team" });
    expect((box as HTMLInputElement).checked).toBe(false);
    fireEvent.click(box);
    await waitFor(() => expect((box as HTMLInputElement).checked).toBe(true));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/admin/ap/team-browser");
    expect(init).toMatchObject({ method: "POST", body: JSON.stringify({ team: true }) });
    expect((init.headers as Record<string, string>)["x-csrf-token"]).toBe("csrf-1");
  });

  it("shows the “Keep this chat” card, and declined replies and under-18 stops per 1,000 conversations", () => {
    const at = (iso: string) => Date.parse(iso);
    const e = (name: string, anon: string, iso: string): MiraEventRow => ({
      name,
      anon_id: anon,
      user_id: null,
      at: at(iso),
      detail: null,
    });
    view.payload = buildMiraPage({
      data: {
        ...DATA,
        events: [
          // Two conversations of 3 messages, a declined reply and an under-18 stop.
          ...["x", "y"].flatMap((anon) =>
            [0, 1, 2].map((m) => e("message_sent", anon, `2026-11-22T10:0${m}:00Z`))
          ),
          e("reply_declined", "x", "2026-11-22T10:03:00Z"),
          e("minor_stop", "z", "2026-11-22T11:00:00Z"),
          e("keep_card_shown", "x", "2026-11-22T10:04:00Z"),
          e("keep_card_shown", "y", "2026-11-22T10:04:00Z"),
          e("keep_card_keep", "x", "2026-11-22T10:05:00Z"),
          e("keep_card_not_now", "y", "2026-11-22T10:05:00Z"),
        ],
      },
      filters: parseFilters({ period: "custom", from: "2026-11-21", to: "2026-11-27" }, TODAY),
      today: TODAY,
      now: new Date(`${TODAY}T12:00:00Z`),
    });
    render(<ApMira />);
    const safety = screen.getByRole("table", { name: "Safety and quality" });
    const cells = (name: string) =>
      within(within(safety).getByRole("rowheader", { name }).parentElement!)
        .getAllByRole("cell")
        .map((c) => c.textContent);
    expect(cells("Declined replies").slice(0, 2)).toEqual(["1", "500.0"]);
    // Crises only: the support lines the question-9 check-in opens ([[SUPPORT]]) aren't counted.
    expect(
      within(safety).getByText("A crisis, with the support lines; the team reviews each")
    ).toBeTruthy();
    expect(document.body.textContent).toContain(
      "Support lines shown without a crisis (Mira’s check-in after a mood check, a declined reply) are not counted as one."
    );
    expect(cells("Under-18 stops").slice(0, 2)).toEqual(["1", "500.0"]);

    const card = screen.getByRole("region", { name: "“Keep this chat” card (retired)" });
    expect(within(card).getByText("Shown the card").closest("div")!.textContent).toContain(
      "2 (100.0%)"
    );
    expect(within(card).getByText("Tapped Keep").closest("div")!.textContent).toContain(
      "1 (50.0%)"
    );
    expect(within(card).getByText("Tapped Not now").closest("div")!.textContent).toContain(
      "1 (50.0%)"
    );
  });

  it("says the “Keep this chat” card was retired, and draws no empty bars for the days after it", () => {
    // Decision 2 (22 Nov 2026): one free message, then the sign-up card, which keeps the chat.
    render(<ApMira />);
    const card = screen.getByRole("region", { name: "“Keep this chat” card (retired)" });
    expect(card.textContent).toContain("Retired when the free messages went down to one");
    expect(card.textContent).toContain("“Shown the sign-up card”");
    expect(within(card).queryByText("Shown the card")).toBeNull();
    expect(screen.getByText("Shown the sign-up card")).toBeTruthy();
  });

  it("names production's database only on the live site (DATA-8)", () => {
    render(<ApMira />);
    expect(screen.getByText(/This deployment’s database \(Mira’s tables\)/)).toBeTruthy();
    expect(screen.queryByText(/Production database/)).toBeNull();
    cleanup();
    site.production = true;
    render(<ApMira />);
    expect(screen.getByText(/Production database \(Mira’s tables\)/)).toBeTruthy();
    site.production = false;
  });

  it("shows a team browser as such, and says users can ask for a copy, not export", () => {
    view.team = { team: true };
    render(<ApMira />);
    const box = screen.getByRole("checkbox", { name: "This browser counts as team" });
    expect((box as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/Users can ask for a copy or delete it anytime\./)).toBeTruthy();
    expect(screen.queryByText(/export/)).toBeNull();
  });
});
