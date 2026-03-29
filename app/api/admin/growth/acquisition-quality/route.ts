import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

interface SubmissionRow {
  id: number;
  status: string;
  utm_tracker: string | null;
  duration_ms: number | null;
  session_id: string | null;
}

interface PartialSaveRow {
  session_id: string;
  utm_tracker: string | null;
}

function parseUtmSource(tracker: string | null): string {
  if (!tracker?.trim()) return "Direct";
  try {
    const parsed = JSON.parse(tracker);
    return parsed.utm_source || "Direct";
  } catch {
    return tracker.trim();
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
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
    bucket: "admin-growth-acquisition-quality",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const since =
    days > 0
      ? new Date(Date.now() - days * 86_400_000).toISOString()
      : new Date("2000-01-01").toISOString();

  try {
    const [submissionsRes, scoringRes, partialsRes] = await Promise.all([
      supabaseFetch(
        `/rest/v1/survey_submission?select=id,status,utm_tracker,duration_ms,session_id&created_date_time=gte.${since}`,
        { headers: { Range: "0-49999" } }
      ),
      supabaseFetch(`/rest/v1/scoring_result?select=survey_submission_id&scored_at=gte.${since}`, {
        headers: { Range: "0-49999" },
      }),
      supabaseFetch(
        `/rest/v1/survey_partial_save?select=session_id,utm_tracker&saved_at=gte.${since}`,
        {
          headers: { Range: "0-49999" },
        }
      ),
    ]);

    if (!submissionsRes.ok || !scoringRes.ok || !partialsRes.ok) {
      logger.error("Growth acquisition quality: query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const submissions = (await submissionsRes.json()) as SubmissionRow[];
    const scoringRows = (await scoringRes.json()) as Array<{ survey_submission_id: number }>;
    const partials = (await partialsRes.json()) as PartialSaveRow[];

    const scoredIds = new Set(scoringRows.map((row) => row.survey_submission_id));
    const partialSessions = new Set(partials.map((row) => row.session_id));
    const partialsBySource = new Map<string, number>();
    for (const partial of partials) {
      const source = parseUtmSource(partial.utm_tracker);
      partialsBySource.set(source, (partialsBySource.get(source) ?? 0) + 1);
    }

    const sourceMap = new Map<
      string,
      {
        total: number;
        completed: number;
        flagged: number;
        scored: number;
        resumedCompleted: number;
        durationTotal: number;
        durationCount: number;
      }
    >();

    for (const submission of submissions) {
      const source = parseUtmSource(submission.utm_tracker);
      const current = sourceMap.get(source) ?? {
        total: 0,
        completed: 0,
        flagged: 0,
        scored: 0,
        resumedCompleted: 0,
        durationTotal: 0,
        durationCount: 0,
      };
      current.total += 1;
      if (submission.status === "completed") current.completed += 1;
      if (submission.status === "flagged") current.flagged += 1;
      if (scoredIds.has(submission.id)) current.scored += 1;
      if (
        submission.session_id &&
        partialSessions.has(submission.session_id) &&
        submission.status === "completed"
      ) {
        current.resumedCompleted += 1;
      }
      if (submission.duration_ms != null && submission.duration_ms > 0) {
        current.durationTotal += submission.duration_ms;
        current.durationCount += 1;
      }
      sourceMap.set(source, current);
    }

    const channels = [...sourceMap.entries()]
      .map(([source, stats]) => {
        const completionRate = stats.total > 0 ? round1((stats.completed / stats.total) * 100) : 0;
        const scoredRate = stats.total > 0 ? round1((stats.scored / stats.total) * 100) : 0;
        const flaggedRate = stats.total > 0 ? round1((stats.flagged / stats.total) * 100) : 0;
        const partialSaveCount = partialsBySource.get(source) ?? 0;
        const resumedRecoveryRate =
          partialSaveCount > 0 ? round1((stats.resumedCompleted / partialSaveCount) * 100) : 0;
        const avgDurationMin =
          stats.durationCount > 0
            ? round1(stats.durationTotal / stats.durationCount / 60_000)
            : null;
        const qualityScore = round1(
          completionRate * 0.45 +
            scoredRate * 0.25 +
            resumedRecoveryRate * 0.2 +
            Math.max(0, 100 - flaggedRate * 3) * 0.1
        );

        return {
          source,
          totalSubmissions: stats.total,
          completionRate,
          scoredRate,
          flaggedRate,
          partialSaveCount,
          resumedCompleted: stats.resumedCompleted,
          resumedRecoveryRate,
          avgDurationMin,
          qualityScore,
        };
      })
      .sort((a, b) => b.qualityScore - a.qualityScore);

    return NextResponse.json({
      channels,
      summary: {
        totalSources: channels.length,
        totalSubmissions: submissions.length,
        totalPartialSaves: partials.length,
        bestSource: channels[0]?.source ?? null,
        worstSource: channels[channels.length - 1]?.source ?? null,
      },
      trust: {
        windowDays: days,
        sampleSize: submissions.length,
        warning:
          submissions.length < 20
            ? "Acquisition quality is based on a small sample in the selected window."
            : null,
      },
    });
  } catch (err) {
    logger.error({ err }, "Growth acquisition quality error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
