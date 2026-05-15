import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import { maskEmail } from "@features/admin/server/format";
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

function topGap(values: Record<string, number> | null): number | null {
  if (!values) return null;
  const sorted = Object.values(values)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a);
  if (sorted.length === 0) return null;
  // Length-guarded sorted[0]/sorted[1] accesses are safe.
  if (sorted.length === 1) return Math.round(sorted[0]! * 10) / 10;
  return Math.round((sorted[0]! - sorted[1]!) * 10) / 10;
}

function confidenceBucket(
  v4Gap: number | null,
  v5Gap: number | null,
  agreement: boolean
): "high" | "medium" | "low" {
  const minGap = Math.min(v4Gap ?? 0, v5Gap ?? 0);
  if (agreement && minGap >= 20) return "high";
  if (minGap >= 10) return "medium";
  return "low";
}

function incrementCount<K>(map: Map<K, number>, key: K, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function getRecordValue(values: Record<string, number> | null, key: string | null): number | null {
  if (!values || !key) return null;
  return new Map(Object.entries(values)).get(key) ?? null;
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
    const v4Map = new Map<string, number>();
    for (const r of dualRows) {
      incrementCount(v4Map, r.primary_archetype);
    }
    const v4Distribution = [...v4Map.entries()]
      .map(([archetype, count]) => ({ archetype, count }))
      .sort((a, b) => b.count - a.count);

    // 3. V5 distribution
    const v5Map = new Map<string, number>();
    for (const r of dualRows) {
      if (r.v5_primary_archetype) incrementCount(v5Map, r.v5_primary_archetype);
    }
    const v5Distribution = [...v5Map.entries()]
      .map(([archetype, count]) => ({ archetype, count }))
      .sort((a, b) => b.count - a.count);

    // 4. Drift matrix
    const driftMap = new Map<string, number>();
    for (const r of dualRows) {
      const key = `${r.primary_archetype}::${r.v5_primary_archetype}`;
      incrementCount(driftMap, key);
    }
    const driftMatrix = [...driftMap.entries()].map(([key, count]) => {
      const [v4, v5] = key.split("::");
      return { v4, v5, count };
    });

    // 5. Disagreements (limit 100)
    const ambiguityRows = dualRows.map((r) => {
      const email = r.survey_submission?.app_user?.email || "";
      const v4Pct = getRecordValue(r.percentages, r.primary_archetype);
      const v5Pct = getRecordValue(r.v5_percentages, r.v5_primary_archetype);
      const v4Gap = topGap(r.percentages);
      const v5Gap = topGap(r.v5_percentages);
      const agreement = r.primary_archetype === r.v5_primary_archetype;
      const confidence = confidenceBucket(v4Gap, v5Gap, agreement);
      const ambiguityScore = Math.round(
        Math.max(0, 30 - (v4Gap ?? 0)) + Math.max(0, 30 - (v5Gap ?? 0)) + (agreement ? 0 : 20)
      );

      return {
        id: r.id,
        submissionId: r.survey_submission_id,
        email: email ? maskEmail(email) : "",
        v4Archetype: r.primary_archetype,
        v5Archetype: r.v5_primary_archetype,
        v4TopPct: v4Pct != null ? Math.round(v4Pct * 10) / 10 : null,
        v5TopPct: v5Pct != null ? Math.round(v5Pct * 10) / 10 : null,
        v4Gap,
        v5Gap,
        agreement,
        confidence,
        ambiguityScore,
      };
    });

    const disagreements = ambiguityRows.filter((row) => !row.agreement).slice(0, 100);
    const ambiguousCases = [...ambiguityRows]
      .sort((a, b) => b.ambiguityScore - a.ambiguityScore)
      .slice(0, 100);

    const confidenceSummary = {
      high: ambiguityRows.filter((row) => row.confidence === "high").length,
      medium: ambiguityRows.filter((row) => row.confidence === "medium").length,
      low: ambiguityRows.filter((row) => row.confidence === "low").length,
      ambiguous: ambiguityRows.filter((row) => row.ambiguityScore >= 40).length,
    };

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
      ambiguousCases,
      confidenceSummary,
    });
  } catch (err) {
    logger.error({ err }, "Scoring comparison error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
