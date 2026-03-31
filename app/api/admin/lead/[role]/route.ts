import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { buildLeadCockpitSnapshot } from "@/lib/admin/os";
import type { LeadCockpitRole } from "@/lib/admin/os-types";
import { hasRole } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

const VALID_ROLES = new Set<LeadCockpitRole>(["strategy", "product", "growth", "tech"]);

export async function GET(request: Request, { params }: { params: Promise<{ role: string }> }) {
  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { role } = await params;
  if (!VALID_ROLES.has(role as LeadCockpitRole)) {
    return NextResponse.json({ error: "Unknown lead cockpit." }, { status: 404 });
  }

  const requiredRole = role === "tech" ? "admin" : "viewer";
  if (!hasRole(admin.role, requiredRole)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: `admin-lead-${role}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const rawDays = parseInt(url.searchParams.get("days") || "30", 10);

  try {
    const snapshot = await buildLeadCockpitSnapshot(role as LeadCockpitRole, rawDays);
    return NextResponse.json(snapshot);
  } catch (err) {
    logger.error({ err, role }, "Lead cockpit error");
    return NextResponse.json({ error: "Unable to load lead cockpit." }, { status: 500 });
  }
}
