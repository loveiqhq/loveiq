import { NextResponse } from "next/server";
import { PREPAID_TOKEN_REGEX } from "@features/pay-to-start/logic/journey";
import {
  PREPAID_COOKIE,
  findEntitlementByToken,
  prepaidCookieOptions,
} from "@features/pay-to-start/server/entitlement";
import { lookupReportTokenBySubmissionId } from "@features/report/server/personalReport";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const runtime = "nodejs";

/**
 * The link in the pay-to-start confirmation email: "come back to this any time".
 *
 * Paid and unused: the entitlement's cookie is set in this browser and the buyer goes to
 * the survey (a draft saved on this device resumes). Used: their report. Anything else:
 * the assessment page, which says why. Opening it changes nothing on the server, so a
 * mail scanner that follows the link spends nothing.
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
    if (entitlement.status === "refunded") return redirect(request, `${LANDING}?continue=refunded`);

    if (entitlement.consumed_submission_id) {
      const reportToken = await lookupReportTokenBySubmissionId(entitlement.consumed_submission_id);
      return redirect(
        request,
        reportToken ? `/report/${encodeURIComponent(reportToken)}?from=email` : "/report?from=email"
      );
    }

    if (entitlement.status === "succeeded") {
      const response = redirect(request, "/survey");
      response.cookies.set(PREPAID_COOKIE, entitlement.prepaid_token, prepaidCookieOptions());
      return response;
    }

    // Pending: the payment is still settling. The status page waits for it.
    if (entitlement.status === "pending" && entitlement.stripe_session_id) {
      const response = redirect(
        request,
        `${LANDING}/checkout?session_id=${encodeURIComponent(entitlement.stripe_session_id)}`
      );
      response.cookies.set(PREPAID_COOKIE, entitlement.prepaid_token, prepaidCookieOptions());
      return response;
    }
    return redirect(request, `${LANDING}?continue=unpaid`);
  } catch (err) {
    logger.error({ err }, "pay-to-start: continue link failed");
    return redirect(request, `${LANDING}?continue=error`);
  }
}
