import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { supabaseFetch } from "@features/admin/server/supabase";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

/** Extract utm_source from a JSON utm_tracker string, falling back to the raw value. */
function parseUtmSource(tracker: string | null, fallback = "Direct"): string {
  if (!tracker?.trim()) return fallback;
  try {
    const parsed = JSON.parse(tracker);
    return parsed.utm_source || fallback;
  } catch {
    return tracker.trim();
  }
}

function incrementCount<K>(map: Map<K, number>, key: K, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  if (map.has(key)) {
    return map.get(key) as V;
  }

  const value = create();
  map.set(key, value);
  return value;
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
    bucket: "admin-stats",
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
    const [submissionsRes, behaviorRes, recentRes] = await Promise.all([
      // Q1: Total submissions & completion stats
      supabaseFetch(
        `/rest/v1/survey_submission?select=id,status,created_date_time,duration_ms,utm_tracker&created_date_time=gte.${since}`,
        { headers: { Prefer: "count=exact", Range: "0-49999" } }
      ),
      // Q2: Behavior stats via RPC (replaces raw behavior query)
      supabaseFetch("/rest/v1/rpc/get_behavior_stats", {
        method: "POST",
        body: JSON.stringify({ since_ts: since }),
      }),
      // Q3: Submissions over time (daily counts)
      supabaseFetch(
        `/rest/v1/survey_submission?select=created_date_time&created_date_time=gte.${since}&order=created_date_time.asc`
      ),
    ]);

    if (!submissionsRes.ok || !behaviorRes.ok || !recentRes.ok) {
      logger.error("Admin stats: one or more Supabase queries failed");
      return NextResponse.json({ error: "Unable to load stats." }, { status: 500 });
    }

    const totalCount = parseInt(
      submissionsRes.headers.get("content-range")?.split("/")[1] || "0",
      10
    );
    const submissions = (await submissionsRes.json()) as Array<{
      id: number;
      status: string;
      created_date_time: string;
      duration_ms: number | null;
      utm_tracker: string | null;
    }>;

    const completed = submissions.filter((s) => s.status === "completed");
    const completionRate = totalCount > 0 ? Math.round((completed.length / totalCount) * 100) : 0;

    // Average duration (only submissions with duration_ms)
    const durationsMs = submissions
      .map((s) => s.duration_ms)
      .filter((d): d is number => d != null && d > 0);
    const avgDurationMs =
      durationsMs.length > 0
        ? Math.round(durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length)
        : null;

    // Status breakdown
    const statusBreakdown = {
      completed: submissions.filter((s) => s.status === "completed").length,
      flagged: submissions.filter((s) => s.status === "flagged").length,
      archived: submissions.filter((s) => s.status === "archived").length,
    };

    // Today's submissions
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayCount = submissions.filter(
      (s) => s.created_date_time.slice(0, 10) === todayStr
    ).length;

    // Q2: Behavior stats from RPC
    const behaviorData = await behaviorRes.json();
    const dropOff = (behaviorData.dropOff ?? [])
      .filter((d: { q_id: string }) => !d.q_id.startsWith("00"))
      .map((d: { q_id: string; count: number }) => ({
        qId: d.q_id,
        count: d.count,
      }));
    // Defense-in-depth: exclude intro fields (00xxx) from avgTime and backtrack
    const avgTimePerQuestion = (behaviorData.avgTimePerQuestion ?? [])
      .filter((d: { q_id: string }) => !d.q_id.startsWith("00"))
      .map((d: { q_id: string; avg_ms: number }) => ({ qId: d.q_id, avgMs: d.avg_ms }));
    const funnel = behaviorData.funnel
      ? {
          uniqueSessions: behaviorData.funnel.unique_sessions ?? 0,
          completedSessions: behaviorData.funnel.completed_sessions ?? 0,
          abandonedSessions: behaviorData.funnel.abandoned_sessions ?? 0,
        }
      : { uniqueSessions: 0, completedSessions: 0, abandonedSessions: 0 };
    const chapterDropOff = behaviorData.chapterDropOff ?? [];
    const backtrackRateData = behaviorData.backtrackRate ?? { back_count: 0, forward_count: 0 };
    const totalMoves = backtrackRateData.back_count + backtrackRateData.forward_count;
    const backtrackRate =
      totalMoves > 0 ? Math.round((backtrackRateData.back_count / totalMoves) * 100) : 0;
    const backtrackByQuestion = (behaviorData.backtrackByQuestion ?? [])
      .filter((d: { q_id: string }) => !d.q_id.startsWith("00"))
      .map((d: { q_id: string; count: number }) => ({ qId: d.q_id, count: d.count }));
    const chapterFunnel = (behaviorData.chapterFunnel ?? []).map(
      (d: { chapter: string; sessions: number }) => ({
        chapter: d.chapter,
        sessions: d.sessions,
      })
    );

    // Duration buckets
    const durationBuckets = { under5m: 0, fiveTo15m: 0, fifteenTo30m: 0, over30m: 0 };
    for (const ms of durationsMs) {
      if (ms < 300_000) durationBuckets.under5m++;
      else if (ms < 900_000) durationBuckets.fiveTo15m++;
      else if (ms < 1_800_000) durationBuckets.fifteenTo30m++;
      else durationBuckets.over30m++;
    }

    // UTM source breakdown (top 10)
    const utmMap = new Map<string, number>();
    for (const s of submissions) {
      const source = parseUtmSource(s.utm_tracker);
      incrementCount(utmMap, source);
    }
    const utmSources = [...utmMap.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Completion rate by UTM source (min 2 submissions per source)
    const utmCompletionMap = new Map<string, { completed: number; total: number }>();
    for (const s of submissions) {
      const source = parseUtmSource(s.utm_tracker);
      const completionStats = getOrCreate(utmCompletionMap, source, () => ({
        completed: 0,
        total: 0,
      }));
      completionStats.total++;
      if (s.status === "completed") completionStats.completed++;
    }
    const completionByUtm = [...utmCompletionMap.entries()]
      .filter(([, v]) => v.total >= 2)
      .map(([source, v]) => ({
        source,
        rate: Math.round((v.completed / v.total) * 100),
        completed: v.completed,
        total: v.total,
      }))
      .sort((a, b) => b.rate - a.rate);

    // Peak submission hours (0-23)
    const hourMap = new Map<number, number>();
    for (const s of submissions) {
      const hour = new Date(s.created_date_time).getUTCHours();
      incrementCount(hourMap, hour);
    }
    const hourly = [...hourMap.entries()]
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour - b.hour);

    // Daily submission counts
    const recentSubmissions = (await recentRes.json()) as Array<{ created_date_time: string }>;
    const dailyMap = new Map<string, number>();
    for (const s of recentSubmissions) {
      const day = s.created_date_time.slice(0, 10);
      incrementCount(dailyMap, day);
    }
    const daily = [...dailyMap.entries()].map(([date, count]) => ({ date, count }));

    // Q4: Waitlist data (graceful degradation)
    let waitlistTotal: number | null = null;
    let waitlistToday: number | null = null;
    let waitlistDaily: Array<{ date: string; count: number }> | null = null;
    let waitlistUtmSources: Array<{ source: string; count: number }> | null = null;
    let waitlistHourly: Array<{ hour: number; count: number }> | null = null;

    try {
      const waitlistRes = await supabaseFetch(
        `/rest/v1/waitlist_user?select=id,utm_tracker,created_date_time&created_date_time=gte.${since}&order=created_date_time.asc`,
        { headers: { Prefer: "count=exact" } }
      );
      if (waitlistRes.ok) {
        waitlistTotal = parseInt(
          waitlistRes.headers.get("content-range")?.split("/")[1] || "0",
          10
        );
        const waitlistRows = (await waitlistRes.json()) as Array<{
          id: number;
          utm_tracker: string | null;
          created_date_time: string;
        }>;
        waitlistToday = waitlistRows.filter(
          (w) => w.created_date_time.slice(0, 10) === todayStr
        ).length;
        // Daily trend
        const wDailyMap = new Map<string, number>();
        for (const w of waitlistRows) {
          const day = w.created_date_time.slice(0, 10);
          incrementCount(wDailyMap, day);
        }
        waitlistDaily = [...wDailyMap.entries()].map(([date, count]) => ({ date, count }));
        // UTM sources
        const wUtmMap = new Map<string, number>();
        for (const w of waitlistRows) {
          const source = parseUtmSource(w.utm_tracker);
          incrementCount(wUtmMap, source);
        }
        waitlistUtmSources = [...wUtmMap.entries()]
          .map(([source, count]) => ({ source, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        // Waitlist peak hours
        const wHourMap = new Map<number, number>();
        for (const w of waitlistRows) {
          const hour = new Date(w.created_date_time).getUTCHours();
          incrementCount(wHourMap, hour);
        }
        waitlistHourly = [...wHourMap.entries()]
          .map(([hour, count]) => ({ hour, count }))
          .sort((a, b) => a.hour - b.hour);
      }
    } catch (err) {
      logger.error({ err }, "Admin stats: waitlist query failed (non-blocking)");
    }

    // Q5: Answer-level insights (graceful degradation)
    let countryDistribution: Array<{ country: string; count: number }> | null = null;
    let scaleAvg: Array<{ qId: string; avg: number }> | null = null;
    let skipRate: Array<{ qId: string; skipped: number; total: number }> | null = null;
    let revisionHotspots: Array<{
      qId: string;
      avgRevisions: number;
      totalRevisions: number;
    }> | null = null;

    const submissionIds = submissions.map((s) => s.id);

    try {
      if (submissionIds.length === 0) {
        countryDistribution = [];
        scaleAvg = [];
        skipRate = [];
        revisionHotspots = [];
      }

      const answerFields =
        "answer_text,normalized_value,was_skipped,revision_count,survey_question(frontend_qid,type),answer_option!fk_ssa_answer_option(option_text)";
      const answersRes =
        submissionIds.length > 0
          ? await supabaseFetch(
              `/rest/v1/survey_submission_answer?select=${answerFields}&survey_submission_id=in.(${submissionIds.join(",")})`,
              { headers: { Range: "0-99999" } }
            )
          : null;
      if (answersRes?.ok) {
        const answers = (await answersRes.json()) as Array<{
          answer_text: string | null;
          normalized_value: number | null;
          was_skipped: boolean;
          revision_count: number | null;
          survey_question: { frontend_qid: string; type: string } | null;
          answer_option: { option_text: string } | null;
        }>;

        // Country distribution (qId 15001) — includes both free-text and option-based answers
        const countryMap = new Map<string, number>();
        for (const a of answers) {
          if (a.survey_question?.frontend_qid === "15001") {
            const country = (a.answer_text || a.answer_option?.option_text || "").trim();
            if (country) incrementCount(countryMap, country);
          }
        }
        countryDistribution = [...countryMap.entries()]
          .map(([country, count]) => ({ country, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 15);

        // Scale question averages
        const scaleMap = new Map<string, { sum: number; count: number }>();
        for (const a of answers) {
          if (a.survey_question?.type === "scale" && a.normalized_value != null) {
            const qId = a.survey_question.frontend_qid;
            const scaleStats = getOrCreate(scaleMap, qId, () => ({ sum: 0, count: 0 }));
            scaleStats.sum += a.normalized_value;
            scaleStats.count++;
          }
        }
        scaleAvg = [...scaleMap.entries()]
          .map(([qId, { sum, count }]) => ({
            qId,
            avg: Math.round((sum / count) * 10) / 10,
          }))
          .sort((a, b) => a.avg - b.avg)
          .slice(0, 15);

        // Skip rate per question
        const skipMap = new Map<string, { skipped: number; total: number }>();
        for (const a of answers) {
          const qId = a.survey_question?.frontend_qid;
          if (!qId) continue;
          const skipStats = getOrCreate(skipMap, qId, () => ({ skipped: 0, total: 0 }));
          skipStats.total++;
          if (a.was_skipped) skipStats.skipped++;
        }
        skipRate = [...skipMap.entries()]
          .filter(([, v]) => v.skipped > 0)
          .map(([qId, v]) => ({ qId, skipped: v.skipped, total: v.total }))
          .sort((a, b) => b.skipped - a.skipped)
          .slice(0, 15);

        // Revision hotspots (most revised questions)
        const revisionMap = new Map<string, { totalRevisions: number; count: number }>();
        for (const a of answers) {
          const qId = a.survey_question?.frontend_qid;
          if (!qId || !a.revision_count || a.revision_count <= 0) continue;
          const revisionStats = getOrCreate(revisionMap, qId, () => ({
            totalRevisions: 0,
            count: 0,
          }));
          revisionStats.totalRevisions += a.revision_count;
          revisionStats.count++;
        }
        revisionHotspots = [...revisionMap.entries()]
          .map(([qId, v]) => ({
            qId,
            avgRevisions: Math.round((v.totalRevisions / v.count) * 10) / 10,
            totalRevisions: v.totalRevisions,
          }))
          .sort((a, b) => b.totalRevisions - a.totalRevisions)
          .slice(0, 15);
      }
    } catch (err) {
      logger.error({ err }, "Admin stats: answers query failed (non-blocking)");
    }

    // Q6: Scoring analytics (graceful degradation)
    let scoredCount: number | null = null;
    let archetypeDistribution: Array<{ archetype: string; count: number }> | null = null;
    let v5ArchetypeDistribution: Array<{ archetype: string; count: number }> | null = null;

    try {
      if (submissionIds.length === 0) {
        scoredCount = 0;
        archetypeDistribution = [];
        v5ArchetypeDistribution = [];
      } else {
        const scoringSelect = "primary_archetype,v5_primary_archetype";
        const scoringRes = await supabaseFetch(
          `/rest/v1/scoring_result?select=${scoringSelect}&survey_submission_id=in.(${submissionIds.join(",")})`,
          { headers: { Range: "0-49999" } }
        );
        if (scoringRes.ok) {
          const scoringRows = (await scoringRes.json()) as Array<{
            primary_archetype: string;
            v5_primary_archetype: string | null;
          }>;
          scoredCount = scoringRows.length;
          const archMap = new Map<string, number>();
          const v5ArchMap = new Map<string, number>();
          for (const row of scoringRows) {
            incrementCount(archMap, row.primary_archetype);
            if (row.v5_primary_archetype) {
              incrementCount(v5ArchMap, row.v5_primary_archetype);
            }
          }
          archetypeDistribution = [...archMap.entries()]
            .map(([archetype, count]) => ({ archetype, count }))
            .sort((a, b) => b.count - a.count);
          v5ArchetypeDistribution = [...v5ArchMap.entries()]
            .map(([archetype, count]) => ({ archetype, count }))
            .sort((a, b) => b.count - a.count);
        }
      }
    } catch (err) {
      logger.error({ err }, "Admin stats: scoring query failed (non-blocking)");
    }

    // Q7: Answer distribution (graceful degradation)
    let answerDistribution: Array<{
      qId: string;
      options: Array<{ option: string; count: number }>;
    }> | null = null;

    try {
      const distRes = await supabaseFetch("/rest/v1/rpc/get_answer_distribution", {
        method: "POST",
        body: JSON.stringify({ since_ts: since }),
      });
      if (distRes.ok) {
        const distData = await distRes.json();
        const allRows = [
          ...((distData.single as Array<{ q_id: string; option_text: string; count: number }>) ??
            []),
          ...((distData.multiple as Array<{ q_id: string; option_text: string; count: number }>) ??
            []),
        ];
        // Group by qId
        const distMap = new Map<string, Array<{ option: string; count: number }>>();
        for (const row of allRows) {
          const options = getOrCreate(distMap, row.q_id, () => []);
          options.push({ option: row.option_text, count: row.count });
        }
        // Sort by total responses, take top 5 questions
        answerDistribution = [...distMap.entries()]
          .map(([qId, options]) => ({ qId, options }))
          .sort(
            (a, b) =>
              b.options.reduce((s, o) => s + o.count, 0) -
              a.options.reduce((s, o) => s + o.count, 0)
          )
          .slice(0, 5);
      }
    } catch (err) {
      logger.error({ err }, "Admin stats: answer distribution query failed (non-blocking)");
    }

    // Q8: Invite click tracking (graceful degradation)
    let inviteClicks: {
      total: number;
      today: number;
      daily: Array<{ date: string; count: number }>;
    } | null = null;

    try {
      const inviteRes = await supabaseFetch(
        `/rest/v1/invite_event?select=id,created_at&created_at=gte.${since}&order=created_at.asc`
      );
      if (inviteRes.ok) {
        const inviteRows = (await inviteRes.json()) as Array<{
          id: number;
          created_at: string;
        }>;
        const today = inviteRows.filter((r) => r.created_at.slice(0, 10) === todayStr).length;
        const iDailyMap = new Map<string, number>();
        for (const r of inviteRows) {
          const day = r.created_at.slice(0, 10);
          incrementCount(iDailyMap, day);
        }
        inviteClicks = {
          total: inviteRows.length,
          today,
          daily: [...iDailyMap.entries()].map(([date, count]) => ({ date, count })),
        };
      }
    } catch (err) {
      logger.error({ err }, "Admin stats: invite click query failed (non-blocking)");
    }

    // Period-over-period deltas (graceful degradation)
    let deltas: {
      submissions: number;
      completionRate: number;
      avgDuration: number;
      waitlist: number | null;
      inviteClicks: number | null;
    } | null = null;

    try {
      const prevSince = new Date(Date.now() - days * 2 * 86_400_000).toISOString();
      const prevUntil = since;

      const prevSubmissionsRes = await supabaseFetch(
        `/rest/v1/survey_submission?select=id,status,duration_ms&created_date_time=gte.${prevSince}&created_date_time=lt.${prevUntil}`,
        { headers: { Prefer: "count=exact", Range: "0-49999" } }
      );

      if (prevSubmissionsRes.ok) {
        const prevTotal = parseInt(
          prevSubmissionsRes.headers.get("content-range")?.split("/")[1] || "0",
          10
        );
        const prevRows = (await prevSubmissionsRes.json()) as Array<{
          id: number;
          status: string;
          duration_ms: number | null;
        }>;
        const prevCompleted = prevRows.filter((s) => s.status === "completed").length;
        const prevCompletionRate =
          prevTotal > 0 ? Math.round((prevCompleted / prevTotal) * 100) : 0;
        const prevDurationsMs = prevRows
          .map((s) => s.duration_ms)
          .filter((d): d is number => d != null && d > 0);
        const prevAvgDurationMs =
          prevDurationsMs.length > 0
            ? Math.round(prevDurationsMs.reduce((a, b) => a + b, 0) / prevDurationsMs.length)
            : null;

        const pctChange = (curr: number, prev: number) =>
          Math.round(((curr - prev) / Math.max(prev, 1)) * 100);

        const submissionsDelta = pctChange(totalCount, prevTotal);
        const completionRateDelta = completionRate - prevCompletionRate;
        const avgDurationDelta =
          avgDurationMs != null && prevAvgDurationMs != null
            ? pctChange(avgDurationMs, prevAvgDurationMs)
            : 0;

        // Waitlist delta
        let waitlistDelta: number | null = null;
        if (waitlistTotal != null) {
          try {
            const prevWaitlistRes = await supabaseFetch(
              `/rest/v1/waitlist_user?select=id&created_date_time=gte.${prevSince}&created_date_time=lt.${prevUntil}`,
              { headers: { Prefer: "count=exact" } }
            );
            if (prevWaitlistRes.ok) {
              const prevWaitlistTotal = parseInt(
                prevWaitlistRes.headers.get("content-range")?.split("/")[1] || "0",
                10
              );
              waitlistDelta = pctChange(waitlistTotal, prevWaitlistTotal);
            }
          } catch {
            // non-blocking
          }
        }

        // Invite clicks delta
        let inviteClicksDelta: number | null = null;
        if (inviteClicks != null) {
          try {
            const prevInviteRes = await supabaseFetch(
              `/rest/v1/invite_event?select=id&created_at=gte.${prevSince}&created_at=lt.${prevUntil}`,
              { headers: { Prefer: "count=exact" } }
            );
            if (prevInviteRes.ok) {
              const prevInviteTotal = parseInt(
                prevInviteRes.headers.get("content-range")?.split("/")[1] || "0",
                10
              );
              inviteClicksDelta = pctChange(inviteClicks.total, prevInviteTotal);
            }
          } catch {
            // non-blocking
          }
        }

        deltas = {
          submissions: submissionsDelta,
          completionRate: completionRateDelta,
          avgDuration: avgDurationDelta,
          waitlist: waitlistDelta,
          inviteClicks: inviteClicksDelta,
        };
      }
    } catch (err) {
      logger.error({ err }, "Admin stats: delta computation failed (non-blocking)");
    }

    return NextResponse.json({
      totalSubmissions: totalCount,
      completionRate,
      avgDurationMs,
      statusBreakdown,
      todayCount,
      dropOff,
      daily,
      durationBuckets,
      utmSources,
      hourly,
      // Behavior analytics (from RPC)
      avgTimePerQuestion,
      funnel,
      chapterDropOff,
      backtrackRate,
      backtrackByQuestion,
      chapterFunnel,
      // Waitlist (nullable)
      waitlistTotal,
      waitlistToday,
      waitlistDaily,
      waitlistUtmSources,
      waitlistHourly,
      // Answer insights (nullable)
      countryDistribution,
      scaleAvg,
      skipRate,
      revisionHotspots,
      // Completion by UTM
      completionByUtm,
      // Scoring analytics (nullable)
      scoredCount,
      archetypeDistribution,
      v5ArchetypeDistribution,
      // Answer distribution (nullable)
      answerDistribution,
      // Invite clicks (nullable)
      inviteClicks,
      // Period-over-period deltas (nullable)
      deltas,
    });
  } catch (err) {
    logger.error({ err }, "Admin stats error");
    return NextResponse.json({ error: "Unable to load stats." }, { status: 500 });
  }
}
