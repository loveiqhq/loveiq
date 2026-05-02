import { NextResponse } from "next/server";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { createSupabaseServer } from "@/lib/admin/supabase-server";

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  // Defensive rate limit; logout is authenticated but the endpoint is still
  // a state-changing POST and shouldn't be reachable in a tight loop.
  const rateLimit = await checkRateLimit(getClientIp(request), {
    bucket: "admin-logout",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();

  const response = NextResponse.redirect(new URL("/admin/login", request.url));
  // Clear the old admin_session cookie if still present (backward compat cleanup)
  response.cookies.set("admin_session", "", { maxAge: 0, path: "/" });
  return response;
}
