/**
 * What every admin sign-in does once Supabase holds a session for the team account: the team
 * password (app/api/admin/login) and an operator's one-time link (app/admin/auth/callback).
 */
import { createHmac } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { logAdminAction } from "@features/admin/server/audit";
import { ADMIN_TEAM_EMAIL } from "@shared/auth/admin-team";
import { getClientIp } from "@shared/http/ratelimit";
import { TEAM_COOKIE, teamCookieOptions } from "@shared/http/team-cookie";
import { notifySlack } from "@shared/observability/slack";

export { ADMIN_TEAM_EMAIL };

/**
 * The password Supabase holds for the team account: the typed password mixed with the
 * server-only ADMIN_TEAM_PASSWORD_SECRET (HMAC-SHA256). Supabase's own sign-in endpoint is open
 * to anyone with the project's public key, so the team password alone must open nothing there:
 * every sign-in goes through /api/admin/login, with its rate limit, audit row and #ops post
 * (security review, 22 Nov 2026). Null when the secret is unset or too short.
 */
export function teamSupabasePassword(password: string): string | null {
  const secret = process.env.ADMIN_TEAM_PASSWORD_SECRET;
  if (!secret || secret.length < 32) return null;
  return createHmac("sha256", secret).update(password).digest("base64url");
}

/**
 * A Supabase client that reads the request's cookies and writes the session's onto `response`
 * (a JSON answer or a redirect: next/headers' cookies() reaches neither). The SDK's own options
 * leave the session readable by page scripts (httpOnly false); nothing in the browser reads it,
 * so httpOnly, sameSite and secure are forced.
 */
export function createAdminAuthClient(request: NextRequest, response: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value)); // nosemgrep
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              sameSite: "lax",
              secure: process.env.NODE_ENV === "production",
            }); // nosemgrep
          });
        },
      },
    }
  );
}

/**
 * The bookkeeping after a sign-in: the audit row and the #ops post, the cookies the admin's pages
 * read (PostHog's admin id, the idle clock, the team browser mark), and a fresh CSRF token for
 * the new privilege. It never ends other sessions: they are the teammates' (T-15's one session
 * per person ended with personal sign-ins, 22 Nov 2026).
 */
export async function finishAdminSignIn({
  request,
  response,
  user,
  via,
}: {
  request: NextRequest;
  response: NextResponse;
  user: { id: string; email: string };
  via: "password" | "link";
}): Promise<void> {
  const ip = getClientIp(request);
  await logAdminAction({ admin_email: user.email, action: "login", ip });
  await notifySlack({
    channel: "ops",
    kind: "admin_login",
    text:
      via === "password"
        ? ":lock: Admin login with the team password"
        : ":lock: Admin login with an operator's one-time link",
    username: "ops_alerts",
  });

  // The admin's Supabase id for PostHog's admin identity, only under /admin, so public-site
  // activity is never tied to an administrator.
  response.cookies.set("admin_posthog_distinct_id", user.id, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    maxAge: 7 * 24 * 60 * 60,
  });
  // R-13: a sign-in is activity. A stamp left from an earlier session that idled out (the proxy
  // keeps it 7 days) would otherwise bounce the first page after it to "idle timeout".
  response.cookies.set("__admin_activity", String(Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  // A teammate's browser: what it does on Mira stays out of the numbers (shared/http/team-cookie).
  response.cookies.set(TEAM_COOKIE, "1", teamCookieOptions());
  // R-03: a new CSRF token for the new privilege; the proxy mints it on the next request. A
  // browser drops a __Host- cookie's Set-Cookie unless it is Secure with Path=/, so a bare
  // delete() never removed it in production.
  response.cookies.set("__Host-csrf", "", {
    path: "/",
    secure: true,
    sameSite: "strict",
    maxAge: 0,
  });
  response.cookies.delete("__csrf");
}
