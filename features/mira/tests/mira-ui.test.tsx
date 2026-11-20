// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

describe("Intake answers", () => {
  const consent = () => localStorage.setItem("mira.consent.v1", JSON.stringify("mira-2026-11-18"));

  it("offers the asked question's answers as buttons, and says which question was answered", async () => {
    consent();
    replies["POST /api/mira/chat"] = (b) =>
      b.message === "hi"
        ? { body: { reply: "Has this always been there, or is it more recent?", ask: "onset" } }
        : { body: { reply: "Thank you." } };
    render(<MiraChat signedIn={false} initialChatId={null} />);
    typeAndSend("hi");
    fireEvent.click(await screen.findByRole("button", { name: "A few years" }));
    await screen.findByText("Thank you.");
    expect(calls("POST /api/mira/chat")[1]).toMatchObject({
      message: "A few years",
      answering: "onset",
    });
    // The buttons belong to the newest reply only.
    expect(screen.queryByRole("button", { name: "A few years" })).toBeNull();
    // The asked question survives a reload with this browser's chat.
    expect(JSON.parse(localStorage.getItem("mira.chat.v1")!).turns[1].ask).toBe("onset");
  });

  it("counts a typed answer too, but not a skip", async () => {
    consent();
    replies["POST /api/mira/chat"] = () => ({
      body: { reply: "When do you feel it most?", ask: "where" },
    });
    render(<MiraChat signedIn={false} initialChatId={null} />);
    typeAndSend("hi");
    await screen.findByRole("group", { name: "Your answer: pick any" });
    typeAndSend("mostly in the mirror");
    await waitFor(() => expect(calls("POST /api/mira/chat")).toHaveLength(2));
    expect(calls("POST /api/mira/chat")[1]).toMatchObject({ answering: "where" });
    fireEvent.click(await screen.findByRole("button", { name: "Skip this one" }));
    await waitFor(() => expect(calls("POST /api/mira/chat")).toHaveLength(3));
    expect(calls("POST /api/mira/chat")[2]!.answering).toBeUndefined();
  });

  it("sends several picks at once, and a 1 to 7 rating in words", async () => {
    consent();
    let n = 0;
    replies["POST /api/mira/chat"] = () => {
      n += 1;
      return n === 1
        ? { body: { reply: "When do you feel it most?", ask: "where" } }
        : { body: { reply: "How much does it get in the way?", ask: "severity" } };
    };
    render(<MiraChat signedIn={false} initialChatId={null} />);
    typeAndSend("hi");
    fireEvent.click(await screen.findByRole("button", { name: "Clothes" }));
    fireEvent.click(screen.getByRole("button", { name: "Mirror" }));
    const group = screen.getByRole("group", { name: "Your answer: pick any" });
    fireEvent.click(within(group).getByRole("button", { name: "Send answer" }));
    await waitFor(() => expect(calls("POST /api/mira/chat")).toHaveLength(2));
    // In the question's own order, whatever order they were tapped in.
    expect(calls("POST /api/mira/chat")[1]!.message).toBe("Mirror, Clothes");
    fireEvent.click(await screen.findByRole("button", { name: "5 of 7" }));
    await waitFor(() => expect(calls("POST /api/mira/chat")).toHaveLength(3));
    expect(calls("POST /api/mira/chat")[2]).toMatchObject({
      message: "5 of 7",
      answering: "severity",
    });
  });
});

describe("Body check", () => {
  const signedInDue = (due: "baseline" | "week4" | null) => {
    replies["GET /api/mira/me"] = () => ({
      body: { profile: { style: {} }, chats: [], bodyCheck: { due } },
    });
  };
  const reply = (extra: Record<string, unknown> = {}) => {
    replies["POST /api/mira/chat"] = () => ({ body: { reply: "Tell me more.", ...extra } });
  };
  const events = () =>
    calls("POST /api/mira/event")
      .filter((b) => b.type === "track")
      .map((b) => b.name);

  it("is offered after a reply when due, and saves the ten answers in order", async () => {
    signedInDue("baseline");
    reply();
    render(<MiraChat signedIn initialChatId={null} />);
    await waitFor(() => expect(calls("GET /api/mira/me")).toHaveLength(1));
    typeAndSend("hello");
    fireEvent.click(await screen.findByRole("button", { name: "Start" }));
    const picks = [5, 4, 4, 3, 3, 2, 4, 5, 3, 4];
    const labels = ["Never", "Seldom", "Sometimes", "Often", "Always"];
    for (const [i, v] of picks.entries()) {
      await screen.findByText(`Statement ${i + 1} of 10`);
      fireEvent.click(screen.getByRole("button", { name: labels[v - 1] }));
    }
    await screen.findByText("Thank you. I’ll ask again in four weeks.");
    expect(calls("POST /api/mira/body-check")).toEqual([{ answers: picks }]);
    expect(events()).toEqual(expect.arrayContaining(["body_check_offered", "body_check_started"]));
  });

  it("lets a statement be changed with Back", async () => {
    signedInDue("baseline");
    reply();
    render(<MiraChat signedIn initialChatId={null} />);
    await waitFor(() => expect(calls("GET /api/mira/me")).toHaveLength(1));
    typeAndSend("hello");
    fireEvent.click(await screen.findByRole("button", { name: "Start" }));
    fireEvent.click(await screen.findByRole("button", { name: "Never" }));
    await screen.findByText("Statement 2 of 10");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByText("Statement 1 of 10");
    expect(screen.getByRole("button", { name: "Never" })).toHaveAttribute("aria-pressed", "true");
  });

  it("waits three days after Not now, and isn't offered beside a question or when not due", async () => {
    signedInDue("baseline");
    reply();
    const { unmount } = render(<MiraChat signedIn initialChatId={null} />);
    await waitFor(() => expect(calls("GET /api/mira/me")).toHaveLength(1));
    typeAndSend("hello");
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
    unmount();
    render(<MiraChat signedIn initialChatId={null} />);
    await waitFor(() => expect(calls("GET /api/mira/me")).toHaveLength(2));
    typeAndSend("hello again");
    await screen.findAllByText("Tell me more.");
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
  });

  it("isn't offered with a reply that asks an intake question, or when nothing is due", async () => {
    signedInDue("baseline");
    reply({ ask: "onset" });
    const first = render(<MiraChat signedIn initialChatId={null} />);
    await waitFor(() => expect(calls("GET /api/mira/me")).toHaveLength(1));
    typeAndSend("hello");
    await screen.findByText("Tell me more.");
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
    first.unmount();
    signedInDue(null);
    reply();
    render(<MiraChat signedIn initialChatId={null} />);
    await waitFor(() => expect(calls("GET /api/mira/me")).toHaveLength(2));
    typeAndSend("hello");
    await screen.findByText("Tell me more.");
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
  });
});
