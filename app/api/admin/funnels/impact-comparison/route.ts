import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { buildCohortComparisonSnapshot } from "@/lib/admin/cohort-comparison";
import { hasRole } from "@/lib/admin/roles";
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
    bucket: "admin-funnels-impact-comparison",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const rawDays = parseInt(url.searchParams.get("days") || "30", 10);

  try {
    return NextResponse.json(await buildCohortComparisonSnapshot(rawDays, admin.email));
  } catch (err) {
    logger.error({ err }, "Impact comparison GET error");
    return NextResponse.json({ error: "Unable to load impact comparison." }, { status: 500 });
  }
}
