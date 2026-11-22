/**
 * POST /api/mira/journal/unsubscribe : stops the daily journal reminder. The email's
 * List-Unsubscribe header points here with `?t=…` (RFC 8058 one-click, the one way a mail app can
 * carry it), and the button on the page its footer link opens posts JSON `{ t }`: a page never
 * puts the token in an address (DATA-1), and a JSON post's address is not read. No sign-in or CSRF
 * check by design: mail providers post it without cookies; the signed token stands for the person,
 * with its own purpose ("journal-stop", features/mira/server/nudges.ts), so it can't open the nudge
 * preferences and theirs can't be used here. It only ever switches an email off, so it works for
 * everyone. GET (someone opening the address) goes to that page instead of changing anything.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { stopReminder } from "@features/mira/server/journal";
import { readToken } from "@features/mira/server/nudges";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";

const pageBody = z.object({ t: z.string().max(200) });

export async function POST(request: Request) {
  // Mail providers post these from shared servers; the token is the gate, this stops a flood.
  const r = await checkRateLimit(getClientIp(request), {
    bucket: "mira-journal-reminder-stop",
    limit: 600,
    windowMs: 60_000,
  });
  if (!r.allowed) return new NextResponse("Too many requests", { status: 429 });
  const page = (request.headers.get("content-type") ?? "").includes("application/json");
  const t = page
    ? pageBody.safeParse(await request.json().catch(() => null)).data?.t
    : new URL(request.url).searchParams.get("t");
  const userId = readToken("journal-stop", t);
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
