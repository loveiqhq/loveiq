import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

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
    const genderMap: Record<string, number> = {};
    const orientationMap: Record<string, number> = {};
    const relationshipMap: Record<string, number> = {};
    const locationMap: Record<string, number> = {};

    // Behavior
    let totalDuration = 0;
    let durationCount = 0;

    // Dimensions
    const dimensionSums: Record<string, number> = {};
    const dimensionCounts: Record<string, number> = {};

    // V4/V5 agreement
    let v5Agree = 0;
    let v5Total = 0;

    // Weekly growth
    const weeklyMap: Record<string, number> = {};

    // Secondary archetypes
    const secondaryMap: Record<string, number> = {};

    for (const r of rows) {
      const profile = r.survey_submission?.app_user?.user_profile;
      if (profile) {
        if (profile.gender) genderMap[profile.gender] = (genderMap[profile.gender] || 0) + 1;
        if (profile.sexual_orientation)
          orientationMap[profile.sexual_orientation] =
            (orientationMap[profile.sexual_orientation] || 0) + 1;
        if (profile.relationship_status)
          relationshipMap[profile.relationship_status] =
            (relationshipMap[profile.relationship_status] || 0) + 1;
        if (profile.location_primary)
          locationMap[profile.location_primary] = (locationMap[profile.location_primary] || 0) + 1;
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
            dimensionSums[dim] = (dimensionSums[dim] || 0) + score;
            dimensionCounts[dim] = (dimensionCounts[dim] || 0) + 1;
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
        weeklyMap[weekKey] = (weeklyMap[weekKey] || 0) + 1;
      }

      // Secondary archetype
      if (r.percentages && typeof r.percentages === "object") {
        const sorted = Object.entries(r.percentages)
          .filter(([name]) => name !== archetypeName)
          .sort((a, b) => (b[1] as number) - (a[1] as number));
        if (sorted.length > 0) {
          const second = sorted[0][0];
          secondaryMap[second] = (secondaryMap[second] || 0) + 1;
        }
      }
    }

    const toDistribution = (map: Record<string, number>) =>
      Object.entries(map)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    const dimensions = Object.entries(dimensionSums)
      .map(([dim, sum]) => ({
        dimension: dim,
        avgScore: Math.round((sum / (dimensionCounts[dim] || 1)) * 100) / 100,
      }))
      .sort((a, b) => b.avgScore - a.avgScore);

    const weeklyGrowth = Object.entries(weeklyMap)
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
