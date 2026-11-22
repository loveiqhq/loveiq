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

import JournalReminderPage from "@/app/mira/journal/reminder/page";
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
    expect(await screen.findByRole("heading", { name: "Reminders are off." })).toBeVisible();
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
