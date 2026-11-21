import { supabaseFetch } from "@features/admin/server/supabase";
import { checkRateLimit } from "@shared/http/ratelimit";
import miraConfig from "../content/mira-config.json";
import { GLOBAL_DAILY_MESSAGES } from "./config";
import { askModel, type MiraTurn } from "./model";
import { STABLE_INSTRUCTIONS } from "./prompt";
import { isCrisisMessage, parseReply } from "./safety";

/**
 * Voice sessions kept as words (supabase/migrations/20261122030000_mira_voice.sql). Talking to
 * Mira (features/mira/ui/voice) sends each spoken turn through the chat route like a typed one,
 * which stores it in the chat tagged with the session's id (mira_message.voice_session) while
 * "Remember our conversations" is on. When the session ends, its row here keeps the times, the
 * talk share by words, how speech became text and up to three key points the model writes from
 * those turns. Audio never reaches us. Every read and write is scoped to the account.
 */

export type RecognitionMode = "device" | "service";

export type Recording = {
  id: string;
  chat_id: string;
  started_at: string;
  ended_at: string;
  seconds: number;
  user_words: number;
  mira_words: number;
  recognition: RecognitionMode;
  /** Null until written (the model was down: it can be asked again); [] when none on purpose. */
  key_points: string[] | null;
  opened_at: string | null;
};

export type SpokenTurn = { role: "user" | "assistant"; content: string; created_at: string };

const COLS =
  "id,chat_id,started_at,ended_at,seconds,user_words,mira_words,recognition,key_points,opened_at";
const enc = encodeURIComponent;
const MINUTE_MS = 60_000;
/** A session may begin a while before its first turn (the person gathers their words), no more. */
const LEAD_IN_MS = 15 * MINUTE_MS;
/** The longest session counted: a voice mode left open all evening is not a 9-hour talk. */
export const MAX_SESSION_SECONDS = 3 * 60 * 60;

async function rows<T>(path: string): Promise<T[]> {
  const res = await supabaseFetch(path);
  if (!res.ok) throw new Error(`mira voice read failed (${res.status})`);
  return (await res.json()) as T[];
}

async function write(path: string, method: string, body?: unknown, prefer?: string) {
  const res = await supabaseFetch(path, {
    method,
    ...(prefer ? { headers: { Prefer: prefer } } : {}),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) throw new Error(`mira voice ${method} failed (${res.status})`);
  return res;
}

/** Words, in any language: what the talk share is counted in. */
export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
}

/** You = the person's share of the session's words, in whole percent (null: nobody spoke). */
export function youShare(r: Pick<Recording, "user_words" | "mira_words">): number | null {
  const all = r.user_words + r.mira_words;
  return all ? Math.round((100 * r.user_words) / all) : null;
}

/** When a session began: the browser's clock, but never after its first turn nor long before it. */
export function sessionStart(claimed: Date, firstTurn: Date): Date {
  const t = Math.min(claimed.getTime(), firstTurn.getTime());
  return new Date(Math.max(t, firstTurn.getTime() - LEAD_IN_MS));
}

export async function listRecordings(userId: string, limit: number): Promise<Recording[]> {
  return rows<Recording>(
    `/rest/v1/mira_voice_session?user_id=eq.${enc(userId)}&select=${COLS}&order=started_at.desc&limit=${limit}`
  );
}

export async function getRecording(userId: string, id: string): Promise<Recording | null> {
  const found = await rows<Recording>(
    `/rest/v1/mira_voice_session?id=eq.${enc(id)}&user_id=eq.${enc(userId)}&select=${COLS}&limit=1`
  );
  return found[0] ?? null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Key points a person may have written a day: each is one call to the model. */
export const KEY_POINTS_PER_DAY = 20;

/**
 * Whether the model may write a session's key points now: the person's own daily allowance, and
 * the chat's ceiling for everyone's model calls together (app/api/mira/chat), which they count in.
 */
export async function mayWriteKeyPoints(userId: string): Promise<boolean> {
  const mine = await checkRateLimit(userId, {
    bucket: "mira-voice-points",
    limit: KEY_POINTS_PER_DAY,
    windowMs: DAY_MS,
  });
  if (!mine.allowed) return false;
  const everyone = await checkRateLimit(`all:${new Date().toISOString().slice(0, 10)}`, {
    bucket: "mira-global-day",
    limit: GLOBAL_DAILY_MESSAGES,
    windowMs: DAY_MS,
  });
  return everyone.allowed;
}

/** A session's turns, oldest first, read only from a chat the caller has checked is the account's. */
export async function sessionTurns(chatId: string, session: string): Promise<SpokenTurn[]> {
  return rows<SpokenTurn>(
    `/rest/v1/mira_message?chat_id=eq.${enc(chatId)}&voice_session=eq.${enc(session)}&select=role,content,created_at&order=id.asc`
  );
}

export async function saveRecording(
  row: Omit<Recording, "key_points" | "opened_at"> & { user_id: string }
) {
  await write("/rest/v1/mira_voice_session", "POST", row, "return=minimal");
}

export async function saveKeyPoints(userId: string, id: string, points: string[]): Promise<void> {
  await write(`/rest/v1/mira_voice_session?id=eq.${enc(id)}&user_id=eq.${enc(userId)}`, "PATCH", {
    key_points: points,
  });
}

/** True the first time the person opens a session (their KPI moment), false every time after. */
export async function markOpened(userId: string, id: string): Promise<boolean> {
  const res = await write(
    `/rest/v1/mira_voice_session?id=eq.${enc(id)}&user_id=eq.${enc(userId)}&opened_at=is.null`,
    "PATCH",
    { opened_at: new Date().toISOString() },
    "return=representation"
  );
  return ((await res.json().catch(() => [])) as unknown[]).length > 0;
}

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Deletes a session's words from its chat (the person's first, they are what matters), then the
 * session. A chat left empty goes too; one that keeps other messages but was named after the
 * deleted words (a chat takes its first message as its title) is named after what stays.
 */
export async function deleteRecording(userId: string, rec: Recording): Promise<void> {
  const chat = `chat_id=eq.${enc(rec.chat_id)}`;
  const spoken = await sessionTurns(rec.chat_id, rec.id);
  await write(`/rest/v1/mira_message?${chat}&voice_session=eq.${enc(rec.id)}`, "DELETE");
  await write(
    `/rest/v1/mira_voice_session?id=eq.${enc(rec.id)}&user_id=eq.${enc(userId)}`,
    "DELETE"
  );
  const mine = `id=eq.${enc(rec.chat_id)}&user_id=eq.${enc(userId)}`;
  const left = await rows<{ role: string; content: string }>(
    `/rest/v1/mira_message?${chat}&select=role,content&order=id.asc&limit=50`
  );
  if (left.length === 0) {
    await write(`/rest/v1/mira_chat?${mine}`, "DELETE");
    return;
  }
  const [named] = await rows<{ title: string }>(`/rest/v1/mira_chat?${mine}&select=title&limit=1`);
  const title = oneLine(named?.title ?? "");
  const fromSpoken = spoken.some(
    (t) => t.role === "user" && title && oneLine(t.content).startsWith(title)
  );
  if (!fromSpoken) return;
  const firstOwn = left.find((m) => m.role === "user");
  await write(`/rest/v1/mira_chat?${mine}`, "PATCH", {
    title: firstOwn ? oneLine(firstOwn.content).slice(0, 80) : "New chat",
  });
}

/**
 * Every session of the account, for the under-18 stop (server/minor.ts). Their words are chat
 * messages, which go with the account's chats there.
 */
export async function deleteRecordings(userId: string): Promise<void> {
  await write(`/rest/v1/mira_voice_session?user_id=eq.${enc(userId)}`, "DELETE");
}

/** Asked of Mira's own model, after her rules, so the same safety rules shape the key points. */
export const KEY_POINTS_INSTRUCTIONS = `SESSION KEY POINTS
The voice session in this conversation has ended. The app, not the person, asks you for its key points: the person will read them later, next to the session's words. Write at most three, each on its own line starting with "- ": one short sentence each (15 words at most), in plain English, speaking to the person ("You noticed…", "We tried…"), only about what was actually said. No new advice, no names, no markers and no Sources line. If the session raised one of your stop rails, or held nothing worth keeping, reply with the single word NONE.`;

/** What the model gets of a session: the newest turns that fit, then the app's request. */
const MAX_TRANSCRIPT_CHARS = 24_000;
const ASK = "(The app, not the person: the session has ended. Write its key points as asked.)";

export function keyPointsTurns(
  transcript: ReadonlyArray<Pick<SpokenTurn, "role" | "content">>
): MiraTurn[] {
  const turns: MiraTurn[] = [];
  for (const t of transcript) {
    if (!t.content.trim()) continue;
    const last = turns.at(-1);
    if (last?.role === t.role) last.content += `\n\n${t.content}`;
    else turns.push({ role: t.role, content: t.content });
  }
  let chars = turns.reduce((n, t) => n + t.content.length, 0);
  while (turns.length > 1 && chars > MAX_TRANSCRIPT_CHARS) chars -= turns.shift()!.content.length;
  while (turns[0]?.role === "assistant") turns.shift();
  const last = turns.at(-1);
  if (last?.role === "user") last.content += `\n\n${ASK}`;
  else turns.push({ role: "user", content: ASK });
  return turns;
}

/** At most three points, without bullets, bold or markers; none when a stop rail fired. */
export function parseKeyPoints(raw: string): string[] {
  const reply = parseReply(raw);
  if (reply.crisis || reply.minor || /^\s*NONE\b/.test(reply.text)) return [];
  return reply.text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^([-•*]|\d+[.)])\s+/.test(line))
    .map((line) =>
      line
        .replace(/^([-•*]|\d+[.)])\s+/, "")
        .replace(/\*\*|__/g, "")
        .trim()
    )
    .filter(Boolean)
    .slice(0, 3)
    .map((line) => line.slice(0, 200));
}

const STOP_MESSAGES = new Set([
  miraConfig.crisisMessage,
  miraConfig.refusalMessage,
  miraConfig.minorMessage,
]);

/** A session where a stop rail fired keeps its words but gets no key points: nothing to sum up. */
export function heldAStop(
  transcript: ReadonlyArray<Pick<SpokenTurn, "role" | "content">>
): boolean {
  return transcript.some((t) =>
    t.role === "user" ? isCrisisMessage(t.content) : STOP_MESSAGES.has(t.content)
  );
}

/** The key points; [] on purpose (a stop rail, nothing to keep), null when the model failed. */
export async function writeKeyPoints(
  transcript: ReadonlyArray<Pick<SpokenTurn, "role" | "content">>,
  until: number
): Promise<string[] | null> {
  if (heldAStop(transcript)) return [];
  const result = await askModel(
    STABLE_INSTRUCTIONS,
    KEY_POINTS_INSTRUCTIONS,
    keyPointsTurns(transcript),
    until
  );
  if (!result.ok) return null;
  return result.refused ? [] : parseKeyPoints(result.text);
}
