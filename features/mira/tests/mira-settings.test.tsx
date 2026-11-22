// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
    getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
  }),
}));

import MiraLayout from "@/app/mira/layout";
import MiraSettings from "@features/mira/ui/MiraSettings";
import { MiraLookRoot, useMiraLook } from "@features/mira/ui/MiraLook";
import SignUpFlow from "@features/mira/ui/SignUpFlow";
import { DEFAULT_LOOK } from "@features/mira/ui/prefs";

/** Settings (board 08c, 21 Nov 2026 upgrade): autosave, the look, the reply language, the slots. */

const PROFILE = {
  email: "lea@example.com",
  name: "Lea",
  country: "DE",
  gender: null,
  style: { tone: 2 },
  remember_chats: true,
  use_assessment: false,
  nudges_on: true,
  nudge_time: "08:00",
  time_zone: "Europe/Berlin",
  reply_language: null,
};

type Reply = { status?: number; body: unknown };
let replies: Record<string, (body: Record<string, unknown>) => Reply | Promise<Reply>>;
const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
  const key = `${init.method ?? "GET"} ${url.split("?")[0]}`;
  const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  const r = (await replies[key]?.(body)) ?? { body: { success: true } };
  const status = r.status ?? 200;
  return { ok: status < 400, status, json: async () => r.body } as Response;
});
const calls = (key: string) =>
  fetchMock.mock.calls
    .filter(([url, init]) => `${init?.method ?? "GET"} ${url.split("?")[0]}` === key)
    .map(([, init]) => JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);

beforeEach(() => {
  replies = { "GET /api/mira/me": () => ({ body: { profile: { ...PROFILE }, chats: [] } }) };
  vi.stubGlobal("fetch", fetchMock);
  // The look cookie is for Mira's pages (Path=/mira): be on one.
  window.history.replaceState({}, "", "/mira/settings");
  document.cookie = "mira_look=; Path=/mira; Max-Age=0";
  cookieJar.clear();
  // jsdom lays nothing out, so it has no scrollIntoView (a section link scrolls on arrival).
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockClear();
  Object.values(router).forEach((f) => f.mockClear());
});

const root = () => document.querySelector(".mira-root") as HTMLElement;
/** PATCH /api/mira/me held until the test answers each one, in the order they went out. */
function holdSaves() {
  const held: Array<{ body: Record<string, unknown>; answer: (status: number) => void }> = [];
  replies["PATCH /api/mira/me"] = (body) =>
    new Promise((resolve) =>
      held.push({
        body,
        answer: (status) =>
          resolve({
            status,
            body: status < 400 ? { success: true } : { error: "Unable to save." },
          }),
      })
    );
  return held;
}
async function openSettings(slots = {}) {
  render(
    <MiraLookRoot initial={DEFAULT_LOOK}>
      <MiraSettings {...slots} />
    </MiraLookRoot>
  );
  await screen.findByRole("heading", { name: "Account" });
}
const section = (name: string) =>
  screen.getByRole("heading", { name }).closest("section") as HTMLElement;

describe("Settings sections", () => {
  it("lists every section in the index, and the other streams' sections where the page passes them", async () => {
    await openSettings();
    const index = screen.getAllByRole("navigation", { name: "Settings sections" })[0]!;
    expect(
      within(index)
        .getAllByRole("link")
        .map((a) => a.getAttribute("href"))
    ).toEqual([
      "#account",
      "#language",
      "#coaching",
      "#privacy",
      "#notifications",
      "#appearance",
      "#data",
    ]);
    expect(screen.queryByRole("heading", { name: "Sign-in & security" })).toBeNull();
    cleanup();

    await openSettings({
      security: <p>Passkeys here</p>,
      checks: <p>Self-checks here</p>,
      sharedReview: <p>Shared review here</p>,
      journal: <p>Journal settings here</p>,
      weeklySession: <p>Weekly session here</p>,
    });
    // Each brings its own heading; the page gives it an index entry and an anchor.
    const at = (id: string) => document.getElementById(id)!;
    expect(at("security")).toHaveTextContent("Passkeys here");
    expect(at("checks")).toHaveTextContent("Self-checks here");
    expect(at("sharing")).toHaveTextContent("Shared review here");
    expect(at("journal")).toHaveTextContent("Journal settings here");
    expect(at("weekly")).toHaveTextContent("Weekly session here");
    const links = within(screen.getAllByRole("navigation", { name: "Settings sections" })[0]!)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(links).toEqual([
      "#account",
      "#language",
      "#security",
      "#coaching",
      "#privacy",
      "#checks",
      "#sharing",
      "#notifications",
      "#journal",
      "#weekly",
      "#appearance",
      "#data",
    ]);
    // Every entry lands below the sticky row of links: each target keeps the page's margin.
    for (const href of links) {
      expect(document.querySelector(href), href).toHaveClass("scroll-mt-16");
    }
  });

  // Round-3 R3-ACCT-7: on desktop the index watched a band 25–30 % down the screen, so a short
  // section a link landed at the top was never marked (the next one was), nor was "Your data".
  it("marks the section a link lands on, however short, and the last one at the page's end", async () => {
    await openSettings();
    const tops: Record<string, number> = {
      account: -900,
      language: 40, // landed by #language, and only 110 px tall
      coaching: 150,
      privacy: 700,
      notifications: 1200,
      appearance: 1600,
      data: 1900,
    };
    for (const id of Object.keys(tops)) {
      vi.spyOn(document.getElementById(id)!, "getBoundingClientRect").mockImplementation(() =>
        DOMRect.fromRect({ x: 0, y: tops[id]!, width: 600, height: 100 })
      );
    }
    const page = vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(4000);
    const marked = () =>
      screen
        .getAllByRole("navigation", { name: "Settings sections" })
        .map((nav) => within(nav).getByRole("link", { current: true }).getAttribute("href"));
    act(() => void window.dispatchEvent(new Event("scroll")));
    await waitFor(() => expect(marked()).toEqual(["#language", "#language"]));

    // The end of the page: the last section, whose top can't reach the line.
    Object.assign(tops, { appearance: 120 - 400, data: 420 });
    page.mockReturnValue(window.innerHeight + window.scrollY);
    act(() => void window.dispatchEvent(new Event("scroll")));
    await waitFor(() => expect(marked()).toEqual(["#data", "#data"]));
  });

  // Round-3 R3-UXA-10 and R3-UXA-1 (Settings' half): the phones' sticky index row cut its labels
  // mid-word at both edges with no cue, and going back up, a focused control landed under it.
  it("fades the phones' index row at its edges, and keeps a focused control clear of it", async () => {
    await openSettings();
    const row = screen.getAllByRole("navigation", { name: "Settings sections" })[0]!;
    expect(row).toHaveClass("sticky", "xl:hidden");
    expect(row.querySelector("ol")!.className).toMatch(/\[mask-image:linear-gradient\(to_right,/);
    // What scrolls under the row gives every control in it a top margin for focus scrolling,
    // the row's own links none (they stick, so a margin there would only jump the page).
    const content = document.getElementById("account")!.parentElement!;
    expect(content).toHaveClass("[&_:is(a,button,input,select,textarea,[tabindex])]:scroll-mt-16");
    expect(row.contains(content)).toBe(false);
  });

  it("after an under-18 stop, says so once and keeps only what still works", async () => {
    replies["GET /api/mira/me"] = () => ({ body: { profile: { ...PROFILE }, minor: true } });
    render(
      <MiraSettings
        security={<p>Devices here</p>}
        checks={<p>Self-checks here</p>}
        sharedReview={<p>Shared review here</p>}
        journal={<p>Journal settings here</p>}
        weeklySession={<p>Weekly session here</p>}
      />
    );
    expect(await screen.findByText("Mira is only for adults.")).toBeVisible();
    // Signing out, taking a rating back and deleting: every other section would only refuse.
    const links = within(screen.getAllByRole("navigation", { name: "Settings sections" })[0]!)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(links).toEqual(["#security", "#sharing", "#data"]);
    expect(screen.getByText("Devices here")).toBeInTheDocument();
    expect(screen.getByText("Shared review here")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete account" })).toBeInTheDocument();
    for (const gone of ["Self-checks here", "Journal settings here", "Weekly session here"]) {
      expect(screen.queryByText(gone)).toBeNull();
    }
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("names each index entry as its section and the menu do (SET-11)", async () => {
    await openSettings({
      security: <p>Passkeys here</p>,
      checks: <p>Self-checks here</p>,
      sharedReview: <p>Shared review here</p>,
      journal: <p>Journal settings here</p>,
      weeklySession: <p>Weekly session here</p>,
    });
    const labels = within(screen.getAllByRole("navigation", { name: "Settings sections" })[0]!)
      .getAllByRole("link")
      .map((a) => a.textContent);
    expect(labels).toEqual([
      "Account",
      "Language",
      "Sign-in & security",
      "How Mira coaches you",
      "What Mira may use",
      "Assessments",
      "Your rating of Mira",
      "Notifications",
      "Daily journal",
      "Weekly session",
      "Appearance",
      "Your data",
    ]);
    for (const name of ["How Mira coaches you", "What Mira may use"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    // One name for the LoveIQ-result permission, here and on Assessments (decision 6).
    expect(screen.getByRole("switch", { name: "Mira may use my LoveIQ result" })).toBeVisible();
    // The text-size sample says what it is (UX-17); fields' edges are drawn at 3:1 (A11Y-8).
    expect(within(section("Appearance")).getByText("Preview")).toBeInTheDocument();
    expect(screen.getByLabelText("Mira replies in")).toHaveClass("border-ap-field");
    expect(screen.getByLabelText("Name or nickname")).toHaveClass("border-ap-field");
  });

  it("says the account is deleted, and what went, instead of the anonymous welcome (ID-18)", async () => {
    replies["DELETE /api/mira/me"] = () => ({ body: { success: true } });
    await openSettings();
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const heading = await screen.findByRole("heading", { name: "Your account is deleted" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.getByText(/chats, journal, goals, check results, voice sessions/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to Mira" })).toHaveAttribute("href", "/mira");
    expect(router.replace).not.toHaveBeenCalled();
    // Nothing of the account is left on the page (its address, its sections).
    expect(screen.queryByText("lea@example.com")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("refreshes the page after a change of country, so the support lines follow it", async () => {
    await openSettings();
    fireEvent.change(screen.getByLabelText("Where you’re based"), { target: { value: "GB" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(calls("PATCH /api/mira/me")).toEqual([{ country: "GB" }]);
    fireEvent.change(screen.getByLabelText("Name or nickname"), { target: { value: "Lena" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("PATCH /api/mira/me")).toHaveLength(2));
    expect(router.refresh).toHaveBeenCalledTimes(1); // a name alone needn't reload anything
  });

  it("shows the page's shape while loading, and a way to try again when loading fails", async () => {
    replies["GET /api/mira/me"] = () => ({ status: 500, body: { error: "Unable to load." } });
    render(<MiraSettings />);
    expect(screen.getByLabelText("Loading your settings")).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load.");
    replies["GET /api/mira/me"] = () => ({ body: { profile: { ...PROFILE }, chats: [] } });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Account" })).toBeInTheDocument();
  });
});

describe("Saving", () => {
  it("saves a switch the moment it changes, that field alone, and says Saved beside its section", async () => {
    await openSettings();
    fireEvent.click(screen.getByRole("switch", { name: "Remember our conversations" }));
    await waitFor(() => expect(calls("PATCH /api/mira/me")).toEqual([{ remember_chats: false }]));
    expect(await within(section("What Mira may use")).findByText("Saved")).toBeInTheDocument();
  });

  // Decision 7: never native `disabled`, which drops keyboard focus mid-save. The switch says it
  // is busy, keeps the focus and lets a second tap wait for the answer.
  it("keeps a switch focusable while its section saves, and ignores a tap until then", async () => {
    const held = holdSaves();
    await openSettings();
    const remember = screen.getByRole("switch", { name: "Remember our conversations" });
    remember.focus();
    fireEvent.click(remember);
    await waitFor(() => expect(remember).toHaveAttribute("aria-disabled", "true"));
    expect(remember).not.toBeDisabled();
    expect(remember).toHaveFocus();
    fireEvent.click(remember); // while it saves: nothing
    expect(remember).not.toBeChecked();
    await waitFor(() => expect(held).toHaveLength(1));
    await act(async () => held[0]!.answer(200));
    await waitFor(() => expect(remember).not.toHaveAttribute("aria-disabled"));
    expect(held.map((h) => h.body)).toEqual([{ remember_chats: false }]);
  });

  it("puts the stored value back, and says why, when a save is refused", async () => {
    replies["PATCH /api/mira/me"] = () => ({ status: 500, body: { error: "Unable to save." } });
    await openSettings();
    const remember = screen.getByRole("switch", { name: "Remember our conversations" });
    fireEvent.click(remember);
    expect(await within(section("What Mira may use")).findByRole("alert")).toHaveTextContent(
      "Unable to save."
    );
    expect(remember).toBeChecked();
  });

  it("keeps the account's typed details until Save, then sends only what changed", async () => {
    await openSettings();
    fireEvent.change(screen.getByLabelText("Name or nickname"), { target: { value: "Lena" } });
    expect(calls("PATCH /api/mira/me")).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("PATCH /api/mira/me")).toEqual([{ name: "Lena" }]));
    expect(await within(section("Account")).findByText("Saved")).toBeInTheDocument();
  });

  it("sends a chosen reply language as its code, and Match my messages as null", async () => {
    await openSettings();
    const select = screen.getByLabelText("Mira replies in");
    expect(select).toHaveValue("");
    fireEvent.change(select, { target: { value: "de" } });
    fireEvent.change(select, { target: { value: "" } });
    await waitFor(() =>
      expect(calls("PATCH /api/mira/me")).toEqual([
        { reply_language: "de" },
        { reply_language: null },
      ])
    );
    expect(section("Language")).toHaveTextContent("stays in English for now");
  });

  it("never lets an earlier refused save undo a later one of the same field", async () => {
    const held = holdSaves();
    await openSettings();
    const select = screen.getByLabelText("Mira replies in");
    fireEvent.change(select, { target: { value: "de" } });
    fireEvent.change(select, { target: { value: "fr" } });
    await waitFor(() => expect(held).toHaveLength(1)); // one at a time
    await act(async () => held[0]!.answer(500));
    expect(within(section("Language")).queryByRole("alert")).toBeNull(); // "fr" is on its way
    await waitFor(() => expect(held).toHaveLength(2));
    expect(held[1]!.body).toEqual({ reply_language: "fr" });
    await act(async () => held[1]!.answer(200));
    expect(await within(section("Language")).findByText("Saved")).toBeInTheDocument();
    expect(select).toHaveValue("fr");
    expect(within(section("Language")).queryByRole("alert")).toBeNull();
  });

  it("still puts back what the server kept when the later save is the refused one", async () => {
    const held = holdSaves();
    await openSettings();
    const select = screen.getByLabelText("Mira replies in");
    fireEvent.change(select, { target: { value: "de" } });
    fireEvent.change(select, { target: { value: "fr" } });
    await waitFor(() => expect(held).toHaveLength(1));
    await act(async () => held[0]!.answer(200));
    await waitFor(() => expect(held).toHaveLength(2));
    await act(async () => held[1]!.answer(500));
    expect(await within(section("Language")).findByRole("alert")).toHaveTextContent(
      "Unable to save."
    );
    expect(select).toHaveValue("de");
  });

  // Round-3 security review: a pending code sign-in or change of email (this tab's storage, with
  // addresses in it) stayed after "Sign out", readable by the next person on the tab.
  it("forgets a pending sign-in and change of email on Sign out", async () => {
    sessionStorage.setItem("mira.signin.code.v1", JSON.stringify({ email: "a@example.com" }));
    sessionStorage.setItem("mira.email.code.v1", JSON.stringify({ address: "b@example.com" }));
    replies["POST /api/mira/auth"] = () => ({ body: { success: true } });
    await openSettings();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/mira"));
    expect(sessionStorage.getItem("mira.signin.code.v1")).toBeNull();
    expect(sessionStorage.getItem("mira.email.code.v1")).toBeNull();
  });

  // Round-3 (frame fixer's note): a 401 on load sent Settings to sign-in by itself, which can
  // bounce back and forth with /mira/start while the page still sees the session (R3-UXA-2 on
  // Home). It now says so in place, with the link, and never navigates on its own.
  it("never leaves for sign-in by itself when its first read answers 401", async () => {
    replies["GET /api/mira/me"] = () => ({ status: 401, body: { error: "Please sign in." } });
    window.history.replaceState({}, "", "/mira/settings");
    render(<MiraSettings />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("You were signed out.");
    expect(within(alert).getByRole("link", { name: "Sign in again" })).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("says so when the sign-in ran out, with a way back here, instead of a page that can't save", async () => {
    replies["PATCH /api/mira/me"] = () => ({ status: 401, body: { error: "Please sign in." } });
    window.history.replaceState({}, "", "/mira/settings#notifications");
    await openSettings();
    fireEvent.click(screen.getByRole("switch", { name: "Daily nudges by email" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("You were signed out.");
    expect(within(alert).getByRole("link", { name: "Sign in again" })).toHaveAttribute(
      "href",
      "/mira/start?next=%2Fmira%2Fsettings%23notifications"
    );
    // Nothing left that looks signed in and can't save.
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Account" })).toBeNull();
  });

  it("asks before deleting on its safe answer, and Keep it gives the focus back", async () => {
    await openSettings();
    const opener = screen.getByRole("button", { name: "Delete all chats" });
    fireEvent.click(opener);
    // The kit's question (UX-9): named by its question, opening on "Keep it".
    expect(screen.getByRole("group", { name: "Delete all your chats? This can't be undone." }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep it" }))
    );
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Delete all chats" }))
    );
  });

  it("saves only the coaching scale that changed, so another tab's change stays (SET-3)", async () => {
    await openSettings(); // the style here: { tone: 2 }
    fireEvent.click(screen.getByRole("radio", { name: "Depth 4 of 5" }));
    await waitFor(() => expect(calls("PATCH /api/mira/me")).toEqual([{ style: { depth: 4 } }]));
    fireEvent.click(screen.getByRole("radio", { name: "Tone 3 of 5" }));
    await waitFor(() => expect(calls("PATCH /api/mira/me")[1]).toEqual({ style: { tone: 3 } }));
  });

  it("resets the coaching style to balanced in one save", async () => {
    await openSettings();
    fireEvent.click(screen.getByRole("button", { name: "Reset to balanced" }));
    // Every scale at the middle (3), so the server's merge leaves nothing of the old style.
    await waitFor(() =>
      expect(calls("PATCH /api/mira/me")).toEqual([
        { style: { guidance: 3, challenge: 3, depth: 3, practical: 3, tone: 3 } },
      ])
    );
    expect(screen.getByRole("button", { name: "Reset to balanced" })).toBeDisabled();
  });
});

describe("Appearance", () => {
  it("turns every Mira page dark at once, keeps it in this browser and saves it on the account", async () => {
    await openSettings();
    expect(root()).toHaveAttribute("data-mira-theme", "system");
    fireEvent.click(within(section("Appearance")).getByRole("radio", { name: /Dark/ }));
    expect(root()).toHaveAttribute("data-mira-theme", "dark");
    expect(document.cookie).toContain("mira_look=dark.default");
    fireEvent.click(within(section("Appearance")).getByRole("radio", { name: /Large/ }));
    expect(root()).toHaveAttribute("data-mira-text", "large");
    expect(document.cookie).toContain("mira_look=dark.large");
    await waitFor(() =>
      expect(calls("PATCH /api/mira/me")).toEqual([{ theme: "dark" }, { text_size: "large" }])
    );
    expect(await within(section("Appearance")).findByText("Saved")).toBeInTheDocument();
  });

  it("says when only this browser kept it", async () => {
    replies["PATCH /api/mira/me"] = () => ({ status: 403, body: { error: "No." } });
    await openSettings();
    fireEvent.click(within(section("Appearance")).getByRole("radio", { name: /Light/ }));
    expect(root()).toHaveAttribute("data-mira-theme", "light");
    expect(await within(section("Appearance")).findByRole("alert")).toHaveTextContent(
      "This browser keeps it"
    );
  });

  it("saves theme changes one after another, and the last one's answer decides", async () => {
    const held = holdSaves();
    await openSettings();
    const appearance = section("Appearance");
    fireEvent.click(within(appearance).getByRole("radio", { name: /Dark/ }));
    fireEvent.click(within(appearance).getByRole("radio", { name: /Light/ }));
    expect(root()).toHaveAttribute("data-mira-theme", "light");
    await waitFor(() => expect(held).toHaveLength(1));
    expect(held[0]!.body).toEqual({ theme: "dark" });
    await act(async () => held[0]!.answer(500)); // the older choice, refused
    expect(within(appearance).queryByRole("alert")).toBeNull(); // Light is on its way
    await waitFor(() => expect(held).toHaveLength(2));
    expect(held[1]!.body).toEqual({ theme: "light" });
    await act(async () => held[1]!.answer(200));
    expect(await within(appearance).findByText("Saved")).toBeInTheDocument();
    expect(within(appearance).queryByRole("alert")).toBeNull();
    expect(root()).toHaveAttribute("data-mira-theme", "light");
  });

  it("keeps a look chosen outside Settings in this browser only: nothing is sent", () => {
    function Probe() {
      const { change } = useMiraLook();
      return (
        <button type="button" onClick={() => change({ theme: "dark" })}>
          Dark
        </button>
      );
    }
    render(
      <MiraLookRoot initial={DEFAULT_LOOK}>
        <Probe />
      </MiraLookRoot>
    );
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(root()).toHaveAttribute("data-mira-theme", "dark");
    expect(document.cookie).toContain("mira_look=dark.default");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is in the first HTML, read from the cookie: no flash of the wrong theme", async () => {
    cookieJar.set("mira_look", "dark.large");
    const html = renderToString(await MiraLayout({ children: <p>Hi</p> }));
    expect(html).toContain('data-mira-theme="dark"');
    expect(html).toContain('data-mira-text="large"');
    cookieJar.set("mira_look", "<b>.huge");
    const tampered = renderToString(await MiraLayout({ children: <p>Hi</p> }));
    expect(tampered).toContain('data-mira-theme="system"');
    expect(tampered).toContain('data-mira-text="default"');
  });

  it("comes with the account to a browser that signs in to it", async () => {
    replies["GET /api/mira/me"] = () => ({
      body: { profile: { ...PROFILE, theme: "dark", text_size: null } },
    });
    await act(async () => {
      render(
        <MiraLookRoot initial={{ theme: "light", text: "large" }}>
          <SignUpFlow googleResult="done" />
        </MiraLookRoot>
      );
    });
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(root()).toHaveAttribute("data-mira-theme", "dark");
    // Never chosen on the account: this browser's own size stays.
    expect(root()).toHaveAttribute("data-mira-text", "large");
  });
});
