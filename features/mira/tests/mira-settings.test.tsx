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
import { MiraLookRoot } from "@features/mira/ui/MiraLook";
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

beforeEach(() => {
  replies = { "GET /api/mira/me": () => ({ body: { profile: { ...PROFILE }, chats: [] } }) };
  vi.stubGlobal("fetch", fetchMock);
  // The look cookie is for Mira's pages (Path=/mira): be on one.
  window.history.replaceState({}, "", "/mira/settings");
  document.cookie = "mira_look=; Path=/mira; Max-Age=0";
  cookieJar.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockClear();
  Object.values(router).forEach((f) => f.mockClear());
});

const root = () => document.querySelector(".mira-root") as HTMLElement;
async function openSettings(slots = {}, signedIn = true) {
  render(
    <MiraLookRoot initial={DEFAULT_LOOK} signedIn={signedIn}>
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
      sharedReview: <p>Shared review here</p>,
      journal: <p>Journal reminders here</p>,
      weeklySession: <p>Session reminders here</p>,
    });
    expect(within(section("Sign-in & security")).getByText("Passkeys here")).toBeInTheDocument();
    expect(within(section("Sharing")).getByText("Shared review here")).toBeInTheDocument();
    const notifications = section("Notifications");
    expect(within(notifications).getByText("Journal reminders here")).toBeInTheDocument();
    expect(within(notifications).getByText("Session reminders here")).toBeInTheDocument();
    const links = within(screen.getAllByRole("navigation", { name: "Settings sections" })[0]!)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(links).toEqual([
      "#account",
      "#language",
      "#security",
      "#coaching",
      "#privacy",
      "#sharing",
      "#notifications",
      "#appearance",
      "#data",
    ]);
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

  it("resets the coaching style to balanced in one save", async () => {
    await openSettings();
    fireEvent.click(screen.getByRole("button", { name: "Reset to balanced" }));
    await waitFor(() => expect(calls("PATCH /api/mira/me")).toEqual([{ style: {} }]));
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
        <MiraLookRoot initial={{ theme: "light", text: "large" }} signedIn={false}>
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
