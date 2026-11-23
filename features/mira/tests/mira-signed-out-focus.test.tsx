// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/mira/home",
}));

import MiraHome from "@features/mira/ui/MiraHome";
import MiraSettings from "@features/mira/ui/MiraSettings";
import GoalsPage from "@features/mira/ui/goals/GoalsPage";
import RecordingsPage from "@features/mira/ui/recordings/Recordings";
import { WeeklySessionSettings } from "@features/mira/ui/weekly-session/WeeklySessionSettings";

/**
 * Round 4 (R4-CORE-7, R4-UXA-1, R4-HABITS-3): when an action found the sign-in gone, the signed-out
 * notice replaced the content holding the pressed control, and the focus fell to the page: the
 * next Tab started again at the skip link. The notice now takes it, and only then: a 401 while
 * the page loads has no focus to lose.
 */

const PROFILE = {
  email: "a@b.co",
  name: "Robin",
  country: "DE",
  gender: null,
  style: {},
  remember_chats: true,
  use_assessment: false,
  nudges_on: true,
  nudge_time: "08:00",
  time_zone: "Europe/Berlin",
  reply_language: null,
};
const SESSION = {
  id: "00000000-0000-4000-8000-000000000001",
  startedAt: "2026-10-28T12:00:00Z",
  seconds: 900,
  you: 64,
  summary: "A first one.",
  previousAt: null,
};

type Reply = { status?: number; body: unknown };
let replies: Record<string, () => Reply>;
const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
  const key = `${init.method ?? "GET"} ${url}`;
  const hit = Object.keys(replies)
    .sort((a, b) => b.length - a.length)
    .find((k) => key.startsWith(k));
  const r = hit ? replies[hit]!() : { body: { success: true } };
  const status = r.status ?? 200;
  return { ok: status < 400, status, json: async () => r.body } as Response;
});

beforeEach(() => {
  replies = {
    "GET /api/mira/me": () => ({ body: { profile: PROFILE, chats: [] } }),
    "GET /api/mira/goals": () => ({ body: { goals: [] } }),
    "GET /api/mira/journal": () => ({
      body: { entries: [], settings: { share: "off", reminderTime: null, timeZone: "UTC" } },
    }),
    "GET /api/mira/weekly-session": () => ({ body: { slot: null, timeZone: "Europe/Berlin" } }),
    "GET /api/mira/checks": () => ({
      body: {
        account: "u1",
        email: "a@b.co",
        name: null,
        useChecks: false,
        useAssessment: false,
        support: "DE",
        checks: ["anxiety", "mood", "loneliness"].map((id) => ({ id, results: [], nextAt: null })),
        bodyCheck: null,
        assessment: null,
      },
    }),
    "GET /api/mira/recordings": () => ({ body: { recordings: [], more: false } }),
    "GET /api/mira/coaches": () => ({
      body: { name: null, email: "a@b.co", remember: true, topics: [], notified: [], chats: [] },
    }),
  };
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockClear();
});

const notice = () =>
  screen.findByText("You were signed out.").then((p) => p.closest("[role=alert]"));

describe("the signed-out notice and the focus", () => {
  it("takes the focus when it replaces the goal form whose Add goal was pressed", async () => {
    render(<GoalsPage />);
    fireEvent.change(await screen.findByLabelText("Your goal, in your own words"), {
      target: { value: "Leave a soft light on" },
    });
    replies["POST /api/mira/goals"] = () => ({ status: 401, body: {} });
    const add = screen.getByRole("button", { name: "Add goal" });
    add.focus();
    fireEvent.click(add);
    const box = await notice();
    await waitFor(() => expect(box).toHaveFocus());
  });

  it("takes the focus from a Settings switch the page took away", async () => {
    render(<MiraSettings />);
    const nudges = await screen.findByRole("switch", { name: "Daily nudges by email" });
    replies["PATCH /api/mira/me"] = () => ({ status: 401, body: {} });
    nudges.focus();
    fireEvent.click(nudges);
    const box = await notice();
    await waitFor(() => expect(box).toHaveFocus());
  });

  it("takes the focus from Home's coaches card's Notify me", async () => {
    render(<MiraHome hour={8} name="Robin" />);
    const [notify] = await screen.findAllByRole("button", { name: /^Notify me when / });
    replies["POST /api/mira/event"] = () => ({ status: 401, body: {} });
    notify!.focus();
    fireEvent.click(notify!);
    const box = await notice();
    await waitFor(() => expect(box).toHaveFocus());
  });

  it("takes the focus from Book in Settings' weekly session picker", async () => {
    render(<MiraSettings weeklySession={<WeeklySessionSettings />} />);
    fireEvent.click(await screen.findByRole("button", { name: "Choose a time" }));
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.click(dialog.getAllByRole("radio")[0]!);
    fireEvent.click(dialog.getAllByRole("radio", { name: /\d\d:\d\d/ })[0]!);
    replies["PUT /api/mira/weekly-session"] = () => ({ status: 401, body: {} });
    const book = dialog.getByRole("button", { name: /^Book / });
    book.focus();
    fireEvent.click(book);
    const box = await notice();
    await waitFor(() => expect(box).toHaveFocus());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("takes the focus from Show older sessions", async () => {
    replies["GET /api/mira/recordings?limit=50&before="] = () => ({ status: 401, body: {} });
    replies["GET /api/mira/recordings?limit=50"] = () => ({
      body: { recordings: [SESSION], more: true },
    });
    render(<RecordingsPage />);
    const older = await screen.findByRole("button", { name: "Show older sessions" });
    older.focus();
    fireEvent.click(older);
    const box = await notice();
    await waitFor(() => expect(box).toHaveFocus());
  });

  it("leaves the focus alone when the page's own read finds the sign-in gone", async () => {
    replies["GET /api/mira/goals"] = () => ({ status: 401, body: {} });
    render(<GoalsPage />);
    const box = await notice();
    await new Promise((r) => requestAnimationFrame(r));
    expect(box).not.toHaveFocus();
  });
});
