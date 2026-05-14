import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";
import {
  REPORT_SHARE_TOKEN_REGEX,
  resolveShareFromToken,
} from "@features/report/server/shareAccess";
import { buildVerifyCookieHeader } from "@features/report/server/shareVerify";
import { timingSafeEqual } from "crypto";

const schema = z.object({
  shareToken: z.string().regex(REPORT_SHARE_TOKEN_REGEX),
  email: z.string().email().max(320),
});

const RATE_LIMIT = { bucket: "report-share-verify", limit: 10, windowMs: 60_000 };

function constantTimeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rate = await checkRateLimit(ip, RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a moment." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rate.resetAt.getTime() - Date.now()) / 1000)),
        },
      }
    );
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const candidateEmail = parsed.data.email.trim().toLowerCase();

  let share;
  try {
    share = await resolveShareFromToken(parsed.data.shareToken);
  } catch (err) {
    logger.error({ err }, "report-share-verify: resolve failed");
    return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
  }

  // Constant-time email comparison so attackers can't brute-force via timing.
  // Always run the comparison (even if `share` is null) so that response
  // shape AND latency are identical for missing-token vs wrong-email — an
  // attacker with a guessed token cannot distinguish "token invalid" from
  // "token valid, wrong email".
  const ownerStored = share?.share.recipient_email ?? "";
  const emailMatches = constantTimeEqualString(candidateEmail, ownerStored);

  if (!share || !emailMatches) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const cookieHeader = buildVerifyCookieHeader(share.share.id, candidateEmail);
  const response = NextResponse.json({ ok: true });
  response.headers.append("Set-Cookie", cookieHeader);
  return response;
}
