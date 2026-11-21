// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

import { CONSENT_VERSION } from "@features/mira/server/config";
import MiraChat from "@features/mira/ui/MiraChat";
import { TURN_PAUSE_MS } from "@features/mira/ui/voice/useVoice";

/** Talking to Mira in the chat: the browser's recognizer and voice are fakes the test drives. */

type Result = [text: string, final: boolean];
class FakeRecognizer {
  static made: FakeRecognizer[] = [];
  static available?: (o: { langs: string[]; processLocally: boolean }) => Promise<string>;
  static install?: (o: { langs: string[]; processLocally: boolean }) => Promise<boolean>;
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  processLocally?: boolean;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  aborted = false;
  constructor() {
    FakeRecognizer.made.push(this);
  }
  start() {
    this.started = true;
  }
  stop() {}
  abort() {
    this.aborted = true;
  }
  /** What the browser heard so far in this listening, oldest first. */
  hear(...results: Result[]) {
    const list = results.map(([text, final]) =>
      Object.assign([{ transcript: text }], { isFinal: final })
    );
    act(() => this.onresult?.({ results: list }));
  }
}
const mic = () => FakeRecognizer.made.at(-1)!;
const listening = () => FakeRecognizer.made.filter((r) => r.started && !r.aborted);

class FakeUtterance {
  voice: unknown = null;
  lang = "";
  rate = 1;
  volume = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}
let said: FakeUtterance[];
const synth = {
  speak: vi.fn((u: FakeUtterance) => void said.push(u)),
  cancel: vi.fn(),
  getVoices: () => [{ name: "Samantha", lang: "en-US", localService: true, default: true }],
};
/** The sentences she was given to say, the silent unlocking word left out. */
const spoken = () => said.map((u) => u.text).filter((t) => t.trim());
const finishSpeaking = () => {
  while (said.some((u) => u.text.trim() && !(u as { done?: boolean }).done)) {
    const u = said.find((x) => x.text.trim() && !(x as { done?: boolean }).done)!;
    (u as { done?: boolean }).done = true;
    act(() => u.onend?.());
  }
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

const REPLY = "That makes sense. Wanting the lights off is a way of feeling safe.";

beforeEach(() => {
  FakeRecognizer.made = [];
  delete FakeRecognizer.available;
  delete FakeRecognizer.install;
  said = [];
  synth.speak.mockClear();
  synth.cancel.mockClear();
  replies = {
    "GET /api/mira/me": () => ({ body: { profile: { style: {} }, chats: [] } }),
    "POST /api/mira/chat": () => ({ body: { reply: REPLY, sources: [], freeLeft: 5 } }),
  };
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("SpeechRecognition", FakeRecognizer);
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  vi.spyOn(navigator, "vendor", "get").mockReturnValue("Google Inc.");
  localStorage.clear();
  localStorage.setItem("mira.consent.v1", JSON.stringify({ version: CONSENT_VERSION }));
  localStorage.setItem("mira.voice.notice.v1", "1");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockClear();
});

const talk = () => fireEvent.click(screen.getByRole("button", { name: "Talk to Mira" }));
/** Talk, then the person says `text` and taps her photo to send it. */
async function sayToMira(text: string) {
  mic().hear([text, true]);
  fireEvent.click(screen.getByRole("button", { name: "Send what you said" }));
  await waitFor(() => expect(calls("POST /api/mira/chat")).toHaveLength(1));
}

describe("Talk", () => {
  it("is offered only where the browser can listen, in Send's place while nothing is typed", async () => {
    vi.stubGlobal("SpeechRecognition", undefined);
    const { unmount } = render(<MiraChat signedIn={false} initialChatId={null} />);
    expect(screen.queryByRole("button", { name: "Talk to Mira" })).toBeNull();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    unmount();

    // Safari's (and older Chrome's) recognizer carries the webkit prefix.
    vi.stubGlobal("webkitSpeechRecognition", FakeRecognizer);
    render(<MiraChat signedIn={false} initialChatId={null} />);
    expect(await screen.findByRole("button", { name: "Talk to Mira" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Message Mira"), { target: { value: "hi" } });
    expect(screen.queryByRole("button", { name: "Talk to Mira" })).toBeNull();
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
  });

  it("asks for the first-message consent before the microphone, then the browser service's notice", async () => {
    localStorage.clear();
    render(<MiraChat signedIn={false} initialChatId={null} />);
    talk();
    expect(FakeRecognizer.made).toHaveLength(0);
    fireEvent.click(screen.getByRole("checkbox", { name: /18 or older/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start chatting" }));
    // No on-device recognition here: the one-time notice, which needs its tick.
    expect(screen.getByRole("heading", { name: "Before you talk" })).toBeTruthy();
    expect(screen.getByText(/Mira never receives or keeps any audio/)).toBeTruthy();
    expect(FakeRecognizer.made).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Start talking" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "I understand" }));
    fireEvent.click(screen.getByRole("button", { name: "Start talking" }));
    expect(mic()).toMatchObject({ started: true, continuous: true, interimResults: true });
    expect(mic().lang).toMatch(/^en-/);
    expect(mic().processLocally).toBeUndefined();
    expect(screen.getByRole("status", { name: "" }).textContent).toContain("Mira is listening");
    // Asked once: the next session starts listening straight away.
    expect(localStorage.getItem("mira.voice.notice.v1")).not.toBeNull();
  });

  it("listens on the device where the browser can, fetching the language once, with no notice", async () => {
    localStorage.removeItem("mira.voice.notice.v1");
    FakeRecognizer.available = vi.fn(async () => "downloadable");
    FakeRecognizer.install = vi.fn(async () => true);
    render(<MiraChat signedIn={false} initialChatId={null} />);
    talk();
    await waitFor(() => expect(FakeRecognizer.made).toHaveLength(1));
    expect(FakeRecognizer.install).toHaveBeenCalledWith({
      langs: [mic().lang],
      processLocally: true,
    });
    expect(mic().processLocally).toBe(true);
    expect(screen.queryByRole("heading", { name: "Before you talk" })).toBeNull();
    expect(screen.getByText(/Speech becomes text on this device/)).toBeTruthy();
  });
});

describe("a spoken turn", () => {
  it("goes to the chat as the person's message, marked spoken, and her reply is read aloud", async () => {
    render(<MiraChat signedIn={false} initialChatId={null} />);
    talk();
    mic().hear(["I only feel okay", false]);
    // The live caption shows what is being heard before it is sent.
    expect(screen.getByText("I only feel okay")).toBeTruthy();
    await sayToMira("I only feel okay with the lights off");
    const [sent] = calls("POST /api/mira/chat");
    expect(sent).toMatchObject({ message: "I only feel okay with the lights off", consent: true });
    expect((sent!.voice as { session: string }).session).toMatch(/^[0-9a-f-]{36}$/);
    // Sentence by sentence, so a long reply never stalls and the caption follows her.
    await waitFor(() => expect(spoken()).toEqual(["That makes sense."]));
    expect(screen.getByText(REPLY)).toBeTruthy(); // and written in the chat
    expect(screen.getByText("Mira is speaking")).toBeTruthy();
    finishSpeaking();
    expect(spoken()).toEqual([
      "That makes sense.",
      "Wanting the lights off is a way of feeling safe.",
    ]);
    expect(screen.getByText("Mira is listening")).toBeTruthy();
    expect(listening()).toHaveLength(1);
  });

  it("ends the turn after a pause in the person's words", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<MiraChat signedIn={false} initialChatId={null} />);
    talk();
    mic().hear(["It's the lights", true]);
    act(() => vi.advanceTimersByTime(TURN_PAUSE_MS - 100));
    mic().hear(["It's the lights", true], ["and the mirror", false]);
    act(() => vi.advanceTimersByTime(TURN_PAUSE_MS - 100));
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes("/api/mira/chat"))).toHaveLength(
      0
    );
    act(() => vi.advanceTimersByTime(200));
    vi.useRealTimers();
    await waitFor(() => expect(calls("POST /api/mira/chat")).toHaveLength(1));
    expect(calls("POST /api/mira/chat")[0]!.message).toBe("It's the lights and the mirror");
  });

  it("stops her when the person starts talking, but not for her own voice in the speakers", async () => {
    render(<MiraChat signedIn={false} initialChatId={null} />);
    talk();
    await sayToMira("It's the lights");
    await waitFor(() => expect(spoken().length).toBeGreaterThan(0));
    const before = synth.cancel.mock.calls.length;
    mic().hear(["wanting the lights off is a way", false]);
    expect(synth.cancel.mock.calls.length).toBe(before);
    mic().hear(["wanting the lights off is a way", true], ["wait I have a question", false]);
    expect(synth.cancel.mock.calls.length).toBeGreaterThan(before);
    expect(screen.getByText("Mira is listening")).toBeTruthy();
    expect(screen.getByText("wait I have a question")).toBeTruthy();
  });

  it("keeps the microphone off while she speaks in Safari, and a tap on her photo stops her", async () => {
    vi.spyOn(navigator, "vendor", "get").mockReturnValue("Apple Computer, Inc.");
    render(<MiraChat signedIn={false} initialChatId={null} />);
    talk();
    await sayToMira("It's the lights");
    await waitFor(() => expect(screen.getByText("Mira is speaking")).toBeTruthy());
    expect(listening()).toHaveLength(0);
    expect(screen.getByText("Tap her photo to stop her.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stop Mira and talk" }));
    expect(synth.cancel).toHaveBeenCalled();
    expect(listening()).toHaveLength(1);
  });

  it("shows the support lines on screen after a spoken crisis message, and pauses the microphone", async () => {
    replies["POST /api/mira/chat"] = () => ({
      body: {
        reply: "I'm really glad you told me.",
        crisis: true,
        crisisLines: { code: "DE", name: "Germany", lines: [] },
        sources: [],
      },
    });
    render(<MiraChat signedIn={false} initialChatId={null} />);
    talk();
    await sayToMira("I want to kill myself");
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(listening()).toHaveLength(0);
    finishSpeaking();
    expect(screen.getByText("Paused")).toBeTruthy();
    expect(listening()).toHaveLength(0);
  });

  it("reads an answer button aloud in voice mode: tapped answers are turns too", async () => {
    replies["POST /api/mira/chat"] = () => ({
      body: { reply: "When did it start?", ask: "onset", sources: [], freeLeft: 5 },
    });
    render(<MiraChat signedIn={false} initialChatId={null} />);
    talk();
    await sayToMira("Hi");
    finishSpeaking();
    fireEvent.click(await screen.findByRole("button", { name: "A few years" }));
    await waitFor(() => expect(calls("POST /api/mira/chat")).toHaveLength(2));
    expect(calls("POST /api/mira/chat")[1]).toMatchObject({
      message: "A few years",
      answering: "onset",
      voice: expect.anything(),
    });
  });
});

describe("the end of a session", () => {
  it("counts a signed-out session's end, never its words, and leaves the sign-up card after the free message", async () => {
    replies["POST /api/mira/chat"] = () => ({ body: { reply: REPLY, sources: [], freeLeft: 0 } });
    render(<MiraChat signedIn={false} initialChatId={null} />);
    talk();
    await sayToMira("It's the lights");
    await waitFor(() => expect(spoken().length).toBeGreaterThan(0));
    // While she says it, the panel (and End) stays; the sign-up card follows.
    expect(screen.getByRole("region", { name: "Talking with Mira" })).toBeTruthy();
    expect(screen.queryByText("Keep talking with Mira, for free")).toBeNull();
    finishSpeaking();
    await waitFor(() => expect(calls("POST /api/mira/recordings")).toHaveLength(1));
    const [end] = calls("POST /api/mira/recordings");
    expect(Object.keys(end!).sort()).toEqual(["chatId", "mode", "session", "startedAt", "turns"]);
    expect(end).toMatchObject({ mode: "service", turns: 1, chatId: null });
    expect(screen.getByText("Keep talking with Mira, for free")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Talking with Mira" })).toBeNull();
  });

  it("shows a signed-in person where their session went, with its first key point", async () => {
    const chatId = "6f2c4a1e-1111-4222-8333-944455556666";
    replies["POST /api/mira/chat"] = () => ({
      body: { reply: REPLY, sources: [], chatId, messageId: 7 },
    });
    replies["POST /api/mira/recordings"] = () => ({
      body: {
        kept: true,
        recording: {
          id: "1c2d3e4f-3333-4444-8555-a66677778888",
          seconds: 420,
          you: 58,
          keyPoints: ["You feel safe only with the lights off."],
        },
      },
    });
    render(<MiraChat signedIn initialChatId={null} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/mira/me", expect.anything()));
    talk();
    await sayToMira("It's the lights");
    fireEvent.click(screen.getByRole("button", { name: "End" }));
    await waitFor(() => expect(calls("POST /api/mira/recordings")).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getByText(/Voice session saved · 7 min · You 58% · Mira 42%/)).toBeTruthy()
    );
    expect(calls("POST /api/mira/recordings")[0]).toMatchObject({ chatId, turns: 1 });
    expect(screen.getByText("You feel safe only with the lights off.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "See its key points" }).getAttribute("href")).toBe(
      "/mira/recordings/1c2d3e4f-3333-4444-8555-a66677778888"
    );
    expect(listening()).toHaveLength(0);
    expect(synth.cancel).toHaveBeenCalled();
  });

  it("waits for a turn on its way when ended, so a new chat's session is kept with its chat", async () => {
    const chatId = "6f2c4a1e-1111-4222-8333-944455556666";
    // Her answer to the first turn is held back until the test lets it through.
    let answer: (r: Reply) => void = () => {};
    const usual = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) =>
      String(url).includes("/api/mira/chat")
        ? new Promise<Response>((done) => {
            answer = (r) => done({ ok: true, status: 200, json: async () => r.body } as Response);
          })
        : usual(url, init)
    );
    render(<MiraChat signedIn initialChatId={null} />);
    talk();
    mic().hear(["It's the lights", true]);
    fireEvent.click(screen.getByRole("button", { name: "Send what you said" }));
    fireEvent.click(screen.getByRole("button", { name: "End" }));
    expect(calls("POST /api/mira/recordings")).toHaveLength(0);
    await act(async () => answer({ body: { reply: REPLY, sources: [], chatId } }));
    await waitFor(() => expect(calls("POST /api/mira/recordings")).toHaveLength(1));
    expect(calls("POST /api/mira/recordings")[0]).toMatchObject({ chatId, turns: 1 });
    expect(spoken()).toEqual([]); // ended: her answer is written, not read out
  });

  it("sends nothing for a session without a turn", async () => {
    render(<MiraChat signedIn={false} initialChatId={null} />);
    talk();
    fireEvent.click(screen.getByRole("button", { name: "End" }));
    expect(calls("POST /api/mira/recordings")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Talk to Mira" })).toBeTruthy();
  });
});

describe("the microphone", () => {
  it("is off while muted, and listens again on Unmute", async () => {
    render(<MiraChat signedIn={false} initialChatId={null} />);
    talk();
    fireEvent.click(screen.getByRole("button", { name: "Mute" }));
    expect(listening()).toHaveLength(0);
    expect(screen.getByText("Microphone off")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Unmute" }));
    expect(listening()).toHaveLength(1);
  });

  it("explains a blocked microphone, with typing as the way out", async () => {
    render(<MiraChat signedIn={false} initialChatId={null} />);
    talk();
    act(() => mic().onerror?.({ error: "not-allowed" }));
    expect(screen.getByText("Mira can't hear you")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Type instead" }));
    await waitFor(() => expect(document.activeElement?.id).toBe("mira-input"));
  });

  it("listens on after the browser stops on its own, but gives up when it stops at once", async () => {
    render(<MiraChat signedIn={false} initialChatId={null} />);
    talk();
    for (let i = 0; i < 3; i++) act(() => mic().onend?.());
    expect(screen.getByText("Listening stopped")).toBeTruthy();
  });
});
