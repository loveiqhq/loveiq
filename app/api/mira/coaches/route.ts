/**
 * GET /api/mira/coaches — what the coaches' pieces of Mira need (features/mira/ui/coaches): the
 * signed-in person's name and email (the frame), whether "Remember our conversations" is on, their
 * chats' topics (none while it is off: picks from chats follow that switch), the coming-soon
 * coaches they asked to hear about, and their chat titles for Home's search. Their own rows only.
 * Someone Mira stopped as under 18 is refused (403), like Mira's other routes.
 *
 * DELETE ?notify=<coach id> — takes back "Notify me" for a coming-soon coach (its requests are
 * deleted). Never refused for age: taking something back always works.
 */
import { NextResponse } from "next/server";
import { COACHES } from "@features/mira/content/coaches";
import { readCoachState, stopNotify } from "@features/mira/server/coaches";
import { MINOR_REFUSAL } from "@features/mira/server/goals";
import { isMinor } from "@features/mira/server/minor";
import { getMiraAccount } from "@features/mira/server/session";
import { getProfile, listChats } from "@features/mira/server/store";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";

async function limited(request: Request) {
  const rate = await checkRateLimit(getClientIp(request), {
    bucket: "mira-coaches",
    limit: 60,
    windowMs: 60_000,
  });
  return rate.allowed
    ? null
    : NextResponse.json({ error: "Please try again in a minute." }, { status: 429 });
}

export async function DELETE(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  const refused = await limited(request);
  if (refused) return refused;
  const account = await getMiraAccount();
  if (!account) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const wanted = new URL(request.url).searchParams.get("notify");
  const coach = COACHES.find((c) => c.id === wanted && !c.live);
  if (!coach) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    await stopNotify(account.id, coach.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "mira: a Notify me was not taken back");
    return NextResponse.json(
      { error: "That didn't go through. Please try again." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const refused = await limited(request);
  if (refused) return refused;
  const account = await getMiraAccount();
  if (!account) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  try {
    if (await isMinor(account.id)) {
      return NextResponse.json(MINOR_REFUSAL, { status: 403 });
    }
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
