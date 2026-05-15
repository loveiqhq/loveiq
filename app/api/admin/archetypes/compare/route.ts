import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { supabaseFetch } from "@features/admin/server/supabase";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export async function GET(request: Request) {
  const admin = await verifyAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!hasRole(admin.role, "viewer"))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const ip = getClientIp(request);
  const rl = await checkRateLimit(ip, {
    bucket: "admin-archetype-compare",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Please try again later." }, { status: 429 });

  const url = new URL(request.url);
  const archetypes = url.searchParams.get("archetypes")?.split(",").filter(Boolean) || [];
  if (archetypes.length < 2 || archetypes.length > 4) {
    return NextResponse.json({ error: "Select 2 to 4 archetypes to compare." }, { status: 400 });
  }

  try {
    const res = await supabaseFetch("/rest/v1/rpc/get_archetype_comparison", {
      method: "POST",
      body: JSON.stringify({ p_archetypes: archetypes }),
    });
    if (!res.ok) {
      logger.error("Archetype comparison: RPC failed");
      return NextResponse.json({ error: "Unable to load comparison." }, { status: 500 });
    }

    const raw = await res.json();

    const behaviorMap = new Map<
      string,
      { sessions: number; avg_time_per_q_sec: number; backtracks: number; abandonments: number }
    >();
    for (const b of raw.behavior ?? []) {
      behaviorMap.set(b.archetype, b);
    }

    const merged = (raw.archetypes ?? []).map(
      (a: {
        name: string;
        count: number;
        avg_duration_min: number;
        scoring: { percentages: Record<string, number> };
      }) => {
        const beh = behaviorMap.get(a.name);
        return {
          name: a.name,
          count: a.count,
          avgDuration: a.avg_duration_min ?? 0,
          sessions: beh?.sessions ?? 0,
          backtracks: beh?.backtracks ?? 0,
          abandonments: beh?.abandonments ?? 0,
          avgTimePerQuestion: beh?.avg_time_per_q_sec ?? 0,
          scoring: a.scoring ?? { percentages: {} },
        };
      }
    );

    return NextResponse.json({ archetypes: merged });
  } catch (err) {
    logger.error({ err }, "Archetype compare error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
