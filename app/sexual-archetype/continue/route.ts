import { NextResponse } from "next/server";
import { PREPAID_TOKEN_REGEX } from "@features/pay-to-start/logic/journey";
import { offerDefinitionOf } from "@features/pay-to-start/logic/offer";
import {
  PREPAID_COOKIE,
  findEntitlementByToken,
  prepaidCookieOptions,
} from "@features/pay-to-start/server/entitlement";
import { claimedReportPathForPayer } from "@features/pay-to-start/server/reportLink";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const runtime = "nodejs";

/**
 * The link in the pay-to-start confirmation email: "come back to this any time".
 *
 * Paid and unused: the entitlement's cookie is set in this browser and the buyer goes to
 * the survey (a draft saved on this device resumes). Used: the report, when the survey
 * was taken under the payer's address (a forwarded link never opens someone else's);
 * otherwise the assessment page says to open it from the report email. Anything else:
 * the assessment page, which says why: the page of the offer that was bought, or the
 * full one for a link that names none. Opening it changes nothing on the server, so a
 * mail scanner that follows the link spends nothing.
 *
 * Only a paid entitlement sets the cookie. The email goes out once the payment is
 * confirmed, so a link to one still pending is not one we sent: setting its cookie would
 * only let someone plant their own checkout in another person's browser.
 */

const RATE_LIMIT = { bucket: "pay-to-start-continue", limit: 20, windowMs: 60_000 };
const LANDING = "/sexual-archetype";

function redirect(request: Request, path: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, request.url), 303);
  response.headers.set("Cache-Control", "no-store");
  // The token is in this URL: never send it on to the next page as a referrer.
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, RATE_LIMIT);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const token = new URL(request.url).searchParams.get("t") ?? "";
  if (!PREPAID_TOKEN_REGEX.test(token)) return redirect(request, `${LANDING}?continue=invalid`);

  try {
    const entitlement = await findEntitlementByToken(token);
    if (!entitlement) return redirect(request, `${LANDING}?continue=invalid`);
    const landing = offerDefinitionOf(entitlement.offer).landingPath;
    if (entitlement.status === "refunded") {
      return redirect(request, `${landing}?continue=refunded`);
    }

    if (entitlement.consumed_submission_id) {
      const reportPath = await claimedReportPathForPayer(entitlement);
      return redirect(
        request,
        reportPath ? `${reportPath}?from=email` : `${landing}?continue=used`
      );
    }

    if (entitlement.status === "succeeded") {
      const response = redirect(request, "/survey");
      response.cookies.set(PREPAID_COOKIE, entitlement.prepaid_token, prepaidCookieOptions());
      return response;
    }

    return redirect(request, `${landing}?continue=unpaid`);
  } catch (err) {
    logger.error({ err }, "pay-to-start: continue link failed");
    return redirect(request, `${LANDING}?continue=error`);
  }
}
