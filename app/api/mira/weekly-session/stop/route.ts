/**
 * /api/mira/weekly-session/stop?t=… : the stop behind every weekly-session email. Its token is
 * signed for this one purpose ("session-stop", features/mira/server/nudges.ts LinkPurpose) and the
 * account, so no sign-in is needed, and it can only pause the reminders: never cancel, change or
 * open anything, and no other link's token works here (nor this one elsewhere). A forwarded email
 * can do no more than its own stop link. Changing or cancelling the session needs the sign-in.
 *
 *   POST, not JSON   → one-click unsubscribe (RFC 8058) from the List-Unsubscribe header. No CSRF
 *                      check by design: mail providers post it without cookies; the token is the gate.
 *   POST, JSON { action: "pause" } → the stop page's button, CSRF-checked
 *   GET              → someone opening the address: the stop page, changing nothing
 *
 * Someone Mira stopped as under 18 is refused (403).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { isMinor } from "@features/mira/server/minor";
import { readToken } from "@features/mira/server/nudges";
import { logMiraEvent } from "@features/mira/server/store";
import { setPaused } from "@features/mira/server/weekly-sessions";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";

const schema = z.object({ action: z.literal("pause") }).strict();

export async function POST(request: Request) {
  // Mail providers post one-click stops from shared servers, so one address carries many people's;
  // the signed token is the real gate, and this only stops a flood.
  const r = await checkRateLimit(getClientIp(request), {
    bucket: "mira-session-stop",
    limit: 600,
    windowMs: 60_000,
  });
  if (!r.allowed) return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  const userId = readToken("session-stop", new URL(request.url).searchParams.get("t"));
  if (!userId) return NextResponse.json({ error: "Invalid link." }, { status: 403 });
  try {
    if (await isMinor(userId)) {
      return NextResponse.json({ error: "Not available." }, { status: 403 });
    }
    const page = (request.headers.get("content-type") ?? "").includes("application/json");
    if (page) {
      if (!(await verifyCsrfToken(request))) {
        return NextResponse.json({ error: "Invalid request." }, { status: 403 });
      }
      const parsed = schema.safeParse(await request.json().catch(() => ({})));
      if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const slot = await setPaused(userId, true);
    if (slot) logMiraEvent("session_paused", { userId }, { source: page ? "email" : "one-click" });
    return NextResponse.json({ success: true, booked: Boolean(slot) });
  } catch (err) {
    logger.error({ err }, "mira: a weekly-session stop failed");
    return NextResponse.json({ error: "Please try again." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const t = url.searchParams.get("t") ?? "";
  return NextResponse.redirect(
    new URL(`/mira/session/stop?t=${encodeURIComponent(t)}`, url.origin)
  );
}
