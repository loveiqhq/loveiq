// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseFilters } from "@features/admin/server/ap/filters";
import {
  buildMiraPage,
  type MiraData,
  type MiraEventRow,
  type MiraPayload,
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

/** AP › Mira › Settings (21 Nov 2026): the choices of today's accounts, and changes per week. */

afterEach(cleanup);

const TODAY = "2026-11-21";
const ev = (name: string, who: { anon?: string; user?: string }, at: string): MiraEventRow => ({
  name,
  anon_id: who.anon ?? null,
  user_id: who.user ?? null,
  at: Date.parse(at),
  detail: null,
});
const account = (id: string, email: string, prefs: Record<string, string | null>) => ({
  id,
  email,
  created_at: "2026-11-02T09:00:00Z",
  style: {},
  use_assessment: false,
  ...prefs,
});

/** Lea chose Dark, Large and German; Ana never chose; Ben chose Light and German; staff, Dark. */
const DATA: MiraData = {
  users: [
    account("lea", "lea@example.com", { theme: "dark", text_size: "large", reply_language: "de" }),
    account("ana", "ana@example.com", { theme: null, text_size: null, reply_language: null }),
    account("ben", "ben@example.com", { theme: "light", text_size: null, reply_language: "de" }),
    account("staff", "eman@loveiq.org", {
      theme: "dark",
      text_size: "small",
      reply_language: "bs",
    }),
  ],
  events: [
    ev("theme_changed", { user: "lea" }, "2026-11-10T10:00:00Z"),
    ev("theme_changed", { anon: "visitor-9" }, "2026-11-17T10:00:00Z"),
    ev("text_size_changed", { user: "lea" }, "2026-11-17T11:00:00Z"),
    ev("reply_language_changed", { user: "ben" }, "2026-11-18T12:00:00Z"),
    ev("theme_changed", { user: "staff" }, "2026-11-17T10:00:00Z"),
    // After the range's last day: not counted.
    ev("theme_changed", { user: "lea" }, "2026-11-21T10:00:00Z"),
  ],
  nudges: [],
  bodyChecks: [],
  withResult: new Set(),
};

function page(): MiraPayload {
  return buildMiraPage({
    data: DATA,
    filters: parseFilters({ period: "custom", from: "2026-11-14", to: "2026-11-20" }, TODAY),
    today: TODAY,
    now: new Date(`${TODAY}T12:00:00Z`),
  });
}

describe("AP › Mira › Settings", () => {
  it("shares today's accounts out by their choices, counting never-chosen as the default and leaving the team out", () => {
    const { settings } = page();
    expect(settings.accounts).toBe(3);
    const n = (rows: typeof settings.theme) => rows.map((r) => [r.label, r.n]);
    expect(n(settings.theme)).toEqual([
      ["System (the default)", 1],
      ["Light", 1],
      ["Dark", 1],
    ]);
    expect(n(settings.textSize)).toEqual([
      ["Default", 2],
      ["Small", 0],
      ["Large", 1],
    ]);
    // Only languages someone chose; Bosnian was the team's.
    expect(n(settings.replyLanguage)).toEqual([
      ["Match my messages (the default)", 1],
      ["German", 2],
    ]);
    expect(settings.theme[2]!.share).toBeCloseTo(1 / 3);
  });

  it("counts the changes in each of the 8 weeks to the range's end, signed-out themes too", () => {
    const { weeks } = page().settings;
    expect(weeks.map((w) => w.week)).toEqual([
      "2026-09-28",
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
      "2026-11-02",
      "2026-11-09",
      "2026-11-16",
    ]);
    expect(weeks.at(-2)).toEqual({ week: "2026-11-09", theme: 1, textSize: 0, replyLanguage: 0 });
    expect(weeks.at(-1)).toEqual({ week: "2026-11-16", theme: 1, textSize: 1, replyLanguage: 1 });
  });

  it("shows the card on the page", () => {
    view.payload = page();
    render(<ApMira />);
    const card = screen.getByRole("heading", { name: "Settings" }).closest("section")!;
    expect(within(card).getByText("German")).toBeInTheDocument();
    expect(within(card).getByText("Match my messages (the default)")).toBeInTheDocument();
    const week = within(card).getAllByRole("row").at(-1)!;
    expect(
      within(week)
        .getAllByRole("cell")
        .map((c) => c.textContent)
    ).toEqual(["1", "1", "1"]);
    expect(card).toHaveTextContent("today’s 3 signed-up accounts");
  });
});
