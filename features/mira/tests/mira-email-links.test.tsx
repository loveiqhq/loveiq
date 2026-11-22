// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Decision 10 (22 Nov 2026): an email link's token never stays in a page's address. proxy.ts
 * moves it into the `mira_link` cookie (shared/auth/tests/proxy.test.ts); these pages read it
 * from there, and a `?t=` that somehow reached them is ignored.
 */
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

vi.mock("@shared/observability/logger", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));

// The booked session, as the stop page reads it before offering to stop its reminders.
const booked = vi.hoisted(() => ({
  slot: { paused: false } as { paused: boolean } | null | Error,
}));
vi.mock("@features/mira/server/weekly-sessions", () => ({
  getSlot: vi.fn(async () => {
    if (booked.slot instanceof Error) throw booked.slot;
    return booked.slot;
  }),
}));

// The journal reminder, as its stop page reads it before offering to stop it.
const reminder = vi.hoisted(() => ({ time: "20:00" as string | null, account: true, down: false }));
vi.mock("@features/mira/server/journal", () => ({
  readJournal: vi.fn(async () => {
    if (reminder.down) throw new Error("supabase down");
    return reminder.account
      ? { entries: [], settings: { share: "off", reminderTime: reminder.time, timeZone: "UTC" } }
      : null;
  }),
}));

import JournalReminderPage from "@/app/mira/journal/reminder/page";
import NudgesPage from "@/app/mira/nudges/page";
import SessionStopPage from "@/app/mira/session/stop/page";
import { makeToken } from "@features/mira/server/nudges";

process.env.UNSUBSCRIBE_SECRET = "test-secret-for-mira-email-links-0123456789";
const ID = "11111111-2222-4333-8444-555555555555";

const fetchMock = vi.fn(
  async (_url: string, _init?: RequestInit) =>
    ({ ok: true, status: 200, json: async () => ({ success: true, booked: true }) }) as Response
);
beforeEach(() => {
  jar.clear();
  booked.slot = { paused: false };
  Object.assign(reminder, { time: "20:00", account: true, down: false });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockClear();
});

/** A page as Next renders it, with `t` in its address as an old link would put it there. */
const open = async (
  page: (p: { searchParams: Promise<{ t?: string }> }) => Promise<React.ReactElement>,
  addressToken?: string
) => render(await page({ searchParams: Promise.resolve({ t: addressToken }) }));

describe("a weekly session's stop page", () => {
  it("reads the link from its cookie and stops the reminders with it", async () => {
    const t = makeToken("session-stop", ID)!;
    jar.set("mira_link", t);
    await open(SessionStopPage);
    fireEvent.click(screen.getByRole("button", { name: "Stop reminder emails" }));
    expect(await screen.findByRole("heading", { name: "No more reminders" })).toBeVisible();
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `/api/mira/weekly-session/stop?t=${encodeURIComponent(t)}`
    );
  });

  it("says Mira is only for adults when the stop is refused as under 18, never 'try again'", async () => {
    jar.set("mira_link", makeToken("session-stop", ID)!);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: "Mira is only for adults.", minor: true }),
    } as Response);
    await open(SessionStopPage);
    fireEvent.click(screen.getByRole("button", { name: "Stop reminder emails" }));
    expect(await screen.findByText("Mira is only for adults.")).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Stop reminder emails" })).toBeNull();
  });

  it("ignores a token in the address: without the cookie the link doesn't work", async () => {
    await open(SessionStopPage, makeToken("session-stop", ID)!);
    expect(screen.queryByRole("button", { name: "Stop reminder emails" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the journal reminder's stop page", () => {
  it("reads the link from its cookie and stops the reminder with it", async () => {
    const t = makeToken("journal-stop", ID)!;
    jar.set("mira_link", t);
    await open(JournalReminderPage);
    fireEvent.click(screen.getByRole("button", { name: "Stop reminders" }));
    expect(await screen.findByRole("heading", { name: "No more reminders" })).toBeVisible();
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `/api/mira/journal/unsubscribe?t=${encodeURIComponent(t)}`
    );
  });

  it("ignores a token in the address: without the cookie the link doesn't work", async () => {
    await open(JournalReminderPage, makeToken("journal-stop", ID)!);
    expect(screen.queryByRole("button", { name: "Stop reminders" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * CHAT-23, UX-13: one situation, so one headline, one sentence and one frame. The tokens never
 * expire, so nothing says "anymore"; a page opened again after its cookie's hour lands here too,
 * hence "Open it again from the email".
 */
describe("the three pages behind email links", () => {
  it("say a link that doesn't work the same way, in the same frame, each with where else to go", async () => {
    for (const [page, name, href] of [
      [NudgesPage, "Settings › Notifications", "/mira/settings#notifications"],
      [JournalReminderPage, "your journal", "/mira/journal"],
      [SessionStopPage, "Settings", "/mira/settings#weekly"],
    ] as const) {
      await open(page as never); // no cookie: a link cut short, or opened again after its hour
      expect(screen.getByRole("heading", { level: 1 }).textContent, name).toBe(
        "This link doesn’t work"
      );
      expect(
        screen.getByText(/^It may be incomplete\. Open it again from the email, or /)
      ).toBeVisible();
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
      expect(screen.getByRole("banner")).toHaveTextContent("Email preferences");
      expect(document.body.textContent).not.toMatch(/anymore/);
      cleanup();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// CHAT-23's other half, for the journal: opened again, it offered "Stop reminders" as if on.
describe("the journal reminder's stop page, opened again", () => {
  it("says the reminder is already off, or that there's nothing to stop, instead of offering to stop it", async () => {
    jar.set("mira_link", makeToken("journal-stop", ID)!);
    reminder.time = null;
    await open(JournalReminderPage);
    expect(screen.getByRole("heading", { name: "No more reminders" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Stop reminders" })).toBeNull();
    cleanup();
    reminder.account = false; // the account is gone: no reminder can come
    await open(JournalReminderPage);
    expect(screen.getByRole("heading", { name: "Nothing to stop" })).toBeVisible();
    expect(screen.queryByText(/Your journal/)).toBeNull();
    cleanup();
    // Unreadable: the button stays, as before, and the stop itself still works.
    Object.assign(reminder, { account: true, down: true });
    await open(JournalReminderPage);
    expect(screen.getByRole("button", { name: "Stop reminders" })).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("a weekly session's stop page, opened again", () => {
  it("says the reminders are already off, or that nothing is booked, instead of offering to stop them", async () => {
    jar.set("mira_link", makeToken("session-stop", ID)!);
    booked.slot = { paused: true };
    await open(SessionStopPage);
    expect(screen.getByRole("heading", { name: "No more reminders" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Stop reminder emails" })).toBeNull();
    cleanup();
    booked.slot = null;
    await open(SessionStopPage);
    expect(screen.getByRole("heading", { name: "Nothing to stop" })).toBeVisible();
    cleanup();
    // Unreadable: the button stays, as before, and the stop itself still works.
    booked.slot = new Error("supabase down");
    await open(SessionStopPage);
    expect(screen.getByRole("button", { name: "Stop reminder emails" })).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
