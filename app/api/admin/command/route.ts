import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import {
  buildAdminCommandAnswer,
  parseAdminIntelligenceSurface,
} from "@features/admin/server/intelligence";
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
    bucket: "admin-command",
    limit: 40,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() || "";
  if (!query) {
    return NextResponse.json({ error: "Query is required." }, { status: 400 });
  }

  const surface = parseAdminIntelligenceSurface(url.searchParams.get("surface"));
  const rawDays = Number.parseInt(url.searchParams.get("days") ?? "30", 10);

  try {
    return NextResponse.json(await buildAdminCommandAnswer(query, surface, rawDays, admin.email));
  } catch (err) {
    logger.error({ err, query, surface, rawDays }, "Admin command GET error");
    return NextResponse.json({ error: "Unable to answer admin command." }, { status: 500 });
  }
}
