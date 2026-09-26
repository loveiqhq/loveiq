/** POST /api/jarvis/sign-out — forget this browser's sign-in, to use another address. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "@features/admin/server/supabase-server";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";

/** It takes no arguments; anything sent is refused rather than ignored. */
const schema = z.object({}).strict();

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  const rate = await checkRateLimit(getClientIp(request), {
    bucket: "jarvis-sign-out",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: "Please try again in a minute." }, { status: 429 });
  }
  if (!schema.safeParse(await request.json().catch(() => ({}))).success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  return NextResponse.json({ success: true });
}
