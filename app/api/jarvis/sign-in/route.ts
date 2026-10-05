/**
 * POST /api/jarvis/sign-in — email a one-time sign-in code to a Jarvis member.
 *
 * The same answer whether or not the address is a member, and a non-member gets no email,
 * so this cannot be used to learn who is on the list. See features/brain/server/connect.ts.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { sendSignInCode } from "@features/brain/server/connect";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(320) });

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  const rate = await checkRateLimit(getClientIp(request), {
    bucket: "jarvis-sign-in",
    limit: 5,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: "Please try again in a minute." }, { status: 429 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter your @loveiq.org email address." }, { status: 400 });
  }
  try {
    if (!(await sendSignInCode(parsed.data.email))) {
      return NextResponse.json(
        { error: "The code could not be sent. Try again." },
        { status: 500 }
      );
    }
  } catch (err) {
    logger.error({ err }, "jarvis: sign-in code failed");
    return NextResponse.json({ error: "The code could not be sent. Try again." }, { status: 500 });
  }
  return NextResponse.json({
    success: true,
    message: "If that address can use Jarvis, a code is on its way.",
  });
}
