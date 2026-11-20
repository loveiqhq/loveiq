/**
 * GET /api/mira/auth/google?adult=1&terms=1&consent=1 — "Continue with Google" (board 04).
 *
 * The page sends people here only after the same three ticks the emailed code needs, and this
 * route checks them again. It then hands over to Google with a fresh state, nonce and PKCE
 * verifier, kept for 10 minutes in an httpOnly cookie that only the callback can read, with the
 * form's optional ticks (`assessment=1`, `share=1`) and `next` (a Mira page, safeNext) beside them.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  GOOGLE_COOKIE,
  GOOGLE_COOKIE_PATH,
  authorizeUrl,
  googleClient,
  newGoogleStart,
  packStart,
  returnOrigin,
} from "@features/mira/server/google";
import { safeNext } from "@features/mira/server/session";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";

export const dynamic = "force-dynamic";

const ticks = z.object({ adult: z.literal("1"), terms: z.literal("1"), consent: z.literal("1") });

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const back = (why: string) =>
    NextResponse.redirect(
      new URL(
        `/mira/start?google=${why}${next ? `&next=${encodeURIComponent(next)}` : ""}`,
        url.origin
      ),
      303
    );

  const rate = await checkRateLimit(getClientIp(request), {
    bucket: "mira-google",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rate.allowed) return back("busy");
  const client = googleClient();
  const origin = returnOrigin(request.url);
  if (!client || !origin) return back("off");
  if (!ticks.safeParse(Object.fromEntries(url.searchParams)).success) return back("ticks");

  const start = newGoogleStart();
  const choices = {
    useAssessment: url.searchParams.get("assessment") === "1",
    shareRated: url.searchParams.get("share") === "1",
    next,
  };
  (await cookies()).set(GOOGLE_COOKIE, packStart(start, choices), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // sent on Google's top-level redirect back to us
    path: GOOGLE_COOKIE_PATH,
    maxAge: 600,
  });
  return NextResponse.redirect(authorizeUrl(client.id, origin, start), 303);
}
