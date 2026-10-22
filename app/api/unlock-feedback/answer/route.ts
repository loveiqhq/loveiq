import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";
import { UNLOCK_REASONS } from "@features/unlock-feedback/logic/reasons";
import { deviceOf, recordAnswer } from "@features/unlock-feedback/server/answer";
import {
  hashLinkToken,
  isLinkTokenShape,
  LINK_COOKIE,
} from "@features/unlock-feedback/server/link";

/**
 * POST /api/unlock-feedback/answer: /why posts the answer its link carried as soon as it has
 * loaded in a browser, which is what makes it count (a scanner's GET of the link records
 * nothing). The first answer is kept, the report is unlocked unless they had already bought,
 * and the page gets what it shows. The token comes from the link's cookie, never the body.
 */
const schema = z.object({
  r: z.enum(UNLOCK_REASONS),
  // The screen takes more than one touch point: tells an iPad from a Mac (shared/http/tablet).
  touch: z.boolean().optional().catch(undefined),
});

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const rateLimit = await checkRateLimit(getClientIp(request), {
    bucket: "unlock-feedback-answer",
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

  // No cookie, an expired one and an unknown token all answer the same 404.
  const token = (await cookies()).get(LINK_COOKIE)?.value;
  if (!isLinkTokenShape(token)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  // Per link too, keyed on its hash so the token itself is never stored.
  const linkLimit = await checkRateLimit(hashLinkToken(token), {
    bucket: "unlock-feedback-answer-link",
    limit: 10,
    windowMs: 60_000,
  });
  if (!linkLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    const result = await recordAnswer({
      device: deviceOf(request.headers.get("user-agent"), parsed.data.touch),
      reason: parsed.data.r,
      token,
    });
    if (!result) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    logger.error({ err }, "Unlock feedback answer failed");
    return NextResponse.json({ error: "Unable to save your answer." }, { status: 500 });
  }
}
