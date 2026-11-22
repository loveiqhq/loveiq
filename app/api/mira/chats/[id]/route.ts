/**
 * GET /api/mira/chats/[id] — one of the signed-in account's stored chats (board 08a), with the
 * goals Mira offered in it and, as `added`, those already among the account's goals (round-2
 * audit CHAT-9: a reopened chat shows "Add as a goal" or "Added" again).
 * DELETE — deletes that chat, after the chat page's confirm (round-2 audit CHAT-29, lead decision
 * 4): its messages and voice sessions go with it. Never refused for an account stopped as under 18.
 */
import { NextResponse } from "next/server";
import { getMiraAccount } from "@features/mira/server/session";
import {
  deleteChat,
  getMessages,
  goalTexts,
  logMiraEvent,
  ownsChat,
} from "@features/mira/server/store";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rate = await checkRateLimit(getClientIp(request), {
    bucket: "mira-me",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return NextResponse.json({ error: "Please try again in a minute." }, { status: 429 });
  const account = await getMiraAccount();
  if (!account) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { id } = await params;
  try {
    if (!(await ownsChat(account.id, id))) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    const messages = await getMessages(account.id, id);
    const offered = new Set(messages.map((m) => m.goal).filter(Boolean));
    // Only for a chat with an offer. Goals that can't be read show the offer: the chat still
    // opens, and a tap could add a goal they already have (adding doesn't check for twins).
    const added = offered.size
      ? (await goalTexts(account.id).catch(() => [])).filter((t) => offered.has(t))
      : [];
    return NextResponse.json({ messages, added }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error({ err }, "mira: could not read a chat");
    return NextResponse.json({ error: "Unable to load this chat." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  const rate = await checkRateLimit(getClientIp(request), {
    bucket: "mira-chat-delete",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return NextResponse.json({ error: "Please try again in a minute." }, { status: 429 });
  const account = await getMiraAccount();
  if (!account) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { id } = await params;
  try {
    if (!(await deleteChat(account.id, id))) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    logMiraEvent("chat_deleted", { userId: account.id });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "mira: could not delete a chat");
    return NextResponse.json({ error: "Unable to delete this chat." }, { status: 500 });
  }
}
