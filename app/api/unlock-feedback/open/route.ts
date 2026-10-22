import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { isUnlockReason } from "@features/unlock-feedback/logic/reasons";
import {
  isLinkTokenShape,
  LINK_COOKIE,
  LINK_COOKIE_MAX_AGE_S,
  LINK_COOKIE_PATH,
} from "@features/unlock-feedback/server/link";

/**
 * GET /api/unlock-feedback/open?r=<reason>&t=<token>: where each of the email's eight answers
 * links. It records NOTHING: mail scanners (Outlook, Gmail, company filters) open every link
 * with a plain GET, so an answer counts only when /why has loaded in a browser and posted it.
 *
 * It moves the token into an httpOnly cookie and redirects to `/why?r=<reason>`, so the token
 * is in no page URL, referrer or analytics payload. A link that isn't one (an unknown reason,
 * a token of the wrong shape) gets no cookie, and any earlier one is cleared, so /why shows
 * its "link doesn't work" state. No lookup here: whether a token exists is never told.
 */
export async function GET(request: NextRequest) {
  const rateLimit = await checkRateLimit(getClientIp(request), {
    bucket: "unlock-feedback-open",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const params = request.nextUrl.searchParams;
  const reason = params.get("r");
  const token = params.get("t");
  const valid = isUnlockReason(reason);
  const response = NextResponse.redirect(
    new URL(valid ? `/why?r=${reason}` : "/why", request.url),
    303
  );
  response.headers.set("Cache-Control", "no-store");
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: LINK_COOKIE_PATH,
  };
  if (valid && isLinkTokenShape(token)) {
    response.cookies.set(LINK_COOKIE, token, { ...options, maxAge: LINK_COOKIE_MAX_AGE_S });
  } else {
    response.cookies.set(LINK_COOKIE, "", { ...options, maxAge: 0 });
  }
  return response;
}
