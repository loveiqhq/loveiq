import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/admin/supabase-server";
import { supabaseFetch } from "@/lib/admin/supabase";
import { logAdminAction } from "@/lib/admin/audit";
import { getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/admin/login?error=missing_code", origin));
  }

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    logger.error({ error: error.message }, "Admin auth callback failed");
    return NextResponse.redirect(new URL("/admin/login?error=auth_failed", origin));
  }

  // Get authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/admin/login?error=no_email", origin));
  }

  // Check admin_users allowlist
  const res = await supabaseFetch(
    `/rest/v1/admin_users?email=eq.${encodeURIComponent(user.email)}&select=email,role&limit=1`
  );
  const admins = await res.json();

  if (!res.ok || !Array.isArray(admins) || admins.length === 0) {
    // Not in allowlist — sign out immediately
    await supabase.auth.signOut();
    logger.info(
      { email: user.email, ip: getClientIp(request) },
      "Admin login denied: not in allowlist"
    );
    return NextResponse.redirect(new URL("/admin/login?error=not_authorized", origin));
  }

  // Log successful login
  const ip = getClientIp(request);
  await logAdminAction({
    admin_email: user.email,
    action: "login",
    ip,
  });

  return NextResponse.redirect(new URL("/admin", origin));
}
