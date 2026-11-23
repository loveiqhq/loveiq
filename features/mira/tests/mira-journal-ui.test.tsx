// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));

import { addDays } from "@features/admin/server/ap/days";
import miraConfig from "@features/mira/content/mira-config.json";
import { JournalCard } from "@features/mira/ui/journal/JournalCard";
import JournalPage from "@features/mira/ui/journal/JournalPage";
import { JournalSettings } from "@features/mira/ui/journal/JournalSettings";
import { ReminderStop } from "@features/mira/ui/journal/ReminderStop";
import { localToday } from "@features/mira/ui/journal/useJournal";

type Reply = { status?: number; body: unknown };
let replies: Record<string, (body: Record<string, unknown>) => Reply>;
const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
  const key = `${init.method ?? "GET"} ${url.split("?")[0]}`;
  const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  const r = replies[key]?.(body) ?? { body: { success: true } };
  const status = r.status ?? 200;
  return { ok: status < 400, status, json: async () => r.body } as Response;
});
/** The requests sent, as "METHOD url" and their bodies. */
const sent = (method: string) =>
  fetchMock.mock.calls
    .filter(([, init]) => (init?.method ?? "GET") === method)
    .map(([url, init]) => ({ url, body: init?.body ? JSON.parse(String(init.body)) : null }));

const TODAY = localToday();
const day = (n: number) => addDays(TODAY, n);
const entry = (d: string, rated: Record<string, unknown> = {}) => ({
  day: d,
  mood: null,
  body: null,
  closeness: null,
  energy: null,
  note: null,
  ...rated,
});
const SETTINGS = { share: "off", reminderTime: null, timeZone: "Europe/Berlin" };
const journalReply = (entries: unknown[], settings: Record<string, unknown> = {}) => ({
  "GET /api/mira/journal": () => ({ body: { entries, settings: { ...SETTINGS, ...settings } } }),
});

beforeEach(() => {
  replies = journalReply([]);
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockClear();
});

describe("the Home card", () => {
  it("shows today's question, the week so far, and never a broken streak", async () => {
    replies = journalReply([entry(day(-1), { mood: 4 }), entry(day(-2), { mood: 3 })]);
    render(<JournalCard />);
    expect(await screen.findByText("How is life feeling today?")).toBeInTheDocument();
    expect(screen.getByText(/You haven’t checked in yet today/)).toBeInTheDocument();
    expect(screen.getByText("days in a row")).toBeInTheDocument();
    const week = within(screen.getByRole("list", { name: "Your last seven days" }));
    const dots = week.getAllByRole("listitem").map((li) => li.getAttribute("aria-label"));
    expect(dots).toHaveLength(7);
    expect(dots.at(-1)).toBe("Today: not yet");
    expect(dots.at(-2)).toMatch(/: checked in$/);
    expect(dots.at(0)).toMatch(/: no check-in$/);
    expect(screen.getByRole("link", { name: "See all check-ins" })).toHaveAttribute(
      "href",
      "/mira/journal"
    );
  });

  it("checks in with one tap a row and a line, and the day fills in", async () => {
    render(<JournalCard />);
    fireEvent.click(await screen.findByRole("button", { name: /Do today’s check-in/ }));
    const dialog = screen.getByRole("dialog", { name: "Today’s check-in" });
    const mood = within(dialog).getByRole("radiogroup", { name: "Mood" });
    fireEvent.click(within(mood).getByRole("radio", { name: "4, Good" }));
    const energy = within(dialog).getByRole("radiogroup", { name: "Energy" });
    fireEvent.click(within(energy).getByRole("radio", { name: "2, Low" }));
    fireEvent.change(within(dialog).getByLabelText(/A line for the day/), {
      target: { value: "  A long   walk " },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved to your journal.")).toBeInTheDocument();
    // The very first check-in has its own line.
    expect(screen.getByText("Your first check-in. Come back any day.")).toBeInTheDocument();
    expect(sent("PUT")).toEqual([
      {
        url: "/api/mira/journal",
        body: {
          day: TODAY,
          mood: 4,
          body: null,
          closeness: null,
          energy: 2,
          note: "A long walk",
          base: null,
        },
      },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    // The save replaced "Do today's check-in": focus goes to what replaced it, not the page.
    const edit = screen.getByRole("button", { name: /Edit today’s check-in/ });
    await waitFor(() => expect(edit).toHaveFocus());
    expect(screen.getByRole("listitem", { name: "Today: checked in" })).toBeInTheDocument();
  });

  it("keeps focus where it is while saving: nothing goes disabled, changes wait", async () => {
    render(<JournalCard />);
    fireEvent.click(await screen.findByRole("button", { name: /Do today’s check-in/ }));
    // The save is held until released.
    let release = () => undefined as void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((done) => {
          release = () =>
            done({
              ok: true,
              status: 200,
              json: async () => ({ success: true, updatedAt: "2026-11-22T10:00:00Z" }),
            } as Response);
        })
    );
    const mood = within(screen.getByRole("radiogroup", { name: "Mood" }));
    fireEvent.click(mood.getByRole("radio", { name: "4, Good" }));
    const note = screen.getByLabelText(/A line for the day/);
    note.focus();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("button", { name: "Saving…" });
    // Decision 7: a disabled control would drop the keyboard's focus.
    expect(note).not.toBeDisabled();
    expect(note).toHaveFocus();
    expect(note).toHaveAttribute("readonly");
    expect(mood.getByRole("radio", { name: "1, Very low" })).not.toBeDisabled();
    fireEvent.click(mood.getByRole("radio", { name: "1, Very low" }));
    expect(mood.getByRole("radio", { name: "4, Good" })).toBeChecked();
    release();
    expect(await screen.findByText("Saved to your journal.")).toBeInTheDocument();
  });

  it("keeps the first check-in's line for the very first one only", async () => {
    replies = journalReply([entry(day(-3), { mood: 3 })]);
    render(<JournalCard />);
    fireEvent.click(await screen.findByRole("button", { name: /Do today’s check-in/ }));
    const mood = screen.getByRole("radiogroup", { name: "Mood" });
    fireEvent.click(within(mood).getByRole("radio", { name: "4, Good" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved to your journal.")).toBeInTheDocument();
    expect(screen.queryByText("Your first check-in. Come back any day.")).toBeNull();
    expect(screen.getByText("Every check-in adds to the picture.")).toBeInTheDocument();
  });

  it("counts the note's characters as a person does, an emoji as one, up to 280", async () => {
    render(<JournalCard />);
    fireEvent.click(await screen.findByRole("button", { name: /Do today’s check-in/ }));
    const line = screen.getByLabelText(/A line for the day/) as HTMLInputElement;
    fireEvent.change(line, { target: { value: `${"a".repeat(273)}${"😀".repeat(6)}` } });
    expect(line).toHaveAccessibleDescription(/1 character left\.$/);
    fireEvent.change(line, { target: { value: `${"a".repeat(276)}${"😀".repeat(6)}` } });
    // Kept to 280 characters (the database's own count), not 280 UTF-16 units.
    expect([...line.value]).toHaveLength(280);
    expect(line).toHaveAccessibleDescription(/0 characters left\.$/);
  });

  it("asks for one rating before saving, and lets a second tap clear a row", async () => {
    render(<JournalCard />);
    fireEvent.click(await screen.findByRole("button", { name: /Do today’s check-in/ }));
    const mood = screen.getByRole("radiogroup", { name: "Mood" });
    const good = within(mood).getByRole("radio", { name: "4, Good" });
    fireEvent.click(good);
    expect(good).toBeChecked();
    fireEvent.click(good);
    expect(good).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose one rating in any row to save.");
    expect(sent("PUT")).toEqual([]);
  });

  it("never overwrites a check-in another tab saved: the typing stays, a second Save replaces it", async () => {
    const other = entry(TODAY, { mood: 5, note: "Tab one", updated_at: "2026-11-22T09:00:00Z" });
    let puts = 0;
    replies["PUT /api/mira/journal"] = () =>
      ++puts === 1
        ? { status: 409, body: { conflict: true, current: other, error: "x" } }
        : { body: { success: true, updatedAt: "2026-11-22T09:05:00Z" } };
    render(<JournalCard />);
    fireEvent.click(await screen.findByRole("button", { name: /Do today’s check-in/ }));
    const dialog = screen.getByRole("dialog", { name: "Today’s check-in" });
    const low = within(within(dialog).getByRole("radiogroup", { name: "Mood" })).getByRole(
      "radio",
      { name: "1, Very low" }
    );
    fireEvent.click(low);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      /saved in another tab or on another device.*Save again to replace it/
    );
    expect(low).toBeChecked();
    expect(screen.queryByText("Saved to your journal.")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved to your journal.")).toBeInTheDocument();
    // The first save claimed an empty day; the second names the version it now knows about.
    expect(sent("PUT").map((p) => p.body.base)).toEqual([null, "2026-11-22T09:00:00Z"]);
  });

  // R3-HAB-1: an older day can't be started anew, so the second Save says it puts this one back.
  it("puts back a day another tab deleted on the second Save, keeping what was typed", async () => {
    const old = entry(day(-5), { mood: 3, note: "Before", updated_at: "2026-11-17T20:00:00Z" });
    replies = journalReply([old]);
    let puts = 0;
    replies["PUT /api/mira/journal"] = () =>
      ++puts === 1
        ? { status: 409, body: { conflict: true, current: null, error: "x" } }
        : { body: { success: true, updatedAt: "2026-11-22T09:05:00Z" } };
    render(<JournalPage />);
    fireEvent.click(await screen.findByRole("button", { name: /^Edit (?!Today)/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/A line for the day/), {
      target: { value: "Typed here" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      /deleted in another tab or on another device\. Save again to keep what’s here/
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved to your journal.")).toBeInTheDocument();
    const [first, second] = sent("PUT").map((p) => p.body);
    expect(first).toMatchObject({ day: day(-5), note: "Typed here", base: old.updated_at });
    expect(first).not.toHaveProperty("restore");
    expect(second).toMatchObject({ day: day(-5), note: "Typed here", base: null, restore: true });
  });

  // R4-HABITS-1: the 409 took the day off the list, so its Edit went; Done then landed on "Do
  // today’s check-in" at the top instead of the day put back.
  it("hands the focus back to the day's Edit after Done, once a day deleted elsewhere is back", async () => {
    const old = entry(day(-5), { mood: 3, note: "Before", updated_at: "2026-11-17T20:00:00Z" });
    replies = journalReply([old]);
    let puts = 0;
    replies["PUT /api/mira/journal"] = () =>
      ++puts === 1
        ? { status: 409, body: { conflict: true, current: null, error: "x" } }
        : { body: { success: true, updatedAt: "2026-11-22T09:05:00Z" } };
    render(<JournalPage />);
    const edit = await screen.findByRole("button", { name: /^Edit (?!Today)/ });
    const name = edit.getAttribute("aria-label")!;
    edit.focus();
    fireEvent.click(edit);
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));
    await dialog.findByRole("alert");
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved to your journal.");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.getByRole("button", { name })).toHaveFocus());
  });

  it("opens the chat's support lines for a note with crisis words", async () => {
    replies["PUT /api/mira/journal"] = () => ({
      body: {
        success: true,
        crisis: true,
        crisisLines: { code: "DE", name: "Germany", lines: [] },
      },
    });
    render(<JournalCard />);
    fireEvent.click(await screen.findByRole("button", { name: /Do today’s check-in/ }));
    const mood = screen.getByRole("radiogroup", { name: "Mood" });
    fireEvent.click(within(mood).getByRole("radio", { name: "1, Very low" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("dialog", { name: "Support right now" })).toBeInTheDocument();
    expect(screen.getByText(miraConfig.crisisMessage)).toBeInTheDocument();
  });

  it("lets the server read a note with nothing rated, for its support lines", async () => {
    replies["PUT /api/mira/journal"] = () => ({
      body: {
        success: false,
        crisis: true,
        crisisLines: { code: "DE", name: "Germany", lines: [] },
      },
    });
    render(<JournalCard />);
    fireEvent.click(await screen.findByRole("button", { name: /Do today’s check-in/ }));
    fireEvent.change(screen.getByLabelText(/A line for the day/), {
      target: { value: "I want to end my life" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("dialog", { name: "Support right now" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Choose one rating in any row to save.");
  });

  it("switches the daily reminder on at 20:00, and back off if it didn't save", async () => {
    render(<JournalCard />);
    const remind = await screen.findByRole("switch", { name: /Remind me daily/ });
    fireEvent.click(remind);
    await waitFor(() => expect(remind).toHaveAttribute("aria-checked", "true"));
    expect(sent("PATCH").map((p) => p.body)).toEqual([{ reminderTime: "20:00" }]);
    expect(await screen.findByText(/Daily reminder on, at 20:00 your time/)).toBeInTheDocument();

    replies["PATCH /api/mira/journal"] = () => ({ status: 500, body: { error: "x" } });
    fireEvent.click(remind);
    expect(await screen.findByText("That didn’t save. Please try again.")).toBeInTheDocument();
    expect(remind).toHaveAttribute("aria-checked", "true");
  });

  // R3-HAB-5: the reminder job skips 14 days after the support lines; Home says so neutrally.
  it("says truthfully when the daily reminder is on hold for now, in neutral words", async () => {
    replies = journalReply([], { reminderTime: "20:00", remindersOnHold: true });
    render(<JournalCard />);
    expect(
      await screen.findByText("Reminder emails are on hold for now. They start again on their own.")
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/support/i);
  });

  it("says nothing of a hold while the reminder is off, or nothing holds it", async () => {
    replies = journalReply([], { reminderTime: null, remindersOnHold: true });
    const { unmount } = render(<JournalCard />);
    await screen.findByRole("switch", { name: /Remind me daily/ });
    expect(screen.queryByText(/on hold/)).toBeNull();
    unmount();
    replies = journalReply([], { reminderTime: "20:00", remindersOnHold: false });
    render(<JournalCard />);
    await screen.findByRole("switch", { name: /Remind me daily/ });
    expect(screen.queryByText(/on hold/)).toBeNull();
  });

  it("says when the journal didn't load, and tries again", async () => {
    replies = { "GET /api/mira/journal": () => ({ status: 500, body: { error: "x" } }) };
    render(<JournalCard />);
    const again = await screen.findByRole("button", { name: "Try again" });
    replies = journalReply([]);
    fireEvent.click(again);
    expect(await screen.findByText("How is life feeling today?")).toBeInTheDocument();
  });

  it("tells someone Mira stopped as under 18 the one refusal, with nothing to retry", async () => {
    replies = {
      "GET /api/mira/journal": () => ({
        status: 403,
        body: { error: "Mira is only for adults.", minor: true },
      }),
    };
    render(<JournalCard />);
    expect(await screen.findByText("Mira is only for adults.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Try again|check-in/ })).toBeNull();
  });

  it("speaks of choosing, never tapping: keyboards and screen readers check in too", async () => {
    render(<JournalCard />);
    expect(
      await screen.findByText(/A few quick ratings across the areas of your life/)
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Do today’s check-in/ }));
    expect(screen.getByText(/one rating a row, skip any/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\btaps?\b/i);
  });

  // HAB-16: Home says a lost sign-in once, above its cards (mira-frame.test.tsx); the card goes
  // quiet rather than show what can no longer be read or saved, or a second notice.
  it("goes quiet on a lost sign-in: no check-in, no Try again, no notice of its own", async () => {
    replies = { "GET /api/mira/journal": () => ({ status: 401, body: { error: "x" } }) };
    render(<JournalCard />);
    await waitFor(() => expect(screen.queryByRole("region", { name: "Daily journal" })).toBeNull());
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("You were signed out.")).toBeNull();
  });
});

// Round 4 (R4-HABITS-3): a check-in saved after the sign-in went vanished on Home with its card,
// what was typed included; on the journal page its line had no way back in.
describe("a check-in that meets a lost sign-in", () => {
  const LINE = "A line I typed and want to keep";
  const fill = async () => {
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.click(
      within(dialog.getByRole("radiogroup", { name: "Mood" })).getByRole("radio", {
        name: "4, Good",
      })
    );
    fireEvent.change(dialog.getByLabelText(/A line for the day/), { target: { value: LINE } });
    replies["PUT /api/mira/journal"] = () => ({ status: 401, body: { error: "x" } });
    const save = dialog.getByRole("button", { name: "Save" });
    save.focus();
    fireEvent.click(save);
    return dialog;
  };
  afterEach(() => sessionStorage.clear());

  it("keeps Home's sheet open with the way back in, and the check-in for after signing in", async () => {
    render(<JournalCard account="u1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Do today’s check-in/ }));
    const dialog = await fill();
    const said = await dialog.findByText(
      /^You were signed out\. Your check-in is kept in this tab/
    );
    expect(said.closest("[class*='text-ap-bad']")).toBeNull();
    expect(dialog.getByRole("link", { name: "Sign in again" })).toHaveAttribute(
      "href",
      `/mira/start?next=${encodeURIComponent(window.location.pathname)}`
    );
    expect(dialog.getByRole("button", { name: "Save" })).toHaveFocus();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    cleanup();

    // Back in: the card opens the check-in again, as it was.
    replies = journalReply([]);
    render(<JournalCard account="u1" />);
    const back = within(await screen.findByRole("dialog"));
    expect(
      within(back.getByRole("radiogroup", { name: "Mood" })).getByRole("radio", { name: "4, Good" })
    ).toBeChecked();
    expect(back.getByLabelText(/A line for the day/)).toHaveValue(LINE);
    fireEvent.click(back.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved to your journal.")).toBeInTheDocument();
    expect(sent("PUT").at(-1)?.body).toMatchObject({ mood: 4, note: LINE, base: null });
  });

  it("never brings one account's check-in back to another", async () => {
    render(<JournalCard account="u1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Do today’s check-in/ }));
    const dialog = await fill();
    await dialog.findByRole("link", { name: "Sign in again" });
    cleanup();
    replies = journalReply([]);
    render(<JournalCard account="u2" />);
    await screen.findByRole("button", { name: /Do today’s check-in/ });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByDisplayValue(LINE)).toBeNull();
  });

  it("gives the journal page's sheet the way back in, and Not now hands the focus to the notice", async () => {
    render(<JournalPage account="u1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Do your first check-in/ }));
    const dialog = await fill();
    expect(await dialog.findByRole("link", { name: "Sign in again" })).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "Not now" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByText("You were signed out.").closest("[role=alert]")
      )
    );
    cleanup();
    replies = journalReply([]);
    render(<JournalPage account="u1" />);
    expect(
      within(await screen.findByRole("dialog")).getByLabelText(/A line for the day/)
    ).toHaveValue(LINE);
  });
});

describe("the journal's settings", () => {
  it("let Mira read the ratings, then the notes as a second choice, and take both back", async () => {
    render(<JournalSettings />);
    const read = await screen.findByRole("switch", { name: "Let Mira read my journal" });
    expect(read).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByRole("switch", { name: "Include my notes" })).toBeNull();
    fireEvent.click(read);
    const notes = await screen.findByRole("switch", { name: "Include my notes" });
    await waitFor(() => expect(notes).not.toBeDisabled());
    fireEvent.click(notes);
    await waitFor(() => expect(notes).toHaveAttribute("aria-checked", "true"));
    await waitFor(() => expect(read).not.toBeDisabled());
    fireEvent.click(read);
    await waitFor(() =>
      expect(screen.queryByRole("switch", { name: "Include my notes" })).toBeNull()
    );
    expect(sent("PATCH").map((p) => p.body)).toEqual([
      { share: "scores" },
      { share: "notes" },
      { share: "off" },
    ]);
  });

  it("keep a switch focusable while it saves, and ignore a second tap until then", async () => {
    let answer: () => void = () => {};
    const slow = new Promise<void>((resolve) => (answer = resolve));
    const usual = fetchMock.getMockImplementation()!;
    // Only the save answers late.
    fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
      if (init.method === "PATCH") await slow;
      return usual(url, init);
    });
    try {
      render(<JournalSettings />);
      const read = await screen.findByRole("switch", { name: "Let Mira read my journal" });
      read.focus();
      fireEvent.click(read);
      await waitFor(() => expect(read).toHaveAttribute("aria-disabled", "true"));
      expect(read).not.toBeDisabled();
      expect(document.activeElement).toBe(read);
      fireEvent.click(read);
      answer();
      await waitFor(() => expect(read).not.toHaveAttribute("aria-disabled", "true"));
      expect(sent("PATCH").map((p) => p.body)).toEqual([{ share: "scores" }]);
    } finally {
      fetchMock.mockImplementation(usual);
    }
  });

  it("set the reminder's time, on the hour or half hour, in the person's time zone", async () => {
    replies = journalReply([], { reminderTime: "20:00" });
    render(<JournalSettings />);
    const time = await screen.findByRole("combobox", { name: /Time/ });
    // The zone as the rest of Mira says it (sessions, their emails): "Berlin time".
    expect(screen.getByText("Berlin time")).toBeInTheDocument();
    fireEvent.change(time, { target: { value: "07:30" } });
    await waitFor(() =>
      expect(sent("PATCH").map((p) => p.body)).toEqual([{ reminderTime: "07:30" }])
    );
    const options = within(time)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options[0]).toBe("06:00");
    expect(options.at(-1)).toBe("23:00");
    expect(options.every((t) => /:(00|30)$/.test(t!))).toBe(true);
  });

  it("say why the daily reminder is on hold, and that it comes back on its own", async () => {
    replies = journalReply([], { reminderTime: "20:00", remindersOnHold: true });
    render(<JournalSettings />);
    expect(
      await screen.findByText(
        "Reminder emails are on hold for up to two weeks after the support lines came up, so none goes out for now. They start again on their own."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Remind me daily" })).toBeChecked();
  });

  it("ask before deleting as everywhere in Mira, and Keep it hands focus back", async () => {
    replies = journalReply([entry(day(0), { mood: 3 })]);
    render(<JournalSettings />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete my journal" }));
    expect(
      screen.getByRole("group", { name: /Delete every check-in in your journal\?/ })
    ).toBeTruthy();
    const keep = screen.getByRole("button", { name: "Keep it" });
    await waitFor(() => expect(keep).toHaveFocus());
    fireEvent.click(keep);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete my journal" })).toHaveFocus()
    );
    expect(sent("DELETE")).toEqual([]);
  });

  it("delete the whole journal, after asking", async () => {
    replies = journalReply([entry(day(0), { mood: 3 })]);
    render(<JournalSettings />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete my journal" }));
    expect(screen.getByText(/Delete every check-in in your journal\?/)).toBeInTheDocument();
    const confirm = screen.getAllByRole("button", { name: "Delete my journal" })[0]!;
    confirm.focus();
    fireEvent.click(confirm);
    expect(await screen.findByText("Your journal is deleted.")).toBeInTheDocument();
    expect(sent("DELETE").map((d) => d.url)).toEqual(["/api/mira/journal?all=1"]);
    // R3-HAB-4: the button went with the journal; focus goes to the section's heading.
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Daily journal" })).toHaveFocus()
    );
  });
});

describe("the journal page", () => {
  it("asks before deleting a day, and Keep it goes back to that day's Delete", async () => {
    replies = journalReply([entry(day(0), { mood: 3 })]);
    render(<JournalPage />);
    const ask = await screen.findByRole("button", { name: "Delete Today" });
    fireEvent.click(ask);
    expect(screen.getByRole("group", { name: /Delete this check-in\?/ })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Keep it" })).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(ask).toHaveFocus();
    expect(screen.queryByRole("group", { name: /Delete this check-in/ })).toBeNull();
  });

  it("shows each area's pattern in words and every day's entry, to edit or delete", async () => {
    replies = journalReply([
      entry(day(0), { mood: 4, note: "Slept well" }),
      entry(day(-3), { body: 2, closeness: 5 }),
    ]);
    render(<JournalPage />);
    expect(await screen.findByRole("heading", { name: "Patterns" })).toBeInTheDocument();
    expect(
      screen.getByText("4.0 out of 5 on average over the last 7 days (1 check-in).")
    ).toBeInTheDocument();
    const days = within(screen.getByRole("heading", { name: "Day by day" }).closest("section")!);
    expect(days.getByText("“Slept well”")).toBeInTheDocument();
    expect(days.getByText("Very good")).toBeInTheDocument(); // closeness 5

    // Edit an older day: its own check-in, as it was.
    fireEvent.click(days.getByRole("button", { name: /^Edit (?!Today)/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { level: 2 }).textContent).toMatch(
      /^How was \w+day\?$/
    );
    expect(
      within(within(dialog).getByRole("radiogroup", { name: "Body" })).getByRole("radio", {
        name: "2, Low",
      })
    ).toBeChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: "Not now" }));

    fireEvent.click(days.getByRole("button", { name: "Delete Today" }));
    fireEvent.click(days.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Today: check-in deleted.")).toBeInTheDocument();
    expect(sent("DELETE").map((d) => d.url)).toEqual([`/api/mira/journal?day=${TODAY}`]);
    expect(days.queryByText("“Slept well”")).toBeNull();
  });

  // R3-HAB-4: focus goes to the day now in the deleted one's place, and deleting the last day
  // is said too, though its "Day by day" section goes with it.
  it("keeps focus in place after a day is deleted, and says when the last one goes", async () => {
    replies = journalReply([entry(day(0), { mood: 4 }), entry(day(-2), { body: 3 })]);
    render(<JournalPage />);
    const deleteDay = async (name: string) => {
      fireEvent.click(await screen.findByRole("button", { name: `Delete ${name}` }));
      const confirm = screen.getByRole("button", { name: "Delete" });
      confirm.focus();
      fireEvent.click(confirm);
    };
    await deleteDay("Today");
    const list = screen.getByRole("heading", { name: "Day by day" }).closest("section")!;
    const older = within(list).getByRole("button", { name: /^Edit (?!Today)/ });
    await waitFor(() => expect(older).toHaveFocus());
    const said = screen.getByText("Today: check-in deleted.");
    expect(said).toHaveAttribute("role", "status");
    await deleteDay(older.getAttribute("aria-label")!.replace(/^Edit /, ""));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Your patterns start here" })).toHaveFocus()
    );
    // The same status line, still there to say it.
    expect(said).toBeInTheDocument();
    expect(said).toHaveTextContent(/: check-in deleted\.$/);
  });

  it("keeps the question open with its error when a day can't be deleted", async () => {
    replies = journalReply([entry(day(0), { mood: 4 })]);
    replies["DELETE /api/mira/journal"] = () => ({ status: 500, body: { error: "x" } });
    render(<JournalPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete Today" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const question = screen.getByRole("group", { name: /Delete this check-in\?/ });
    expect(await within(question).findByRole("alert")).toHaveTextContent(
      "Unable to delete right now. Please try again."
    );
  });

  it("invites a first check-in when there is nothing yet", async () => {
    render(<JournalPage />);
    expect(
      await screen.findByRole("heading", { name: "Your patterns start here" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Do your first check-in/ })).toBeInTheDocument();
  });

  it("opens today's check-in straight away from the reminder email's button", async () => {
    window.history.replaceState(null, "", "/mira/journal?checkin=1");
    render(<JournalPage startCheckIn />);
    expect(await screen.findByRole("dialog", { name: "Today’s check-in" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    // Done with: a reload shows the page, not the sheet again.
    expect(window.location.search).toBe("");
  });
});

describe("the reminder's stop page", () => {
  it("stops the reminder with one button, from the link alone", async () => {
    render(<ReminderStop token="abc.def" valid />);
    fireEvent.click(screen.getByRole("button", { name: "Stop reminders" }));
    expect(await screen.findByRole("heading", { name: "No more reminders" })).toBeInTheDocument();
    // DATA-1: the token goes in the body, never in an address.
    expect(sent("POST")).toEqual([
      { url: "/api/mira/journal/unsubscribe", body: { t: "abc.def" } },
    ]);
  });

  it("says plainly when the link doesn't work, and asks nothing of the server", () => {
    render(<ReminderStop token="forged" valid={false} />);
    expect(screen.getByRole("heading", { name: "This link doesn’t work" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
