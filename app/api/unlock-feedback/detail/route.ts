import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";
import { UNLOCK_REASONS } from "@features/unlock-feedback/logic/reasons";
import { recordDetail } from "@features/unlock-feedback/server/answer";
import {
  hashLinkToken,
  isLinkTokenShape,
  LINK_COOKIE,
} from "@features/unlock-feedback/server/link";

/**
 * POST /api/unlock-feedback/detail: the optional follow-up on /why ("Open my report" with
 * chips picked, words written or the answer changed). Only for an answer already recorded;
 * chips the reason doesn't offer are dropped, the words cleaned (answer.ts). The token comes
 * from the link's cookie.
 */
const schema = z.object({
  reason: z.enum(UNLOCK_REASONS).optional(),
  chips: z.array(z.string().max(200)).max(20),
  // The page's box takes 2,000 characters, as many as the column holds.
  note: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const rateLimit = await checkRateLimit(getClientIp(request), {
    bucket: "unlock-feedback-detail",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const token = (await cookies()).get(LINK_COOKIE)?.value;
  if (!isLinkTokenShape(token)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const linkLimit = await checkRateLimit(hashLinkToken(token), {
    bucket: "unlock-feedback-detail-link",
    limit: 10,
    windowMs: 60_000,
  });
  if (!linkLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    const saved = await recordDetail({ ...parsed.data, token });
    if (!saved) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Unlock feedback detail failed");
    return NextResponse.json({ error: "Unable to save your answer." }, { status: 500 });
  }
}
