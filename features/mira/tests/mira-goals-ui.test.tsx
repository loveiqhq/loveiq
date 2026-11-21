// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import MiraChat from "@features/mira/ui/MiraChat";
import { GOAL_STARTER, GoalSuggestion } from "@features/mira/ui/goals/GoalSuggestion";
import GoalsCard from "@features/mira/ui/goals/GoalsCard";
import GoalsPage from "@features/mira/ui/goals/GoalsPage";

/** Challenges & goals on screen: Home's card, the goals page and "Add as a goal" in the chat. */

type Reply = { status?: number; body: unknown };
let replies: Record<string, (body: Record<string, unknown>) => Reply>;
const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
  const key = `${init.method ?? "GET"} ${url.split("?")[0]}`;
  const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  const r = replies[key]?.(body) ?? { body: { success: true } };
  const status = r.status ?? 200;
  return { ok: status < 400, status, json: async () => r.body } as Response;
});
const calls = (key: string) =>
  fetchMock.mock.calls
    .filter(([url, init]) => `${init?.method ?? "GET"} ${url.split("?")[0]}` === key)
    .map(([, init]) => JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);

// Saturday 21 Nov 2026, in the browser's own time zone; its week began on Monday 16 Nov.
const TODAY = "2026-11-21";
const goal = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  challenge: "body-confidence",
  text: `Goal ${id}`,
  weekly_target: null,
  via: "hand",
  created_at: "2026-11-02T10:00:00Z",
  archived_at: null,
  completed_at: null,
  days: [] as string[],
  ...over,
});
const LIGHT = goal("g1", {
  text: "Leave one soft light on for the first minute",
  weekly_target: 3,
  via: "mira",
  days: ["2026-11-17"],
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
  replies = {
    "GET /api/mira/goals": () => ({ body: { goals: [] } }),
    "GET /api/mira/me": () => ({ body: { profile: { style: {} }, chats: [] } }),
  };
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockClear();
  window.history.replaceState(null, "", "/");
});

describe("Home's goals card", () => {
  it("teaches a first goal: ask Mira (written, not sent) or write your own", async () => {
    render(<GoalsCard />);
    expect(
      screen.getByRole("region", { name: "Challenges & goals" }).getAttribute("aria-busy")
    ).toBe("true");
    const ask = await screen.findByRole("link", { name: "Ask Mira to help" });
    expect(ask.getAttribute("href")).toBe("/mira?prompt=goal");
    expect(screen.getByRole("link", { name: "Write your own" }).getAttribute("href")).toBe(
      "/mira/goals#new"
    );
    expect(screen.getByText("Body confidence")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add a challenge" }).getAttribute("href")).toBe(
      "/mira/coaches"
    );
  });

  it("shows three goals on the go with this week, and the way to the rest", async () => {
    replies["GET /api/mira/goals"] = () => ({
      body: {
        goals: [
          LIGHT,
          goal("g2"),
          goal("g3"),
          goal("g4"),
          goal("done", { completed_at: "2026-11-15T10:00:00Z" }),
          goal("away", { archived_at: "2026-11-15T10:00:00Z" }),
        ],
      },
    });
    render(<GoalsCard />);
    await screen.findByText(LIGHT.text);
    expect(screen.getByText("1 of 3 this week")).toBeTruthy();
    expect(screen.queryByText("Goal g4")).toBeNull();
    expect(screen.queryByText("Goal done")).toBeNull();
    expect(screen.getByRole("link", { name: "1 more goal on your goals page" })).toBeTruthy();
  });

  it("ticks today in one tap, at once, and takes it back", async () => {
    replies["GET /api/mira/goals"] = () => ({ body: { goals: [LIGHT] } });
    render(<GoalsCard />);
    const tick = await screen.findByRole("button", { name: `Did it today: ${LIGHT.text}` });
    expect(tick.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(tick);
    expect(tick.getAttribute("aria-pressed")).toBe("true"); // before the server answers
    expect(screen.getByText("2 of 3 this week")).toBeTruthy();
    await waitFor(() =>
      expect(calls("POST /api/mira/goals/g1/log")).toEqual([{ day: TODAY, done: true }])
    );
    fireEvent.click(tick);
    await waitFor(() =>
      expect(calls("POST /api/mira/goals/g1/log").at(-1)).toEqual({ day: TODAY, done: false })
    );
    expect(tick.getAttribute("aria-pressed")).toBe("false");
  });

  it("celebrates a week's aim met, never naming what is missing", async () => {
    replies["GET /api/mira/goals"] = () => ({
      body: { goals: [{ ...LIGHT, days: ["2026-11-17", "2026-11-18"] }] },
    });
    render(<GoalsCard />);
    fireEvent.click(await screen.findByRole("button", { name: /Did it today/ }));
    expect(await screen.findByText("Done for this week")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/missed|behind|failed|broke/i);
  });

  it("puts a tick back when it doesn't save, and says so", async () => {
    replies["GET /api/mira/goals"] = () => ({ body: { goals: [LIGHT] } });
    replies["POST /api/mira/goals/g1/log"] = () => ({
      status: 500,
      body: { error: "That didn't save. Please try again." },
    });
    render(<GoalsCard />);
    const tick = await screen.findByRole("button", { name: /Did it today/ });
    fireEvent.click(tick);
    expect((await screen.findByRole("alert")).textContent).toContain("didn't save");
    expect(tick.getAttribute("aria-pressed")).toBe("false");
  });

  it("offers a way out when the goals don't load", async () => {
    replies["GET /api/mira/goals"] = () => ({
      status: 500,
      body: { error: "Unable to load your goals." },
    });
    render(<GoalsCard />);
    expect(await screen.findByText("Unable to load your goals.")).toBeTruthy();
    replies["GET /api/mira/goals"] = () => ({ body: { goals: [LIGHT] } });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(LIGHT.text)).toBeTruthy();
  });
});

describe("Add as a goal, under a reply of Mira's", () => {
  it("saves it in one tap as Mira's suggestion, then says it is added", async () => {
    replies["POST /api/mira/goals"] = () => ({ body: { goal: LIGHT } });
    render(<GoalSuggestion text={LIGHT.text} signedIn />);
    fireEvent.click(screen.getByRole("button", { name: "Add as a goal" }));
    expect(await screen.findByText("Added to your goals")).toBeTruthy();
    expect(calls("POST /api/mira/goals")).toEqual([{ text: LIGHT.text, via: "mira" }]);
    expect(screen.getByRole("link", { name: "See your goals" }).getAttribute("href")).toBe(
      "/mira/goals"
    );
  });

  it("invites someone signed out to the free account, sending nothing", () => {
    render(<GoalSuggestion text={LIGHT.text} signedIn={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Add as a goal" }));
    expect(screen.getByRole("link", { name: "Create free account" }).getAttribute("href")).toBe(
      "/mira/start"
    );
    expect(calls("POST /api/mira/goals")).toEqual([]);
  });

  it("says why when it can't be added, with the way to the goals", async () => {
    replies["POST /api/mira/goals"] = () => ({
      status: 409,
      body: { error: "You have 5 goals on the go. Mark one done or put one away first." },
    });
    render(<GoalSuggestion text={LIGHT.text} signedIn />);
    fireEvent.click(screen.getByRole("button", { name: "Add as a goal" }));
    expect((await screen.findByRole("alert")).textContent).toContain("5 goals on the go");
    expect(screen.getByRole("button", { name: "Add as a goal" })).toBeTruthy();
  });
});

describe("the chat and goals", () => {
  const consent = () =>
    localStorage.setItem("mira.consent.v1", JSON.stringify({ version: "mira-2026-11-21-2" }));

  it("shows Mira's goal offer under her reply, with no sign-up card beside it", async () => {
    consent();
    replies["POST /api/mira/chat"] = () => ({
      body: { reply: "A gentle first step could be the light.", goal: LIGHT.text, freeLeft: 3 },
    });
    render(<MiraChat signedIn={false} initialChatId={null} />);
    fireEvent.change(await screen.findByLabelText("Message Mira"), {
      target: { value: "I'd like to try something small" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("button", { name: "Add as a goal" })).toBeTruthy();
    expect(screen.getByText(LIGHT.text)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Keep this chat" })).toBeNull();
  });

  it("opens with the goal question written in the composer, not sent", async () => {
    window.history.replaceState(null, "", "/mira?prompt=goal");
    render(<MiraChat signedIn initialChatId={null} />);
    await waitFor(() =>
      expect((screen.getByLabelText("Message Mira") as HTMLTextAreaElement).value).toBe(
        GOAL_STARTER
      )
    );
    expect(window.location.search).toBe("");
    expect(calls("POST /api/mira/chat")).toEqual([]);
  });
});

describe("the goals page", () => {
  const OLD = goal("g3", {
    text: "Do the 2-minute sensation check",
    weekly_target: 2,
    created_at: "2026-10-20T10:00:00Z",
    // Met in the weeks of 2, 9 and 16 Nov.
    days: ["2026-11-17", "2026-11-16", "2026-11-10", "2026-11-09", "2026-11-03", "2026-11-02"],
  });

  it("adds a goal in the person's words with days a week", async () => {
    replies["POST /api/mira/goals"] = (b) => ({
      body: { goal: goal("new", { text: b.text, weekly_target: b.weeklyTarget }) },
    });
    render(<GoalsPage />);
    const input = await screen.findByLabelText("Your goal, in your own words");
    fireEvent.change(input, { target: { value: "  Walk   ten minutes " } });
    const more = screen.getByRole("button", { name: "More days" });
    for (let i = 0; i < 3; i++) fireEvent.click(more);
    expect(screen.getByText("3 days a week")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add goal" }));
    const onTheGo = screen.getByRole("region", { name: "On the go" });
    expect(await within(onTheGo).findByText("Walk ten minutes")).toBeTruthy();
    expect(calls("POST /api/mira/goals")).toEqual([
      { text: "Walk ten minutes", weeklyTarget: 3, via: "hand" },
    ]);
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("asks for words before adding an empty goal", async () => {
    render(<GoalsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Add goal" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Write your goal in a few words.");
    expect(calls("POST /api/mira/goals")).toEqual([]);
  });

  it("celebrates weeks in a row, and marks a goal done with a way back", async () => {
    replies["GET /api/mira/goals"] = () => ({ body: { goals: [OLD] } });
    replies["PATCH /api/mira/goals/g3"] = (b) => ({
      body: {
        goal: {
          ...OLD,
          days: undefined,
          completed_at: b.completed ? "2026-11-21T12:00:00Z" : null,
        },
      },
    });
    render(<GoalsPage />);
    expect(await screen.findByText("3 weeks in a row")).toBeTruthy();
    expect(screen.getByText("6 days so far")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: `Mark done: ${OLD.text}` }));
    const done = await screen.findByRole("region", { name: "Done" });
    expect(within(done).getByText(OLD.text)).toBeTruthy();
    expect(within(done).getByText("Done 21 Nov · 6 days ticked")).toBeTruthy();
    expect(calls("PATCH /api/mira/goals/g3")).toEqual([{ completed: true }]);
    expect(within(done).getByRole("button", { name: `Bring back: ${OLD.text}` })).toBeTruthy();
  });

  it("keeps a few goals on the go: no new one past five", async () => {
    replies["GET /api/mira/goals"] = () => ({
      body: { goals: ["a", "b", "c", "d", "e"].map((id) => goal(id)) },
    });
    render(<GoalsPage />);
    expect(await screen.findByText(/5 goals on the go is plenty/)).toBeTruthy();
    expect(screen.queryByLabelText("Your goal, in your own words")).toBeNull();
  });

  it("deletes all goals only after asking", async () => {
    replies["GET /api/mira/goals"] = () => ({ body: { goals: [LIGHT] } });
    render(<GoalsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete all goals" }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Delete all" }));
    await waitFor(() => expect(screen.queryByText(LIGHT.text)).toBeNull());
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(1);
  });
});
