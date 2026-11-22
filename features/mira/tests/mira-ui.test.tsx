// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import miraConfig from "@features/mira/content/mira-config.json";
import { CONSENT_VERSION, VOICE_NOTICE_VERSION } from "@features/mira/server/config";
import { StyleScales } from "@features/mira/ui/CoachingStylePanel";
import MiraChat from "@features/mira/ui/MiraChat";
import MiraHome, { greeting } from "@features/mira/ui/MiraHome";
import { changedFields } from "@features/mira/ui/MiraSettings";
import SignUpFlow from "@features/mira/ui/SignUpFlow";
import { SupportPanel } from "@features/mira/ui/SupportPanel";
import { Wordmark } from "@features/mira/ui/MiraShell";

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
/** This browser already gave the first-message consent, in the current wording. */
const giveConsent = () =>
  localStorage.setItem("mira.consent.v1", JSON.stringify({ version: CONSENT_VERSION }));
/** The track events the page sent, by name. */
const tracked = () =>
  calls("POST /api/mira/event")
    .filter((b) => b.type === "track")
    .map((b) => b.name);

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

// Round-2 audit SET-9, the chat's side: "Need support right now?" listed the United States first
// whatever the account's "Where you're based", whose hint promises that country's lines first.
describe("Need support right now? in the chat", () => {
  const firstListed = () =>
    within(screen.getByRole("dialog", { name: "Support right now" }))
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent)[0];

  it("lists the country the account is based in first", async () => {
    replies["GET /api/mira/me"] = () => ({
      body: { profile: { style: {}, country: "DE" }, chats: [] },
    });
    render(<MiraChat signedIn initialChatId={null} />);
    await waitFor(() => expect(calls("GET /api/mira/me")).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Need support right now?" }));
    expect(firstListed()).toMatch(/^Germany/);
  });

  it("lists somewhere else first for an account based elsewhere, and the usual order without one", async () => {
    replies["GET /api/mira/me"] = () => ({
      body: { profile: { style: {}, country: "OTHER" }, chats: [] },
    });
    const first = render(<MiraChat signedIn initialChatId={null} />);
    await waitFor(() => expect(calls("GET /api/mira/me")).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Need support right now?" }));
    const elsewhere = firstListed();
    first.unmount();
    render(<MiraChat signedIn={false} initialChatId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Need support right now?" }));
    expect(elsewhere).not.toBe(firstListed());
    expect(firstListed()).toMatch(/^United States/);
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
  // A11Y-8 (WCAG 1.4.11): the pill's edge is the field's own token, 3:1 or more on the page in
  // both themes, and so is its focused edge (lavender is 2.98:1 on white): pairs in
  // mira-theme-contrast.test.ts.
  it("draws the message box's edge in the field colour, and its focused edge in purple", () => {
    render(<MiraChat signedIn={false} initialChatId={null} />);
    const box = screen.getByLabelText("Message Mira").closest("form")!;
    const edges = box.className.split(/\s+/).filter((c) => /^(focus-within:)?border-ap-/.test(c));
    expect(edges).toEqual(["border-ap-field", "focus-within:border-ap-purple"]);
    expect(box).toHaveClass("rounded-[28px]");
  });

  it("offers to sign in again on a 401, and the support panel under any error", async () => {
    replies["POST /api/mira/chat"] = () => ({
      status: 401,
      body: { error: "Please sign in again.", signIn: true },
    });
    render(<MiraChat signedIn initialChatId={null} />);
    typeAndSend("hello");
    const link = await screen.findByRole("link", { name: "Sign in again" });
    expect(link).toHaveAttribute("href", "/mira/start");
    // Round-2 audit CHAT-19: the page says it was signed in, so a sign-in that ended meanwhile
    // gets this 401 rather than an anonymous reply, and the words wait in the composer.
    expect(calls("POST /api/mira/chat")[0]).toMatchObject({ message: "hello", signedIn: true });
    expect(screen.getByLabelText("Message Mira")).toHaveValue("hello");
    fireEvent.click(screen.getByRole("button", { name: "Need support" }));
    expect(screen.getByRole("dialog", { name: "Support right now" })).toBeInTheDocument();
  });

  it("forgets this browser's chat and the 18+ tick once the person says they are under 18", async () => {
    giveConsent();
    replies["POST /api/mira/chat"] = () => ({
      body: {
        reply: "I can only talk about this with adults.",
        sources: [],
        minor: true,
        freeLeft: 0,
      },
    });
    render(<MiraChat signedIn={false} initialChatId={null} />);
    typeAndSend("I'm 15");
    await screen.findByText("I can only talk about this with adults.");
    expect(localStorage.getItem("mira.chat.v1")).toBeNull();
    expect(localStorage.getItem("mira.consent.v1")).toBeNull();
    expect(screen.queryByRole("link", { name: "Keep this chat" })).toBeNull();
    // Round-2 audit CHAT-20 / ID-4: the stop's reply also says freeLeft 0, and nobody under 18
    // is pointed at an account, not even by the line under the composer.
    expect(screen.queryByText(/free message|free account/)).toBeNull();
    // The 18+ tick is gone with it: the next message asks for it again, unticked.
    typeAndSend("hello");
    const step = await screen.findByRole("dialog", { name: "Before your first message" });
    for (const box of within(step).getAllByRole("checkbox")) expect(box).not.toBeChecked();
    expect(calls("POST /api/mira/chat")).toHaveLength(1);
  });

  // Round-2 audit CHAT-16: a saved chat that couldn't load opened as an empty new chat, silently.
  const SAVED = "6f2c4a1e-1111-4222-8333-944455556666";
  it("says a deleted chat isn't here any more, and starts a new one", async () => {
    window.history.replaceState(null, "", `/mira?chat=${SAVED}`);
    replies[`GET /api/mira/chats/${SAVED}`] = () => ({
      status: 404,
      body: { error: "Not found." },
    });
    replies["POST /api/mira/chat"] = () => ({ body: { reply: "Try this." } });
    render(<MiraChat signedIn initialChatId={SAVED} />);
    const said = await screen.findByText(
      "That chat isn't here any more. It may have been deleted."
    );
    expect(said).toHaveAttribute("aria-live", "polite"); // read out when it comes
    expect(window.location.search).toBe(""); // a reload doesn't ask for it again
    typeAndSend("hello");
    await screen.findByText("Try this.");
    expect(calls("POST /api/mira/chat")[0]!.chatId).toBeUndefined();
  });

  it("says a chat that didn't load didn't, keeps it, and loads it on Try again", async () => {
    let up = false;
    replies[`GET /api/mira/chats/${SAVED}`] = () =>
      up
        ? { body: { messages: [{ id: 1, role: "user", content: "an earlier line" }] } }
        : { status: 500, body: { error: "Unable to load this chat." } };
    render(<MiraChat signedIn initialChatId={SAVED} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("This chat didn't load.");
    // Not the welcome and its prompts, which would read as a new chat.
    expect(screen.queryByRole("heading", { level: 1, name: /Talk to/ })).toBeNull();
    expect(screen.queryByRole("button", { name: miraConfig.starterChips[0] })).toBeNull();
    up = true;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("an earlier line")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("lists a new chat under the title the server gave it, never words it held back", async () => {
    const earlier = { id: SAVED, title: "Lights off", updated_at: "2026-11-21T10:00:00Z" };
    replies["GET /api/mira/me"] = () => ({ body: { profile: { style: {} }, chats: [earlier] } });
    replies["POST /api/mira/chat"] = () => ({
      body: {
        reply: "Please reach out now.",
        crisis: true,
        chatId: "7a3d5b2f-2222-4333-8444-a55566667777",
        title: "Chat on 22 Nov",
      },
    });
    render(<MiraChat signedIn initialChatId={null} />);
    await waitFor(() => expect(calls("GET /api/mira/me")).toHaveLength(1));
    typeAndSend("everything feels dark");
    const list = await screen.findByRole("navigation", { name: "Your chats" });
    expect(
      within(list)
        .getAllByRole("link")
        .map((a) => a.textContent)
    ).toEqual(["Chat on 22 Nov", "Lights off"]);
  });

  // Round-2 audit CHAT-9, lead decision 3: a goal offer lived in its page view only, so after a
  // reload Mira's words pointed at an "Add as a goal" that was gone.
  it("shows a reopened chat's goal offers again, and Added for one already taken", async () => {
    replies[`GET /api/mira/chats/${SAVED}`] = () => ({
      body: {
        messages: [
          { id: 1, role: "user", content: "what could I try?" },
          { id: 2, role: "assistant", content: "One small step.", goal: "Leave one soft light on" },
          { id: 3, role: "user", content: "and another?" },
          { id: 4, role: "assistant", content: "Or this one.", goal: "Write one kind line" },
        ],
        added: ["Write one kind line"],
      },
    });
    render(<MiraChat signedIn initialChatId={SAVED} />);
    await screen.findByText("Or this one.");
    expect(screen.getAllByRole("button", { name: "Add as a goal" })).toHaveLength(1);
    expect(screen.getByText("Add as a goal").closest("div[class*=rounded]")).toHaveTextContent(
      "Leave one soft light on"
    );
    expect(screen.getByText("Added to your goals")).toBeInTheDocument();
  });

  it("keeps an anonymous chat's goal offer through a reload", async () => {
    giveConsent();
    replies["POST /api/mira/chat"] = () => ({
      body: { reply: "One small step.", goal: "Leave one soft light on" },
    });
    const first = render(<MiraChat signedIn={false} initialChatId={null} />);
    typeAndSend("what could I try?");
    await screen.findByRole("button", { name: "Add as a goal" });
    first.unmount();
    render(<MiraChat signedIn={false} initialChatId={null} />);
    expect(await screen.findByRole("button", { name: "Add as a goal" })).toBeInTheDocument();
  });

  // Round-2 audit CHAT-29, lead decision 4: one chat can be deleted.
  describe("deleting this chat", () => {
    const list = [
      { id: SAVED, title: "Lights off", updated_at: "2026-11-22T10:00:00Z" },
      { id: "7a3d5b2f-2222-4333-8444-a55566667777", title: "Mirror", updated_at: "2026-11-21" },
      { id: "8b4e6c3a-3333-4444-8555-b66677778888", title: "Clothes", updated_at: "2026-11-20" },
    ];
    const open = async () => {
      replies["GET /api/mira/me"] = () => ({ body: { profile: { style: {} }, chats: list } });
      replies[`GET /api/mira/chats/${SAVED}`] = () => ({
        body: { messages: [{ id: 1, role: "user", content: "an earlier line" }] },
      });
      render(<MiraChat signedIn initialChatId={SAVED} />);
      await screen.findByText("an earlier line");
    };
    const deletes = () => fetchMock.mock.calls.filter(([, i]) => i?.method === "DELETE");

    it("asks first, then deletes it, takes it off the list at once and says so", async () => {
      await open();
      fireEvent.click(screen.getByRole("button", { name: "Delete this chat" }));
      const ask = screen.getByRole("dialog", { name: "Delete this chat?" });
      fireEvent.click(within(ask).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(deletes()).toHaveLength(0);

      replies[`DELETE /api/mira/chats/${SAVED}`] = () => ({ body: { success: true } });
      fireEvent.click(screen.getByRole("button", { name: "Delete this chat" }));
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
      expect(await screen.findByText("Chat deleted.")).toBeInTheDocument();
      expect(deletes().map(([url]) => url)).toEqual([`/api/mira/chats/${SAVED}`]);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.queryByText("an earlier line")).toBeNull();
      const nav = screen.getByRole("navigation", { name: "Your chats" });
      expect(
        within(nav)
          .getAllByRole("link")
          .map((a) => a.textContent)
      ).toEqual(["Mirror", "Clothes"]);
      expect(window.location.search).toBe("");
    });

    it("keeps the chat and says so when the delete doesn't go through", async () => {
      await open();
      replies[`DELETE /api/mira/chats/${SAVED}`] = () => ({
        status: 500,
        body: { error: "Unable to delete this chat." },
      });
      fireEvent.click(screen.getByRole("button", { name: "Delete this chat" }));
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
      expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent(
        "Unable to delete this chat."
      );
      expect(screen.getByText("an earlier line")).toBeInTheDocument();
    });

    it("isn't offered for a chat that isn't saved", async () => {
      replies["POST /api/mira/chat"] = () => ({ body: { reply: "Try this.", chatId: null } });
      render(<MiraChat signedIn initialChatId={null} />);
      typeAndSend("hi");
      await screen.findByText("Try this.");
      expect(screen.queryByRole("button", { name: "Delete this chat" })).toBeNull();
    });
  });

  // Round-2 audit CHAT-5: Mira cites a guide practice by its address, which couldn't be tapped,
  // and named the production site on staging.
  it("turns the guide's address in Mira's reply into a link to this site's guide, and nothing else", async () => {
    replies["POST /api/mira/chat"] = () => ({
      body: {
        reply:
          "The full steps are at loveiq.org/mira/guide#practice-1. The whole guide: https://www.loveiq.org/mira/guide, not example.com/mira/guide.",
      },
    });
    render(<MiraChat signedIn initialChatId={null} />);
    typeAndSend("hi");
    const practice = await screen.findByRole("link", { name: "loveiq.org/mira/guide#practice-1" });
    expect(practice).toHaveAttribute("href", "/mira/guide#practice-1");
    expect(screen.getByRole("link", { name: "https://www.loveiq.org/mira/guide" })).toHaveAttribute(
      "href",
      "/mira/guide"
    );
    expect(screen.queryByRole("link", { name: /example\.com/ })).toBeNull();
    expect(practice.closest("p")).toHaveTextContent(
      "The full steps are at loveiq.org/mira/guide#practice-1. The whole guide: https://www.loveiq.org/mira/guide, not example.com/mira/guide."
    );
  });

  // Round-2 audit A11Y-11: the whole list was one live region, so readers repeated the person's
  // own words and read the answer buttons as text.
  it("announces only Mira's new reply, never the person's words or the buttons", async () => {
    let answer: (r: Response) => void = () => {};
    const usual = fetchMock.getMockImplementation()!;
    // The chat's reply is held back until the test lets it through; everything else answers.
    fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) =>
      url === "/api/mira/chat" ? new Promise<Response>((done) => (answer = done)) : usual(url, init)
    );
    onTestFinished(() => void fetchMock.mockImplementation(usual));
    render(<MiraChat signedIn initialChatId={null} />);
    const conversation = screen.getByRole("region", { name: "Conversation" });
    expect(conversation).not.toHaveAttribute("aria-live");
    const said = document.querySelector<HTMLElement>(".sr-only[aria-live='polite']")!;
    typeAndSend("I feel tense");
    await waitFor(() => expect(said).toHaveTextContent("Mira is writing…"));
    answer({
      ok: true,
      status: 200,
      json: async () => ({ reply: "That sounds hard.", invitation: miraConfig.intakeInvitation }),
    } as Response);
    await screen.findByRole("button", { name: miraConfig.intakeReplyButtons[0] });
    expect(said).toHaveTextContent(`Mira: That sounds hard. ${miraConfig.intakeInvitation}`);
    expect(said).not.toHaveTextContent("I feel tense");
    expect(said).not.toHaveTextContent(miraConfig.intakeReplyButtons[0]!);
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
    giveConsent();
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
  const consent = () => giveConsent();

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
    // The statements come in a dialog, one at a time.
    expect(await screen.findByRole("dialog", { name: "Body check" })).toBeInTheDocument();
    const picks = [5, 4, 4, 3, 3, 2, 4, 5, 3, 4];
    const labels = ["Never", "Seldom", "Sometimes", "Often", "Always"];
    for (const [i, v] of picks.entries()) {
      await screen.findByText(`Body check · statement ${i + 1} of 10`);
      fireEvent.click(screen.getByRole("button", { name: labels[v - 1] }));
    }
    await screen.findByText("Thank you. I’ll ask again in four weeks.");
    expect(screen.queryByRole("dialog", { name: "Body check" })).toBeNull();
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
    await screen.findByText("Body check · statement 2 of 10");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByText("Body check · statement 1 of 10");
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

  // Round-2 audit CHAT-4: it stacked under Mira's goal offer, two asks at once.
  it("isn't offered with a reply that offers a goal", async () => {
    signedInDue("baseline");
    reply({ goal: "Leave one soft light on" });
    render(<MiraChat signedIn initialChatId={null} />);
    await waitFor(() => expect(calls("GET /api/mira/me")).toHaveLength(1));
    typeAndSend("hello");
    await screen.findByRole("button", { name: "Add as a goal" });
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
    expect(events()).not.toContain("body_check_offered");
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

describe("First-message consent (wording of 21 Nov 2026)", () => {
  // Asked in a short step when the first message is sent (Mark's minimal chat, 21 Nov 2026).
  const step = () => screen.getByRole("dialog", { name: "Before your first message" });
  const required = () => within(step()).getByRole("checkbox", { name: /18 or older/ });
  const start = () => within(step()).getByRole("button", { name: "Start chatting" });
  const consentEvents = () => calls("POST /api/mira/event").filter((b) => b.type === "consent");
  const ratings = () => calls("POST /api/mira/event").filter((b) => b.type === "rating");

  it("holds the first message until the 18+ and sex-life tick, the only box, kept with its version", async () => {
    replies["POST /api/mira/chat"] = () => ({ body: { reply: "Try this." } });
    render(<MiraChat signedIn={false} initialChatId={null} />);
    typeAndSend("hi");
    await screen.findByRole("dialog", { name: "Before your first message" });
    expect(required()).not.toBeChecked();
    expect(within(step()).getAllByRole("checkbox")).toHaveLength(1); // the rating box went (21 Nov)
    expect(start()).toBeDisabled();
    expect(calls("POST /api/mira/chat")).toHaveLength(0);
    fireEvent.click(required());
    fireEvent.click(start());
    await screen.findByText("Try this.");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(calls("POST /api/mira/chat")).toEqual([
      expect.objectContaining({ message: "hi", consent: true }),
    ]);
    expect(consentEvents()).toEqual([{ type: "consent", version: CONSENT_VERSION }]);
    expect(JSON.parse(localStorage.getItem("mira.consent.v1")!)).toEqual({
      version: CONSENT_VERSION,
    });
  });

  it("keeps the typed words when the step is cancelled, and sends a tapped prompt once agreed", async () => {
    replies["POST /api/mira/chat"] = () => ({ body: { reply: "Try this." } });
    render(<MiraChat signedIn={false} initialChatId={null} />);
    typeAndSend("hi");
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" })
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("Message Mira")).toHaveValue("hi");
    expect(consentEvents()).toEqual([]);
    fireEvent.click(await screen.findByRole("button", { name: miraConfig.starterChips[0] }));
    fireEvent.click(required());
    fireEvent.click(start());
    await screen.findByText("Try this.");
    expect(calls("POST /api/mira/chat")).toEqual([
      expect.objectContaining({ message: miraConfig.starterChips[0] }),
    ]);
    // The prompt went away with the welcome: focus is on the conversation, not lost.
    expect(document.activeElement).toBe(screen.getByRole("region", { name: "Conversation" }));
  });

  it("asks again in a browser that ticked an older wording, and not after this one", async () => {
    localStorage.setItem("mira.consent.v1", JSON.stringify("mira-2026-11-18"));
    const first = render(<MiraChat signedIn={false} initialChatId={null} />);
    typeAndSend("hi");
    await screen.findByRole("dialog", { name: "Before your first message" });
    expect(required()).not.toBeChecked();
    first.unmount();

    giveConsent();
    replies["POST /api/mira/chat"] = () => ({ body: { reply: "Try this." } });
    render(<MiraChat signedIn={false} initialChatId={null} />);
    typeAndSend("hi");
    await screen.findByText("Try this.");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // Round-2 audit CHAT-6: the first thumb is final, but the other one looked live.
  it("shows the other thumb as unavailable once a reply is rated", async () => {
    replies["POST /api/mira/chat"] = () => ({ body: { reply: "Try this." } });
    giveConsent();
    render(<MiraChat signedIn={false} initialChatId={null} />);
    typeAndSend("hi");
    const up = await screen.findByRole("button", { name: "Helpful" });
    expect(up).not.toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("button", { name: "Not helpful" }));
    await waitFor(() => expect(up).toHaveAttribute("aria-disabled", "true"));
    expect(screen.getByRole("button", { name: "Not helpful" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.click(up);
    expect(ratings()).toHaveLength(1);
  });

  it("sends the thumbs only when a reply is rated, never its words", async () => {
    replies["POST /api/mira/chat"] = () => ({ body: { reply: "Try this." } });
    giveConsent();
    render(<MiraChat signedIn={false} initialChatId={null} />);
    typeAndSend("hi");
    fireEvent.click(await screen.findByRole("button", { name: "Not helpful" }));
    await waitFor(() => expect(ratings()).toEqual([{ type: "rating", rating: -1 }]));
    expect(calls("POST /api/mira/chat")[0]!.signedIn).toBeUndefined(); // anonymous
  });
});

describe("Welcome", () => {
  it("the logo goes back to the start: a new chat when signed in", async () => {
    replies["POST /api/mira/chat"] = () => ({ body: { reply: "Try this.", chatId: null } });
    render(<MiraChat signedIn initialChatId={null} />);
    typeAndSend("hi");
    await screen.findByText("Try this.");
    expect(screen.queryByRole("heading", { level: 1, name: /Talk to/ })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Applied Psychometrics BETA, talk to Mira" }));
    expect(screen.getByRole("heading", { level: 1, name: /Talk to/ })).toBeInTheDocument();
    expect(screen.queryByText("Try this.")).toBeNull();
  });

  it("the logo goes back to the start without losing the chat the sign-up card keeps", async () => {
    giveConsent();
    replies["POST /api/mira/chat"] = () => ({ body: { reply: "Try this.", freeLeft: 0 } });
    render(<MiraChat signedIn={false} initialChatId={null} />);
    typeAndSend("hi");
    await screen.findByText("Keep talking with Mira, for free");
    fireEvent.click(screen.getByRole("link", { name: "Applied Psychometrics BETA, talk to Mira" }));
    expect(screen.getByRole("heading", { level: 1, name: /Talk to/ })).toBeInTheDocument();
    expect(screen.getByText("Keep talking with Mira, for free")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("mira.chat.v1")!).turns).toHaveLength(2);
    // The composer stays there too: what is sent from it belongs to that chat, which comes back.
    replies["POST /api/mira/chat"] = () => ({ body: { gate: true, freeLeft: 0 } });
    typeAndSend("one more thing");
    expect(await screen.findByText("one more thing")).toBeInTheDocument();
    expect(screen.getByText("Try this.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: /Talk to/ })).toBeNull();
  });

  // Round-2 audit A11Y-6 (WCAG 2.2.2, 2.4.7): on phones the prompts glided in an endless loop
  // with no way to stop it, and a focused prompt slid off the screen. A still row instead, which
  // scrolls by hand, as it already did with reduced motion.
  it("lists each starter prompt once, in a still row", async () => {
    const { container } = render(<MiraChat signedIn initialChatId={null} />);
    const chip = miraConfig.starterChips[0];
    expect(await screen.findAllByRole("button", { name: chip })).toHaveLength(1);
    expect(screen.getAllByText(chip)).toHaveLength(1);
    expect(container.innerHTML).not.toContain("mira-marquee");
  });

  it("hands the logo's link no function outside the chat, so server-rendered pages can use it", () => {
    // /mira/privacy and /mira/guide render it on the server: a function prop there is a 500.
    expect((Wordmark({}) as { props: { onClick?: unknown } }).props.onClick).toBeUndefined();
    expect(
      (Wordmark({ onHome: () => {} }) as { props: { onClick?: unknown } }).props.onClick
    ).toBeTypeOf("function");
  });

  it("says what Mira was trained on", () => {
    render(<MiraChat signedIn={false} initialChatId={null} />);
    expect(screen.getByText(/of research on/, { selector: "p" })).toHaveTextContent(
      "Trained on 100+ scientific papers & 100M+ words of research on body confidence"
    );
  });
});

describe("“Make Mira yours” tip (coaching style)", () => {
  const tip = () => screen.queryByRole("note", { name: "Tip" });

  it("shows once after a reply, opens the coaching panel, and never comes back in that browser", async () => {
    replies["POST /api/mira/chat"] = () => ({ body: { reply: "Try this.", chatId: null } });
    const first = render(<MiraChat signedIn initialChatId={null} />);
    expect(tip()).toBeNull();
    typeAndSend("hi");
    await screen.findByText("Try this.");
    expect(await screen.findByRole("note", { name: "Tip" })).toHaveTextContent("Make Mira yours");
    fireEvent.click(within(tip()!).getByRole("button", { name: "Set it up" }));
    expect(screen.getByRole("dialog", { name: "How Mira coaches you" })).toBeInTheDocument();
    expect(tip()).toBeNull();
    expect(tracked()).toEqual(["chat_opened", "style_tip_shown", "style_tip_opened"]);
    first.unmount();

    render(<MiraChat signedIn initialChatId={null} />);
    typeAndSend("hello");
    await screen.findByText("Try this.");
    expect(tip()).toBeNull();
  });

  it("Not now puts it away for good in that browser", async () => {
    replies["POST /api/mira/chat"] = () => ({ body: { reply: "Try this." } });
    render(<MiraChat signedIn initialChatId={null} />);
    typeAndSend("hi");
    const note = await screen.findByRole("note", { name: "Tip" });
    fireEvent.click(within(note).getByRole("button", { name: "Not now" }));
    expect(tip()).toBeNull();
    expect(localStorage.getItem("mira.tip.style.v1")).not.toBeNull();
  });

  // Round-2 audit SET-3, the chat's side: the panel saved the whole style from the copy the page
  // loaded, so a change made meanwhile in Settings or another tab went back without a word.
  it("saves only what the panel changed, onto the newest saved style", async () => {
    let reads = 0;
    replies["GET /api/mira/me"] = () => ({
      body: {
        profile: { style: ++reads === 1 ? { guidance: 2 } : { guidance: 2, depth: 4 } },
        chats: [],
      },
    });
    replies["POST /api/mira/chat"] = () => ({ body: { reply: "Try this." } });
    render(<MiraChat signedIn initialChatId={null} />);
    typeAndSend("hi");
    await screen.findByText("Try this.");
    fireEvent.click(screen.getByRole("button", { name: "Coaching style" }));
    fireEvent.click(screen.getByRole("radio", { name: "Tone 5 of 5" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("PATCH /api/mira/me")).toHaveLength(1));
    expect(calls("PATCH /api/mira/me")[0]).toEqual({
      style: { guidance: 2, depth: 4, tone: 5 },
    });
  });

  it("keeps a style another tab of this browser saved, when anonymous", async () => {
    giveConsent();
    replies["POST /api/mira/chat"] = () => ({ body: { reply: "Try this." } });
    render(<MiraChat signedIn={false} initialChatId={null} />);
    typeAndSend("hi");
    await screen.findByText("Try this.");
    localStorage.setItem("mira.style.v1", JSON.stringify({ depth: 4 })); // the other tab
    fireEvent.click(screen.getByRole("button", { name: "Coaching style" }));
    fireEvent.click(screen.getByRole("radio", { name: "Tone 5 of 5" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem("mira.style.v1")!)).toEqual({ depth: 4, tone: 5 })
    );
  });

  it("counts a saved style", async () => {
    replies["POST /api/mira/chat"] = () => ({ body: { reply: "Try this." } });
    replies["PATCH /api/mira/me"] = () => ({ body: { success: true } });
    render(<MiraChat signedIn initialChatId={null} />);
    typeAndSend("hi");
    await screen.findByText("Try this.");
    fireEvent.click(screen.getByRole("button", { name: "Coaching style" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(tracked()).toContain("style_saved"));
  });
});

// Round-2 audit A11Y-9 / CHAT-12: buttons with role="radio" and no arrow keys made 25 Tab
// stops, and the unselected points were 14-px rings at 1.5:1.
describe("How Mira coaches you", () => {
  it("is five native radio groups, so each scale is one Tab stop that arrow keys move", () => {
    const onChange = vi.fn();
    render(<StyleScales value={{ guidance: 2 }} onChange={onChange} />);
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios).toHaveLength(25);
    expect(radios.every((r) => r.tagName === "INPUT" && r.type === "radio")).toBe(true);
    expect(new Set(radios.map((r) => r.name)).size).toBe(5);
    expect(screen.getByRole("group", { name: "Guidance" })).toContainElement(radios[0]!);
    expect(screen.getByRole("radio", { name: "Guidance 2 of 5" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Depth 3 of 5" })).toBeChecked(); // balanced
    fireEvent.click(screen.getByRole("radio", { name: "Guidance 4 of 5" }));
    expect(onChange).toHaveBeenCalledWith({ guidance: 4 });
    // An unselected point is ringed in muted (4.5:1 on the page in both themes), not mist.
    const ring = screen.getByRole("radio", { name: "Tone 1 of 5" }).nextElementSibling!;
    expect(ring.className).toContain("border-ap-muted");
    expect(ring.className).not.toContain("border-ap-mist");
  });
});

// From the voice stream's audit (round 2): when a voice session ended, its panel went with the
// focused End or "Not now", and keyboard focus fell to the page.
describe("after a voice session", () => {
  class Recognizer {
    lang = "";
    continuous = false;
    interimResults = false;
    maxAlternatives = 1;
    onresult = null;
    onerror = null;
    onend = null;
    start() {}
    stop() {}
    abort() {}
  }
  beforeEach(() => {
    vi.stubGlobal("SpeechRecognition", Recognizer);
    vi.stubGlobal("speechSynthesis", { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [] });
    vi.spyOn(navigator, "vendor", "get").mockReturnValue("Google Inc.");
    giveConsent();
  });
  const talk = () => screen.getByRole("button", { name: "Talk to Mira" });
  const press = (name: string) => {
    const b = screen.getByRole("button", { name });
    b.focus();
    fireEvent.click(b);
  };

  it("gives the focus back to Talk when the notice is put off", async () => {
    render(<MiraChat signedIn={false} initialChatId={null} />);
    await screen.findByRole("button", { name: "Talk to Mira" });
    press("Talk to Mira");
    await screen.findByRole("heading", { name: "Before you talk" });
    press("Not now");
    await waitFor(() => expect(document.activeElement).toBe(talk()));
  });

  it("gives the focus back to Talk when the session is ended", async () => {
    localStorage.setItem("mira.voice.notice.v1", JSON.stringify({ version: VOICE_NOTICE_VERSION }));
    render(<MiraChat signedIn={false} initialChatId={null} />);
    await screen.findByRole("button", { name: "Talk to Mira" });
    press("Talk to Mira");
    await screen.findByRole("button", { name: "End" });
    press("End");
    await waitFor(() => expect(document.activeElement).toBe(talk()));
  });
});

describe("Free messages", () => {
  it("shows the sign-up card once the last free message is answered, and keeps the chat", async () => {
    giveConsent();
    replies["POST /api/mira/chat"] = () => ({ body: { reply: "Try this.", freeLeft: 0 } });
    render(<MiraChat signedIn={false} initialChatId={null} />);
    typeAndSend("hi");
    await screen.findByText("Keep talking with Mira, for free");
    // The card carries the "Keep this chat" promise (round-2 audit CHAT-25: that card could no
    // longer show with one free message, so it went).
    expect(screen.getByText(/had your free message with Mira/)).toHaveTextContent(
      "this chat comes with you"
    );
    expect(screen.queryByRole("link", { name: "Keep this chat" })).toBeNull();
    // Round-2 audit CHAT-22: the composer stays, so a message about a crisis can still be sent.
    expect(screen.getByLabelText("Message Mira")).toBeInTheDocument();
    expect(screen.getByText("Try this.")).toBeInTheDocument();
    // New chat would wipe the chat the card promises to bring along.
    for (const b of screen.getAllByRole("button", { name: /New chat/ })) expect(b).toBeDisabled();
    // Saved by an effect after the card renders: on a busy machine it lands a moment later.
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem("mira.chat.v1")!)).toMatchObject({
        gate: true,
        freeLeft: 0,
      })
    );
    expect(tracked()).not.toContain("keep_card_shown");
  });

  it("after the free message, a crisis message is answered and any other gets the sign-up card", async () => {
    giveConsent();
    replies["POST /api/mira/chat"] = (b) =>
      b.message === "hi"
        ? { body: { reply: "Try this.", freeLeft: 0 } }
        : b.message === "everything feels dark"
          ? { body: { reply: "Please reach out now.", crisis: true } }
          : { body: { gate: true, freeLeft: 0 } };
    render(<MiraChat signedIn={false} initialChatId={null} />);
    typeAndSend("hi");
    await screen.findByText("Keep talking with Mira, for free");
    typeAndSend("everything feels dark");
    await screen.findByText("Please reach out now.");
    // Never beside the reply that brought the support lines.
    expect(screen.queryByText("Keep talking with Mira, for free")).toBeNull();
    typeAndSend("and then?");
    expect(await screen.findByText("Keep talking with Mira, for free")).toBeInTheDocument();
    // The message stays in the chat that comes along with the account.
    expect(screen.getByText("and then?")).toBeInTheDocument();
    expect(calls("POST /api/mira/chat").map((b) => b.message)).toEqual([
      "hi",
      "everything feels dark",
      "and then?",
    ]);
  });

  it("isn't put beside a crisis reply: the person can still write", async () => {
    giveConsent();
    replies["POST /api/mira/chat"] = () => ({
      body: { reply: "Please reach out now.", crisis: true, freeLeft: 0 },
    });
    render(<MiraChat signedIn={false} initialChatId={null} />);
    typeAndSend("everything feels dark");
    await screen.findByText("Please reach out now.");
    expect(screen.queryByText("Keep talking with Mira, for free")).toBeNull();
    expect(screen.getByLabelText("Message Mira")).toBeInTheDocument();
    // Nor its one-line version under the composer.
    expect(screen.queryByText(/free message|free account/)).toBeNull();
  });

  it("counts the last three down in messages", async () => {
    giveConsent();
    replies["POST /api/mira/chat"] = () => ({ body: { reply: "Try this.", freeLeft: 3 } });
    render(<MiraChat signedIn={false} initialChatId={null} />);
    typeAndSend("hi");
    expect(
      await screen.findByText("3 more free messages before you need a free account.")
    ).toBeInTheDocument();
  });
});

describe("Sign-up ticks, honeypot and where it ends", () => {
  const box = (name: RegExp) => screen.getByRole("checkbox", { name });
  const signIn = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Send me a code" }));
    await screen.findByRole("heading", { name: "Check your inbox" });
    fireEvent.change(screen.getByLabelText("Code from the email"), {
      target: { value: "12345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify and continue" }));
  };

  it("needs three ticks; the LoveIQ result one starts unticked and goes with the code check", async () => {
    render(<SignUpFlow />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.co" } });
    const send = screen.getByRole("button", { name: "Send me a code" });
    const assessment = box(/Use my LoveIQ test result to tailor my coaching/);
    expect(assessment).not.toBeChecked();
    expect(screen.queryByText(/team may read replies I rate/)).toBeNull(); // the box went (21 Nov)
    fireEvent.click(box(/18 years of age or older/));
    fireEvent.click(box(/I accept the terms of use and I have read the privacy notice/));
    expect(send).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(box(/sex life and health to coach me/));
    expect(send).not.toHaveAttribute("aria-disabled");
    expect(screen.getByRole("link", { name: "terms of use" })).toHaveAttribute(
      "href",
      "/terms-of-use"
    );
    expect(screen.getByRole("link", { name: "privacy notice" })).toHaveAttribute(
      "href",
      "/privacy-policy"
    );
    fireEvent.click(assessment);
    await signIn();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/mira/home"));
    expect(calls("POST /api/mira/auth")[1]).toMatchObject({
      action: "verify",
      useAssessment: true,
    });
    expect(calls("POST /api/mira/auth")[1]).not.toHaveProperty("shareRated");
  });

  it("has a honeypot people never see or reach, sent with the code request", async () => {
    render(<SignUpFlow />);
    const trap = document.querySelector<HTMLInputElement>('input[name="website"]')!;
    expect(trap).toHaveAttribute("aria-hidden", "true");
    expect(trap).toHaveAttribute("tabindex", "-1");
    expect(trap).toHaveAttribute("autocomplete", "off");
    expect(screen.getAllByRole("textbox")).toEqual([screen.getByLabelText("Email")]);
    fireEvent.change(trap, { target: { value: "https://spam.example" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.co" } });
    screen.getAllByRole("checkbox").forEach((b) => fireEvent.click(b));
    fireEvent.click(screen.getByRole("button", { name: "Send me a code" }));
    await waitFor(() =>
      expect(calls("POST /api/mira/auth")[0]).toMatchObject({
        action: "start",
        website: "https://spam.example",
      })
    );
  });

  it("goes on to the Mira page it was given once signed in, by code or with Google", async () => {
    const next = "/mira?chat=6f2c4a1e-1111-4222-8333-944455556666";
    render(<SignUpFlow googleEnabled next={next} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.co" } });
    screen.getAllByRole("checkbox").forEach((b) => fireEvent.click(b));
    expect(screen.getByRole("link", { name: "Continue with Google" })).toHaveAttribute(
      "href",
      `/api/mira/auth/google?adult=1&terms=1&consent=1&assessment=1&next=${encodeURIComponent(next)}`
    );
    await signIn();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(next));
  });
});
