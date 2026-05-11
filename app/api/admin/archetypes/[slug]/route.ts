import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

function incrementCount<K>(map: Map<K, number>, key: K, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "viewer")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-archetype-detail",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const { slug } = await params;
  // Convert slug back to archetype name
  const archetypeName = slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  try {
    // Get submissions with this archetype
    const res = await supabaseFetch(
      `/rest/v1/scoring_result?select=id,survey_submission_id,primary_archetype,v5_primary_archetype,percentages,raw_scores,scored_at,survey_submission(id,duration_ms,created_date_time,app_user(user_profile(gender,sexual_orientation,relationship_status,location_primary)))&primary_archetype=eq.${encodeURIComponent(archetypeName)}&order=scored_at.desc`,
      { headers: { Range: "0-9999" } }
    );

    if (!res.ok) {
      logger.error({ status: res.status }, "Archetype detail query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const rows = await res.json();
    const total = rows.length;

    // Demographics
    const genderMap = new Map<string, number>();
    const orientationMap = new Map<string, number>();
    const relationshipMap = new Map<string, number>();
    const locationMap = new Map<string, number>();

    // Behavior
    let totalDuration = 0;
    let durationCount = 0;

    // Dimensions
    const dimensionSums = new Map<string, number>();
    const dimensionCounts = new Map<string, number>();

    // V4/V5 agreement
    let v5Agree = 0;
    let v5Total = 0;

    // Weekly growth
    const weeklyMap = new Map<string, number>();

    // Secondary archetypes
    const secondaryMap = new Map<string, number>();

    for (const r of rows) {
      const profile = r.survey_submission?.app_user?.user_profile;
      if (profile) {
        if (profile.gender) incrementCount(genderMap, profile.gender);
        if (profile.sexual_orientation) incrementCount(orientationMap, profile.sexual_orientation);
        if (profile.relationship_status)
          incrementCount(relationshipMap, profile.relationship_status);
        if (profile.location_primary) incrementCount(locationMap, profile.location_primary);
      }

      // Duration
      if (r.survey_submission?.duration_ms > 0) {
        totalDuration += r.survey_submission.duration_ms;
        durationCount++;
      }

      // Raw scores for dimensions
      if (r.raw_scores && typeof r.raw_scores === "object") {
        for (const [dim, score] of Object.entries(r.raw_scores)) {
          if (typeof score === "number") {
            dimensionSums.set(dim, (dimensionSums.get(dim) ?? 0) + score);
            incrementCount(dimensionCounts, dim);
          }
        }
      }

      // V5 agreement
      if (r.v5_primary_archetype) {
        v5Total++;
        if (r.v5_primary_archetype === r.primary_archetype) v5Agree++;
      }

      // Weekly
      if (r.scored_at) {
        const d = new Date(r.scored_at);
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        const weekKey = weekStart.toISOString().slice(0, 10);
        incrementCount(weeklyMap, weekKey);
      }

      // Secondary archetype
      if (r.percentages && typeof r.percentages === "object") {
        const sorted = Object.entries(r.percentages)
          .filter(([name]) => name !== archetypeName)
          .sort((a, b) => (b[1] as number) - (a[1] as number));
        if (sorted.length > 0) {
          // sorted.length > 0 checked above; [0][0] is the key string.
          const second = sorted[0]![0];
          incrementCount(secondaryMap, second);
        }
      }
    }

    const toDistribution = (map: Map<string, number>) =>
      [...map.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    const dimensions = [...dimensionSums.entries()]
      .map(([dim, sum]) => ({
        dimension: dim,
        avgScore: Math.round((sum / (dimensionCounts.get(dim) ?? 1)) * 100) / 100,
      }))
      .sort((a, b) => b.avgScore - a.avgScore);

    const weeklyGrowth = [...weeklyMap.entries()]
      .map(([week, count]) => ({ week, count }))
      .sort((a, b) => a.week.localeCompare(b.week));

    return NextResponse.json({
      name: archetypeName,
      total,
      demographics: {
        gender: toDistribution(genderMap),
        orientation: toDistribution(orientationMap),
        relationship: toDistribution(relationshipMap),
        location: toDistribution(locationMap),
      },
      behavior: {
        avgDurationMin: durationCount > 0 ? Math.round(totalDuration / durationCount / 60000) : 0,
        total,
      },
      dimensions,
      v5AgreementRate: v5Total > 0 ? Math.round((v5Agree / v5Total) * 100) : 0,
      weeklyGrowth,
      secondaryArchetypes: toDistribution(secondaryMap),
    });
  } catch (err) {
    logger.error({ err }, "Archetype detail error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
