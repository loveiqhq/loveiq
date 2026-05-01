import { NextResponse } from "next/server";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(request: Request) {
  // CSRF verification
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  // Rate limiting
  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "staging-login",
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

  const STAGING_PASSWORD = process.env.STAGING_PASSWORD;
  if (!STAGING_PASSWORD) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { password?: unknown };
  const { password } = body;

  if (!password || typeof password !== "string") {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const expected = await sha256(STAGING_PASSWORD);
  const incoming = await sha256(password);

  if (incoming !== expected) {
    logger.info({ ip }, "Failed staging login attempt");
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set("staging_session", expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // strict matches /api/staging-logout and prevents cross-site form posts
    // from forging staging logins. The staging gate is the only thing
    // protecting pre-prod content — keep CSRF surface minimal.
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  return response;
}
