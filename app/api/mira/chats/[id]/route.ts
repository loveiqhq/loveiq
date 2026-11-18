/** GET /api/mira/chats/[id] — one of the signed-in account's stored chats (board 08a). */
import { NextResponse } from "next/server";
import { getMiraAccount } from "@features/mira/server/session";
import { getMessages, ownsChat } from "@features/mira/server/store";
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
    return NextResponse.json({ messages }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error({ err }, "mira: could not read a chat");
    return NextResponse.json({ error: "Unable to load this chat." }, { status: 500 });
  }
}
