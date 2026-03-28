import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
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
    bucket: "admin-comparisons-segment",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const sinceA = url.searchParams.get("sinceA") || null;
  const untilA = url.searchParams.get("untilA") || null;
  const utmA = url.searchParams.get("utmA") || null;
  const archetypeA = url.searchParams.get("archetypeA") || null;
  const sinceB = url.searchParams.get("sinceB") || null;
  const untilB = url.searchParams.get("untilB") || null;
  const utmB = url.searchParams.get("utmB") || null;
  const archetypeB = url.searchParams.get("archetypeB") || null;

  try {
    const [resA, resB] = await Promise.all([
      supabaseFetch("/rest/v1/rpc/get_segment_metrics", {
        method: "POST",
        body: JSON.stringify({
          p_since: sinceA,
          p_until: untilA,
          p_utm: utmA,
          p_archetype: archetypeA,
        }),
      }),
      supabaseFetch("/rest/v1/rpc/get_segment_metrics", {
        method: "POST",
        body: JSON.stringify({
          p_since: sinceB,
          p_until: untilB,
          p_utm: utmB,
          p_archetype: archetypeB,
        }),
      }),
    ]);

    if (!resA.ok || !resB.ok) {
      logger.error("Comparisons segment: one or more Supabase RPC calls failed");
      return NextResponse.json({ error: "Unable to load segment data." }, { status: 500 });
    }

    const dataA = await resA.json();
    const dataB = await resB.json();

    return NextResponse.json({ segmentA: dataA, segmentB: dataB });
  } catch (err) {
    logger.error({ err }, "Comparisons segment error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
