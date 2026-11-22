// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import miraConfig from "@features/mira/content/mira-config.json";
import { CONSENT_VERSION } from "@features/mira/server/config";
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

  it("forgets this browser's chat and the 18+ tick once the person says they are under 18", async () => {
    giveConsent();
    replies["POST /api/mira/chat"] = () => ({
      body: { reply: "I can only talk about this with adults.", sources: [], minor: true },
    });
    render(<MiraChat signedIn={false} initialChatId={null} />);
    typeAndSend("I'm 15");
    await screen.findByText("I can only talk about this with adults.");
    expect(localStorage.getItem("mira.chat.v1")).toBeNull();
    expect(localStorage.getItem("mira.consent.v1")).toBeNull();
    expect(screen.queryByRole("link", { name: "Keep this chat" })).toBeNull();
    // The 18+ tick is gone with it: the next message asks for it again, unticked.
    typeAndSend("hello");
    const step = await screen.findByRole("dialog", { name: "Before your first message" });
    for (const box of within(step).getAllByRole("checkbox")) expect(box).not.toBeChecked();
    expect(calls("POST /api/mira/chat")).toHaveLength(1);
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
    expect(document.activeElement?.getAttribute("aria-live")).toBe("polite");
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

  it("sends the thumbs only when a reply is rated, never its words", async () => {
    replies["POST /api/mira/chat"] = () => ({ body: { reply: "Try this." } });
    giveConsent();
    render(<MiraChat signedIn={false} initialChatId={null} />);
    typeAndSend("hi");
    fireEvent.click(await screen.findByRole("button", { name: "Not helpful" }));
    await waitFor(() => expect(ratings()).toEqual([{ type: "rating", rating: -1 }]));
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
  });

  it("lists each starter prompt once for assistive tech, though phones show a second run", async () => {
    render(<MiraChat signedIn initialChatId={null} />);
    const chip = miraConfig.starterChips[0];
    expect(await screen.findAllByRole("button", { name: chip })).toHaveLength(1);
    expect(screen.getAllByText(chip)).toHaveLength(2);
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

  it("waits while the “Keep this chat” card is up, and Not now puts it away", async () => {
    giveConsent();
    replies["POST /api/mira/chat"] = () => ({ body: { reply: "Try this." } });
    render(<MiraChat signedIn={false} initialChatId={null} />);
    typeAndSend("hi");
    await screen.findByText(/remember this conversation next time/);
    expect(tip()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(await screen.findByRole("note", { name: "Tip" })).toBeInTheDocument();
    fireEvent.click(within(tip()!).getByRole("button", { name: "Not now" }));
    expect(tip()).toBeNull();
    expect(localStorage.getItem("mira.tip.style.v1")).not.toBeNull();
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

describe("Free messages", () => {
  it("shows the sign-up card once the last free message is answered, and keeps the chat", async () => {
    giveConsent();
    replies["POST /api/mira/chat"] = () => ({ body: { reply: "Try this.", freeLeft: 0 } });
    render(<MiraChat signedIn={false} initialChatId={null} />);
    typeAndSend("hi");
    await screen.findByText("Keep talking with Mira, for free");
    expect(screen.getByText(/had your free message with Mira/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Message Mira")).toBeNull();
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

describe("Keep this chat (board 01 copy)", () => {
  const card = () => screen.queryByText(/remember this conversation next time/);

  it("follows Mira's first reply to an anonymous person, and Keep goes to the sign-up", async () => {
    giveConsent();
    replies["POST /api/mira/chat"] = () => ({ body: { reply: "Try this." } });
    render(<MiraChat signedIn={false} initialChatId={null} />);
    expect(card()).toBeNull();
    typeAndSend("hi");
    await screen.findByText("Try this.");
    expect(card()).toHaveTextContent(
      "Would you like Mira to remember this conversation next time? Sign in and she can also gently tailor things to your LoveIQ result."
    );
    const keep = screen.getByRole("link", { name: "Keep this chat" });
    expect(keep).toHaveAttribute("href", "/mira/start");
    await waitFor(() => expect(tracked()).toEqual(["chat_opened", "keep_card_shown"]));
    fireEvent.click(keep);
    expect(tracked()).toContain("keep_card_keep");
  });

  it("waits for the reply after the intake invitation instead of standing beside it", async () => {
    giveConsent();
    replies["POST /api/mira/chat"] = (b) =>
      b.message === "hi"
        ? { body: { reply: "Tell me more.", invitation: miraConfig.intakeInvitation } }
        : { body: { reply: "First question, then." } };
    render(<MiraChat signedIn={false} initialChatId={null} />);
    typeAndSend("hi");
    await screen.findByText("Tell me more.");
    expect(card()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: miraConfig.intakeReplyButtons[0] }));
    await screen.findByText("First question, then.");
    expect(card()).not.toBeNull();
  });

  it("never comes with a crisis reply or later in that chat, nor for a signed-in person", async () => {
    giveConsent();
    let n = 0;
    replies["POST /api/mira/chat"] = () =>
      ++n === 1
        ? { body: { reply: "Please reach out now.", crisis: true } }
        : { body: { reply: "I am here with you." } };
    const first = render(<MiraChat signedIn={false} initialChatId={null} />);
    typeAndSend("everything feels dark");
    await screen.findByText("Please reach out now.");
    expect(card()).toBeNull();
    typeAndSend("thank you");
    await screen.findByText("I am here with you.");
    expect(card()).toBeNull();
    first.unmount();
    render(<MiraChat signedIn={false} initialChatId={null} />); // the crisis is kept with the chat
    await screen.findByText("I am here with you.");
    expect(card()).toBeNull();
    cleanup();

    replies["POST /api/mira/chat"] = () => ({ body: { reply: "Try this." } });
    render(<MiraChat signedIn initialChatId={null} />);
    typeAndSend("hi");
    await screen.findByText("Try this.");
    expect(card()).toBeNull();
    expect(tracked()).not.toContain("keep_card_shown");
  });

  it("Not now puts it away for this chat, after a reload too; a new chat may offer it again", async () => {
    giveConsent();
    replies["POST /api/mira/chat"] = () => ({ body: { reply: "Try this." } });
    const first = render(<MiraChat signedIn={false} initialChatId={null} />);
    typeAndSend("hi");
    await screen.findByText("Try this.");
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(card()).toBeNull();
    expect(tracked()).toContain("keep_card_not_now");
    first.unmount();
    render(<MiraChat signedIn={false} initialChatId={null} />);
    await screen.findByText("Try this.");
    expect(card()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    typeAndSend("hello again");
    await screen.findByText("Try this.");
    expect(card()).not.toBeNull();
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
