// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { CONSENT_VERSION } from "@features/mira/server/config";
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

describe("focus rings in the habits' screens", () => {
  it("leave a paper-coloured gap, never a white one in Dark", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const dirs = ["goals", "journal", "checks", "coaches", "weekly-session"];
    const files = dirs.flatMap((d) =>
      readdirSync(`features/mira/ui/${d}`)
        .filter((f) => /\.tsx?$/.test(f))
        .map((f) => `features/mira/ui/${d}/${f}`)
    );
    const bare = files.flatMap((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .flatMap((line, i) =>
          /ring-offset-2/.test(line) && !/ring-offset-white/.test(line) ? [`${f}:${i + 1}`] : []
        )
    );
    expect(bare).toEqual([]);
  });

  // Round 3: Mira's one focus ring (tailwind.config.js) hugs every bordered text field; a field's
  // own ring or outline offset beside it drew a second edge (the session picker's time field).
  it("leave text fields to Mira's one ring, with no ring or outline offset of their own", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const dirs = ["goals", "journal", "checks", "coaches", "weekly-session"];
    // Each field's own tag up to its className: never past the tag's end or into another tag
    // (an onChange's "=>" is inside the tag, so ">" alone can't end it).
    const tag = /<(input|select|textarea)\b((?:(?!\/>|<)[\s\S])*?)className="([^"]*)"/g;
    const fields = dirs.flatMap((d) =>
      readdirSync(`features/mira/ui/${d}`)
        .filter((f) => /\.tsx$/.test(f))
        .flatMap((f) =>
          [...readFileSync(`features/mira/ui/${d}/${f}`, "utf8").matchAll(tag)]
            .filter((m) => /(^|\s)border(\s|$)/.test(m[3]!))
            .map((m) => ({ where: `${d}/${f} <${m[1]}>`, classes: m[3]! }))
        )
    );
    // The time field, the reminder's select, both searches, the goal and the check-in's line.
    expect(fields.length).toBeGreaterThanOrEqual(6);
    expect(fields.map((x) => x.where)).toEqual(
      expect.arrayContaining([
        "weekly-session/SlotPicker.tsx <input>",
        "journal/JournalSettings.tsx <select>",
      ])
    );
    const own = fields.filter((x) =>
      /(focus|focus-visible):(ring|outline-offset-[1-9])/.test(x.classes)
    );
    expect(own.map((x) => x.where)).toEqual([]);
  });
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
    // No "Add a challenge" until a second one can be picked: it led to coaches who can't be.
    expect(screen.queryByRole("link", { name: /challenge/i })).toBeNull();
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

  // HAB-16: Home says a lost sign-in once, above its cards (mira-frame.test.tsx); the card goes
  // quiet rather than offer ticks that can't save, or a second notice.
  it("goes quiet when a tick finds the sign-in gone, leaving the notice to Home", async () => {
    replies["GET /api/mira/goals"] = () => ({ body: { goals: [LIGHT] } });
    replies["POST /api/mira/goals/g1/log"] = () => ({ status: 401, body: { error: "x" } });
    render(<GoalsCard />);
    fireEvent.click(await screen.findByRole("button", { name: /Did it today/ }));
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Challenges & goals" })).toBeNull()
    );
    expect(screen.queryByText("You were signed out.")).toBeNull();
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

  it("tells someone Mira stopped as under 18 the one refusal, with nothing to retry", async () => {
    replies["GET /api/mira/goals"] = () => ({
      status: 403,
      body: { error: "Mira is only for adults.", minor: true },
    });
    render(<GoalsCard />);
    expect(await screen.findByText("Mira is only for adults.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Ask Mira to help" })).toBeNull();
  });

  it("offers a way out when the goals don't load", async () => {
    replies["GET /api/mira/goals"] = () => ({
      status: 500,
      body: { error: "Unable to load your goals." },
    });
    render(<GoalsCard />);
    // One wording for a failed read on Home (round-3 SET-11), whatever the server said.
    expect(await screen.findByText("Your goals didn’t load.")).toBeTruthy();
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
    expect(screen.getByText(/^Goals live in your free account/)).toHaveFocus();
  });

  // Round-3 R3-CHAT-6: the button went (natively disabled while saving, then replaced by
  // "Added"), and the focus fell to the page.
  it("keeps the focus while it saves, then hands it to what replaced the button", async () => {
    let answer: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((done) => (answer = done)));
    render(<GoalSuggestion text={LIGHT.text} signedIn />);
    const add = screen.getByRole("button", { name: "Add as a goal" });
    add.focus();
    fireEvent.click(add);
    const saving = screen.getByRole("button", { name: "Adding…" });
    expect(saving).toHaveFocus();
    expect(saving).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(saving); // a second tap while it saves sends nothing more
    expect(fetchMock).toHaveBeenCalledTimes(1);
    answer({ ok: true, status: 200, json: async () => ({ goal: LIGHT }) } as Response);
    await waitFor(() => expect(screen.getByText("Added to your goals")).toHaveFocus());
  });

  it("doesn't take the focus when a reopened chat shows it already added", () => {
    render(<GoalSuggestion text={LIGHT.text} signedIn added />);
    expect(screen.getByText("Added to your goals")).not.toHaveFocus();
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
    localStorage.setItem("mira.consent.v1", JSON.stringify({ version: CONSENT_VERSION }));

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

  // R4-HABITS-2: one status line, and the same words set again changed nothing in it, so a
  // second "Goal added." or "Goal deleted." in a row was never read out.
  it("says every add and every delete, the same words twice in a row too", async () => {
    let n = 0;
    replies["POST /api/mira/goals"] = (b) => ({
      body: { goal: goal(`new${++n}`, { text: b.text }) },
    });
    render(<GoalsPage />);
    const input = await screen.findByLabelText("Your goal, in your own words");
    const status = screen.getAllByRole("status").find((el) => el.classList.contains("sr-only"))!;
    const heard: string[] = [];
    const watch = new MutationObserver(() => heard.push(status.textContent ?? ""));
    watch.observe(status, { childList: true, characterData: true, subtree: true });
    for (const words of ["Stretch before bed", "Walk ten minutes"]) {
      fireEvent.change(input, { target: { value: words } });
      fireEvent.click(screen.getByRole("button", { name: "Add goal" }));
      await screen.findByText(words);
    }
    await waitFor(() => expect(heard.length).toBeGreaterThanOrEqual(2));
    expect(heard.map((t) => t.trim())).toEqual(["Goal added.", "Goal added."]);

    for (const words of ["Stretch before bed", "Walk ten minutes"]) {
      fireEvent.click(screen.getByRole("button", { name: `Edit: ${words}` }));
      fireEvent.click(screen.getByRole("button", { name: "Delete goal" }));
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
      await waitFor(() => expect(screen.queryByText(words)).toBeNull());
    }
    await waitFor(() => expect(heard.length).toBeGreaterThanOrEqual(4));
    expect(heard.map((t) => t.trim())).toEqual([
      "Goal added.",
      "Goal added.",
      "Goal deleted.",
      "Goal deleted.",
    ]);
    watch.disconnect();
  });

  it("says so when a stale tab ticks a goal put away elsewhere, and keeps no tick", async () => {
    replies["GET /api/mira/goals"] = () => ({ body: { goals: [LIGHT] } });
    replies["POST /api/mira/goals/g1/log"] = () => ({
      status: 409,
      body: { error: "This goal was put away or marked done somewhere else. Reload to see it." },
    });
    render(<GoalsPage />);
    const tick = await screen.findByRole("button", { name: /Did it today/ });
    fireEvent.click(tick);
    expect((await screen.findByRole("alert")).textContent).toMatch(/put away or marked done/);
    expect(tick.getAttribute("aria-pressed")).toBe("false");
  });

  it("names a goal's aim once, and shows its 8 weeks as labelled slots, not a hairline", async () => {
    const fresh = goal("g5", { text: "Two quiet minutes", weekly_target: 2 });
    replies["GET /api/mira/goals"] = () => ({ body: { goals: [fresh] } });
    render(<GoalsPage />);
    const entry = (await screen.findByRole("heading", { name: "Two quiet minutes" })).closest(
      "li"
    )!;
    expect(within(entry).getAllByText(/2 days a week/)).toHaveLength(1);
    expect(within(entry).getByText("Tick the days you do it")).toBeTruthy();
    const weeks = within(entry).getByRole("list", { name: "Days ticked, last 8 weeks" });
    expect(within(weeks).getAllByRole("listitem")).toHaveLength(8);
    // Every week is a visible slot (a track), filled as days are ticked.
    for (const li of within(weeks).getAllByRole("listitem")) {
      expect(li.className).toMatch(/bg-ap-track/);
    }
    expect(within(entry).getByText("Last 8 weeks")).toBeTruthy();
    // Spelled out, as the journal does: "Sep", never ICU's "Sept".
    expect(within(weeks).getByText(/^Week of 28 Sep: /)).toBeTruthy();
  });

  it("keeps the days stepper focused at its ends, ignoring a press past them", async () => {
    render(<GoalsPage />);
    const more = await screen.findByRole("button", { name: "More days" });
    more.focus();
    for (let i = 0; i < 8; i++) fireEvent.click(more);
    expect(screen.getByText("Every day")).toBeTruthy();
    expect(more).toHaveAttribute("aria-disabled", "true");
    expect(more).not.toBeDisabled();
    expect(more).toHaveFocus();
    const fewer = screen.getByRole("button", { name: "Fewer days" });
    fewer.focus();
    for (let i = 0; i < 8; i++) fireEvent.click(fewer);
    expect(screen.getByText("No set days")).toBeTruthy();
    expect(fewer).toHaveAttribute("aria-disabled", "true");
    expect(fewer).toHaveFocus();
  });

  it("opens a goal's delete question on Keep it, and Keep it hands focus back", async () => {
    replies["GET /api/mira/goals"] = () => ({ body: { goals: [LIGHT] } });
    render(<GoalsPage />);
    fireEvent.click(await screen.findByRole("button", { name: `Edit: ${LIGHT.text}` }));
    fireEvent.click(screen.getByRole("button", { name: "Delete goal" }));
    const keep = screen.getByRole("button", { name: "Keep it" });
    await waitFor(() => expect(keep).toHaveFocus());
    fireEvent.click(keep);
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete goal" })).toHaveFocus());
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
  });

  // R3-HAB-3: the same words answer the goal on the go. Say so, and drop nothing typed.
  it("says a goal is already on the go, keeping the words and the new aim in the form", async () => {
    replies["GET /api/mira/goals"] = () => ({ body: { goals: [LIGHT] } });
    replies["POST /api/mira/goals"] = () => ({ body: { goal: LIGHT, existing: true } });
    render(<GoalsPage />);
    const input = await screen.findByLabelText("Your goal, in your own words");
    const typed = `  ${LIGHT.text.toUpperCase()} `;
    fireEvent.change(input, { target: { value: typed } });
    for (let i = 0; i < 7; i++) fireEvent.click(screen.getByRole("button", { name: "More days" }));
    fireEvent.click(screen.getByRole("button", { name: "Add goal" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "You already have this goal on the go. To change its days a week, use Edit on it above."
    );
    expect(calls("POST /api/mira/goals")).toHaveLength(1);
    expect((input as HTMLInputElement).value).toBe(typed);
    expect(screen.getByText("Every day")).toBeTruthy();
    expect(screen.queryByText("Goal added.")).toBeNull();
    expect(screen.getAllByRole("heading", { name: LIGHT.text })).toHaveLength(1);
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

  // R3-HAB-4: a row that leaves its list takes focus with it: to the row now in its place, else
  // to the list's heading, never to the page.
  it("keeps focus in place when a goal is done, put away, brought back or deleted", async () => {
    const [one, two, three] = ["g1", "g2", "g3"].map((id) => goal(id));
    replies["GET /api/mira/goals"] = () => ({ body: { goals: [one, two, three] } });
    for (const g of [one, two, three]) {
      replies[`PATCH /api/mira/goals/${g!.id}`] = (b) => ({
        body: {
          goal: {
            ...g,
            days: undefined,
            completed_at: b.completed ? "2026-11-21T12:00:00Z" : null,
            archived_at: b.archived ? "2026-11-21T12:00:00Z" : null,
          },
        },
      });
    }
    render(<GoalsPage />);
    const press = async (name: string) => {
      const button = await screen.findByRole("button", { name });
      button.focus();
      fireEvent.click(button);
    };
    const focused = () => document.activeElement;
    await press("Mark done: Goal g1");
    await waitFor(() =>
      expect(focused()).toBe(screen.getByRole("button", { name: "Did it today: Goal g2" }))
    );
    await press("Put away: Goal g3");
    // The last row went: the one before it takes its place.
    await waitFor(() =>
      expect(focused()).toBe(screen.getByRole("button", { name: "Did it today: Goal g2" }))
    );
    await press("Put away: Goal g2");
    await waitFor(() => expect(focused()).toBe(screen.getByRole("heading", { name: "On the go" })));
    // Put away now holds g3 and g2: bringing one back lands on the other's.
    await press("Bring back: Goal g3");
    await waitFor(() =>
      expect(focused()).toBe(screen.getByRole("button", { name: "Bring back: Goal g2" }))
    );
    // Its section goes with its last goal: focus goes to where the goals on the go are.
    await press("Bring back: Goal g2");
    await waitFor(() => expect(focused()).toBe(screen.getByRole("heading", { name: "On the go" })));
    expect(screen.queryByRole("region", { name: "Put away" })).toBeNull();
  });

  it("keeps focus in place after a goal, or all of them, are deleted", async () => {
    replies["GET /api/mira/goals"] = () => ({ body: { goals: [goal("g1"), goal("g2")] } });
    render(<GoalsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit: Goal g1" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete goal" }));
    const confirm = screen.getByRole("button", { name: "Delete" });
    confirm.focus();
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Did it today: Goal g2" })
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete all goals" }));
    const all = screen.getByRole("button", { name: "Delete all" });
    all.focus();
    fireEvent.click(all);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { name: "Who sees your goals" })
      )
    );
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
