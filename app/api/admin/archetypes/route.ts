import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

interface ScoringRow {
  primary_archetype: string;
  v5_primary_archetype: string | null;
  scored_at: string;
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
    bucket: "admin-archetypes",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    const res = await supabaseFetch(
      `/rest/v1/scoring_result?select=primary_archetype,v5_primary_archetype,scored_at&order=scored_at.desc`,
      { headers: { Range: "0-49999" } }
    );

    if (!res.ok) {
      logger.error({ status: res.status }, "Archetypes query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const rows = (await res.json()) as ScoringRow[];
    const totalScored = rows.length;

    // Count per archetype
    const v4Map: Record<string, number> = {};
    const v5Map: Record<string, number> = {};
    const weeklyMap: Record<string, Record<string, number>> = {};

    for (const r of rows) {
      if (r.primary_archetype) {
        v4Map[r.primary_archetype] = (v4Map[r.primary_archetype] || 0) + 1;

        // Weekly trend (last 4 weeks)
        const week = r.scored_at?.slice(0, 10) || "";
        const d = new Date(week);
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        const weekKey = weekStart.toISOString().slice(0, 10);

        if (!weeklyMap[r.primary_archetype]) weeklyMap[r.primary_archetype] = {};
        weeklyMap[r.primary_archetype][weekKey] =
          (weeklyMap[r.primary_archetype][weekKey] || 0) + 1;
      }
      if (r.v5_primary_archetype) {
        v5Map[r.v5_primary_archetype] = (v5Map[r.v5_primary_archetype] || 0) + 1;
      }
    }

    // Get last 4 week keys
    const allWeeks = new Set<string>();
    for (const wm of Object.values(weeklyMap)) {
      for (const w of Object.keys(wm)) allWeeks.add(w);
    }
    const recentWeeks = Array.from(allWeeks).sort().slice(-4);

    const allArchetypes = new Set([...Object.keys(v4Map), ...Object.keys(v5Map)]);
    const archetypes = Array.from(allArchetypes).map((name) => ({
      slug: name.toLowerCase().replace(/\s+/g, "-"),
      name,
      v4Count: v4Map[name] || 0,
      v5Count: v5Map[name] || 0,
      pctOfTotal: totalScored > 0 ? Math.round(((v4Map[name] || 0) / totalScored) * 1000) / 10 : 0,
      weeklyTrend: recentWeeks.map((w) => weeklyMap[name]?.[w] || 0),
    }));

    return NextResponse.json({ archetypes, totalScored });
  } catch (err) {
    logger.error({ err }, "Archetypes error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
