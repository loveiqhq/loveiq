import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

interface SubmissionRow {
  id: number;
  status: string;
  start_date_time: string | null;
  created_date_time: string;
  duration_ms: number | null;
  session_id: string | null;
  utm_tracker: string | null;
}

interface PartialSaveRow {
  session_id: string;
  current_index: number;
  started_at: string | null;
  saved_at: string;
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

function weekKey(iso: string) {
  const date = new Date(iso);
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  return start.toISOString().slice(0, 10);
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return round1((sorted[middle - 1] + sorted[middle]) / 2);
  }
  return round1(sorted[middle]);
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
    bucket: "admin-growth-recovery",
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
    const [submissionsRes, partialsRes, scoringRes] = await Promise.all([
      supabaseFetch(
        `/rest/v1/survey_submission?select=id,status,start_date_time,created_date_time,duration_ms,session_id,utm_tracker&created_date_time=gte.${since}`,
        { headers: { Range: "0-49999" } }
      ),
      supabaseFetch(
        `/rest/v1/survey_partial_save?select=session_id,current_index,started_at,saved_at,utm_tracker&saved_at=gte.${since}`,
        { headers: { Range: "0-49999" } }
      ),
      supabaseFetch(`/rest/v1/scoring_result?select=survey_submission_id&scored_at=gte.${since}`, {
        headers: { Range: "0-49999" },
      }),
    ]);

    if (!submissionsRes.ok || !partialsRes.ok || !scoringRes.ok) {
      logger.error("Growth recovery: query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const submissions = (await submissionsRes.json()) as SubmissionRow[];
    const partials = (await partialsRes.json()) as PartialSaveRow[];
    const scoredIds = new Set(
      ((await scoringRes.json()) as Array<{ survey_submission_id: number }>).map(
        (row) => row.survey_submission_id
      )
    );

    const partialBySession = new Map(partials.map((partial) => [partial.session_id, partial]));
    const recoveredDurationsHours: number[] = [];
    const sourceMap = new Map<
      string,
      {
        partialSaves: number;
        recovered: number;
      }
    >();

    for (const partial of partials) {
      const source = parseUtmSource(partial.utm_tracker);
      const current = sourceMap.get(source) ?? { partialSaves: 0, recovered: 0 };
      current.partialSaves += 1;
      sourceMap.set(source, current);
    }

    const cohorts = new Map<
      string,
      {
        total: number;
        completed: number;
        scored: number;
        resumed: number;
        resumedCompleted: number;
        durationTotal: number;
        durationCount: number;
      }
    >();

    for (const submission of submissions) {
      const firstTouch = submission.start_date_time || submission.created_date_time;
      const key = weekKey(firstTouch);
      const cohort = cohorts.get(key) ?? {
        total: 0,
        completed: 0,
        scored: 0,
        resumed: 0,
        resumedCompleted: 0,
        durationTotal: 0,
        durationCount: 0,
      };
      const partial = submission.session_id
        ? partialBySession.get(submission.session_id)
        : undefined;
      cohort.total += 1;
      if (submission.status === "completed") cohort.completed += 1;
      if (scoredIds.has(submission.id)) cohort.scored += 1;
      if (partial) {
        cohort.resumed += 1;
        if (submission.status === "completed") {
          cohort.resumedCompleted += 1;
          const recoveryHours =
            (new Date(submission.created_date_time).getTime() -
              new Date(partial.saved_at).getTime()) /
            3_600_000;
          if (recoveryHours >= 0) recoveredDurationsHours.push(recoveryHours);
          const source = parseUtmSource(partial.utm_tracker);
          const current = sourceMap.get(source) ?? { partialSaves: 0, recovered: 0 };
          current.recovered += 1;
          sourceMap.set(source, current);
        }
      }
      if (submission.duration_ms != null && submission.duration_ms > 0) {
        cohort.durationTotal += submission.duration_ms;
        cohort.durationCount += 1;
      }
      cohorts.set(key, cohort);
    }

    const resumePoints = new Map<number, number>();
    for (const partial of partials) {
      resumePoints.set(partial.current_index, (resumePoints.get(partial.current_index) ?? 0) + 1);
    }

    const recoveryBySource = [...sourceMap.entries()]
      .map(([source, stats]) => ({
        source,
        partialSaves: stats.partialSaves,
        recovered: stats.recovered,
        recoveryRate:
          stats.partialSaves > 0 ? round1((stats.recovered / stats.partialSaves) * 100) : 0,
      }))
      .sort((a, b) => b.recoveryRate - a.recoveryRate || b.partialSaves - a.partialSaves);

    const cohortRows = [...cohorts.entries()]
      .map(([week, cohort]) => {
        const completionRate =
          cohort.total > 0 ? round1((cohort.completed / cohort.total) * 100) : 0;
        const scoredRate = cohort.total > 0 ? round1((cohort.scored / cohort.total) * 100) : 0;
        const resumedShare = cohort.total > 0 ? round1((cohort.resumed / cohort.total) * 100) : 0;
        const resumedCompletionRate =
          cohort.resumed > 0 ? round1((cohort.resumedCompleted / cohort.resumed) * 100) : 0;
        const avgDurationMin =
          cohort.durationCount > 0
            ? round1(cohort.durationTotal / cohort.durationCount / 60_000)
            : null;
        const qualityScore = round1(
          completionRate * 0.45 +
            scoredRate * 0.25 +
            resumedCompletionRate * 0.2 +
            Math.max(0, 100 - resumedShare) * 0.1
        );

        return {
          week,
          totalSubmissions: cohort.total,
          completionRate,
          scoredRate,
          resumedShare,
          resumedCompletionRate,
          avgDurationMin,
          qualityScore,
        };
      })
      .sort((a, b) => a.week.localeCompare(b.week));

    const recoveredCount = recoveredDurationsHours.length;
    const totalPartialSaves = partials.length;

    return NextResponse.json({
      summary: {
        totalPartialSaves,
        recoveredCount,
        recoveryRate:
          totalPartialSaves > 0 ? round1((recoveredCount / totalPartialSaves) * 100) : 0,
        medianHoursToRecover: median(recoveredDurationsHours),
        avgHoursToRecover:
          recoveredDurationsHours.length > 0
            ? round1(
                recoveredDurationsHours.reduce((sum, value) => sum + value, 0) /
                  recoveredDurationsHours.length
              )
            : null,
      },
      resumePoints: [...resumePoints.entries()]
        .map(([currentIndex, count]) => ({ currentIndex, count }))
        .sort((a, b) => b.count - a.count),
      recoveryBySource,
      cohorts: cohortRows,
      trust: {
        windowDays: days,
        sampleSize: submissions.length,
      },
    });
  } catch (err) {
    logger.error({ err }, "Growth recovery error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
