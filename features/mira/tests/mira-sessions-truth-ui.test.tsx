// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
// This browser keeps New York time; the account books in Berlin.
vi.mock("@features/mira/ui/weekly-session/useWeeklySession", async (orig) => ({
  ...(await orig<typeof import("@features/mira/ui/weekly-session/useWeeklySession")>()),
  browserZone: () => "America/New_York",
}));

import { IntakeAnswers } from "@features/mira/ui/IntakeAnswers";
import { NextSessionCard } from "@features/mira/ui/weekly-session/NextSessionCard";
import { WeeklySessionSettings } from "@features/mira/ui/weekly-session/WeeklySessionSettings";

/**
 * The weekly session's screens say what really happened: a refused request is an error to retry
 * (only the under-18 stop hides them), a lapsed sign-in goes to sign-in, an invite or a
 * cancellation that couldn't be emailed comes with its way into the calendar, and a new time zone
 * alone is a change.
 */

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

/** Tuesdays at 19:00 Berlin. */
const SLOT = {
  weekday: 2,
  time: "19:00",
  timeZone: "Europe/Berlin",
  paused: false,
  next: "2026-11-24T18:00:00.000Z",
  googleUrl: "https://calendar.google.com/calendar/render?action=TEMPLATE&x=1",
};
/** What the CSRF check answers: a 403 that has nothing to do with age. */
const CSRF = () => ({ status: 403, body: { error: "Invalid request." } });

beforeEach(() => {
  replies = {
    "GET /api/mira/weekly-session": () => ({ body: { slot: SLOT, timeZone: "Europe/Berlin" } }),
  };
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState(null, "", "/mira/home");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockClear();
  router.replace.mockClear();
});

describe("a refused change is an error to retry, not the under-18 stop", () => {
  it("Home: a move refused by the CSRF check keeps the card and the sheet, and says so", async () => {
    replies["PUT /api/mira/weekly-session"] = CSRF;
    render(<NextSessionCard />);
    fireEvent.click(await screen.findByRole("button", { name: "Change" }));
    fireEvent.click(screen.getByRole("radio", { name: "Thursday" }));
    fireEvent.click(screen.getByRole("button", { name: "Move to Thursdays at 19:00" }));
    const sheet = await screen.findByRole("dialog", { name: "Your weekly session" });
    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      "That didn’t go through. Please try again."
    );
    expect(screen.getByRole("heading", { name: /Tuesday, 19:00/ })).toBeInTheDocument();
  });

  it("Settings: a reminder switch refused by the CSRF check keeps the section, and says so", async () => {
    replies["PATCH /api/mira/weekly-session"] = CSRF;
    render(<WeeklySessionSettings />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /Reminder emails/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That didn’t go through. Please try again."
    );
    expect(screen.getByRole("heading", { name: "Weekly session" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Reminder emails/ })).toBeChecked();
  });

  it("only the under-18 stop (403 with `minor`) hides the card", async () => {
    replies["GET /api/mira/weekly-session"] = () => ({
      status: 403,
      body: { error: "Not available.", minor: true },
    });
    const { container } = render(<NextSessionCard />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("a lapsed sign-in on a change goes to sign-in and back to the page", async () => {
    replies["PATCH /api/mira/weekly-session"] = () => ({
      status: 401,
      body: { error: "Please sign in." },
    });
    window.history.replaceState(null, "", "/mira/settings");
    render(<WeeklySessionSettings />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /Reminder emails/ }));
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/mira/start?next=%2Fmira%2Fsettings")
    );
  });
});

describe("cancelling in Settings says whether the calendar update went out", () => {
  const ICS = "BEGIN:VCALENDAR\r\nMETHOD:CANCEL\r\nEND:VCALENDAR\r\n";
  const cancelIt = async () => {
    render(<WeeklySessionSettings />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel weekly session" }));
    // No promise the email may not keep.
    expect(
      screen.getByText(
        /takes it out of your calendar comes by email, or here if the email can’t go/
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel session" }));
  };

  it("not emailed: says so, and offers the update to open in a calendar", async () => {
    replies["DELETE /api/mira/weekly-session"] = () => ({
      body: { slot: null, timeZone: "Europe/Berlin", emailed: false, ics: ICS },
    });
    await cancelIt();
    expect(await screen.findByRole("status")).toHaveTextContent(
      /cancelled, but we couldn’t email the update, so it may still be in your calendar/
    );
    const file = screen.getByRole("link", { name: "Download the cancellation" });
    expect(file).toHaveAttribute("download", "mira-weekly-session-cancelled.ics");
    expect(file.getAttribute("href")).toBe(
      `data:text/calendar;charset=utf-8,${encodeURIComponent(ICS)}`
    );
  });

  it("emailed: says it is cancelled, with nothing to download", async () => {
    replies["DELETE /api/mira/weekly-session"] = () => ({
      body: { slot: null, timeZone: "Europe/Berlin", emailed: true },
    });
    await cancelIt();
    expect(await screen.findByText("Your weekly session is cancelled.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Download the cancellation" })).toBeNull();
  });
});

describe("booking in the chat says whether the invite was emailed", () => {
  const weekly = (onAnswer = vi.fn()) => {
    render(<IntakeAnswers questionId="weekly" onAnswer={onAnswer} onSkip={vi.fn()} />);
    return onAnswer;
  };

  it("not emailed: the calendar links first, then the answer goes into the chat", async () => {
    replies["GET /api/mira/weekly-session"] = () => ({
      body: { slot: null, timeZone: "Europe/Berlin" },
    });
    replies["PUT /api/mira/weekly-session"] = () => ({
      body: { slot: SLOT, timeZone: "Europe/Berlin", change: "booked", emailed: false },
    });
    const onAnswer = weekly();
    fireEvent.click(await screen.findByRole("radio", { name: "Tuesday" }));
    fireEvent.click(screen.getByRole("radio", { name: "19:00" }));
    fireEvent.click(screen.getByRole("button", { name: "Book Tuesdays at 19:00" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "We couldn’t email your invite just now. Add it to your calendar here:"
    );
    expect(screen.getByRole("link", { name: "Google Calendar" })).toHaveAttribute(
      "href",
      SLOT.googleUrl
    );
    expect(screen.getByRole("link", { name: "Apple or Outlook" })).toHaveAttribute(
      "href",
      "/api/mira/weekly-session?format=ics"
    );
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onAnswer).toHaveBeenCalledWith("Tuesdays at 19:00 works for me.");
  });
});

describe("a new time zone alone is a change", () => {
  it("in the chat: 'Use New York time' moves the session to New York time", async () => {
    replies["PUT /api/mira/weekly-session"] = (b) => ({
      body: {
        slot: { ...SLOT, timeZone: b.timeZone },
        timeZone: b.timeZone,
        change: "moved",
        emailed: true,
      },
    });
    const onAnswer = vi.fn();
    render(<IntakeAnswers questionId="weekly" onAnswer={onAnswer} onSkip={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Use New York time" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Move to Tuesdays at 19:00, New York time" })
    );
    await waitFor(() =>
      expect(onAnswer).toHaveBeenCalledWith("Let’s move it to Tuesdays at 19:00, New York time.")
    );
    expect(calls("PUT /api/mira/weekly-session")).toEqual([
      { weekday: 2, time: "19:00", timeZone: "America/New_York", source: "chat" },
    ]);
  });

  it("on Home: the sheet's button says it moves to the new zone", async () => {
    render(<NextSessionCard />);
    fireEvent.click(await screen.findByRole("button", { name: "Change" }));
    expect(screen.getByRole("button", { name: "Keep Tuesdays at 19:00" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Use New York time" }));
    expect(
      screen.getByRole("button", { name: "Move to Tuesdays at 19:00, New York time" })
    ).toBeEnabled();
  });
});
