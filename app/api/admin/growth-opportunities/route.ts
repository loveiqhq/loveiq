import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { buildGrowthOpportunitySnapshot } from "@features/admin/server/growth-opportunities";
import { hasRole } from "@features/admin/server/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

export async function GET(request: Request) {
  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "viewer")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-growth-opportunities",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const rawDays = Number.parseInt(url.searchParams.get("days") ?? "30", 10);

  try {
    return NextResponse.json(await buildGrowthOpportunitySnapshot(rawDays, admin.email));
  } catch (err) {
    logger.error({ err, rawDays }, "Admin growth opportunities GET error");
    return NextResponse.json({ error: "Unable to load growth opportunities." }, { status: 500 });
  }
}
