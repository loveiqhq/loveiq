import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { buildChannelEfficiencySnapshot } from "@features/admin/server/channel-efficiency";
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
    bucket: "admin-growth-acquisition-quality",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);

  try {
    return NextResponse.json(await buildChannelEfficiencySnapshot(days));
  } catch (err) {
    logger.error({ err }, "Growth acquisition quality error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
