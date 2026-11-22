import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@features/admin/server/supabase", () => ({ supabaseFetch: vi.fn() }));
vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: vi.fn().mockResolvedValue(true) }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@features/mira/server/session", () => ({ getMiraAccount: vi.fn() }));
vi.mock("@features/mira/server/anon", () => ({
  anonId: vi.fn().mockResolvedValue("anon_test_123456789"),
}));
vi.mock("@features/mira/server/model", () => ({ askModel: vi.fn() }));
vi.mock("@features/mira/server/store", () => ({
  deleteChats: vi.fn(),
  getProfile: vi.fn(),
  logMiraEvent: vi.fn(),
  ownsChat: vi.fn(),
  updateProfile: vi.fn(),
}));
const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => jar) }));
// The real under-18 stop; whether this person was stopped is each test's to say.
vi.mock("@features/mira/server/minor", async (real) => ({
  ...(await real<typeof import("@features/mira/server/minor")>()),
  isMinor: vi.fn(),
}));

import { readFileSync } from "node:fs";
import miraConfig from "@features/mira/content/mira-config.json";
import { GET as list, POST as ended } from "@/app/api/mira/recordings/route";
import {
  DELETE as remove,
  GET as one,
  POST as rewrite,
} from "@/app/api/mira/recordings/[id]/route";
import { supabaseFetch } from "@features/admin/server/supabase";
import { isMinor, stopForMinor } from "@features/mira/server/minor";
import { askModel } from "@features/mira/server/model";
import { getMiraAccount } from "@features/mira/server/session";
import { getProfile, logMiraEvent, ownsChat } from "@features/mira/server/store";
import {
  countWords,
  keyPointsTurns,
  parseKeyPoints,
  sessionStart,
} from "@features/mira/server/voice";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit } from "@shared/http/ratelimit";

const LEA = { id: "6f2c4a1e-1111-4222-8333-944455556666", email: "lea@example.com" };
const CHAT = "0b8a7c6d-2222-4333-8444-955566667777";
const SESSION = "1c2d3e4f-3333-4444-8555-a66677778888";
const NOW = new Date("2026-11-22T20:30:00Z");

/** The database: what each read answers, and every call made, as "METHOD path". */
let tables: Record<string, unknown>;
const calls = () =>
  vi.mocked(supabaseFetch).mock.calls.map(([path, init]) => ({
    call: `${init?.method ?? "GET"} ${path}`,
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  }));
const called = (start: string) => calls().filter((c) => c.call.startsWith(start));

const turn = (role: "user" | "assistant", content: string, at: string) => ({
  role,
  content,
  created_at: at,
});
const SPOKEN = [
  turn("user", "I only feel okay with the lights off", "2026-11-22T20:21:00Z"),
  turn("assistant", "That makes sense. What might happen if they were on?", "2026-11-22T20:21:05Z"),
  turn("user", "He would see my stomach", "2026-11-22T20:22:00Z"),
  turn("assistant", "That worry is common, and it can soften.", "2026-11-22T20:22:06Z"),
];
const RECORDING = {
  id: SESSION,
  chat_id: CHAT,
  started_at: "2026-11-22T20:20:00Z",
  ended_at: "2026-11-22T20:30:00Z",
  seconds: 600,
  user_words: 13,
  mira_words: 18,
  recognition: "device",
  key_points: ["You said you feel safe only with the lights off."],
  opened_at: null,
};

function database() {
  vi.mocked(supabaseFetch).mockImplementation(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const key = Object.keys(tables).find((k) => `${method} ${path}`.startsWith(k));
    const answer = key ? tables[key] : method === "GET" ? [] : null;
    if (answer instanceof Response) return answer;
    return new Response(answer === null ? null : JSON.stringify(answer), {
      status: answer === null ? 204 : 200,
    });
  });
}

const request = (url: string, method: string, body?: unknown) =>
  new Request(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json", "x-csrf-token": "t" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const END = {
  session: SESSION,
  chatId: CHAT,
  startedAt: "2026-11-22T20:20:00Z",
  mode: "device",
  turns: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  tables = {};
  database();
  vi.mocked(verifyCsrfToken).mockResolvedValue(true);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() });
  vi.mocked(getMiraAccount).mockResolvedValue(LEA);
  vi.mocked(isMinor).mockResolvedValue(false);
  vi.mocked(getProfile).mockResolvedValue({ id: LEA.id, remember_chats: true } as never);
  vi.mocked(ownsChat).mockImplementation(async (user, chat) => user === LEA.id && chat === CHAT);
  vi.mocked(askModel).mockResolvedValue({
    ok: true,
    text: "- You feel safe only with the lights off.\n- You worry he would see your stomach.",
    refused: false,
  });
});

describe("key points from Mira's model", () => {
  it("keeps at most three points, without bullets, bold or the app's markers", () => {
    expect(
      parseKeyPoints(
        "- **You** named the watcher.\n* We tried a breath.\n1. One step.\n- Four.\n[[REFER]]"
      )
    ).toEqual(["You named the watcher.", "We tried a breath.", "One step."]);
  });

  it("keeps none when she says there is nothing to keep, or a stop rail fired", () => {
    expect(parseKeyPoints("NONE")).toEqual([]);
    expect(parseKeyPoints("- You talked about it.\n[[CRISIS]]")).toEqual([]);
    expect(parseKeyPoints("- You are fifteen.\n[[MINOR]]")).toEqual([]);
  });

  it("sends the session's words as one conversation, then asks for the points as the app", () => {
    const turns = keyPointsTurns([
      { role: "assistant", content: "Hi, I'm Mira." },
      { role: "user", content: "Hi" },
      { role: "user", content: "it's the lights" },
      { role: "assistant", content: "Tell me more." },
    ]);
    expect(turns.map((t) => t.role)).toEqual(["user", "assistant", "user"]);
    expect(turns[0]!.content).toBe("Hi\n\nit's the lights");
    expect(turns[2]!.content).toMatch(/^\(The app, not the person:/);
  });

  it("counts words in any language, and dates a session from its own clock within its turns", () => {
    expect(countWords("I don’t  like my body — at all")).toBe(7);
    expect(countWords("Ich mag meinen Körper nicht")).toBe(5);
    const first = new Date("2026-11-22T20:21:00Z");
    expect(sessionStart(new Date("2026-11-22T20:20:00Z"), first)).toEqual(
      new Date("2026-11-22T20:20:00Z")
    );
    // Never after its first turn, nor more than 15 minutes before it.
    expect(sessionStart(new Date("2026-11-22T20:25:00Z"), first)).toEqual(first);
    expect(sessionStart(new Date("2026-11-22T17:00:00Z"), first)).toEqual(
      new Date("2026-11-22T20:06:00Z")
    );
  });
});

describe("POST /api/mira/recordings (a voice session ended)", () => {
  it("refuses without the CSRF token", async () => {
    vi.mocked(verifyCsrfToken).mockResolvedValueOnce(false);
    expect((await ended(request("/api/mira/recordings", "POST", END))).status).toBe(403);
  });

  it("only counts a signed-out session: its length, recognition and turns, never words", async () => {
    vi.mocked(getMiraAccount).mockResolvedValue(null);
    const res = await ended(request("/api/mira/recordings", "POST", END));
    expect(await res.json()).toEqual({ kept: false });
    expect(supabaseFetch).not.toHaveBeenCalled();
    expect(logMiraEvent).toHaveBeenCalledWith(
      "voice_session_ended",
      { anonId: "anon_test_123456789" },
      { seconds: 600, mode: "device", turns: 2, kept: false }
    );
  });

  it("keeps a signed-in session as words: its own turns in its own chat, talk share and key points", async () => {
    tables[`GET /rest/v1/mira_message?chat_id=eq.${CHAT}&voice_session=eq.${SESSION}`] = SPOKEN;
    const res = await ended(request("/api/mira/recordings", "POST", END));
    const body = await res.json();
    expect(res.status).toBe(200);
    const saved = called("POST /rest/v1/mira_voice_session")[0]!.body;
    expect(saved).toMatchObject({
      id: SESSION,
      user_id: LEA.id,
      chat_id: CHAT,
      started_at: "2026-11-22T20:20:00.000Z",
      ended_at: "2026-11-22T20:30:00.000Z",
      seconds: 600,
      user_words: 13,
      mira_words: 18,
      recognition: "device",
    });
    // The model sees the session's words, as the person's and Mira's turns.
    const [, personal, turns] = vi.mocked(askModel).mock.calls[0]!;
    expect(personal).toMatch(/SESSION KEY POINTS/);
    expect(turns[0]).toEqual({ role: "user", content: "I only feel okay with the lights off" });
    const points = called(
      `PATCH /rest/v1/mira_voice_session?id=eq.${SESSION}&user_id=eq.${LEA.id}`
    );
    expect(points[0]!.body).toEqual({
      key_points: [
        "You feel safe only with the lights off.",
        "You worry he would see your stomach.",
      ],
    });
    expect(body).toMatchObject({
      kept: true,
      recording: { id: SESSION, seconds: 600, you: 42, keyPoints: expect.any(Array) },
    });
    expect(logMiraEvent).toHaveBeenCalledWith(
      "voice_session_ended",
      { userId: LEA.id },
      { seconds: 600, mode: "device", turns: 2, kept: true, session: SESSION, points: 2 }
    );
  });

  // CHAT-15: a session held in German got English key points.
  it("asks for the key points in the session's language: the one Mira replies in, else the one spoken", async () => {
    tables[`GET /rest/v1/mira_message?chat_id=eq.${CHAT}&voice_session=eq.${SESSION}`] = SPOKEN;
    vi.mocked(getProfile).mockResolvedValueOnce({
      id: LEA.id,
      remember_chats: true,
      reply_language: "de",
    } as never);
    await ended(request("/api/mira/recordings", "POST", END));
    const german = vi.mocked(askModel).mock.calls[0]![1];
    expect(german).toContain("Write them in German, the language Mira replies in.");
    expect(german).not.toMatch(/English/);

    vi.mocked(askModel).mockClear();
    vi.mocked(getProfile).mockResolvedValueOnce({
      id: LEA.id,
      remember_chats: true,
      reply_language: null,
    } as never);
    await ended(request("/api/mira/recordings", "POST", END));
    expect(vi.mocked(askModel).mock.calls[0]![1]).toContain(
      "Write them in the language the session was held in (English when you can't tell)."
    );
  });

  it("writes no key points for a session where a stop rail fired, and asks no model", async () => {
    tables[`GET /rest/v1/mira_message?chat_id=eq.${CHAT}&voice_session=eq.${SESSION}`] = [
      turn("user", "I want to kill myself", "2026-11-22T20:21:00Z"),
      turn("assistant", miraConfig.crisisMessage, "2026-11-22T20:21:01Z"),
    ];
    const body = await (await ended(request("/api/mira/recordings", "POST", END))).json();
    expect(askModel).not.toHaveBeenCalled();
    expect(body.recording.keyPoints).toEqual([]);
  });

  // The model can flag a crisis itself ([[CRISIS]]): the chat stores its reply without the marker,
  // so the words alone don't show that the support lines opened. The KPI log does.
  const FLAGGED = [
    turn("user", "Honestly I don't see why I should keep going", "2026-11-22T20:21:00Z"),
    turn("assistant", "I'm really worried about what you just said.", "2026-11-22T20:21:05Z"),
  ];
  const SHOWN = `GET /rest/v1/mira_event?user_id=eq.${LEA.id}&name=in.(crisis_shown,reply_declined)`;

  it("writes no key points when the support lines opened in the session, whatever its words say", async () => {
    tables[`GET /rest/v1/mira_message?chat_id=eq.${CHAT}&voice_session=eq.${SESSION}`] = FLAGGED;
    tables[SHOWN] = [{ id: 9 }];
    const body = await (await ended(request("/api/mira/recordings", "POST", END))).json();
    expect(askModel).not.toHaveBeenCalled();
    expect(body.recording.keyPoints).toEqual([]);
    expect(
      called(`PATCH /rest/v1/mira_voice_session?id=eq.${SESSION}&user_id=eq.${LEA.id}`)[0]!.body
    ).toEqual({ key_points: [] });
    // Asked over the session's own turns, from its first to a minute after its last.
    const asked = called("GET /rest/v1/mira_event")[0]!.call;
    expect(asked).toContain(`created_at=gte.${encodeURIComponent("2026-11-22T20:21:00.000Z")}`);
    expect(asked).toContain(`created_at=lte.${encodeURIComponent("2026-11-22T20:22:05.000Z")}`);
  });

  it("asks the model only when the log shows no support lines in the session", async () => {
    tables[`GET /rest/v1/mira_message?chat_id=eq.${CHAT}&voice_session=eq.${SESSION}`] = FLAGGED;
    tables[SHOWN] = [];
    await ended(request("/api/mira/recordings", "POST", END));
    expect(askModel).toHaveBeenCalledTimes(1);
  });

  it("leaves the key points for later when the log can't be read, and asks no model", async () => {
    tables[`GET /rest/v1/mira_message?chat_id=eq.${CHAT}&voice_session=eq.${SESSION}`] = FLAGGED;
    tables[SHOWN] = new Response("{}", { status: 503 });
    const body = await (await ended(request("/api/mira/recordings", "POST", END))).json();
    expect(askModel).not.toHaveBeenCalled();
    expect(body).toMatchObject({ kept: true, recording: { keyPoints: null } });
  });

  it("keeps nothing from a chat that isn't the person's, or with memory off, and says which", async () => {
    for (const [setup, answer] of [
      [() => vi.mocked(ownsChat).mockResolvedValueOnce(false), { kept: false }],
      [
        () => vi.mocked(getProfile).mockResolvedValueOnce({ remember_chats: false } as never),
        { kept: false, reason: "memory_off" },
      ],
    ] as const) {
      vi.mocked(supabaseFetch).mockClear();
      setup();
      tables[`GET /rest/v1/mira_message?chat_id=eq.${CHAT}&voice_session=eq.${SESSION}`] = SPOKEN;
      const body = await (await ended(request("/api/mira/recordings", "POST", END))).json();
      expect(body).toEqual(answer);
      expect(called("POST /rest/v1/mira_voice_session")).toEqual([]);
      expect(called("GET /rest/v1/mira_message")).toEqual([]);
    }
  });

  // VOI-V6b: memory on, but the first answer failed (no chat) or no turn was stored.
  it("doesn't blame the memory setting when the session's words simply aren't in the chat", async () => {
    for (const end of [{ ...END, chatId: null }, END]) {
      tables[`GET /rest/v1/mira_message?chat_id=eq.${CHAT}&voice_session=eq.${SESSION}`] = [];
      const body = await (await ended(request("/api/mira/recordings", "POST", end))).json();
      expect(body).toEqual({ kept: false });
    }
  });

  it("is saved once when the end arrives twice (the End tap and the page closing)", async () => {
    tables[`GET /rest/v1/mira_voice_session?id=eq.${SESSION}&user_id=eq.${LEA.id}`] = [RECORDING];
    const body = await (await ended(request("/api/mira/recordings", "POST", END))).json();
    expect(body.recording.id).toBe(SESSION);
    expect(called("POST /rest/v1/mira_voice_session")).toEqual([]);
    expect(askModel).not.toHaveBeenCalled();
  });

  it("keeps the session without key points when the model is down, to try again later", async () => {
    tables[`GET /rest/v1/mira_message?chat_id=eq.${CHAT}&voice_session=eq.${SESSION}`] = SPOKEN;
    vi.mocked(askModel).mockResolvedValue({ ok: false, reason: "overloaded" });
    const body = await (await ended(request("/api/mira/recordings", "POST", END))).json();
    expect(body.recording).toMatchObject({ id: SESSION, keyPoints: null });
    expect(called("PATCH /rest/v1/mira_voice_session")).toEqual([]);
  });

  it("doesn't spend everyone's daily model calls once they are used up", async () => {
    tables[`GET /rest/v1/mira_message?chat_id=eq.${CHAT}&voice_session=eq.${SESSION}`] = SPOKEN;
    vi.mocked(checkRateLimit).mockImplementation(async (_k, cfg) => ({
      allowed: cfg.bucket !== "mira-global-day",
      remaining: 0,
      resetAt: new Date(),
    }));
    const body = await (await ended(request("/api/mira/recordings", "POST", END))).json();
    expect(askModel).not.toHaveBeenCalled();
    expect(body.recording.keyPoints).toBeNull();
  });

  // VOI-V10: the end was the save's arrival, so time away before End, or a "Try again" an hour
  // later, counted as talking (up to 3 h).
  it("dates the end from the browser's End, never after the save nor before the last turn", async () => {
    const saved = () => called("POST /rest/v1/mira_voice_session").at(-1)!.body;
    for (const [endedAt, end, seconds] of [
      ["2026-11-22T20:25:00Z", "2026-11-22T20:25:00.000Z", 300], // End, five minutes before the save
      ["2026-11-22T21:00:00Z", "2026-11-22T20:30:00.000Z", 600], // a clock ahead: the save's time
      ["2026-11-22T20:21:30Z", "2026-11-22T20:22:06.000Z", 126], // a clock behind: its last turn
    ] as const) {
      tables[`GET /rest/v1/mira_message?chat_id=eq.${CHAT}&voice_session=eq.${SESSION}`] = SPOKEN;
      await ended(request("/api/mira/recordings", "POST", { ...END, endedAt }));
      expect(saved()).toMatchObject({ ended_at: end, seconds });
    }
    // Signed out, only counted: the same clock.
    vi.mocked(getMiraAccount).mockResolvedValue(null);
    await ended(
      request("/api/mira/recordings", "POST", { ...END, endedAt: "2026-11-22T20:25:00Z" })
    );
    expect(vi.mocked(logMiraEvent).mock.calls.at(-1)![2]).toMatchObject({ seconds: 300 });
  });

  it("is counted, and kept without key points, when writing them fails after the save", async () => {
    tables[`GET /rest/v1/mira_message?chat_id=eq.${CHAT}&voice_session=eq.${SESSION}`] = SPOKEN;
    tables[`PATCH /rest/v1/mira_voice_session?id=eq.${SESSION}`] = new Response("{}", {
      status: 503,
    });
    const res = await ended(request("/api/mira/recordings", "POST", END));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ kept: true, recording: { keyPoints: null } });
    expect(logMiraEvent).toHaveBeenCalledWith(
      "voice_session_ended",
      { userId: LEA.id },
      expect.objectContaining({ kept: true, session: SESSION, points: 0 })
    );
  });

  it("refuses what isn't a session's end", async () => {
    for (const bad of [
      { ...END, session: "nope" },
      { ...END, mode: "cloud" },
      { ...END, turns: 0 },
      { ...END, words: "I said this" },
    ]) {
      expect((await ended(request("/api/mira/recordings", "POST", bad))).status).toBe(400);
    }
  });
});

describe("GET /api/mira/recordings", () => {
  it("needs a signed-in person", async () => {
    vi.mocked(getMiraAccount).mockResolvedValue(null);
    expect((await list(request("/api/mira/recordings", "GET"))).status).toBe(401);
  });

  it("lists the person's own sessions, newest first, with the one before each for the gap", async () => {
    const older = {
      ...RECORDING,
      id: "2d3e4f50-4444-4555-8666-b77788889999",
      started_at: "2026-11-20T19:00:00Z",
      key_points: [],
    };
    tables[`GET /rest/v1/mira_voice_session?user_id=eq.${LEA.id}`] = [RECORDING, older];
    const body = await (await list(request("/api/mira/recordings?limit=1", "GET"))).json();
    const path = called("GET /rest/v1/mira_voice_session")[0]!.call;
    expect(path).toContain("order=started_at.desc");
    expect(path).toContain("limit=2");
    expect(body).toEqual({
      recordings: [
        {
          id: SESSION,
          startedAt: RECORDING.started_at,
          seconds: 600,
          you: 42,
          summary: "You said you feel safe only with the lights off.",
          previousAt: older.started_at,
        },
      ],
      more: true,
    });
  });
});

describe("/api/mira/recordings/[id]", () => {
  const url = `/api/mira/recordings/${SESSION}`;

  it("answers 404 for a session that isn't the person's (every read is scoped to them)", async () => {
    const res = await one(request(url, "GET"), params(SESSION));
    expect(res.status).toBe(404);
    expect(called("GET /rest/v1/mira_voice_session")[0]!.call).toContain(`user_id=eq.${LEA.id}`);
  });

  it("shows the key points and the words, and counts the first time the points were opened", async () => {
    tables[`GET /rest/v1/mira_voice_session?id=eq.${SESSION}&user_id=eq.${LEA.id}`] = [RECORDING];
    tables[`GET /rest/v1/mira_message?chat_id=eq.${CHAT}&voice_session=eq.${SESSION}`] = SPOKEN;
    tables[
      `PATCH /rest/v1/mira_voice_session?id=eq.${SESSION}&user_id=eq.${LEA.id}&opened_at=is.null`
    ] = [{ id: SESSION }];
    const body = await (await one(request(url, "GET"), params(SESSION))).json();
    expect(body.recording).toMatchObject({
      keyPoints: RECORDING.key_points,
      chatId: CHAT,
      you: 42,
    });
    expect(body.transcript).toHaveLength(4);
    expect(logMiraEvent).toHaveBeenCalledWith(
      "voice_points_opened",
      { userId: LEA.id },
      { session: SESSION }
    );
    // Already opened: not counted again.
    vi.mocked(logMiraEvent).mockClear();
    tables[
      `PATCH /rest/v1/mira_voice_session?id=eq.${SESSION}&user_id=eq.${LEA.id}&opened_at=is.null`
    ] = [];
    await one(request(url, "GET"), params(SESSION));
    expect(logMiraEvent).not.toHaveBeenCalled();
  });

  it("deletes the session's words from its chat, then the session; an emptied chat goes too", async () => {
    tables[`GET /rest/v1/mira_voice_session?id=eq.${SESSION}&user_id=eq.${LEA.id}`] = [RECORDING];
    tables[`GET /rest/v1/mira_message?chat_id=eq.${CHAT}&voice_session=eq.${SESSION}`] = SPOKEN;
    const res = await remove(request(url, "DELETE"), params(SESSION));
    expect(res.status).toBe(200);
    const deletes = calls()
      .map((c) => c.call)
      .filter((c) => c.startsWith("DELETE"));
    expect(deletes).toEqual([
      `DELETE /rest/v1/mira_message?chat_id=eq.${CHAT}&voice_session=eq.${SESSION}`,
      `DELETE /rest/v1/mira_voice_session?id=eq.${SESSION}&user_id=eq.${LEA.id}`,
      `DELETE /rest/v1/mira_chat?id=eq.${CHAT}&user_id=eq.${LEA.id}`,
    ]);
  });

  it("renames a chat whose title was the deleted words, when other messages stay", async () => {
    tables[`GET /rest/v1/mira_voice_session?id=eq.${SESSION}&user_id=eq.${LEA.id}`] = [RECORDING];
    tables[`GET /rest/v1/mira_message?chat_id=eq.${CHAT}&voice_session=eq.${SESSION}`] = SPOKEN;
    tables[`GET /rest/v1/mira_message?chat_id=eq.${CHAT}&select=role,content`] = [
      { role: "user", content: "Later, typed:   how do I start?" },
    ];
    tables[`GET /rest/v1/mira_chat?id=eq.${CHAT}&user_id=eq.${LEA.id}`] = [
      { title: "I only feel okay with the lights off" },
    ];
    await remove(request(url, "DELETE"), params(SESSION));
    expect(called(`PATCH /rest/v1/mira_chat?id=eq.${CHAT}&user_id=eq.${LEA.id}`)[0]!.body).toEqual({
      title: "Later, typed: how do I start?",
    });
    expect(called("DELETE /rest/v1/mira_chat")).toEqual([]);
  });

  it("needs the CSRF token to delete or rewrite", async () => {
    vi.mocked(verifyCsrfToken).mockResolvedValue(false);
    expect((await remove(request(url, "DELETE"), params(SESSION))).status).toBe(403);
    expect((await rewrite(request(url, "POST"), params(SESSION))).status).toBe(403);
  });

  it("writes none on asking again when the support lines opened in that session", async () => {
    tables[`GET /rest/v1/mira_voice_session?id=eq.${SESSION}&user_id=eq.${LEA.id}`] = [
      { ...RECORDING, key_points: null },
    ];
    tables[`GET /rest/v1/mira_message?chat_id=eq.${CHAT}&voice_session=eq.${SESSION}`] = [
      turn("user", "Honestly I don't see why I should keep going", "2026-11-22T20:21:00Z"),
      turn("assistant", "I'm really worried about what you just said.", "2026-11-22T20:21:05Z"),
    ];
    tables[`GET /rest/v1/mira_event?user_id=eq.${LEA.id}&name=in.(crisis_shown,reply_declined)`] = [
      { id: 9 },
    ];
    const body = await (await rewrite(request(url, "POST"), params(SESSION))).json();
    expect(body.keyPoints).toEqual([]);
    expect(askModel).not.toHaveBeenCalled();
  });

  it("writes the key points again only when there are none, in the session's language", async () => {
    tables[`GET /rest/v1/mira_voice_session?id=eq.${SESSION}&user_id=eq.${LEA.id}`] = [
      { ...RECORDING, key_points: null },
    ];
    tables[`GET /rest/v1/mira_message?chat_id=eq.${CHAT}&voice_session=eq.${SESSION}`] = SPOKEN;
    vi.mocked(getProfile).mockResolvedValueOnce({ id: LEA.id, reply_language: "fr" } as never);
    const body = await (await rewrite(request(url, "POST"), params(SESSION))).json();
    expect(body.keyPoints).toHaveLength(2);
    expect(vi.mocked(askModel).mock.calls[0]![1]).toContain("Write them in French");
    tables[`GET /rest/v1/mira_voice_session?id=eq.${SESSION}&user_id=eq.${LEA.id}`] = [RECORDING];
    expect((await rewrite(request(url, "POST"), params(SESSION))).status).toBe(409);
  });
});

describe("someone Mira stopped as under 18", () => {
  it("is refused on every voice session route, before anything of theirs is read or counted", async () => {
    vi.mocked(isMinor).mockResolvedValue(true);
    const url = `/api/mira/recordings/${SESSION}`;
    for (const res of [
      await ended(request("/api/mira/recordings", "POST", END)),
      await list(request("/api/mira/recordings", "GET")),
      await one(request(url, "GET"), params(SESSION)),
      await rewrite(request(url, "POST"), params(SESSION)),
      await remove(request(url, "DELETE"), params(SESSION)),
    ]) {
      expect(res.status).toBe(403);
    }
    // Signed out too: the browser's own mark.
    vi.mocked(getMiraAccount).mockResolvedValue(null);
    expect((await ended(request("/api/mira/recordings", "POST", END))).status).toBe(403);
    expect(supabaseFetch).not.toHaveBeenCalled();
    expect(logMiraEvent).not.toHaveBeenCalled();
    expect(askModel).not.toHaveBeenCalled();
  });

  it("loses their voice sessions with the stop, key points included", async () => {
    await stopForMinor(LEA.id);
    expect(called("DELETE /rest/v1/mira_voice_session").map((c) => c.call)).toEqual([
      `DELETE /rest/v1/mira_voice_session?user_id=eq.${LEA.id}`,
    ]);
  });
});

describe("the voice tables (supabase/migrations/20261122030000_mira_voice.sql)", () => {
  const sql = readFileSync("supabase/migrations/20261122030000_mira_voice.sql", "utf8");
  const rollback = readFileSync("supabase/rollbacks/20261122030000_mira_voice_down.sql", "utf8");

  it("are the service role's only, keep no audio, and go with the chat and the account", () => {
    expect(sql).toMatch(/ALTER TABLE public\.mira_voice_session ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(
      /REVOKE ALL ON public\.mira_voice_session FROM PUBLIC, anon, authenticated/
    );
    expect(sql).toMatch(
      /user_id\s+uuid NOT NULL REFERENCES public\.mira_user \(id\) ON DELETE CASCADE/
    );
    expect(sql).toMatch(
      /chat_id\s+uuid NOT NULL REFERENCES public\.mira_chat \(id\) ON DELETE CASCADE/
    );
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS voice_session uuid;/);
    // No column for sound: outside its comments and descriptions, the file never names one.
    const code = sql.replace(/--.*$/gm, "").replace(/'(?:[^']|'')*'/g, "''");
    expect(code).not.toMatch(/audio|bytea|blob/i);
    expect(rollback).toMatch(/DROP TABLE IF EXISTS public\.mira_voice_session;/);
    expect(rollback).toMatch(/DROP COLUMN IF EXISTS voice_session;/);
  });
});
