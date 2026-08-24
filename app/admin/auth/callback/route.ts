import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseFetch } from "@features/admin/server/supabase";
import { logAdminAction } from "@features/admin/server/audit";
import { getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";
import { notifySlack, maskEmail, escapeSlack } from "@shared/observability/slack";

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
          // Supabase SSR sets browser cookies via `options` it constructs
          // itself: sameSite="lax", httpOnly=true, secure=true in prod, path="/".
          // Semgrep can't statically prove that across the SDK boundary —
          // the rule fires on any literal containing a `sameSite` key. The
          // OVERRIDE below forces sameSite=lax + secure regardless of what
          // the SDK passes, so the final cookie is provably safe.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value)); // nosemgrep
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, {
              ...options,
              sameSite: "lax",
              secure: process.env.NODE_ENV === "production",
            }); // nosemgrep
          });
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
    /*
     * A spent link is the NORMAL case here, not an incident. These tokens are
     * single-use, so the second interaction with the same email always lands in
     * this branch — paste the URL, then click the button, and the click fails.
     *
     * Previously that threw the visitor to /admin/login?error=auth_failed even
     * when the first interaction had already signed them in successfully, which
     * is how a working session ends up looking like a lockout. If the request
     * already carries a valid session, honour it and send them where the link was
     * taking them anyway. /admin re-checks the session and the allowlist itself
     * (verifyAdminSession), so this cannot grant access on its own.
     */
    const { data: existing } = await supabase.auth.getUser();
    if (existing.user?.email) {
      logger.info(
        { email: existing.user.email },
        "Admin auth callback: link already spent, but the session is valid — continuing"
      );
      return redirectToAdmin;
    }

    // logger.warn, not logger.error: error mirrors to the ops Slack channel in
    // production, and a re-clicked sign-in link is not something to page anyone about.
    logger.warn({ error: error.message }, "Admin auth callback failed");
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
    await notifySlack({
      channel: "ops",
      kind: "admin_login_denied",
      text: `:warning: Admin login *denied* — ${escapeSlack(maskEmail(user.email))} not in allowlist`,
      username: "ops_alerts",
    });
    return loginRedirect;
  }

  // Log successful login
  const ip = getClientIp(request);
  await logAdminAction({
    admin_email: user.email,
    action: "login",
    ip,
  });
  await notifySlack({
    channel: "ops",
    kind: "admin_login",
    text: `:lock: Admin login — *${escapeSlack(user.email)}*`,
    username: "ops_alerts",
  });

  // Make the authenticated user's immutable Supabase ID available to the admin
  // client for PostHog identification. Scope it to /admin so public-site
  // activity is never associated with an administrator account.
  redirectToAdmin.cookies.set("admin_posthog_distinct_id", user.id, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    maxAge: 7 * 24 * 60 * 60,
  });

  // R-03: rotate the CSRF cookie on privilege change. Clearing both prod and
  // dev names is a no-op for whichever one isn't present in the request. The
  // middleware re-mints a fresh CSRF value on the next request.
  redirectToAdmin.cookies.delete("__Host-csrf");
  redirectToAdmin.cookies.delete("__csrf");

  // T-15: kill all OTHER active sessions for this admin user, keeping
  // only the just-minted one. Stops the "magic link clicked on phone
  // then laptop then public computer = three live sessions" failure
  // mode. Supabase's `scope: "others"` revokes every refresh token
  // EXCEPT the current request's, so this user's prior browser tabs
  // are forced to re-auth on the next request. Best-effort: a failure
  // here doesn't block the successful login; ops sees it in the
  // audit log if the warn fires.
  try {
    await supabase.auth.signOut({ scope: "others" });
  } catch (err) {
    logger.warn({ err, email: user.email }, "T-15: failed to revoke other admin sessions on login");
  }

  return redirectToAdmin;
}
