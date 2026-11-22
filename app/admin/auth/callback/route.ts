import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_TEAM_EMAIL,
  createAdminAuthClient as createCallbackClient,
  finishAdminSignIn,
} from "@features/admin/server/sign-in";
import { supabaseFetch } from "@features/admin/server/supabase";
import { getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";
import { notifySlack, maskEmail, escapeSlack } from "@shared/observability/slack";
import { ADMIN_HOME, safeAdminNext } from "@shared/url/admin-next";

/**
 * The one-time link's landing: an operator's way in (a link minted with the service key for the
 * team account, e.g. for a signed-in check). The team signs in with the team password
 * (app/api/admin/login); nothing emails these links any more, and the admin opens only for the
 * team account (22 Nov 2026). Sign-outs here are this browser's only: the team account's other
 * sessions are the teammates'.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (!tokenHash || type !== "magiclink") {
    return NextResponse.redirect(new URL("/admin/login?error=missing_code", origin));
  }

  // Create redirect response first — auth cookies will be set on this object. A sign-in lands
  // on the page its link was for (`next`, only ever a same-site admin path: safeAdminNext),
  // else on AP-Analytics' Dashboard, the whole admin since 16 Oct 2026.
  const back = safeAdminNext(searchParams.get("next")) ?? ADMIN_HOME;
  const redirectToAdmin = NextResponse.redirect(new URL(back, origin));
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
    await signOutClient.auth.signOut({ scope: "local" });
    return loginRedirect;
  }

  // Only the team account, and only while it is on the admin_users allowlist.
  const team = user.email.toLowerCase() === ADMIN_TEAM_EMAIL;
  const res = team
    ? await supabaseFetch(
        `/rest/v1/admin_users?email=eq.${encodeURIComponent(ADMIN_TEAM_EMAIL)}&select=email,role&limit=1`
      )
    : null;
  const admins: unknown = res ? await res.json() : [];

  if (!res?.ok || !Array.isArray(admins) || admins.length === 0) {
    // Not allowed — sign out with cookies on the error redirect
    const loginRedirect = NextResponse.redirect(
      new URL("/admin/login?error=not_authorized", origin)
    );
    const signOutClient = createCallbackClient(request, loginRedirect);
    await signOutClient.auth.signOut({ scope: "local" });
    logger.info(
      { email: user.email, ip: getClientIp(request) },
      "Admin login denied: not the team account, or not in allowlist"
    );
    await notifySlack({
      channel: "ops",
      kind: "admin_login_denied",
      text: `:warning: Admin login *denied* — ${escapeSlack(maskEmail(user.email))} is not the team account, or not in the allowlist`,
      username: "ops_alerts",
    });
    return loginRedirect;
  }

  await finishAdminSignIn({
    request,
    response: redirectToAdmin,
    user: { id: user.id, email: user.email },
    via: "link",
  });
  return redirectToAdmin;
}
