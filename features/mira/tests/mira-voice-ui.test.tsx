// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

import { CONSENT_VERSION, VOICE_NOTICE_VERSION } from "@features/mira/server/config";
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
const route = async (url: string, init: RequestInit = {}) => {
  const key = `${init.method ?? "GET"} ${url.split("?")[0]}`;
  const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  const r = replies[key]?.(body) ?? { body: { success: true } };
  const status = r.status ?? 200;
  return { ok: status < 400, status, json: async () => r.body } as Response;
};
const fetchMock = vi.fn(route);
const calls = (key: string) =>
  fetchMock.mock.calls
    .filter(([url, init]) => `${init?.method ?? "GET"} ${url.split("?")[0]}` === key)
    .map(([, init]) => JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);

const REPLY = "That makes sense. Wanting the lights off is a way of feeling safe.";
/** Sanjin's message G, as the chat route sends it for an under-18 stop. */
const STOP_G = "Thanks for reaching out. I can only talk about this with adults.";
/** Holds every answer of one route back until the test lets one through. */
function holdAnswers(route: string) {
  const answer = { current: (_r: Reply) => {} };
  const usual = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) =>
    String(url).includes(route)
      ? new Promise<Response>((done) => {
          answer.current = (r) =>
            done({ ok: true, status: 200, json: async () => r.body } as Response);
        })
      : usual(url, init)
  );
  return answer;
}
const holdChatAnswers = () => holdAnswers("/api/mira/chat");
const visibility = (state: "hidden" | "visible") => {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue(state);
  act(() => void document.dispatchEvent(new Event("visibilitychange")));
};
const leaveTab = () => visibility("hidden");
const comeBack = () => visibility("visible");
/** The notice's tick, word for word. */
const AGREE =
  "I agree that my browser's speech service (for example Apple's or Google's) hears what I say to Mira, under that company's terms, possibly outside the EU.";

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
  fetchMock.mockImplementation(route); // a test may hold answers back
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("SpeechRecognition", FakeRecognizer);
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  vi.spyOn(navigator, "vendor", "get").mockReturnValue("Google Inc.");
  localStorage.clear();
  localStorage.setItem("mira.consent.v1", JSON.stringify({ version: CONSENT_VERSION }));
  localStorage.setItem("mira.voice.notice.v1", JSON.stringify({ version: VOICE_NOTICE_VERSION }));
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
    fireEvent.click(screen.getByRole("checkbox", { name: AGREE }));
    expect(calls("POST /api/mira/event").filter((b) => b.type === "voice_notice")).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Start talking" }));
    // The agreement is recorded with its wording's version.
    expect(calls("POST /api/mira/event").filter((b) => b.type === "voice_notice")).toEqual([
      { type: "voice_notice", version: "mira-voice-2026-11-22" },
    ]);
    expect(mic()).toMatchObject({ started: true, continuous: true, interimResults: true });
    expect(mic().lang).toBe(navigator.language);
    expect(mic().processLocally).toBeUndefined();
    expect(screen.getByRole("status", { name: "" }).textContent).toContain("Mira is listening");
    // Asked once: the next session starts listening straight away.
    expect(JSON.parse(localStorage.getItem("mira.voice.notice.v1")!)).toEqual({
      version: "mira-voice-2026-11-22",
    });
  });

  it("asks again when the notice's wording changed since this browser agreed", async () => {
    for (const before of ["1", JSON.stringify({ version: "mira-voice-2026-01-01" })]) {
      localStorage.setItem("mira.voice.notice.v1", before);
      const { unmount } = render(<MiraChat signedIn={false} initialChatId={null} />);
      talk();
      expect(screen.getByRole("heading", { name: "Before you talk" })).toBeTruthy();
      expect(screen.getByRole("checkbox", { name: AGREE })).not.toBeChecked();
      expect(FakeRecognizer.made).toHaveLength(0);
      unmount();
    }
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

  // The first Talk in Chrome can wait up to 20 s on the language download (CHAT-14).
  it("says so while the browser downloads its speech recognition, and can be cancelled", async () => {
    let installed: (ok: boolean) => void = () => {};
    FakeRecognizer.available = vi.fn(async () => "downloadable");
    FakeRecognizer.install = vi.fn(() => new Promise<boolean>((done) => (installed = done)));
    render(<MiraChat signedIn={false} initialChatId={null} />);
    talk();
    await waitFor(() => expect(FakeRecognizer.install).toHaveBeenCalled());
    const panel = screen.getByRole("region", { name: "Talking with Mira" });
    // In the status line, so a screen reader says it too.
    expect(screen.getByRole("status").textContent).toBe("Setting up speech recognition…");
    expect(panel.textContent).toContain(
      "Your browser is downloading it to this device. This can take up to 20 seconds."
    );
    expect(panel.textContent).not.toMatch(/Starting the microphone|speech service turns/);
    expect(screen.queryByRole("button", { name: /Mute|End/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("region", { name: "Talking with Mira" })).toBeNull();
    expect(screen.getByRole("button", { name: "Talk to Mira" })).toBeTruthy();
    // The download finishing later starts nothing.
    await act(async () => installed(true));
    expect(FakeRecognizer.made).toHaveLength(0);
    expect(calls("POST /api/mira/recordings")).toHaveLength(0);
  });
});

describe("the language Talk listens and speaks in", () => {
  it("is the language a signed-in person chose for Mira's replies, with a voice of it", async () => {
    replies["GET /api/mira/me"] = () => ({
      body: { profile: { style: {}, reply_language: "de" }, chats: [] },
    });
    vi.spyOn(synth, "getVoices").mockReturnValue([
      { name: "Samantha", lang: "en-US", localService: true, default: true },
      { name: "Anna", lang: "de-DE", localService: true, default: false },
    ]);
    render(<MiraChat signedIn initialChatId={null} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/mira/me", expect.anything()));
    await act(async () => {}); // the profile's answer is in
    talk();
    expect(mic().lang).toBe("de-DE");
    await sayToMira("Ich mag das Licht nicht");
    await waitFor(() => expect(spoken().length).toBeGreaterThan(0));
    const utterance = said.find((u) => u.text.trim())!;
    expect(utterance).toMatchObject({ lang: "de-DE", voice: { name: "Anna" } });
  });

  it("is the browser's own language otherwise", async () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("pl-PL");
    render(<MiraChat signedIn={false} initialChatId={null} />);
    talk();
    expect(mic().lang).toBe("pl-PL");
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

  // VOI-V5: the recognizer that listened while she spoke can bring her last words back late.
  it("doesn't send her own last words, arriving just after she stopped, as the person's turn", async () => {
    render(<MiraChat signedIn={false} initialChatId={null} />);
    talk();
    await sayToMira("It's the lights");
    await waitFor(() => expect(spoken().length).toBeGreaterThan(0));
    const rec = mic(); // listening while she speaks (Chrome), and on into the person's turn
    rec.hear(["that makes sense", true]);
    finishSpeaking();
    await waitFor(() => expect(screen.getByText("Mira is listening")).toBeTruthy());
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const late = "wanting the lights off is a way of feeling safe";
    rec.hear(["that makes sense", true], [late, false]);
    rec.hear(["that makes sense", true], [late, true]);
    act(() => vi.advanceTimersByTime(TURN_PAUSE_MS + 100));
    expect(calls("POST /api/mira/chat")).toHaveLength(1);
    expect(screen.queryByText(late)).toBeNull();
    // The person's own words after them are their turn.
    rec.hear(["that makes sense", true], [late, true], ["yes please go on", true]);
    act(() => vi.advanceTimersByTime(TURN_PAUSE_MS + 100));
    vi.useRealTimers();
    await waitFor(() => expect(calls("POST /api/mira/chat")).toHaveLength(2));
    expect(calls("POST /api/mira/chat")[1]!.message).toBe("yes please go on");
  });

  it("keeps the microphone off while she speaks in Safari, and a tap on her photo stops her", async () => {
    vi.spyOn(navigator, "vendor", "get").mockReturnValue("Apple Computer, Inc.");
    render(<MiraChat signedIn={false} initialChatId={null} />);
    talk();
    mic().hear(["It's the lights", true]);
    // A11Y-16: words for every way of choosing her photo (a click, a key, a screen reader).
    expect(screen.getByText("Pause when you're done, or select her photo.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send what you said" }));
    await waitFor(() => expect(calls("POST /api/mira/chat")).toHaveLength(1));
    await waitFor(() => expect(screen.getByText("Mira is speaking")).toBeTruthy());
    expect(listening()).toHaveLength(0);
    expect(screen.getByText("Select her photo to stop her.")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Talking with Mira" }).textContent).not.toMatch(
      /\btap\b/i
    );
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
    expect(Object.keys(end!).sort()).toEqual([
      "chatId",
      "endedAt",
      "mode",
      "session",
      "startedAt",
      "turns",
    ]);
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

  it("ends without keeping or sending anything when Mira stops for someone under 18", async () => {
    replies["POST /api/mira/chat"] = () => ({
      body: { reply: STOP_G, minor: true, sources: [] },
    });
    render(<MiraChat signedIn initialChatId={null} />);
    talk();
    await sayToMira("I'm 16");
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Talking with Mira" })).toBeNull()
    );
    expect(screen.getByText(STOP_G)).toBeTruthy(); // written in the chat
    expect(calls("POST /api/mira/recordings")).toHaveLength(0);
    expect(screen.queryByText(/couldn.t be saved/)).toBeNull();
  });

  // VOI-V10: the server dated the end from the save, so time away or a late "Try again" counted.
  it("sends when it ended: when the person left it paused, the same on a later Try again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-22T20:00:00Z"));
    replies["POST /api/mira/chat"] = () => ({
      body: { reply: REPLY, sources: [], chatId: "6f2c4a1e-1111-4222-8333-944455556666" },
    });
    replies["POST /api/mira/recordings"] = () => ({ status: 500, body: { error: "Down." } });
    render(<MiraChat signedIn initialChatId={null} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/mira/me", expect.anything()));
    talk();
    await sayToMira("It's the lights");
    finishSpeaking();
    await waitFor(() => expect(screen.getByText("Mira is listening")).toBeTruthy());
    vi.setSystemTime(new Date("2026-11-22T20:05:00Z"));
    leaveTab();
    vi.setSystemTime(new Date("2026-11-22T21:05:00Z"));
    comeBack();
    fireEvent.click(screen.getByRole("button", { name: "End" }));
    await screen.findByText(/couldn.t be saved/);
    vi.setSystemTime(new Date("2026-11-22T22:00:00Z"));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(calls("POST /api/mira/recordings")).toHaveLength(2));
    expect(calls("POST /api/mira/recordings").map((b) => b.endedAt)).toEqual([
      "2026-11-22T20:05:00.000Z",
      "2026-11-22T20:05:00.000Z",
    ]);
  });

  it("sends nothing for a session without a turn", async () => {
    render(<MiraChat signedIn={false} initialChatId={null} />);
    talk();
    fireEvent.click(screen.getByRole("button", { name: "End" }));
    expect(calls("POST /api/mira/recordings")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Talk to Mira" })).toBeTruthy();
  });
});

// The stops that end a session: once a reply carries the under-18 stop, or no free message is
// left, nothing may bring the microphone back (talking over her, leaving the tab, Resume).
describe("an under-18 stop in a voice session", () => {
  it("ends the session at once: not read aloud, no listening, no turn and no save after it", async () => {
    replies["POST /api/mira/chat"] = () => ({ body: { reply: STOP_G, minor: true, sources: [] } });
    render(<MiraChat signedIn={false} initialChatId={null} />);
    talk();
    await sayToMira("I'm 15 and I hate my body");
    await waitFor(() => expect(screen.getByText(STOP_G)).toBeTruthy());
    expect(screen.queryByRole("region", { name: "Talking with Mira" })).toBeNull();
    expect(spoken()).toEqual([]);
    expect(listening()).toHaveLength(0);
    // The microphone that heard the turn is off for good: nothing it hears is a turn.
    FakeRecognizer.made.forEach((r) => r.hear(["but please I really need to talk", true]));
    expect(screen.queryByRole("button", { name: "Send what you said" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Before your first message" })).toBeNull();
    expect(calls("POST /api/mira/chat")).toHaveLength(1);
    expect(calls("POST /api/mira/recordings")).toHaveLength(0);
  });

  it("leaves no end card for a signed-in person: nothing was kept or is being saved", async () => {
    replies["POST /api/mira/chat"] = () => ({
      body: { reply: STOP_G, minor: true, sources: [], chatId: null },
    });
    render(<MiraChat signedIn initialChatId={null} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/mira/me", expect.anything()));
    talk();
    await sayToMira("I'm 16");
    await waitFor(() => expect(screen.getByText(STOP_G)).toBeTruthy());
    await new Promise((r) => setTimeout(r, 20));
    expect(
      screen.queryByText(/Saving your voice session|couldn.t be saved|wasn.t kept/)
    ).toBeNull();
    expect(calls("POST /api/mira/recordings")).toHaveLength(0);
  });

  it("brings no sign-up card when it comes with the last free message", async () => {
    replies["POST /api/mira/chat"] = () => ({
      body: { reply: STOP_G, minor: true, sources: [], freeLeft: 0 },
    });
    render(<MiraChat signedIn={false} initialChatId={null} />);
    talk();
    await sayToMira("I'm 15");
    await waitFor(() => expect(screen.getByText(STOP_G)).toBeTruthy());
    expect(screen.queryByText("Keep talking with Mira, for free")).toBeNull();
    expect(screen.queryByRole("link", { name: "Create free account" })).toBeNull();
  });

  it("keeps nothing when End was tapped while that turn was on its way: no save, no 'couldn't be saved'", async () => {
    // Signed in with memory off: the chat has no id, so the end card shows in it.
    replies["POST /api/mira/chat"] = () => ({ body: { reply: REPLY, sources: [], chatId: null } });
    replies["POST /api/mira/recordings"] = () => ({
      status: 403,
      body: { error: "Mira is only for people aged 18 or older." },
    });
    render(<MiraChat signedIn initialChatId={null} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/mira/me", expect.anything()));
    talk();
    await sayToMira("It's the lights");
    finishSpeaking();
    await waitFor(() => expect(screen.getByText("Mira is listening")).toBeTruthy());
    const answer = holdChatAnswers();
    mic().hear(["I'm only 15 though", true]);
    fireEvent.click(screen.getByRole("button", { name: "Send what you said" }));
    fireEvent.click(screen.getByRole("button", { name: "End" }));
    expect(screen.getByText("Saving your voice session…")).toBeTruthy(); // waiting for the answer
    await act(async () =>
      answer.current({ body: { reply: STOP_G, minor: true, sources: [], chatId: null } })
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(calls("POST /api/mira/recordings")).toHaveLength(0);
    expect(
      screen.queryByText(/couldn.t be saved|Saving your voice session|wasn.t kept/)
    ).toBeNull();
  });

  // Decision 9: the account was stopped elsewhere while this session ran, so its save is refused.
  it("says Mira is only for adults when the save is refused as under 18, never 'try again'", async () => {
    const chatId = "6f2c4a1e-1111-4222-8333-944455556666";
    replies["POST /api/mira/chat"] = () => ({ body: { reply: REPLY, sources: [], chatId } });
    replies["POST /api/mira/recordings"] = () => ({
      status: 403,
      body: { error: "Mira is only for adults.", minor: true },
    });
    render(<MiraChat signedIn initialChatId={null} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/mira/me", expect.anything()));
    talk();
    await sayToMira("It's the lights");
    fireEvent.click(screen.getByRole("button", { name: "End" }));
    await waitFor(() => expect(calls("POST /api/mira/recordings")).toHaveLength(1));
    expect(await screen.findByText("Mira is only for adults.")).toBeTruthy();
    expect(screen.queryByText(/couldn.t be saved|Saving your voice session/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("ends the session when the stop arrives after the tab was left: no Resume", async () => {
    render(<MiraChat signedIn={false} initialChatId={null} />);
    talk();
    const answer = holdChatAnswers();
    mic().hear(["I'm 15", true]);
    fireEvent.click(screen.getByRole("button", { name: "Send what you said" }));
    leaveTab();
    await act(async () => answer.current({ body: { reply: STOP_G, minor: true, sources: [] } }));
    comeBack();
    expect(screen.queryByRole("region", { name: "Talking with Mira" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
    expect(listening()).toHaveLength(0);
  });
});

describe("the sign-up stop in a voice session (everyone signed out)", () => {
  const lastFree = () => {
    replies["POST /api/mira/chat"] = () => ({ body: { reply: REPLY, sources: [], freeLeft: 0 } });
  };
  const signUpCard = () => screen.queryByText("Keep talking with Mira, for free");

  it("ends the session when the person talks over her last free reply, and shows the sign-up card", async () => {
    lastFree();
    render(<MiraChat signedIn={false} initialChatId={null} />);
    talk();
    await sayToMira("It's the lights");
    await waitFor(() => expect(spoken().length).toBeGreaterThan(0));
    mic().hear(["wait I have one more question", false]);
    expect(screen.queryByRole("region", { name: "Talking with Mira" })).toBeNull();
    expect(signUpCard()).toBeTruthy();
    expect(listening()).toHaveLength(0);
    expect(calls("POST /api/mira/chat")).toHaveLength(1);
  });

  it("ends the session when the tab is left during her last free reply: no Resume", async () => {
    lastFree();
    render(<MiraChat signedIn={false} initialChatId={null} />);
    talk();
    await sayToMira("It's the lights");
    await waitFor(() => expect(spoken().length).toBeGreaterThan(0));
    leaveTab();
    comeBack();
    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
    expect(signUpCard()).toBeTruthy();
    expect(listening()).toHaveLength(0);
  });

  it("ends the session on Try again after the microphone failed during her last free reply", async () => {
    lastFree();
    render(<MiraChat signedIn={false} initialChatId={null} />);
    talk();
    await sayToMira("It's the lights");
    await waitFor(() => expect(spoken().length).toBeGreaterThan(0));
    act(() => mic().onerror?.({ error: "network" }));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.queryByRole("region", { name: "Talking with Mira" })).toBeNull();
    expect(signUpCard()).toBeTruthy();
    expect(listening()).toHaveLength(0);
  });

  it("ends the session when the refusal for the free limit arrives after the tab was left", async () => {
    replies["POST /api/mira/chat"] = () => ({ body: { reply: REPLY, sources: [], freeLeft: 3 } });
    render(<MiraChat signedIn={false} initialChatId={null} />);
    talk();
    await sayToMira("It's the lights");
    await waitFor(() => expect(spoken().length).toBeGreaterThan(0));
    finishSpeaking();
    await waitFor(() => expect(screen.getByText("Mira is listening")).toBeTruthy());
    const answer = holdChatAnswers();
    mic().hear(["and the mirror", true]);
    fireEvent.click(screen.getByRole("button", { name: "Send what you said" }));
    leaveTab();
    await act(async () => answer.current({ body: { gate: true, freeLeft: 0 } }));
    comeBack();
    expect(screen.queryByRole("region", { name: "Talking with Mira" })).toBeNull();
    expect(signUpCard()).toBeTruthy();
  });

  it("never waits 90 seconds on a turn the chat can't take", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    replies["POST /api/mira/chat"] = () => ({ body: { gate: true, freeLeft: 0 } });
    render(<MiraChat signedIn={false} initialChatId={null} />);
    talk();
    mic().hear(["It's the lights", true]);
    fireEvent.click(screen.getByRole("button", { name: "Send what you said" }));
    await act(async () => {});
    vi.useRealTimers();
    await waitFor(() => expect(signUpCard()).toBeTruthy());
    expect(screen.queryByText("Mira is thinking")).toBeNull();
    expect(listening()).toHaveLength(0);
  });
});

describe("answer buttons while Talk can't take a turn", () => {
  const asked = () => {
    replies["POST /api/mira/chat"] = () => ({
      body: { reply: "When did it start?", ask: "onset", sources: [], freeLeft: 5 },
    });
  };
  async function typedQuestion() {
    fireEvent.change(screen.getByLabelText("Message Mira"), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByRole("button", { name: "A few years" });
  }
  async function tapIsTyped() {
    fireEvent.click(screen.getByRole("button", { name: "A few years" }));
    await waitFor(() => expect(calls("POST /api/mira/chat")).toHaveLength(2));
    expect(calls("POST /api/mira/chat")[1]).toMatchObject({
      message: "A few years",
      answering: "onset",
    });
    expect(calls("POST /api/mira/chat")[1]!.voice).toBeUndefined();
    expect(screen.getByText("A few years", { selector: "p" })).toBeTruthy();
  }

  it("sends a tapped answer as typed while the panel shows a microphone problem", async () => {
    asked();
    render(<MiraChat signedIn={false} initialChatId={null} />);
    await typedQuestion();
    talk();
    act(() => mic().onerror?.({ error: "audio-capture" }));
    expect(screen.getByText("No microphone found")).toBeTruthy();
    await tapIsTyped();
  });

  it("sends it as typed while the notice waits for its tick", async () => {
    asked();
    localStorage.removeItem("mira.voice.notice.v1");
    render(<MiraChat signedIn={false} initialChatId={null} />);
    await typedQuestion();
    talk();
    expect(screen.getByRole("heading", { name: "Before you talk" })).toBeTruthy();
    await tapIsTyped();
    expect(FakeRecognizer.made).toHaveLength(0); // the browser's service never started
  });

  it("sends it as typed while Talk is getting ready", async () => {
    asked();
    FakeRecognizer.available = () => new Promise<string>(() => {}); // still checking the device
    render(<MiraChat signedIn={false} initialChatId={null} />);
    await typedQuestion();
    talk();
    expect(screen.getByText("Getting ready…")).toBeTruthy();
    await tapIsTyped();
  });
});

describe("the end card", () => {
  const notKept = () => {
    replies["POST /api/mira/chat"] = () => ({ body: { reply: REPLY, sources: [], chatId: null } });
    replies["POST /api/mira/recordings"] = () => ({ body: { kept: false } });
  };
  async function newChatAndType() {
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    fireEvent.change(screen.getByLabelText("Message Mira"), { target: { value: "A new topic" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(calls("POST /api/mira/chat")).toHaveLength(2));
    await screen.findAllByText(REPLY);
  }

  // VOI-V6b: the setting is named only when it is the reason.
  it("says a session wasn't kept because of the memory setting only when that was why", async () => {
    for (const [answer, why] of [
      [{ kept: false, reason: "memory_off" }, /kept while “Remember our conversations” is on/],
      [{ kept: false }, /wasn.t kept: its words aren.t in your chats\.$/],
    ] as const) {
      notKept();
      replies["POST /api/mira/recordings"] = () => ({ body: answer });
      render(<MiraChat signedIn initialChatId={null} />);
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith("/api/mira/me", expect.anything())
      );
      talk();
      await sayToMira("It's the lights");
      fireEvent.click(screen.getByRole("button", { name: "End" }));
      const card = await screen.findByText(/wasn.t kept/);
      expect(card.textContent).toMatch(why);
      expect(Boolean(screen.queryByRole("link", { name: "Settings" }))).toBe("reason" in answer);
      cleanup();
      fetchMock.mockClear();
    }
  });

  it("stays with its own chat: 'wasn't kept' doesn't follow into a new chat", async () => {
    notKept();
    render(<MiraChat signedIn initialChatId={null} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/mira/me", expect.anything()));
    talk();
    await sayToMira("It's the lights");
    fireEvent.click(screen.getByRole("button", { name: "End" }));
    await waitFor(() => expect(screen.getByText(/wasn.t kept/)).toBeTruthy());
    await newChatAndType();
    expect(screen.queryByText(/wasn.t kept/)).toBeNull();
  });

  // It sits at the chat's foot: unscrolled, the saved card ended under the composer's edge (UX-5).
  it("comes into view as it lands, and again as it grows into the saved card", async () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled; // jsdom lays nothing out, so it has none
    try {
      replies["POST /api/mira/chat"] = () => ({
        body: { reply: REPLY, sources: [], chatId: "6f2c4a1e-1111-4222-8333-944455556666" },
      });
      render(<MiraChat signedIn initialChatId={null} />);
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith("/api/mira/me", expect.anything())
      );
      talk();
      await sayToMira("It's the lights");
      const saved = holdAnswers("/api/mira/recordings");
      fireEvent.click(screen.getByRole("button", { name: "End" }));
      const saving = screen.getByText("Saving your voice session…");
      expect(scrolled.mock.contexts.some((el) => (el as Element).contains(saving))).toBe(true);
      scrolled.mockClear();
      await act(async () =>
        saved.current({
          body: {
            kept: true,
            recording: { id: "1c2d3e4f-3333-4444-8555-a66677778888", seconds: 90, you: 50 },
          },
        })
      );
      const card = screen.getByText(/Voice session saved/);
      expect(scrolled.mock.contexts.some((el) => (el as Element).contains(card))).toBe(true);
      expect(scrolled).toHaveBeenLastCalledWith(expect.objectContaining({ block: "nearest" }));
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it("doesn't come back when the save answers after the new chat began", async () => {
    notKept();
    render(<MiraChat signedIn initialChatId={null} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/mira/me", expect.anything()));
    talk();
    await sayToMira("It's the lights");
    const saved = holdAnswers("/api/mira/recordings");
    fireEvent.click(screen.getByRole("button", { name: "End" }));
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    await act(async () => saved.current({ body: { kept: false } }));
    fireEvent.change(screen.getByLabelText("Message Mira"), { target: { value: "A new topic" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(calls("POST /api/mira/chat")).toHaveLength(2));
    await screen.findAllByText(REPLY);
    expect(screen.queryByText(/wasn.t kept|Saving your voice session/)).toBeNull();
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

  it("can be muted while she speaks: she finishes, it stays off, and Unmute brings it back", async () => {
    render(<MiraChat signedIn={false} initialChatId={null} />);
    talk();
    await sayToMira("It's the lights");
    await waitFor(() => expect(screen.getByText("Mira is speaking")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Mute" }));
    expect(listening()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Unmute" }).getAttribute("aria-pressed")).toBe(
      "true"
    );
    fireEvent.click(screen.getByRole("button", { name: "Unmute" }));
    expect(listening()).toHaveLength(1); // listening for the person to cut in again
    fireEvent.click(screen.getByRole("button", { name: "Mute" }));
    finishSpeaking();
    expect(screen.getByText("Microphone off")).toBeTruthy();
    expect(listening()).toHaveLength(0);
  });

  it("never starts the browser's service behind the notice, even after the tab was left", async () => {
    localStorage.removeItem("mira.voice.notice.v1");
    render(<MiraChat signedIn={false} initialChatId={null} />);
    talk();
    expect(screen.getByRole("heading", { name: "Before you talk" })).toBeTruthy();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    expect(screen.getByRole("heading", { name: "Before you talk" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
    expect(FakeRecognizer.made).toHaveLength(0);
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
