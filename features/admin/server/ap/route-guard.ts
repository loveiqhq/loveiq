/**
 * The checks every AP-Analytics API route makes after its own CSRF check (a write route calls
 * verifyCsrfToken first, as every API route in this codebase does): the session and its role,
 * then the rate limit. Returns the admin, or the response to send instead.
 */
import { NextResponse } from "next/server";

import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole, type AdminRole, type AdminUser } from "@features/admin/server/roles";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";

export async function apGuard(
  request: Request,
  /** write: a write route, held to a lower rate. */
  // No bucket: the route rate-limits itself first, as a POST route does in this codebase.
  opts: { bucket?: string; role?: AdminRole; limit?: number; write?: boolean }
): Promise<AdminUser | NextResponse> {
  const admin = await verifyAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!hasRole(admin.role, opts.role ?? "viewer")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (opts.bucket) {
    const rate = await checkRateLimit(getClientIp(request), {
      bucket: opts.bucket,
      limit: opts.limit ?? (opts.write ? 10 : 30),
      windowMs: 60_000,
    });
    if (!rate.allowed)
      return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }
  return admin;
}

/** No caching anywhere: the figures are live. */
export const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
