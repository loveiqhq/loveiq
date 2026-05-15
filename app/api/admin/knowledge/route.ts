import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import {
  buildAdminKnowledgeSnapshot,
  parseAdminKnowledgeSurface,
} from "@features/admin/server/knowledge";
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
    bucket: "admin-knowledge",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const surface = parseAdminKnowledgeSurface(url.searchParams.get("surface"));
  const rawDays = Number.parseInt(url.searchParams.get("days") ?? "30", 10);
  const query = url.searchParams.get("q");

  try {
    return NextResponse.json(
      await buildAdminKnowledgeSnapshot(surface, rawDays, admin.email, query)
    );
  } catch (err) {
    logger.error({ err, surface, rawDays }, "Admin knowledge GET error");
    return NextResponse.json({ error: "Unable to load admin knowledge." }, { status: 500 });
  }
}
