import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { buildForecastSnapshot } from "@/lib/admin/forecasting";
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
    bucket: "admin-predictions",
    limit: 15,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const rawDays = parseInt(url.searchParams.get("days") || "30", 10);

  try {
    const snapshot = await buildForecastSnapshot(rawDays);
    return NextResponse.json(snapshot);
  } catch (err) {
    logger.error({ err }, "Admin predictions error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
