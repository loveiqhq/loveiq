import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import { maskEmail } from "@/lib/admin/format";
import logger from "@/lib/logger";

interface ScoringRow {
  id: number;
  survey_submission_id: number;
  primary_archetype: string;
  percentages: Record<string, number> | null;
  v5_primary_archetype: string | null;
  v5_percentages: Record<string, number> | null;
  scored_at: string | null;
  survey_submission: {
    id: number;
    app_user: { email: string } | null;
  } | null;
}

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
    bucket: "admin-scoring-comparison",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "0", 10);

  try {
    // Build query for scoring_result with v4+v5 engine_version
    const select =
      "id,survey_submission_id,primary_archetype,percentages,v5_primary_archetype,v5_percentages,scored_at,survey_submission(id,app_user(email))";
    let query = `/rest/v1/scoring_result?select=${select}&engine_version=eq.v4%2Bv5&order=scored_at.desc`;

    if (days > 0) {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      query += `&scored_at=gte.${since}`;
    }

    const res = await supabaseFetch(query, {
      headers: { Range: "0-49999" },
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "Scoring comparison query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const rows = (await res.json()) as ScoringRow[];

    // Filter to rows that have both V4 and V5 results
    const dualRows = rows.filter((r) => r.primary_archetype && r.v5_primary_archetype);
    const totalScored = dualRows.length;

    // 1. Agreement rate
    const agreements = dualRows.filter(
      (r) => r.primary_archetype === r.v5_primary_archetype
    ).length;
    const agreementRate = totalScored > 0 ? Math.round((agreements / totalScored) * 100) : 0;

    // 2. V4 distribution
    const v4Map: Record<string, number> = {};
    for (const r of dualRows) {
      v4Map[r.primary_archetype] = (v4Map[r.primary_archetype] || 0) + 1;
    }
    const v4Distribution = Object.entries(v4Map)
      .map(([archetype, count]) => ({ archetype, count }))
      .sort((a, b) => b.count - a.count);

    // 3. V5 distribution
    const v5Map: Record<string, number> = {};
    for (const r of dualRows) {
      v5Map[r.v5_primary_archetype!] = (v5Map[r.v5_primary_archetype!] || 0) + 1;
    }
    const v5Distribution = Object.entries(v5Map)
      .map(([archetype, count]) => ({ archetype, count }))
      .sort((a, b) => b.count - a.count);

    // 4. Drift matrix
    const driftMap: Record<string, number> = {};
    for (const r of dualRows) {
      const key = `${r.primary_archetype}::${r.v5_primary_archetype}`;
      driftMap[key] = (driftMap[key] || 0) + 1;
    }
    const driftMatrix = Object.entries(driftMap).map(([key, count]) => {
      const [v4, v5] = key.split("::");
      return { v4, v5, count };
    });

    // 5. Disagreements (limit 100)
    const disagreements = dualRows
      .filter((r) => r.primary_archetype !== r.v5_primary_archetype)
      .slice(0, 100)
      .map((r) => {
        const email = r.survey_submission?.app_user?.email || "";
        const v4Pct = r.percentages?.[r.primary_archetype] ?? null;
        const v5Pct = r.v5_percentages?.[r.v5_primary_archetype!] ?? null;
        return {
          id: r.id,
          submissionId: r.survey_submission_id,
          email: email ? maskEmail(email) : "",
          v4Archetype: r.primary_archetype,
          v5Archetype: r.v5_primary_archetype,
          v4TopPct: v4Pct != null ? Math.round(v4Pct * 10) / 10 : null,
          v5TopPct: v5Pct != null ? Math.round(v5Pct * 10) / 10 : null,
        };
      });

    // Count V4-only and V5-only for stats
    const v4Only = rows.filter((r) => r.primary_archetype && !r.v5_primary_archetype).length;
    const v5Only = rows.filter((r) => !r.primary_archetype && r.v5_primary_archetype).length;

    return NextResponse.json({
      totalScored,
      agreementRate,
      v4Only,
      v5Only,
      v4Distribution,
      v5Distribution,
      driftMatrix,
      disagreements,
    });
  } catch (err) {
    logger.error({ err }, "Scoring comparison error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
