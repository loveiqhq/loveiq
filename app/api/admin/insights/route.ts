import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { supabaseFetch } from "@/lib/admin/supabase";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

interface Insight {
  type: string;
  severity: string;
  title: string;
  description: string;
  metric?: string;
}

interface PeriodComparison {
  current_submissions: number;
  previous_submissions: number;
  current_completion_rate: number | null;
  previous_completion_rate: number | null;
  current_avg_duration_min: number | null;
  previous_avg_duration_min: number | null;
  current_waitlist: number;
  previous_waitlist: number;
}

interface RpcResult {
  period_comparison: PeriodComparison | null;
  high_friction_questions: Array<{
    q_id: string;
    avg_time_sec: number;
    backtrack_count: number;
  }> | null;
  top_drop_off_questions: Array<{
    q_id: string;
    abandon_count: number;
  }> | null;
  fastest_growing_archetype: {
    archetype: string;
    current: number;
    previous: number;
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
  const rl = await checkRateLimit(ip, {
    bucket: "admin-insights",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "7", 10);

  try {
    const res = await supabaseFetch("/rest/v1/rpc/get_automated_insights", {
      method: "POST",
      body: JSON.stringify({ p_days: days }),
    });
    if (!res.ok) {
      logger.error("Insights: RPC failed");
      return NextResponse.json({ error: "Unable to load insights." }, { status: 500 });
    }
    const data: RpcResult = await res.json();

    const insights: Insight[] = [];
    const pc = data.period_comparison;

    if (pc) {
      // Submission trend
      const subDelta =
        pc.previous_submissions > 0
          ? Math.round(
              ((pc.current_submissions - pc.previous_submissions) / pc.previous_submissions) * 100
            )
          : null;
      if (subDelta !== null && Math.abs(subDelta) >= 10) {
        insights.push({
          type: "trend",
          severity: subDelta > 0 ? "positive" : "warning",
          title: subDelta > 0 ? "Submissions are trending up" : "Submissions are trending down",
          description: `${Math.abs(subDelta)}% ${subDelta > 0 ? "increase" : "decrease"} vs previous ${days} days (${pc.current_submissions} vs ${pc.previous_submissions})`,
          metric: `${subDelta > 0 ? "+" : ""}${subDelta}%`,
        });
      }

      // Completion rate change
      if (pc.current_completion_rate != null && pc.previous_completion_rate != null) {
        const rateDelta = pc.current_completion_rate - pc.previous_completion_rate;
        if (Math.abs(rateDelta) >= 5) {
          insights.push({
            type: "trend",
            severity: rateDelta > 0 ? "positive" : "warning",
            title: rateDelta > 0 ? "Completion rate improved" : "Completion rate declined",
            description: `${pc.current_completion_rate}% now vs ${pc.previous_completion_rate}% previously (${rateDelta > 0 ? "+" : ""}${rateDelta.toFixed(1)}pp)`,
            metric: `${rateDelta > 0 ? "+" : ""}${rateDelta.toFixed(1)}pp`,
          });
        }
      }

      // Duration change
      if (pc.current_avg_duration_min != null && pc.previous_avg_duration_min != null) {
        const durDelta = pc.current_avg_duration_min - pc.previous_avg_duration_min;
        if (Math.abs(durDelta) >= 2) {
          insights.push({
            type: "trend",
            severity: durDelta < 0 ? "positive" : "info",
            title:
              durDelta < 0 ? "Survey completion got faster" : "Survey taking longer to complete",
            description: `Average ${pc.current_avg_duration_min}min now vs ${pc.previous_avg_duration_min}min previously`,
            metric: `${durDelta > 0 ? "+" : ""}${durDelta.toFixed(1)}min`,
          });
        }
      }

      // Waitlist trend
      if (pc.current_waitlist > 0 || pc.previous_waitlist > 0) {
        const wlDelta =
          pc.previous_waitlist > 0
            ? Math.round(
                ((pc.current_waitlist - pc.previous_waitlist) / pc.previous_waitlist) * 100
              )
            : pc.current_waitlist > 0
              ? 100
              : 0;
        if (Math.abs(wlDelta) >= 15) {
          insights.push({
            type: "trend",
            severity: wlDelta > 0 ? "positive" : "warning",
            title: wlDelta > 0 ? "Waitlist signups growing" : "Waitlist signups declining",
            description: `${Math.abs(wlDelta)}% ${wlDelta > 0 ? "increase" : "decrease"} (${pc.current_waitlist} vs ${pc.previous_waitlist})`,
            metric: `${wlDelta > 0 ? "+" : ""}${wlDelta}%`,
          });
        }
      }
    }

    // High friction questions
    if (data.high_friction_questions && data.high_friction_questions.length > 0) {
      const worst = data.high_friction_questions[0];
      insights.push({
        type: "anomaly",
        severity: "warning",
        title: "High-friction question detected",
        description: `Question ${worst.q_id} takes ${worst.avg_time_sec}s avg (2x+ above average)${worst.backtrack_count > 0 ? `, with ${worst.backtrack_count} backtracks` : ""}`,
        metric: `${worst.avg_time_sec}s`,
      });
    }

    // Top drop-off
    if (data.top_drop_off_questions && data.top_drop_off_questions.length > 0) {
      const top = data.top_drop_off_questions[0];
      insights.push({
        type: "anomaly",
        severity: "warning",
        title: "Top abandonment point",
        description: `Question ${top.q_id} caused ${top.abandon_count} abandonments in the last ${days} days`,
        metric: `${top.abandon_count} exits`,
      });
    }

    // Growing archetype
    if (data.fastest_growing_archetype) {
      const fg = data.fastest_growing_archetype;
      if (fg.current > fg.previous) {
        insights.push({
          type: "trend",
          severity: "info",
          title: `${fg.archetype} is the fastest growing archetype`,
          description: `${fg.current} in current period vs ${fg.previous} previously`,
          metric: `${fg.current}`,
        });
      }
    }

    if (insights.length === 0) {
      insights.push({
        type: "info",
        severity: "neutral",
        title: "All metrics stable",
        description: `No significant changes detected in the last ${days} days`,
      });
    }

    return NextResponse.json({ insights, period: days });
  } catch (err) {
    logger.error({ err }, "Insights error");
    return NextResponse.json({ error: "Unable to load insights." }, { status: 500 });
  }
}
