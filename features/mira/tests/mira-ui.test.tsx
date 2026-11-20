// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import MiraChat from "@features/mira/ui/MiraChat";
import MiraHome, { greeting } from "@features/mira/ui/MiraHome";
import { changedFields } from "@features/mira/ui/MiraSettings";
import SignUpFlow from "@features/mira/ui/SignUpFlow";
import { SupportPanel } from "@features/mira/ui/SupportPanel";

/** The audit fixes of 20 Nov 2026 on Mira's screens (the API routes are tested on their own). */

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
  replies = { "GET /api/mira/me": () => ({ body: { profile: { style: {} }, chats: [] } }) };
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockClear();
  Object.values(router).forEach((f) => f.mockClear());
});

const typeAndSend = (text: string) => {
  fireEvent.change(screen.getByLabelText("Message Mira"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
};

describe("Home greeting", () => {
  it("follows the hours: 05-11 morning, 12-17 afternoon, otherwise evening", () => {
    expect([0, 4, 5, 11, 12, 17, 18, 23].map(greeting)).toEqual([
      "Good evening",
      "Good evening",
      "Good morning",
      "Good morning",
      "Good afternoon",
      "Good afternoon",
      "Good evening",
      "Good evening",
    ]);
  });

  it("is neutral in the server render, so the server's clock can't mismatch the browser's", () => {
    const html = renderToString(<MiraHome />);
    expect(html).toContain("Hello");
    expect(html).not.toMatch(/Good (morning|afternoon|evening)/);
  });
});

describe("Settings save", () => {
  const profile = {
    email: "a@b.co",
    name: "Ana",
    country: "DE",
    gender: null,
    style: { tone: 2 },
    remember_chats: true,
    use_assessment: true,
    nudges_on: true,
    nudge_time: "08:00" as const,
    time_zone: "Europe/Berlin",
  };

  it("sends only the fields that changed", () => {
    expect(changedFields({ ...profile, name: " Ana " }, profile)).toEqual({});
    expect(changedFields({ ...profile, nudge_time: "19:00", style: { tone: 4 } }, profile)).toEqual(
      { nudge_time: "19:00", style: { tone: 4 } }
    );
  });
});

describe("Support panel", () => {
  function Opener() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Need support right now?
        </button>
        {open ? <SupportPanel highlight={null} onClose={() => setOpen(false)} /> : null}
      </>
    );
  }

  it("takes focus, locks the page, closes on Escape and gives focus back", () => {
    render(<Opener />);
    const opener = screen.getByRole("button", { name: "Need support right now?" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Support right now" });
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Support right now" }));
    expect(document.documentElement.style.overflow).toBe("hidden");

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.documentElement.style.overflow).toBe("");
  });
});

describe("Sign-up", () => {
  it("says a new code is coming only when one went out, and can't send twice at once", async () => {
    render(<SignUpFlow />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.co" } });
    screen.getAllByRole("checkbox").forEach((box) => fireEvent.click(box));
    fireEvent.click(screen.getByRole("button", { name: "Send me a code" }));
    await screen.findByRole("heading", { name: "Check your inbox" });

    replies["POST /api/mira/auth"] = () => ({
      status: 429,
      body: { error: "We just sent you a code. Check your inbox and spam." },
    });
    const resend = screen.getByRole("button", { name: "Send a new code" });
    fireEvent.click(resend);
    expect(resend).toBeDisabled();
    expect(await screen.findByText(/We just sent you a code/)).toBeInTheDocument();
    expect(screen.queryByText("A new code is on its way.")).toBeNull();
    expect(calls("POST /api/mira/auth")).toHaveLength(2);
  });

  it("keeps the browser's time zone when About you is skipped, and leaves by replace", async () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      timeZone: "America/New_York",
    } as Intl.ResolvedDateTimeFormatOptions);
    replies["GET /api/mira/me"] = () => ({ body: { profile: { time_zone: "Europe/Berlin" } } });
    render(<SignUpFlow googleResult="done" needsAbout />);
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/mira/home"));
    expect(calls("PATCH /api/mira/me")).toEqual([{ time_zone: "America/New_York" }]);
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe("Chat", () => {
  it("offers to sign in again on a 401, and the support panel under any error", async () => {
    replies["POST /api/mira/chat"] = () => ({
      status: 401,
      body: { error: "Please sign in again.", signIn: true },
    });
    render(<MiraChat signedIn initialChatId={null} />);
    typeAndSend("hello");
    const link = await screen.findByRole("link", { name: "Sign in again" });
    expect(link).toHaveAttribute("href", "/mira/start");
    fireEvent.click(screen.getByRole("button", { name: "Need support" }));
    expect(screen.getByRole("dialog", { name: "Support right now" })).toBeInTheDocument();
  });

  it("doesn't send on the Enter that ends an input-method composition", async () => {
    render(<MiraChat signedIn initialChatId={null} />);
    const box = screen.getByLabelText("Message Mira");
    fireEvent.change(box, { target: { value: "こんにちは" } });
    fireEvent.keyDown(box, { key: "Enter", isComposing: true });
    fireEvent.keyDown(box, { key: "Enter", keyCode: 229 });
    expect(calls("POST /api/mira/chat")).toHaveLength(0);
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(calls("POST /api/mira/chat")).toHaveLength(1));
  });

  it("keeps an anonymous reply's sources and rating, and undoes a rating that failed", async () => {
    localStorage.setItem("mira.consent.v1", JSON.stringify("mira-2026-11-18"));
    const sources = [{ id: "C1", label: "Smith 2020", link: null }];
    replies["POST /api/mira/chat"] = () => ({ body: { reply: "Try this.", sources } });
    render(<MiraChat signedIn={false} initialChatId={null} />);
    typeAndSend("hi");
    await screen.findByText("Try this.");

    replies["POST /api/mira/event"] = (b) =>
      b.type === "rating"
        ? { status: 429, body: { error: "Please try again in a minute." } }
        : { body: {} };
    fireEvent.click(screen.getByRole("button", { name: "Helpful" }));
    expect(await screen.findByText("Please try again in a minute.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Helpful" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );

    replies["POST /api/mira/event"] = () => ({ body: { success: true } });
    fireEvent.click(screen.getByRole("button", { name: "Helpful" }));
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem("mira.chat.v1")!).turns[1]).toMatchObject({
        content: "Try this.",
        sources,
        rated: 1,
      })
    );
  });
});
