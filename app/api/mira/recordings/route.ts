/**
 * /api/mira/recordings — talking to Mira by voice (features/mira/ui/voice), kept as words.
 *
 *   POST { session, chatId?, startedAt, mode, turns }  a voice session ended. Signed out it is
 *        only counted (voice_session_ended: its length, how speech became text, its turns; never
 *        words). Signed in with "Remember our conversations" on, its turns (stored by the chat
 *        route, tagged with the session) become a session to look back on: times, the talk share
 *        by words, the recognition mode and up to three key points from Mira's model, under the
 *        same rules as her replies. Sent again (the End tap and the page closing), it is saved once.
 *   GET ?limit=1..50  the account's sessions, newest first, each with the start of the one before
 *        it (Home's card, /mira/recordings).
 *
 * Audio never reaches us: the browser turns speech into text before anything is sent. Someone
 * Mira stopped as under 18 (server/minor.ts) is refused (403), like on Mira's other routes.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { anonId } from "@features/mira/server/anon";
import { isMinor } from "@features/mira/server/minor";
import { getMiraAccount } from "@features/mira/server/session";
import { getProfile, logMiraEvent, ownsChat } from "@features/mira/server/store";
import {
  MAX_SESSION_SECONDS,
  countWords,
  getRecording,
  listRecordings,
  mayWriteKeyPoints,
  saveKeyPoints,
  saveRecording,
  sessionStart,
  sessionTurns,
  writeKeyPoints,
  youShare,
  type Recording,
} from "@features/mira/server/voice";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";
// The key points get at most KEY_POINTS_MS of the model (its fallback included); a literal,
// because Next reads it statically.
export const maxDuration = 60;
const KEY_POINTS_MS = 40_000;

const ADULTS_ONLY = () =>
  NextResponse.json({ error: "Mira is only for people aged 18 or older." }, { status: 403 });

const schema = z
  .object({
    session: z.string().uuid(),
    chatId: z.string().uuid().nullable().optional(),
    startedAt: z.string().datetime({ offset: true }),
    mode: z.enum(["device", "service"]),
    turns: z.number().int().min(1).max(500),
  })
  .strict();

/** What the chat's end card shows. keyPoints null: not written yet (the model was down). */
const summary = (r: Recording) => ({
  id: r.id,
  startedAt: r.started_at,
  seconds: r.seconds,
  you: youShare(r),
  keyPoints: r.key_points,
});

export async function POST(request: Request) {
  const started = Date.now();
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  const ip = getClientIp(request);
  const limits = await Promise.all([
    checkRateLimit(ip, { bucket: "mira-voice", limit: 20, windowMs: 60_000 }),
    checkRateLimit(ip, { bucket: "mira-voice-day", limit: 200, windowMs: 24 * 60 * 60 * 1000 }),
  ]);
  if (limits.some((l) => !l.allowed)) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { session, chatId, startedAt, mode, turns } = parsed.data;
  const now = new Date();
  const secondsFrom = (from: Date) =>
    Math.min(MAX_SESSION_SECONDS, Math.max(0, Math.round((now.getTime() - from.getTime()) / 1000)));

  try {
    const account = await getMiraAccount();
    const counted = (who: { anonId?: string; userId?: string }) => {
      logMiraEvent("voice_session_ended", who, {
        seconds: secondsFrom(new Date(startedAt)),
        mode,
        turns,
        kept: false,
      });
      return NextResponse.json({ kept: false });
    };
    if (await isMinor(account?.id ?? null)) return ADULTS_ONLY();
    if (!account) return counted({ anonId: await anonId() });
    const who = { userId: account.id };
    const profile = await getProfile(account.id);
    if (!profile) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    // Kept like the chat it happened in: only while "Remember our conversations" is on.
    if (!profile.remember_chats || !chatId || !(await ownsChat(account.id, chatId))) {
      return counted(who);
    }
    const known = await getRecording(account.id, session);
    if (known) return NextResponse.json({ kept: true, recording: summary(known) });
    const spoken = await sessionTurns(chatId, session);
    if (spoken.length === 0) return counted(who);

    const start = sessionStart(new Date(startedAt), new Date(spoken[0]!.created_at));
    // The database stamped the turns; a server clock a little behind it must not end a session
    // before it began.
    const end = new Date(Math.max(now.getTime(), start.getTime()));
    const words = (role: "user" | "assistant") =>
      spoken.filter((t) => t.role === role).reduce((n, t) => n + countWords(t.content), 0);
    const recording: Recording = {
      id: session,
      chat_id: chatId,
      started_at: start.toISOString(),
      ended_at: end.toISOString(),
      seconds: secondsFrom(start),
      user_words: words("user"),
      mira_words: words("assistant"),
      recognition: mode,
      key_points: null,
      opened_at: null,
    };
    const { key_points: _none, opened_at: _new, ...row } = recording;
    await saveRecording({ ...row, user_id: account.id });

    // Kept even when the key points can't be written now: the session page can ask again.
    const points = (await mayWriteKeyPoints(account.id))
      ? await writeKeyPoints(spoken, started + KEY_POINTS_MS)
      : null;
    if (points) await saveKeyPoints(account.id, session, points);
    logMiraEvent("voice_session_ended", who, {
      seconds: recording.seconds,
      mode,
      turns,
      kept: true,
      session,
      points: points?.length ?? 0,
    });
    return NextResponse.json({
      kept: true,
      recording: summary({ ...recording, key_points: points }),
    });
  } catch (err) {
    logger.error({ err }, "mira: a voice session was not saved");
    return NextResponse.json(
      { error: "Your session couldn't be saved. Please try again." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const rate = await checkRateLimit(getClientIp(request), {
    bucket: "mira-recordings",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: "Please try again in a minute." }, { status: 429 });
  }
  const account = await getMiraAccount();
  if (!account) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const asked = Number(new URL(request.url).searchParams.get("limit"));
  const limit = Number.isInteger(asked) && asked >= 1 && asked <= 50 ? asked : 50;
  try {
    if (await isMinor(account.id)) return ADULTS_ONLY();
    // One more than shown: the start of the session before the last one shown.
    const found = await listRecordings(account.id, limit + 1);
    return NextResponse.json(
      {
        recordings: found.slice(0, limit).map((r, i) => ({
          id: r.id,
          startedAt: r.started_at,
          seconds: r.seconds,
          you: youShare(r),
          summary: r.key_points?.[0] ?? null,
          previousAt: found[i + 1]?.started_at ?? null,
        })),
        more: found.length > limit,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    logger.error({ err }, "mira: could not list voice sessions");
    return NextResponse.json({ error: "Unable to load your sessions." }, { status: 500 });
  }
}
