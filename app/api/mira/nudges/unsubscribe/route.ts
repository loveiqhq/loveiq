/**
 * POST /api/mira/nudges/unsubscribe?t=… : one-click unsubscribe (RFC 8058) from the email's
 * List-Unsubscribe header, so a mail app's own "Unsubscribe" stops every nudge at once. No CSRF
 * check by design: mail providers post it without cookies; the signed token stands for the person.
 * GET (someone opening the address) goes to the preferences page instead of changing anything.
 */
import { NextResponse } from "next/server";
import { stopNudges } from "@features/mira/server/nudge-prefs";
import { readToken } from "@features/mira/server/nudges";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const r = await checkRateLimit(getClientIp(request), {
    bucket: "mira-nudge-unsubscribe",
    limit: 20,
    windowMs: 60_000,
  });
  if (!r.allowed) return new NextResponse("Too many requests", { status: 429 });
  const userId = readToken("prefs", new URL(request.url).searchParams.get("t"));
  if (!userId) return new NextResponse("Invalid link", { status: 403 });
  try {
    await stopNudges(userId, null, "one-click");
    return new NextResponse("Unsubscribed", { status: 200 });
  } catch (err) {
    logger.error({ err }, "mira: one-click unsubscribe failed");
    return new NextResponse("Please try again", { status: 500 });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const t = url.searchParams.get("t") ?? "";
  return NextResponse.redirect(new URL(`/mira/nudges?t=${encodeURIComponent(t)}`, url.origin));
}
