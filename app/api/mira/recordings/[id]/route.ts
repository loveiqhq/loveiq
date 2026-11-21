/**
 * /api/mira/recordings/[id] — one of the signed-in account's voice sessions (/mira/recordings/[id]).
 *
 *   GET     its key points and its words (the turns the chat stored for it). The first time a
 *           session with key points is opened counts once (voice_points_opened, its id only).
 *   POST    asks Mira's model for the key points again, when they could not be written at the
 *           session's end (409 once they exist).
 *   DELETE  deletes its words from the chat, then the session (server/voice.ts deleteRecording).
 *
 * Every read is scoped to the account, so another person's session answers 404. Someone Mira
 * stopped as under 18 (server/minor.ts) is refused (403), like on Mira's other routes.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { isMinor } from "@features/mira/server/minor";
import { getMiraAccount } from "@features/mira/server/session";
import { logMiraEvent } from "@features/mira/server/store";
import {
  deleteRecording,
  getRecording,
  markOpened,
  mayWriteKeyPoints,
  saveKeyPoints,
  sessionTurns,
  writeKeyPoints,
  youShare,
} from "@features/mira/server/voice";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const KEY_POINTS_MS = 40_000;

type Params = { params: Promise<{ id: string }> };

/** The signed-in account's session by its id, or the answer to give instead. */
async function find(request: Request, { params }: Params) {
  const rate = await checkRateLimit(getClientIp(request), {
    bucket: "mira-recording",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return {
      error: NextResponse.json({ error: "Please try again in a minute." }, { status: 429 }),
    };
  }
  const account = await getMiraAccount();
  if (!account) return { error: NextResponse.json({ error: "Please sign in." }, { status: 401 }) };
  if (await isMinor(account.id)) {
    const error = "Mira is only for people aged 18 or older.";
    return { error: NextResponse.json({ error }, { status: 403 }) };
  }
  const id = z
    .string()
    .uuid()
    .safeParse((await params).id);
  const recording = id.success ? await getRecording(account.id, id.data) : null;
  if (!recording) return { error: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  return { account, recording };
}

export async function GET(request: Request, context: Params) {
  try {
    const found = await find(request, context);
    if ("error" in found) return found.error;
    const { account, recording: r } = found;
    const spoken = await sessionTurns(r.chat_id, r.id);
    if (r.key_points?.length && (await markOpened(account.id, r.id))) {
      logMiraEvent("voice_points_opened", { userId: account.id }, { session: r.id });
    }
    return NextResponse.json(
      {
        recording: {
          id: r.id,
          chatId: r.chat_id,
          startedAt: r.started_at,
          endedAt: r.ended_at,
          seconds: r.seconds,
          you: youShare(r),
          keyPoints: r.key_points,
        },
        transcript: spoken.map(({ role, content }) => ({ role, content })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    logger.error({ err }, "mira: could not read a voice session");
    return NextResponse.json({ error: "Unable to load this session." }, { status: 500 });
  }
}

export async function POST(request: Request, context: Params) {
  const started = Date.now();
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  const rate = await checkRateLimit(getClientIp(request), {
    bucket: "mira-voice",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  try {
    const found = await find(request, context);
    if ("error" in found) return found.error;
    const { account, recording: r } = found;
    if (r.key_points !== null) {
      return NextResponse.json({ error: "This session has its key points." }, { status: 409 });
    }
    if (!(await mayWriteKeyPoints(account.id))) {
      return NextResponse.json(
        { error: "Mira is resting for today. Please try again tomorrow." },
        { status: 429 }
      );
    }
    const points = await writeKeyPoints(
      await sessionTurns(r.chat_id, r.id),
      started + KEY_POINTS_MS
    );
    if (!points) {
      return NextResponse.json(
        { error: "Mira couldn't write them just now. Please try again." },
        { status: 503 }
      );
    }
    await saveKeyPoints(account.id, r.id, points);
    return NextResponse.json({ keyPoints: points });
  } catch (err) {
    logger.error({ err }, "mira: key points were not written");
    return NextResponse.json({ error: "Unable to write them right now." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: Params) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  const rate = await checkRateLimit(getClientIp(request), {
    bucket: "mira-voice",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  try {
    const found = await find(request, context);
    if ("error" in found) return found.error;
    await deleteRecording(found.account.id, found.recording);
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "mira: a voice session was not deleted");
    return NextResponse.json(
      { error: "Unable to delete right now. Please try again." },
      { status: 500 }
    );
  }
}
