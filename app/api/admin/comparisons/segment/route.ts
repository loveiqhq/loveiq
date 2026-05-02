import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

const SNAPSHOT_REFRESH_CADENCE_MINUTES = 5;

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
  const sessionStateA = url.searchParams.get("sessionStateA") || null;
  const sessionStateB = url.searchParams.get("sessionStateB") || null;
  const savedSegmentA = url.searchParams.get("savedSegmentA") || null;
  const savedSegmentB = url.searchParams.get("savedSegmentB") || null;

  try {
    if (savedSegmentA || savedSegmentB) {
      if (!savedSegmentA || !savedSegmentB) {
        return NextResponse.json(
          { error: "Select two saved segments to compare." },
          { status: 400 }
        );
      }

      const segmentIds = [savedSegmentA, savedSegmentB]
        .filter((value): value is string => !!value)
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0);

      if (segmentIds.length !== 2) {
        return NextResponse.json({ error: "Invalid input." }, { status: 400 });
      }

      const segmentsRes = await supabaseFetch(
        `/rest/v1/admin_segment?select=id,name,rules&or=(admin_email.eq.${encodeURIComponent(admin.email)},is_shared.eq.true)&id=in.(${segmentIds.join(",")})`,
        { headers: { Range: "0-9" } }
      );

      if (!segmentsRes.ok) {
        logger.error("Comparisons segment: saved segment lookup failed");
        return NextResponse.json({ error: "Unable to load segment data." }, { status: 500 });
      }

      const segments = (await segmentsRes.json()) as Array<{
        id: number;
        name: string;
        rules: { logic: "and" | "or"; conditions: Array<Record<string, unknown>> };
      }>;
      if (segments.length !== 2) {
        return NextResponse.json(
          { error: "One or both saved segments are unavailable." },
          { status: 404 }
        );
      }

      const segmentMap = new Map(segments.map((segment) => [segment.id, segment]));
      const segmentA = segmentMap.get(Number(savedSegmentA));
      const segmentB = segmentMap.get(Number(savedSegmentB));
      if (!segmentA || !segmentB) {
        return NextResponse.json(
          { error: "One or both saved segments are unavailable." },
          { status: 404 }
        );
      }

      const [metricsARes, metricsBRes] = await Promise.all([
        supabaseFetch("/rest/v1/rpc/get_segment_metrics_by_rules", {
          method: "POST",
          body: JSON.stringify({ p_rules: segmentA.rules }),
        }),
        supabaseFetch("/rest/v1/rpc/get_segment_metrics_by_rules", {
          method: "POST",
          body: JSON.stringify({ p_rules: segmentB.rules }),
        }),
      ]);

      if (!metricsARes.ok || !metricsBRes.ok) {
        logger.error("Comparisons segment: saved segment metrics failed");
        return NextResponse.json({ error: "Unable to load segment data." }, { status: 500 });
      }

      const dataA = await metricsARes.json();
      const dataB = await metricsBRes.json();

      return NextResponse.json({
        segmentA: dataA,
        segmentB: dataB,
        trust: {
          source: "materialized_snapshot",
          refreshCadenceMinutes: SNAPSHOT_REFRESH_CADENCE_MINUTES,
          segmentCount: segments.length,
        },
      });
    }

    if (sessionStateA || sessionStateB) {
      const [resA, resB] = await Promise.all([
        supabaseFetch("/rest/v1/rpc/get_segment_metrics_snapshot", {
          method: "POST",
          body: JSON.stringify({
            p_session_state: sessionStateA,
          }),
        }),
        supabaseFetch("/rest/v1/rpc/get_segment_metrics_snapshot", {
          method: "POST",
          body: JSON.stringify({
            p_session_state: sessionStateB,
          }),
        }),
      ]);

      if (!resA.ok || !resB.ok) {
        logger.error("Comparisons segment: session state metrics failed");
        return NextResponse.json({ error: "Unable to load segment data." }, { status: 500 });
      }

      const dataA = await resA.json();
      const dataB = await resB.json();

      return NextResponse.json({
        segmentA: dataA,
        segmentB: dataB,
        trust: {
          source: "materialized_snapshot",
          refreshCadenceMinutes: SNAPSHOT_REFRESH_CADENCE_MINUTES,
        },
      });
    }

    const [resA, resB] = await Promise.all([
      supabaseFetch("/rest/v1/rpc/get_segment_metrics_snapshot", {
        method: "POST",
        body: JSON.stringify({
          p_since: sinceA,
          p_until: untilA,
          p_utm: utmA,
          p_archetype: archetypeA,
        }),
      }),
      supabaseFetch("/rest/v1/rpc/get_segment_metrics_snapshot", {
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

    return NextResponse.json({
      segmentA: dataA,
      segmentB: dataB,
      trust: {
        source: "materialized_snapshot",
        refreshCadenceMinutes: SNAPSHOT_REFRESH_CADENCE_MINUTES,
      },
    });
  } catch (err) {
    logger.error({ err }, "Comparisons segment error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
