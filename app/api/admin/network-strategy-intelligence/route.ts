import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { buildNetworkStrategyIntelligenceSnapshot } from "@features/admin/server/network-strategy-intelligence";
import { hasRole } from "@features/admin/server/roles";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

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
    bucket: "admin-network-strategy-intelligence",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const surface = url.searchParams.get("surface");
  const rawDays = Number.parseInt(url.searchParams.get("days") ?? "30", 10);

  try {
    return NextResponse.json(
      await buildNetworkStrategyIntelligenceSnapshot(surface, rawDays, admin.email)
    );
  } catch (err) {
    logger.error({ err, surface, rawDays }, "Admin network strategy intelligence GET error");
    return NextResponse.json(
      { error: "Unable to load network strategy intelligence." },
      { status: 500 }
    );
  }
}
