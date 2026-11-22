// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));

import GoalsCard from "@features/mira/ui/goals/GoalsCard";
import GoalsPage from "@features/mira/ui/goals/GoalsPage";
import { JournalCard } from "@features/mira/ui/journal/JournalCard";
import JournalPage from "@features/mira/ui/journal/JournalPage";

/**
 * "Today" is the person's today at the moment they act, in a tab left open past midnight too:
 * Home's journal card and goals check it again at every tap and whenever the tab comes back into
 * view. And every tick of "Did it today" is saved, or said not to be.
 */

type Reply = { status?: number; body: unknown };
let replies: Record<string, (body: Record<string, unknown>) => Reply | Promise<Reply>>;
const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
  const key = `${init.method ?? "GET"} ${url.split("?")[0]}`;
  const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  const r = (await replies[key]?.(body)) ?? { body: { success: true } };
  const status = r.status ?? 200;
  return { ok: status < 400, status, json: async () => r.body } as Response;
});
const sent = (method: string, path: string) =>
  fetchMock.mock.calls
    .filter(([url, init]) => (init?.method ?? "GET") === method && url.split("?")[0] === path)
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
/** The tab comes back into view: the person picks the phone up again. */
const backInView = () => act(() => void document.dispatchEvent(new Event("visibilitychange")));

const SETTINGS = { share: "off", reminderTime: null, timeZone: "Europe/Berlin" };
const goal = (id: string, days: string[] = []) => ({
  id,
  challenge: "body-confidence",
  text: `Goal ${id}`,
  weekly_target: null,
  via: "hand",
  created_at: "2026-11-02T10:00:00Z",
  archived_at: null,
  completed_at: null,
  days,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.stubGlobal("fetch", fetchMock);
  replies = {};
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockClear();
});

describe("Home's journal card left open past midnight", () => {
  it("saves 'today's check-in' on the day it is tapped, not the day the page loaded", async () => {
    vi.setSystemTime(new Date(2026, 10, 23, 23, 50)); // Monday 23:50 on this browser's clock
    replies["GET /api/mira/journal"] = () => ({ body: { entries: [], settings: SETTINGS } });
    render(<JournalCard />);
    await screen.findByText("How is life feeling today?");
    vi.setSystemTime(new Date(2026, 10, 24, 8, 0)); // Tuesday 08:00, same tab
    fireEvent.click(screen.getByRole("button", { name: /Do today’s check-in/ }));
    const dialog = screen.getByRole("dialog", { name: "Today’s check-in" });
    fireEvent.click(
      within(within(dialog).getByRole("radiogroup", { name: "Mood" })).getByRole("radio", {
        name: "4, Good",
      })
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await screen.findByText("Saved to your journal.");
    expect(sent("PUT", "/api/mira/journal")).toEqual([
      { day: "2026-11-24", mood: 4, body: null, closeness: null, energy: null, note: null },
    ]);
  });

  it("never edits yesterday's entry as today's", async () => {
    vi.setSystemTime(new Date(2026, 10, 23, 21, 0));
    replies["GET /api/mira/journal"] = () => ({
      body: {
        entries: [{ day: "2026-11-23", mood: 2, body: 2, closeness: 2, energy: 2, note: "Mon" }],
        settings: SETTINGS,
      },
    });
    render(<JournalCard />);
    await screen.findByText(/Checked in for today/);
    vi.setSystemTime(new Date(2026, 10, 24, 9, 0)); // Tuesday morning, same tab
    fireEvent.click(screen.getByRole("button", { name: /Edit today’s check-in/ }));
    const dialog = screen.getByRole("dialog", { name: "Today’s check-in" });
    const mood = within(within(dialog).getByRole("radiogroup", { name: "Mood" }));
    // Tuesday's own check-in: empty, not Monday's.
    expect(mood.getByRole("radio", { name: "2, Low" })).not.toBeChecked();
    fireEvent.click(mood.getByRole("radio", { name: "5, Very good" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await screen.findByText("Saved to your journal.");
    expect(sent("PUT", "/api/mira/journal")[0]).toMatchObject({ day: "2026-11-24", note: null });
  });

  it("moves on to the new day when the tab comes back into view", async () => {
    vi.setSystemTime(new Date(2026, 10, 23, 21, 0));
    replies["GET /api/mira/journal"] = () => ({
      body: {
        entries: [
          { day: "2026-11-23", mood: 3, body: null, closeness: null, energy: null, note: null },
        ],
        settings: SETTINGS,
      },
    });
    render(<JournalCard />);
    await screen.findByText(/Checked in for today/);
    vi.setSystemTime(new Date(2026, 10, 24, 7, 30));
    backInView();
    expect(screen.getByText(/You haven’t checked in yet today/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Do today’s check-in/ })).toBeInTheDocument();
  });
});

describe("the journal page left open past midnight", () => {
  it("checks in for the day it is tapped", async () => {
    vi.setSystemTime(new Date(2026, 10, 23, 23, 50));
    replies["GET /api/mira/journal"] = () => ({
      body: {
        entries: [
          { day: "2026-11-22", mood: 3, body: null, closeness: null, energy: null, note: null },
        ],
        settings: SETTINGS,
      },
    });
    render(<JournalPage />);
    const start = await screen.findByRole("button", { name: /Do today’s check-in/ });
    vi.setSystemTime(new Date(2026, 10, 24, 8, 0));
    fireEvent.click(start);
    const dialog = screen.getByRole("dialog", { name: "Today’s check-in" });
    fireEvent.click(
      within(within(dialog).getByRole("radiogroup", { name: "Energy" })).getByRole("radio", {
        name: "3, Okay",
      })
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await screen.findByText("Saved to your journal.");
    expect(sent("PUT", "/api/mira/journal")[0]).toMatchObject({ day: "2026-11-24", energy: 3 });
  });
});

describe("Home's goals card left open past midnight", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 10, 23, 21, 0)); // Monday evening, ticked Monday
    replies["GET /api/mira/goals"] = () => ({ body: { goals: [goal("g1", ["2026-11-23"])] } });
  });

  it("a tap the next morning ticks the new day, at once", async () => {
    render(<GoalsCard />);
    const b = await screen.findByRole("button", { name: "Did it today: Goal g1" });
    vi.setSystemTime(new Date(2026, 10, 24, 8, 0)); // Tuesday morning, same tab
    await act(async () => void fireEvent.click(b));
    expect(sent("POST", "/api/mira/goals/g1/log")).toEqual([{ day: "2026-11-24", done: true }]);
    expect(b).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the new day as not yet ticked when the tab comes back into view", async () => {
    render(<GoalsCard />);
    const b = await screen.findByRole("button", { name: "Did it today: Goal g1" });
    expect(b).toHaveAttribute("aria-pressed", "true");
    vi.setSystemTime(new Date(2026, 10, 24, 8, 0));
    backInView();
    expect(b).toHaveAttribute("aria-pressed", "false");
  });
});

describe("ticking goals in a row on the goals page", () => {
  /** Each tick's request waits until released: a phone on a train. */
  let release: Array<() => void>;
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-11-21T12:00:00"));
    release = [];
    replies["GET /api/mira/goals"] = () => ({ body: { goals: [goal("a"), goal("b")] } });
    for (const id of ["a", "b"]) {
      replies[`POST /api/mira/goals/${id}/log`] = () =>
        new Promise<Reply>((done) => release.push(() => done({ body: { success: true } })));
    }
  });
  const announced = () => screen.getAllByRole("status").map((s) => s.textContent);
  const logs = () =>
    fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.endsWith("/log"));

  it("ticks a second goal while the first still saves, and says so once it is saved", async () => {
    render(<GoalsPage />);
    const a = await screen.findByRole("button", { name: "Did it today: Goal a" });
    const b = screen.getByRole("button", { name: "Did it today: Goal b" });
    fireEvent.click(a);
    fireEvent.click(b);
    expect(logs()).toEqual(["/api/mira/goals/a/log", "/api/mira/goals/b/log"]);
    expect(b).toHaveAttribute("aria-pressed", "true");
    expect(announced()).not.toContain("Ticked for today."); // nothing is saved yet
    await act(async () => release[1]!()); // b's arrives first
    expect(announced()).toContain("Ticked for today.");
    await act(async () => release[0]!());
    expect(a).toHaveAttribute("aria-pressed", "true");
  });

  it("holds a second tap on a goal whose tick is still saving, and announces nothing for it", async () => {
    render(<GoalsPage />);
    const a = await screen.findByRole("button", { name: "Did it today: Goal a" });
    fireEvent.click(a);
    expect(a).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(a); // taken back while the tick saves: not sent, not undone on screen
    expect(logs()).toEqual(["/api/mira/goals/a/log"]);
    expect(a).toHaveAttribute("aria-pressed", "true");
    expect(announced()).not.toContain("Tick taken back.");
    await act(async () => release[0]!());
    expect(a).not.toHaveAttribute("aria-disabled", "true");
    expect(announced()).toContain("Ticked for today.");
  });
});
