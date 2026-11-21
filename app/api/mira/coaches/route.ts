/**
 * GET /api/mira/coaches — what the coaches' pieces of Mira need (features/mira/ui/coaches): the
 * signed-in person's name and email (the frame), whether "Remember our conversations" is on, their
 * chats' topics (none while it is off: picks from chats follow that switch), the coming-soon
 * coaches they asked to hear about, and their chat titles for Home's search. Their own rows only.
 */
import { NextResponse } from "next/server";
import { readCoachState } from "@features/mira/server/coaches";
import { getMiraAccount } from "@features/mira/server/session";
import { getProfile, listChats } from "@features/mira/server/store";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rate = await checkRateLimit(getClientIp(request), {
    bucket: "mira-coaches",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: "Please try again in a minute." }, { status: 429 });
  }
  const account = await getMiraAccount();
  if (!account) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  try {
    const [profile, chats, state] = await Promise.all([
      getProfile(account.id),
      listChats(account.id),
      readCoachState(account.id),
    ]);
    if (!profile) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    return NextResponse.json(
      {
        name: profile.name,
        email: profile.email,
        remember: profile.remember_chats,
        topics: profile.remember_chats ? state.topics : [],
        notified: state.notified,
        chats,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    logger.error({ err }, "mira: could not read the coaches");
    return NextResponse.json({ error: "Unable to load your coaches." }, { status: 500 });
  }
}
