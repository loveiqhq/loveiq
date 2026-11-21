/**
 * POST /api/mira/journal/reminder?t=… : stops the daily journal reminder. The email's
 * List-Unsubscribe header points here (RFC 8058 one-click), and so does the button on the page
 * its footer link opens. No sign-in or CSRF check by design: mail providers post it without
 * cookies; the signed token (features/mira/server/nudges.ts, as the nudges') stands for the
 * person. It only ever switches an email off, so it works for everyone.
 * GET (someone opening the address) goes to that page instead of changing anything.
 */
import { NextResponse } from "next/server";
import { stopReminder } from "@features/mira/server/journal";
import { readToken } from "@features/mira/server/nudges";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Mail providers post these from shared servers; the token is the gate, this stops a flood.
  const r = await checkRateLimit(getClientIp(request), {
    bucket: "mira-journal-reminder-stop",
    limit: 600,
    windowMs: 60_000,
  });
  if (!r.allowed) return new NextResponse("Too many requests", { status: 429 });
  const userId = readToken("prefs", new URL(request.url).searchParams.get("t"));
  if (!userId) return new NextResponse("Invalid link", { status: 403 });
  try {
    await stopReminder(userId);
    return new NextResponse("Stopped", { status: 200 });
  } catch (err) {
    logger.error({ err }, "mira: a journal reminder was not stopped");
    return new NextResponse("Please try again", { status: 500 });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const t = url.searchParams.get("t") ?? "";
  return NextResponse.redirect(
    new URL(`/mira/journal/reminder?t=${encodeURIComponent(t)}`, url.origin)
  );
}
