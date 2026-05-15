import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseFetch } from "@features/admin/server/supabase";
import { logAdminAction } from "@features/admin/server/audit";
import { getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

/**
 * Creates a Supabase client that reads cookies from the request and writes
 * them onto a NextResponse object. This is the same pattern used by
 * middleware (createSupabaseMiddleware) and is required when the route
 * returns an explicit NextResponse.redirect() — the next/headers cookies()
 * API does NOT propagate to explicit redirect responses.
 */
function createCallbackClient(request: NextRequest, response: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (!tokenHash || type !== "magiclink") {
    return NextResponse.redirect(new URL("/admin/login?error=missing_code", origin));
  }

  // Create redirect response first — auth cookies will be set on this object
  const redirectToAdmin = NextResponse.redirect(new URL("/admin", origin));
  const supabase = createCallbackClient(request, redirectToAdmin);

  // verifyOtp with token_hash does not require PKCE code_verifier,
  // so it works even when the link is opened in a different browser context.
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });

  if (error) {
    logger.error({ error: error.message }, "Admin auth callback failed");
    return NextResponse.redirect(new URL("/admin/login?error=auth_failed", origin));
  }

  // Get authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    // Sign out — need a fresh redirect so signOut cookies propagate
    const loginRedirect = NextResponse.redirect(new URL("/admin/login?error=no_email", origin));
    const signOutClient = createCallbackClient(request, loginRedirect);
    await signOutClient.auth.signOut();
    return loginRedirect;
  }

  // Check admin_users allowlist
  const res = await supabaseFetch(
    `/rest/v1/admin_users?email=eq.${encodeURIComponent(user.email)}&select=email,role&limit=1`
  );
  const admins = await res.json();

  if (!res.ok || !Array.isArray(admins) || admins.length === 0) {
    // Not in allowlist — sign out with cookies on the error redirect
    const loginRedirect = NextResponse.redirect(
      new URL("/admin/login?error=not_authorized", origin)
    );
    const signOutClient = createCallbackClient(request, loginRedirect);
    await signOutClient.auth.signOut();
    logger.info(
      { email: user.email, ip: getClientIp(request) },
      "Admin login denied: not in allowlist"
    );
    return loginRedirect;
  }

  // Log successful login
  const ip = getClientIp(request);
  await logAdminAction({
    admin_email: user.email,
    action: "login",
    ip,
  });

  return redirectToAdmin;
}
