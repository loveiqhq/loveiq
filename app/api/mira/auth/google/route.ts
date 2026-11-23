/**
 * GET /api/mira/auth/google?adult=1&terms=1&consent=1 — "Continue with Google" (board 04).
 *
 * The page sends people here only after the same three ticks the emailed code needs, and this
 * route checks them again. It then hands over to Google with a fresh state, nonce and PKCE
 * verifier, kept for 10 minutes in an httpOnly cookie that only the callback can read, with the
 * form's optional tick (`assessment=1`) and `next` (a Mira page, safeNext) beside them.
 *
 * GET /api/mira/auth/google?connect=1 — Settings' "Connect Google" (22 Nov 2026): for the
 * signed-in account, no ticks (it signs nobody in), Google asked for the account's own address;
 * the callback records it only if Google confirms exactly that address. Never for staff or anyone
 * Mira stopped as under 18. Answers go back to Settings (`?google=…#security`).
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
import { isMinor } from "@features/mira/server/minor";
import { getMiraAccount, safeNext } from "@features/mira/server/session";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";

export const dynamic = "force-dynamic";

const ticks = z.object({ adult: z.literal("1"), terms: z.literal("1"), consent: z.literal("1") });

/**
 * The ticks (required and optional) count only when the click came from our own sign-up page,
 * so another site's link can't tick them for someone: the browser's Sec-Fetch-Site, or the
 * referrer where a browser doesn't send it. Anything else goes back to the form to tick there.
 */
function fromOurPage(request: Request, origin: string): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const ref = request.headers.get("referer");
  if (!ref) return false;
  try {
    return new URL(ref).origin === origin;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const connect = url.searchParams.get("connect") === "1";
  const next = connect ? null : safeNext(url.searchParams.get("next"));
  const back = (why: string) =>
    NextResponse.redirect(
      new URL(
        connect
          ? `/mira/settings?google=${why}#security`
          : `/mira/start?google=${why}${next ? `&next=${encodeURIComponent(next)}` : ""}`,
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
  if (!fromOurPage(request, url.origin)) return back(connect ? "failed" : "ticks");
  let hint: string | undefined;
  if (connect) {
    const account = await getMiraAccount();
    if (!account) {
      return NextResponse.redirect(new URL("/mira/start?next=%2Fmira%2Fsettings", url.origin), 303);
    }
    if (await isMinor(account.id)) return back("minor");
    hint = account.email;
  } else if (!ticks.safeParse(Object.fromEntries(url.searchParams)).success) {
    return back("ticks");
  }

  const start = newGoogleStart();
  const choices = {
    useAssessment: !connect && url.searchParams.get("assessment") === "1",
    next,
    ...(connect ? { connect: true } : {}),
  };
  (await cookies()).set(GOOGLE_COOKIE, packStart(start, choices), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // sent on Google's top-level redirect back to us
    path: GOOGLE_COOKIE_PATH,
    maxAge: 600,
  });
  return NextResponse.redirect(authorizeUrl(client.id, origin, start, hint), 303);
}
