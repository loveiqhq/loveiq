// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import MiraChat, { SESSION_OPENING } from "@features/mira/ui/MiraChat";
import { IntakeAnswers } from "@features/mira/ui/IntakeAnswers";
import { NextSessionCard } from "@features/mira/ui/weekly-session/NextSessionCard";
import { SessionStop } from "@features/mira/ui/weekly-session/SessionStop";
import { WeeklySessionSettings } from "@features/mira/ui/weekly-session/WeeklySessionSettings";

/** The weekly session's screens: the chat's picker, Home's card, Settings, the email stop page. */

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
    .map(([url, init]) => ({ url, body: JSON.parse(String(init?.body ?? "{}")) }));

/** Tuesdays at 19:00 Berlin; next start Tue 24 Nov 2026, 18:00Z. */
const SLOT = {
  weekday: 2,
  time: "19:00",
  timeZone: "Europe/Berlin",
  paused: false,
  next: "2026-11-24T18:00:00.000Z",
  googleUrl: "https://calendar.google.com/calendar/render?action=TEMPLATE&x=1",
};
const has = (slot: typeof SLOT | null) => () => ({
  body: { slot, timeZone: "Europe/Berlin" },
});

beforeEach(() => {
  replies = { "GET /api/mira/weekly-session": has(null) };
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  fetchMock.mockClear();
});

const weekly = (onAnswer = vi.fn(), onSkip = vi.fn()) => {
  render(<IntakeAnswers questionId="weekly" onAnswer={onAnswer} onSkip={onSkip} />);
  return { onAnswer, onSkip };
};

describe("the weekly question's time picker in the chat", () => {
  it("invites someone signed out to the free account, and still lets them say not yet", async () => {
    replies["GET /api/mira/weekly-session"] = () => ({ status: 401, body: { error: "x" } });
    const { onAnswer } = weekly();
    expect(await screen.findByRole("link", { name: "Create free account" })).toHaveAttribute(
      "href",
      "/mira/start"
    );
    fireEvent.click(screen.getByRole("button", { name: "Not ready yet" }));
    expect(onAnswer).toHaveBeenCalledWith("Not ready yet");
  });

  it("books a day and a time, then answers in the person's words", async () => {
    replies["PUT /api/mira/weekly-session"] = () => ({
      body: { slot: SLOT, timeZone: "Europe/Berlin", change: "booked", emailed: true },
    });
    const { onAnswer } = weekly();
    const book = await screen.findByRole("button", { name: "Pick a day and a time" });
    expect(book).toHaveAttribute("aria-disabled", "true");
    // Real radios: the day's whole name is read out.
    fireEvent.click(screen.getByRole("radio", { name: "Tuesday" }));
    fireEvent.click(screen.getByRole("radio", { name: "19:00" }));
    expect(screen.getByText(/Times are Berlin time/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Book Tuesdays at 19:00" }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith("Tuesdays at 19:00 works for me."));
    expect(calls("PUT /api/mira/weekly-session")[0]!.body).toEqual({
      weekday: 2,
      time: "19:00",
      timeZone: "Europe/Berlin",
      source: "chat",
    });
  });

  it("takes another time from the browser's own time input", async () => {
    weekly();
    fireEvent.click(await screen.findByRole("radio", { name: "Monday" }));
    fireEvent.click(screen.getByRole("radio", { name: "Another time" }));
    fireEvent.change(screen.getByLabelText("Your time"), { target: { value: "07:45" } });
    expect(screen.getByRole("button", { name: "Book Mondays at 07:45" })).not.toHaveAttribute(
      "aria-disabled"
    );
  });

  it("says what went wrong and sends nothing to the chat when booking fails", async () => {
    replies["PUT /api/mira/weekly-session"] = () => ({
      status: 500,
      body: { error: "Unable to book right now." },
    });
    const { onAnswer } = weekly();
    fireEvent.click(await screen.findByRole("radio", { name: "Thursday" }));
    fireEvent.click(screen.getByRole("radio", { name: "18:00" }));
    fireEvent.click(screen.getByRole("button", { name: "Book Thursdays at 18:00" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to book right now.");
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("keeps a time already booked without booking it again", async () => {
    replies["GET /api/mira/weekly-session"] = has(SLOT);
    const { onAnswer } = weekly();
    fireEvent.click(await screen.findByRole("button", { name: "Keep Tuesdays at 19:00" }));
    expect(onAnswer).toHaveBeenCalledWith("Tuesdays at 19:00 still works for me.");
    expect(calls("PUT /api/mira/weekly-session")).toEqual([]);
  });
});

describe("Home's weekly session card", () => {
  it("shows a skeleton while loading, then invites to book, and books in the sheet", async () => {
    replies["PUT /api/mira/weekly-session"] = () => ({
      body: { slot: SLOT, timeZone: "Europe/Berlin", change: "booked", emailed: true },
    });
    render(<NextSessionCard />);
    expect(screen.getByLabelText("Your weekly session")).toHaveAttribute("aria-busy", "true");
    fireEvent.click(await screen.findByRole("button", { name: "Choose a time" }));
    const sheet = screen.getByRole("dialog", { name: "Your weekly session" });
    fireEvent.click(within(sheet).getByRole("radio", { name: "Tuesday" }));
    fireEvent.click(within(sheet).getByRole("radio", { name: "19:00" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Book Tuesdays at 19:00" }));
    const done = await screen.findByRole("dialog", { name: "Weekly session booked" });
    expect(within(done).getByRole("heading", { name: "You’re booked" })).toBeInTheDocument();
    expect(within(done).getByRole("status")).toHaveTextContent("on its way to your inbox");
    expect(within(done).getByRole("link", { name: "Google Calendar" })).toHaveAttribute(
      "href",
      SLOT.googleUrl
    );
    expect(within(done).getByRole("link", { name: "Apple or Outlook" })).toHaveAttribute(
      "href",
      "/api/mira/weekly-session?format=ics"
    );
    expect(calls("PUT /api/mira/weekly-session")[0]!.body).toMatchObject({ source: "home" });
  });

  it("moves focus to the confirmation, and back to the card's Change after Done", async () => {
    replies["PUT /api/mira/weekly-session"] = () => ({
      body: { slot: SLOT, timeZone: "Europe/Berlin", change: "booked", emailed: true },
    });
    render(<NextSessionCard />);
    fireEvent.click(await screen.findByRole("button", { name: "Choose a time" }));
    fireEvent.click(screen.getByRole("radio", { name: "Tuesday" }));
    fireEvent.click(screen.getByRole("radio", { name: "19:00" }));
    const book = screen.getByRole("button", { name: "Book Tuesdays at 19:00" });
    book.focus();
    fireEvent.click(book);
    const done = await screen.findByRole("dialog", { name: "Weekly session booked" });
    // Not left on the vanished Book button: on the confirmation, whose news is then read out.
    await waitFor(() =>
      expect(within(done).getByRole("heading", { name: "You’re booked" })).toHaveFocus()
    );
    await waitFor(() =>
      expect(within(done).getByRole("status")).toHaveTextContent("on its way to your inbox")
    );
    fireEvent.click(within(done).getByRole("button", { name: "Done" }));
    // "Choose a time" is gone with the booking: focus goes to what replaced it.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Change your weekly session" })).toHaveFocus()
    );
  });

  it("keeps focus in the time group when the arrows reach Another time", async () => {
    render(<NextSessionCard />);
    fireEvent.click(await screen.findByRole("button", { name: "Choose a time" }));
    const other = screen.getByRole("radio", { name: "Another time" });
    other.focus();
    fireEvent.click(other);
    await new Promise((r) => requestAnimationFrame(r));
    expect(screen.getByLabelText("Your time")).toBeInTheDocument();
    expect(other).toHaveFocus();
  });

  it("says when the invite couldn't be emailed, and still offers the calendar", async () => {
    replies["PUT /api/mira/weekly-session"] = () => ({
      body: { slot: SLOT, timeZone: "Europe/Berlin", change: "booked", emailed: false },
    });
    render(<NextSessionCard />);
    fireEvent.click(await screen.findByRole("button", { name: "Choose a time" }));
    fireEvent.click(screen.getByRole("radio", { name: "Tuesday" }));
    fireEvent.click(screen.getByRole("radio", { name: "19:00" }));
    fireEvent.click(screen.getByRole("button", { name: "Book Tuesdays at 19:00" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("couldn’t email your invite")
    );
  });

  it("shows the next session, its way into a calendar, and a way to change it", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-21T12:00:00Z"), toFake: ["Date"] });
    replies["GET /api/mira/weekly-session"] = has(SLOT);
    render(<NextSessionCard />);
    expect(
      await screen.findByRole("heading", { name: /^Your next weekly session:\s*Tuesday, 19:00$/ })
    ).toBeInTheDocument();
    expect(screen.getByText("In 3 days · 15 minutes with Mira · Berlin time")).toBeInTheDocument();
    const add = screen.getByRole("button", { name: "Add to calendar" });
    expect(add).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(add);
    expect(add).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Google Calendar" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change your weekly session" }));
    const sheet = screen.getByRole("dialog", { name: "Your weekly session" });
    expect(within(sheet).getByRole("radio", { name: "Tuesday" })).toBeChecked();
    expect(within(sheet).getByRole("button", { name: "Keep Tuesdays at 19:00" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
  });

  it("opens the way in while the session is under way", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-24T18:10:00Z"), toFake: ["Date"] });
    replies["GET /api/mira/weekly-session"] = has(SLOT);
    render(<NextSessionCard />);
    expect(
      await screen.findByRole("heading", { name: "Your session is open now" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Join now" })).toHaveAttribute("href", "/mira/session");
  });

  it("says truthfully when reminder emails are on hold for now, in neutral words", async () => {
    replies["GET /api/mira/weekly-session"] = has({
      ...SLOT,
      remindersOnHold: true,
    } as typeof SLOT);
    render(<NextSessionCard />);
    expect(
      await screen.findByText("Reminder emails are on hold for now. They start again on their own.")
    ).toBeInTheDocument();
    // Home stays neutral: nothing about why.
    expect(document.body.textContent).not.toMatch(/support|crisis/i);
  });

  it("says when reminders are paused, and turns them back on", async () => {
    replies["GET /api/mira/weekly-session"] = has({ ...SLOT, paused: true });
    replies["PATCH /api/mira/weekly-session"] = () => ({
      body: { slot: SLOT, timeZone: "Europe/Berlin" },
    });
    render(<NextSessionCard />);
    expect(await screen.findByText(/Reminder emails are paused/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Turn them back on" }));
    await waitFor(() => expect(screen.queryByText(/Reminder emails are paused/)).toBeNull());
    expect(calls("PATCH /api/mira/weekly-session")[0]!.body).toEqual({ paused: false });
  });

  it("offers a retry when it can't load, and shows nothing signed out", async () => {
    replies["GET /api/mira/weekly-session"] = () => ({ status: 500, body: { error: "Nope." } });
    const { unmount } = render(<NextSessionCard />);
    // One wording for a failed read on Home (round-3 SET-11), whatever the server said.
    expect(await screen.findByRole("alert")).toHaveTextContent("Your weekly session didn't load.");
    replies["GET /api/mira/weekly-session"] = has(null);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Choose a time" })).toBeInTheDocument();
    unmount();
    replies["GET /api/mira/weekly-session"] = () => ({ status: 401, body: {} });
    const { container } = render(<NextSessionCard />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

describe("Settings' weekly session section", () => {
  it("says when reminder emails are on hold after support lines, and that they come back", async () => {
    replies["GET /api/mira/weekly-session"] = has({
      ...SLOT,
      remindersOnHold: true,
    } as typeof SLOT);
    render(<WeeklySessionSettings />);
    expect(
      await screen.findByText(/on hold for up to two weeks after the support lines came up/)
    ).toBeInTheDocument();
    // Paused by the person: nothing to say about a hold.
    cleanup();
    replies["GET /api/mira/weekly-session"] = has({
      ...SLOT,
      paused: true,
      remindersOnHold: true,
    } as typeof SLOT);
    render(<WeeklySessionSettings />);
    expect(await screen.findByText("Tuesdays at 19:00")).toBeInTheDocument();
    expect(screen.queryByText(/on hold/)).toBeNull();
  });

  it("pauses the reminders at once, and cancels after a confirmation", async () => {
    replies["GET /api/mira/weekly-session"] = has(SLOT);
    replies["PATCH /api/mira/weekly-session"] = () => ({
      body: { slot: { ...SLOT, paused: true }, timeZone: "Europe/Berlin" },
    });
    replies["DELETE /api/mira/weekly-session"] = () => ({
      body: { slot: null, timeZone: "Europe/Berlin", emailed: true },
    });
    render(<WeeklySessionSettings />);
    expect(await screen.findByText("Tuesdays at 19:00")).toBeInTheDocument();
    const reminders = screen.getByRole("switch", { name: "Reminder emails" });
    expect(reminders).toBeChecked();
    fireEvent.click(reminders);
    expect(await screen.findByText("Reminders are paused.")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Reminder emails" })).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Cancel weekly session" }));
    expect(screen.getByRole("group", { name: /takes it out of your calendar/ })).toBeTruthy();
    // "Keep it" first, as everywhere: it hands focus back, and nothing is cancelled.
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cancel weekly session" })).toHaveFocus()
    );
    expect(calls("DELETE /api/mira/weekly-session")).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Cancel weekly session" }));
    expect(calls("DELETE /api/mira/weekly-session")).toEqual([]);
    const cancel = screen.getByRole("button", { name: "Cancel session" });
    cancel.focus();
    fireEvent.click(cancel);
    expect(await screen.findByText("Your weekly session is cancelled.")).toBeInTheDocument();
    // R3-HAB-4: focus goes to what took the cancelled session's place, never to the page.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Choose a time" })).toHaveFocus()
    );
  });
});

describe("the weekly session's link opens a session", () => {
  it("sends the session's opening line once, as a session, when the chat loads", async () => {
    replies["GET /api/mira/me"] = () => ({ body: { profile: { style: {} }, chats: [] } });
    replies["POST /api/mira/chat"] = () => ({
      body: { reply: "Welcome to your weekly session, Lea.", sources: [], chatId: null },
    });
    // Strict mode runs effects twice in development: the opening must still go once.
    render(
      <StrictMode>
        <MiraChat signedIn initialChatId={null} session />
      </StrictMode>
    );
    expect(await screen.findByText("Welcome to your weekly session, Lea.")).toBeInTheDocument();
    const sent = calls("POST /api/mira/chat");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toMatchObject({ message: SESSION_OPENING, session: true });
    expect(screen.getByText(SESSION_OPENING)).toBeInTheDocument();
  });

  it("sends nothing on its own in an ordinary chat", async () => {
    replies["GET /api/mira/me"] = () => ({ body: { profile: { style: {} }, chats: [] } });
    render(<MiraChat signedIn initialChatId={null} />);
    await waitFor(() => expect(calls("GET /api/mira/me")).toHaveLength(1));
    expect(calls("POST /api/mira/chat")).toEqual([]);
  });
});

describe("the email's stop page", () => {
  it("explains a link that doesn't work, with the way to Settings", () => {
    render(<SessionStop token={null} />);
    expect(screen.getByRole("heading", { name: "This link doesn’t work" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/mira/settings#weekly"
    );
  });

  it("stops the reminders, and only that", async () => {
    replies["POST /api/mira/weekly-session/stop"] = () => ({
      body: { success: true, booked: true },
    });
    render(<SessionStop token="abc.def" />);
    fireEvent.click(screen.getByRole("button", { name: "Stop reminder emails" }));
    expect(await screen.findByRole("heading", { name: "No more reminders" })).toBeInTheDocument();
    const [sent] = calls("POST /api/mira/weekly-session/stop");
    // DATA-1: the token goes in the body, never in an address.
    expect(sent!.url).toBe("/api/mira/weekly-session/stop");
    expect(sent!.body).toEqual({ action: "pause", t: "abc.def" });
  });

  it("offers a retry when the stop fails", async () => {
    replies["POST /api/mira/weekly-session/stop"] = () => ({ status: 500, body: {} });
    render(<SessionStop token="abc.def" />);
    fireEvent.click(screen.getByRole("button", { name: "Stop reminder emails" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please try again");
    expect(screen.getByRole("button", { name: "Stop reminder emails" })).not.toHaveAttribute(
      "aria-disabled"
    );
  });
});
