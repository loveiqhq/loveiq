import { NextResponse } from "next/server";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import { createSupabaseServer } from "@/lib/admin/supabase-server";
import logger from "@/lib/logger";
import { z } from "zod";

const schema = z.object({
  email: z
    .string()
    .email()
    .max(320)
    .transform((e) => e.toLowerCase().trim()),
});

export async function POST(request: Request) {
  // 1. CSRF
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  // 2. Rate limit
  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-login",
    limit: 5,
    windowMs: 60_000,
  });
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
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email." }, { status: 400 });
  }

  const { email } = parsed.data;

  // 4. Check admin_users (silent fail — don't reveal allowlist)
  try {
    const res = await supabaseFetch(
      `/rest/v1/admin_users?email=eq.${encodeURIComponent(email)}&select=email&limit=1`
    );
    const admins = await res.json();

    if (!res.ok || !Array.isArray(admins) || admins.length === 0) {
      // NOT in allowlist — log but return same generic response
      logger.info({ ip, email }, "Admin login attempt: email not in allowlist");
      return NextResponse.json({
        success: true,
        message: "If your email is registered, check your inbox.",
      });
    }
  } catch {
    logger.error({ ip, email }, "Admin login: failed to check admin_users");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }

  // 5. Send magic link
  try {
    const supabase = await createSupabaseServer();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${siteUrl}/admin/auth/callback`,
      },
    });

    if (error) {
      logger.error({ error: error.message, ip }, "Failed to send magic link");
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }
  } catch (err) {
    logger.error({ err, ip }, "Magic link send error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }

  // 6. Generic response (same whether email is in allowlist or not)
  return NextResponse.json({
    success: true,
    message: "If your email is registered, check your inbox.",
  });
}
