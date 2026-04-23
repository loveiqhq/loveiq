import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseMiddleware } from "./lib/supabase-middleware";
import logger from "./lib/logger";

const isProduction = process.env.NODE_ENV === "production";
const CSRF_COOKIE_NAME = isProduction ? "__Host-csrf" : "__csrf";
const CSRF_TOKEN_LENGTH = 32;

function generateCsrfToken(): string {
  const array = new Uint8Array(CSRF_TOKEN_LENGTH);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function proxy(request: NextRequest) {
  // Staging gate: when STAGING_PASSWORD is set, require a valid session cookie
  const STAGING_PASSWORD = process.env.STAGING_PASSWORD;
  if (STAGING_PASSWORD) {
    const path = request.nextUrl.pathname;
    const isPublic =
      path === "/login" ||
      path === "/api/health" ||
      path === "/api/stripe/webhook" ||
      path.startsWith("/api/cron/") ||
      path.startsWith("/api/staging-") ||
      path.startsWith("/admin") ||
      path.startsWith("/_next/") ||
      path.startsWith("/images/") ||
      path.startsWith("/emails/") ||
      path === "/favicon.ico" ||
      path === "/favicon.svg" ||
      path === "/apple-touch-icon.png";

    if (!isPublic) {
      const session = request.cookies.get("staging_session")?.value;
      const expected = await sha256(STAGING_PASSWORD);
      if (session !== expected) {
        const loginUrl = new URL("/login", request.url);
        const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
        if (nextPath.startsWith("/") && !nextPath.startsWith("//")) {
          loginUrl.searchParams.set("next", nextPath);
        }
        return NextResponse.redirect(loginUrl);
      }
    }
  }

  // Generate a random nonce for CSP
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const isDev = !isProduction;
  const googleFontStyleSources = "https://fonts.googleapis.com";
  const googleFontSources = "https://fonts.gstatic.com";
  const stripeScriptSources = "https://js.stripe.com https://*.js.stripe.com";
  const stripeImageSources = "https://*.stripe.com";
  const stripeConnectSources =
    "https://api.stripe.com https://m.stripe.com https://m.stripe.network https://r.stripe.com";
  const stripeFrameSources =
    "https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://checkout.stripe.com";

  // Build CSP header
  // Production: 'self' + 'unsafe-inline' + explicit external domain allowlist.
  //   Nonce-based CSP was tried but abandoned: Next.js App Router generates inline bootstrap
  //   scripts (webpack loader, RSC streaming) that don't receive the nonce. WebKit/Safari
  //   strictly enforces that ALL inline scripts need the nonce when nonce-* is in the policy,
  //   which blocked React hydration entirely. Chrome/Firefox are more lenient. Since this site
  //   has no user-generated content, 'unsafe-inline' is an acceptable tradeoff.
  // Development: permissive for HMR/webpack
  const cspHeader = [
    "default-src 'self'",
    isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : `script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://cdn-cookieyes.com https://cookieyes.com https://connect.facebook.net https://analytics.tiktok.com https://t.contentsquare.net https://*.contentsquare.net https://*.hotjar.com ${stripeScriptSources}`,
    `style-src 'self' 'unsafe-inline' ${googleFontStyleSources}`, // Tailwind requires unsafe-inline for styles
    `font-src 'self' data: ${googleFontSources}`,
    `img-src 'self' data: blob: https://images.unsplash.com https://www.google-analytics.com https://www.googletagmanager.com https://cdn-cookieyes.com https://flagcdn.com https://www.facebook.com https://*.hotjar.com ${stripeImageSources}`,
    "media-src 'self'",
    `connect-src 'self'${isDev ? " ws://localhost:* http://localhost:*" : ""} https://www.google-analytics.com https://www.googletagmanager.com https://images.unsplash.com https://www.google.com/recaptcha/ https://cdn-cookieyes.com https://log.cookieyes.com https://cookieyes.com https://www.facebook.com https://analytics.tiktok.com https://*.contentsquare.net https://*.hotjar.com https://*.hotjar.io ${stripeConnectSources}`,
    `frame-src 'self' https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://cdn-cookieyes.com https://*.hotjar.com ${stripeFrameSources}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    isDev || request.nextUrl.hostname === "localhost" || request.nextUrl.hostname === "127.0.0.1"
      ? ""
      : "upgrade-insecure-requests", // Skip in dev and on localhost (Playwright WebKit on Linux doesn't implement the localhost exemption)
  ]
    .filter(Boolean)
    .join("; ");

  // Clone the request headers and set CSP nonce for use in components
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  // Create response with security headers
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Admin gate: verify Supabase Auth session for /admin routes
  const adminPath = request.nextUrl.pathname;
  if (adminPath.startsWith("/admin")) {
    const isAdminPublic =
      adminPath === "/admin/login" ||
      adminPath === "/api/admin/login" ||
      adminPath === "/api/admin/logout" ||
      adminPath.startsWith("/admin/auth/"); // callback route

    if (!isAdminPublic) {
      const supabase = createSupabaseMiddleware(request, response);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.redirect(new URL("/admin/login", request.url));
      }

      // Pass user email to API routes via header for audit logging
      requestHeaders.set("x-admin-email", user.email || "");
    }
  }

  // Set security headers on response
  response.headers.set("Content-Security-Policy", cspHeader);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), autoplay=(self), payment=()"
  );
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  // Cross-Origin-Opener-Policy for origin isolation
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");

  // Set CSRF cookie if not present
  const existingCsrf = request.cookies.get(CSRF_COOKIE_NAME);
  if (!existingCsrf) {
    const csrfToken = generateCsrfToken();
    response.cookies.set(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false, // Must be readable by JavaScript
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    });
  }

  // Security logging for API routes (3.4)
  // Note: This IP is for observability logging only, not for security decisions
  // (rate limiting uses getClientIp() which trusts only x-real-ip).
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const ip =
      request.headers.get("x-real-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0] ||
      "unknown";
    logger.info({
      type: "api_request",
      method: request.method,
      path: request.nextUrl.pathname,
      ip,
      userAgent: request.headers.get("user-agent")?.slice(0, 100) || "unknown",
    });
  }

  return response;
}

export const config = {
  matcher: [
    // Match all paths except static files and API routes that don't need CSP
    {
      source: "/((?!_next/static|_next/image|favicon.ico|images/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
