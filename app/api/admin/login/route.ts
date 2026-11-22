import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  ADMIN_TEAM_EMAIL,
  createAdminAuthClient,
  finishAdminSignIn,
  teamSupabasePassword,
} from "@features/admin/server/sign-in";
import { supabaseFetch } from "@features/admin/server/supabase";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";
import { notifySlack } from "@shared/observability/slack";
import { ADMIN_HOME, safeAdminNext } from "@shared/url/admin-next";

const schema = z.object({
  password: z.string().min(1).max(256),
  next: z.string().max(2048).optional(),
});

/**
 * The admin's sign-in: the team password (Eman, 22 Nov 2026: "only login with password just
 * like on staging"), checked by Supabase Auth as the password of the one team account
 * (ADMIN_TEAM_EMAIL). Its session is an ordinary admin session, so the proxy's gate, the idle
 * sign-out, the roles and the audit log work as before. Answers `{ success, next }`, the admin
 * page to open (only ever a same-site admin path), with the session's cookies set.
 */
export async function POST(request: NextRequest) {
  // 1. CSRF
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  // 2. Rate limit: five tries a minute per address.
  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, { bucket: "admin-login", limit: 5, windowMs: 60_000 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000)),
        },
      }
    );
  }

  // 3. Validate
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter the password." }, { status: 400 });
  }
  const supabasePassword = teamSupabasePassword(parsed.data.password);
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    !supabasePassword
  ) {
    logger.error({ ip }, "Admin login: Supabase Auth or ADMIN_TEAM_PASSWORD_SECRET is not set");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }

  // 4. The password, as the team account's: Supabase Auth checks it (mixed with the server's
  // secret) and, when right, writes the session's cookies onto the answer.
  const response = NextResponse.json({
    success: true,
    next: safeAdminNext(parsed.data.next ?? null) ?? ADMIN_HOME,
  });
  const supabase = createAdminAuthClient(request, response);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: ADMIN_TEAM_EMAIL,
    password: supabasePassword,
  });
  const wrong = () => NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  if (error || !data.user) {
    logger.info({ ip, status: error?.status }, "Admin login: wrong password");
    return wrong();
  }

  // 5. The team account must still be an admin (admin_users): taken off it, the password opens
  // nothing, and the session just made is ended. The answer is the wrong password's, so it
  // never tells a guesser they were right.
  let allowed = false;
  try {
    const res = await supabaseFetch(
      `/rest/v1/admin_users?email=eq.${encodeURIComponent(ADMIN_TEAM_EMAIL)}&select=email&limit=1`
    );
    const admins: unknown = await res.json();
    allowed = res.ok && Array.isArray(admins) && admins.length > 0;
  } catch (err) {
    logger.error({ err, ip }, "Admin login: failed to check admin_users");
  }
  if (!allowed) {
    // The session is ended at Supabase through a throwaway answer, so the one sent carries no
    // cookie of it and matches a wrong password's.
    await createAdminAuthClient(request, NextResponse.json({})).auth.signOut({ scope: "local" });
    logger.warn({ ip }, "Admin login: the team account is not in admin_users");
    await notifySlack({
      channel: "ops",
      kind: "admin_login_denied",
      text: ":warning: Admin login *denied*: the team account is not in admin_users",
      username: "ops_alerts",
    });
    return wrong();
  }

  await finishAdminSignIn({
    request,
    response,
    user: { id: data.user.id, email: data.user.email ?? ADMIN_TEAM_EMAIL },
    via: "password",
  });
  return response;
}
