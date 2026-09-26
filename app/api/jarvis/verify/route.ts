/**
 * POST /api/jarvis/verify — exchange the emailed code for a signed-in session (a Supabase
 * Auth cookie on this site), then back to /jarvis/connect to approve Claude.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "@features/admin/server/supabase-server";
import { SIGN_IN_CODE } from "@features/brain/server/connect";
import { memberByEmail } from "@features/brain/server/sign-in";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  code: z.string().trim().regex(SIGN_IN_CODE),
});

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  const rate = await checkRateLimit(getClientIp(request), {
    bucket: "jarvis-verify",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: "Please try again in a minute." }, { status: 429 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "The code is the number in the email." }, { status: 400 });
  }
  const { email } = parsed.data;

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token: parsed.data.code,
    type: "email",
  });
  if (error) {
    logger.info({ reason: error.message }, "jarvis: a sign-in code was refused");
    return NextResponse.json(
      { error: "That code did not work. Check it, or send a new one." },
      { status: 400 }
    );
  }
  // Checked again after sign-in: a code only exists for a member, but membership can end
  // between the email and the typing.
  const member = await memberByEmail(email).catch(() => null);
  if (!member) {
    await supabase.auth.signOut();
    return NextResponse.json({ error: `${email} cannot use Jarvis.` }, { status: 403 });
  }
  return NextResponse.json({ success: true });
}
