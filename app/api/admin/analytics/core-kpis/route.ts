import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { supabaseFetch } from "@features/admin/server/supabase";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  // sorted.length > 0 above; both branches access valid indices.
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function percentile(nums: number[], p: number): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  // idx is clamped to sorted.length - 1; valid index.
  return sorted[idx]!;
}

function ageBucket(birthday: string | null | undefined): string | null {
  if (!birthday) return null;
  const dob = new Date(birthday);
  if (isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  if (age < 18 || age > 100) return null;
  if (age < 25) return "18–24";
  if (age < 35) return "25–34";
  if (age < 45) return "35–44";
  if (age < 55) return "45–54";
  if (age < 65) return "55–64";
  return "65+";
}

function topNWithOther<T extends { count: number }>(
  rows: T[],
  n: number,
  labelKey: keyof T
): Array<T | { count: number; [k: string]: string | number }> {
  if (rows.length <= n) return rows;
  const top = rows.slice(0, n);
  const other = rows.slice(n).reduce((sum, r) => sum + r.count, 0);
  return [...top, { count: other, [labelKey as string]: "Other" }];
}

function pctChange(curr: number, prev: number): number {
  return Math.round(((curr - prev) / Math.max(prev, 1)) * 100);
}

function safeDiv(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Response shape
// ─────────────────────────────────────────────────────────────────────────────

interface SegmentRow {
  label: string;
  count: number;
  pct: number;
}

interface DailyPoint {
  date: string;
  count: number;
}

interface CoreKpiResponse {
  range: { since: string; days: number; daysInRange: number };
  marketingInput: {
    adSpendEur: number | null;
    channelMix: Array<{ channel: string; spend: number; pct: number }> | null;
    cpcEur: number | null;
  };
  traffic: {
    uniqueVisitors: number | null;
  };
  surveyStart: {
    attempts: number;
    visitToSurveyCvr: number | null;
  };
  surveyCompletion: {
    completed: number;
    completionRate: number;
    costPerCompletedEur: number | null;
    dropOffRate: number;
    avgDurationMinutes: number | null;
    medianDurationMinutes: number | null;
    p90DurationMinutes: number | null;
    completionsPerDay: number;
    daily: DailyPoint[];
  };
  monetization: {
    paidReports: number;
    surveyToPaidCvr: number | null;
    paidPerDay: number;
    daily: DailyPoint[];
  };
  revenue: {
    arppEur: number | null;
    totalRevenueEur: number;
  };
  unitEconomics: {
    cpprEur: number | null;
    cb1Eur: number | null;
    cb1PerReportEur: number | null;
  };
  engagement: {
    reopenRate: number | null;
    medianSessionMinutes: number | null;
    p90SessionMinutes: number | null;
  };
  perceivedValue: {
    sentimentScore: number | null;
    upCount: number;
    downCount: number;
    sampleSize: number;
  };
  virality: {
    referAFriendRate: number | null;
    reportShareRate: number | null;
    avgInvitesPerReferrer: number | null;
    emailShareViewRate: number | null;
  };
  retention: {
    returnVisitRate: number | null;
  };
  efficiency: {
    roas: number | null;
  };
  segmentation: {
    completion: {
      archetype: SegmentRow[];
      country: SegmentRow[];
      gender: SegmentRow[];
      age: SegmentRow[];
    };
    paid: {
      archetype: SegmentRow[];
      country: SegmentRow[];
      gender: SegmentRow[];
      age: SegmentRow[];
    };
  };
  deltas: {
    completed: number | null;
    revenue: number | null;
    paidReports: number | null;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET handler
// ─────────────────────────────────────────────────────────────────────────────

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
    bucket: "admin-core-kpis",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const daysInRange = days > 0 ? days : 365; // for per-day denominators when "all time"
  const since =
    days > 0
      ? new Date(Date.now() - days * 86_400_000).toISOString()
      : new Date("2000-01-01").toISOString();
  const prevSince =
    days > 0
      ? new Date(Date.now() - days * 2 * 86_400_000).toISOString()
      : new Date("2000-01-01").toISOString();
  const prevUntil = since;

  // Initialise nullable section payloads up-front so per-branch failures degrade gracefully.
  const response: CoreKpiResponse = {
    range: { since, days, daysInRange },
    marketingInput: { adSpendEur: null, channelMix: null, cpcEur: null },
    traffic: { uniqueVisitors: null },
    surveyStart: { attempts: 0, visitToSurveyCvr: null },
    surveyCompletion: {
      completed: 0,
      completionRate: 0,
      costPerCompletedEur: null,
      dropOffRate: 0,
      avgDurationMinutes: null,
      medianDurationMinutes: null,
      p90DurationMinutes: null,
      completionsPerDay: 0,
      daily: [],
    },
    monetization: { paidReports: 0, surveyToPaidCvr: null, paidPerDay: 0, daily: [] },
    revenue: { arppEur: null, totalRevenueEur: 0 },
    unitEconomics: { cpprEur: null, cb1Eur: null, cb1PerReportEur: null },
    engagement: { reopenRate: null, medianSessionMinutes: null, p90SessionMinutes: null },
    perceivedValue: { sentimentScore: null, upCount: 0, downCount: 0, sampleSize: 0 },
    virality: {
      referAFriendRate: null,
      reportShareRate: null,
      avgInvitesPerReferrer: null,
      emailShareViewRate: null,
    },
    retention: { returnVisitRate: null },
    efficiency: { roas: null },
    segmentation: {
      completion: { archetype: [], country: [], gender: [], age: [] },
      paid: { archetype: [], country: [], gender: [], age: [] },
    },
    deltas: { completed: null, revenue: null, paidReports: null },
  };

  try {
    // ─── 1. Marketing Input + Traffic (manual entries) ──────────────────────
    try {
      const spendRes = await supabaseFetch(
        `/rest/v1/marketing_spend?select=channel,spend_eur,clicks,unique_visitors&date=gte.${since.slice(
          0,
          10
        )}`,
        { headers: { Range: "0-9999" } }
      );
      if (spendRes.ok) {
        const rows = (await spendRes.json()) as Array<{
          channel: string;
          spend_eur: string | number;
          clicks: number;
          unique_visitors: number;
        }>;
        const totalSpend = rows.reduce((s, r) => s + Number(r.spend_eur), 0);
        const totalClicks = rows.reduce((s, r) => s + r.clicks, 0);
        const totalVisitors = rows.reduce((s, r) => s + r.unique_visitors, 0);
        const channelMap = new Map<string, number>();
        for (const r of rows) {
          channelMap.set(r.channel, (channelMap.get(r.channel) ?? 0) + Number(r.spend_eur));
        }
        const channelMix = [...channelMap.entries()]
          .map(([channel, spend]) => ({
            channel,
            spend: Math.round(spend * 100) / 100,
            pct: totalSpend > 0 ? Math.round((spend / totalSpend) * 1000) / 10 : 0,
          }))
          .sort((a, b) => b.spend - a.spend);
        response.marketingInput = {
          adSpendEur: rows.length > 0 ? Math.round(totalSpend * 100) / 100 : null,
          channelMix: rows.length > 0 ? channelMix : null,
          cpcEur: totalClicks > 0 ? Math.round((totalSpend / totalClicks) * 10000) / 10000 : null,
        };
        response.traffic.uniqueVisitors = rows.length > 0 ? totalVisitors : null;
      }
    } catch (err) {
      logger.error({ err }, "core-kpis: marketing_spend query failed (non-blocking)");
    }

    // ─── 2. Survey funnel (submissions + partial-save sessions) ─────────────
    let submissionRows: Array<{
      id: number;
      user_id: number;
      status: string;
      duration_ms: number | null;
      created_date_time: string;
    }> = [];
    let completedIds: number[] = [];
    let completedUserIds: number[] = [];
    try {
      const submissionsRes = await supabaseFetch(
        `/rest/v1/survey_submission?select=id,user_id,status,duration_ms,created_date_time&created_date_time=gte.${since}`,
        { headers: { Range: "0-49999" } }
      );
      if (submissionsRes.ok) {
        submissionRows = await submissionsRes.json();
        const completed = submissionRows.filter((s) => s.status === "completed");
        completedIds = completed.map((s) => s.id);
        completedUserIds = completed.map((s) => s.user_id);

        const partialRes = await supabaseFetch(
          `/rest/v1/survey_partial_save?select=session_id,started_at&saved_at=gte.${since}`,
          { headers: { Range: "0-49999", Prefer: "count=exact" } }
        );
        const partialCount = partialRes.ok
          ? parseInt(partialRes.headers.get("content-range")?.split("/")[1] || "0", 10)
          : 0;
        // Attempts = distinct partial-save sessions (open/abandoned) + completed submissions.
        // A completed session writes both rows but partial_save is keyed by session_id while
        // submission rows are independent — we use SUM as the upper bound.
        const attempts = partialCount + completed.length;

        const durationsMs = completed
          .map((s) => s.duration_ms)
          .filter((d): d is number => d != null && d > 0);
        const avgMs =
          durationsMs.length > 0
            ? durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length
            : null;
        const medMs = median(durationsMs);
        const p90Ms = percentile(durationsMs, 90);

        const dailyMap = new Map<string, number>();
        for (const s of completed) {
          const day = s.created_date_time.slice(0, 10);
          dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
        }
        const daily = [...dailyMap.entries()]
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => a.date.localeCompare(b.date));

        const completionRate =
          attempts > 0 ? Math.round((completed.length / attempts) * 1000) / 10 : 0;

        response.surveyStart = {
          attempts,
          visitToSurveyCvr:
            response.traffic.uniqueVisitors != null && response.traffic.uniqueVisitors > 0
              ? Math.round((attempts / response.traffic.uniqueVisitors) * 1000) / 10
              : null,
        };
        response.surveyCompletion = {
          completed: completed.length,
          completionRate,
          costPerCompletedEur:
            response.marketingInput.adSpendEur != null && completed.length > 0
              ? Math.round((response.marketingInput.adSpendEur / completed.length) * 100) / 100
              : null,
          dropOffRate: Math.round((100 - completionRate) * 10) / 10,
          avgDurationMinutes: avgMs != null ? Math.round((avgMs / 60_000) * 10) / 10 : null,
          medianDurationMinutes: medMs != null ? Math.round((medMs / 60_000) * 10) / 10 : null,
          p90DurationMinutes: p90Ms != null ? Math.round((p90Ms / 60_000) * 10) / 10 : null,
          completionsPerDay: Math.round((completed.length / daysInRange) * 10) / 10,
          daily,
        };
      }
    } catch (err) {
      logger.error({ err }, "core-kpis: survey funnel failed (non-blocking)");
    }

    // ─── 3. Monetization + Revenue ──────────────────────────────────────────
    let succeededPayments: Array<{
      id: number;
      user_id: number;
      personal_report_id: number | null;
      amount: string | number;
      payment_date_time: string | null;
      created_date_time: string;
    }> = [];
    try {
      const paymentRes = await supabaseFetch(
        `/rest/v1/payment?select=id,user_id,personal_report_id,amount,payment_date_time,created_date_time&status=eq.succeeded&created_date_time=gte.${since}`,
        { headers: { Range: "0-49999" } }
      );
      if (paymentRes.ok) {
        succeededPayments = await paymentRes.json();
        const totalRevenue = succeededPayments.reduce((s, p) => s + Number(p.amount ?? 0), 0);
        const paidReports = succeededPayments.length;

        const payDailyMap = new Map<string, number>();
        for (const p of succeededPayments) {
          const day = (p.payment_date_time ?? p.created_date_time).slice(0, 10);
          payDailyMap.set(day, (payDailyMap.get(day) ?? 0) + 1);
        }
        const paidDaily = [...payDailyMap.entries()]
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => a.date.localeCompare(b.date));

        response.monetization = {
          paidReports,
          surveyToPaidCvr:
            response.surveyCompletion.completed > 0
              ? Math.round((paidReports / response.surveyCompletion.completed) * 1000) / 10
              : null,
          paidPerDay: Math.round((paidReports / daysInRange) * 10) / 10,
          daily: paidDaily,
        };
        response.revenue = {
          arppEur: paidReports > 0 ? Math.round((totalRevenue / paidReports) * 100) / 100 : null,
          totalRevenueEur: Math.round(totalRevenue * 100) / 100,
        };

        // Unit economics — derived
        if (response.marketingInput.adSpendEur != null) {
          const adSpend = response.marketingInput.adSpendEur;
          response.unitEconomics = {
            cpprEur: paidReports > 0 ? Math.round((adSpend / paidReports) * 100) / 100 : null,
            cb1Eur: Math.round((totalRevenue - adSpend) * 100) / 100,
            cb1PerReportEur:
              paidReports > 0
                ? Math.round(((totalRevenue - adSpend) / paidReports) * 100) / 100
                : null,
          };
          response.efficiency.roas =
            adSpend > 0 ? Math.round((totalRevenue / adSpend) * 100) / 100 : null;
        }
      }
    } catch (err) {
      logger.error({ err }, "core-kpis: payment query failed (non-blocking)");
    }

    // ─── 4. Engagement (report_session) ─────────────────────────────────────
    try {
      const sessionRes = await supabaseFetch(
        `/rest/v1/report_session?select=user_id,personal_report_id,started_at,ended_at&started_at=gte.${since}`,
        { headers: { Range: "0-99999" } }
      );
      if (sessionRes.ok) {
        const sessions = (await sessionRes.json()) as Array<{
          user_id: number | null;
          personal_report_id: number;
          started_at: string;
          ended_at: string | null;
        }>;
        const uniqueReports = new Set(sessions.map((s) => s.personal_report_id));
        const reopenRate =
          uniqueReports.size > 0
            ? Math.round(((sessions.length - uniqueReports.size) / uniqueReports.size) * 1000) / 10
            : null;
        const durationsMs = sessions
          .filter((s) => s.ended_at != null)
          .map((s) => new Date(s.ended_at!).getTime() - new Date(s.started_at).getTime())
          .filter((d) => d > 0 && d < 4 * 3600_000); // sanity-cap at 4h
        const medMs = median(durationsMs);
        const p90Ms = percentile(durationsMs, 90);
        response.engagement = {
          reopenRate,
          medianSessionMinutes: medMs != null ? Math.round((medMs / 60_000) * 10) / 10 : null,
          p90SessionMinutes: p90Ms != null ? Math.round((p90Ms / 60_000) * 10) / 10 : null,
        };

        // Retention (early): users with >=2 distinct report sessions
        const userSessionCount = new Map<number, number>();
        for (const s of sessions) {
          if (s.user_id == null) continue;
          userSessionCount.set(s.user_id, (userSessionCount.get(s.user_id) ?? 0) + 1);
        }
        const returnUsers = [...userSessionCount.values()].filter((c) => c >= 2).length;
        if (response.monetization.paidReports > 0) {
          response.retention.returnVisitRate =
            Math.round((returnUsers / response.monetization.paidReports) * 1000) / 10;
        }
      }
    } catch (err) {
      logger.error({ err }, "core-kpis: report_session query failed (non-blocking)");
    }

    // ─── 5. Perceived Value (sentiment via report_section_feedback) ─────────
    try {
      const fbRes = await supabaseFetch(
        `/rest/v1/report_section_feedback?select=feedback&created_at=gte.${since}`,
        { headers: { Range: "0-99999" } }
      );
      if (fbRes.ok) {
        const rows = (await fbRes.json()) as Array<{ feedback: "up" | "down" }>;
        const up = rows.filter((r) => r.feedback === "up").length;
        const down = rows.filter((r) => r.feedback === "down").length;
        const total = up + down;
        response.perceivedValue = {
          sentimentScore: total > 0 ? Math.round((up / total) * 1000) / 10 : null,
          upCount: up,
          downCount: down,
          sampleSize: total,
        };
      }
    } catch (err) {
      logger.error({ err }, "core-kpis: feedback query failed (non-blocking)");
    }

    // ─── 6. Virality (invite_event + report_share) ──────────────────────────
    try {
      const inviteRes = await supabaseFetch(
        `/rest/v1/invite_event?select=referrer_email&created_at=gte.${since}`,
        { headers: { Range: "0-99999" } }
      );
      if (inviteRes.ok) {
        const invites = (await inviteRes.json()) as Array<{ referrer_email: string | null }>;
        const referrerCount = new Map<string, number>();
        for (const inv of invites) {
          if (!inv.referrer_email) continue;
          referrerCount.set(inv.referrer_email, (referrerCount.get(inv.referrer_email) ?? 0) + 1);
        }
        const distinctReferrers = referrerCount.size;
        const totalInvites = invites.length;

        if (response.monetization.paidReports > 0) {
          response.virality.referAFriendRate =
            Math.round((distinctReferrers / response.monetization.paidReports) * 1000) / 10;
        }
        response.virality.avgInvitesPerReferrer =
          distinctReferrers > 0 ? Math.round((totalInvites / distinctReferrers) * 10) / 10 : null;
      }

      const shareRes = await supabaseFetch(
        `/rest/v1/report_share?select=personal_report_id,view_count&created_at=gte.${since}`,
        { headers: { Range: "0-99999" } }
      );
      if (shareRes.ok) {
        const shares = (await shareRes.json()) as Array<{
          personal_report_id: number;
          view_count: number;
        }>;
        const sharedReports = new Set(shares.map((s) => s.personal_report_id));
        if (response.monetization.paidReports > 0) {
          response.virality.reportShareRate =
            Math.round((sharedReports.size / response.monetization.paidReports) * 1000) / 10;
        }
        const opened = shares.filter((s) => s.view_count > 0).length;
        response.virality.emailShareViewRate =
          shares.length > 0 ? Math.round((opened / shares.length) * 1000) / 10 : null;
      }
    } catch (err) {
      logger.error({ err }, "core-kpis: virality query failed (non-blocking)");
    }

    // ─── 7. Segmentation ────────────────────────────────────────────────────
    try {
      // Archetype distribution — completion + paid
      let scoringRows: Array<{
        survey_submission_id: number;
        primary_archetype: string;
      }> = [];
      if (completedIds.length > 0) {
        const scoringRes = await supabaseFetch(
          `/rest/v1/scoring_result?select=survey_submission_id,primary_archetype&survey_submission_id=in.(${completedIds.join(",")})`,
          { headers: { Range: "0-49999" } }
        );
        if (scoringRes.ok) scoringRows = await scoringRes.json();
      }

      const buildPctRows = (counts: Map<string, number>): SegmentRow[] => {
        const total = [...counts.values()].reduce((s, c) => s + c, 0);
        if (total === 0) return [];
        return [...counts.entries()]
          .map(([label, count]) => ({
            label,
            count,
            pct: Math.round((count / total) * 1000) / 10,
          }))
          .sort((a, b) => b.count - a.count);
      };

      // Completion archetype
      const compArchMap = new Map<string, number>();
      for (const r of scoringRows) {
        compArchMap.set(r.primary_archetype, (compArchMap.get(r.primary_archetype) ?? 0) + 1);
      }
      response.segmentation.completion.archetype = buildPctRows(compArchMap);

      // Paid archetype — restrict to scored submissions whose users paid
      const paidUserIds = new Set(succeededPayments.map((p) => p.user_id));
      const paidSubmissionIds = new Set(
        submissionRows.filter((s) => paidUserIds.has(s.user_id)).map((s) => s.id)
      );
      const paidArchMap = new Map<string, number>();
      for (const r of scoringRows) {
        if (paidSubmissionIds.has(r.survey_submission_id)) {
          paidArchMap.set(r.primary_archetype, (paidArchMap.get(r.primary_archetype) ?? 0) + 1);
        }
      }
      response.segmentation.paid.archetype = buildPctRows(paidArchMap);

      // Demographics via app_user → user_profile
      const allUserIds = new Set([...completedUserIds, ...paidUserIds]);
      if (allUserIds.size > 0) {
        const userIdList = [...allUserIds].join(",");
        const userRes = await supabaseFetch(
          `/rest/v1/app_user?select=id,user_profile_id&id=in.(${userIdList})`,
          { headers: { Range: "0-49999" } }
        );
        if (userRes.ok) {
          const users = (await userRes.json()) as Array<{
            id: number;
            user_profile_id: number | null;
          }>;
          const profileIds = users
            .map((u) => u.user_profile_id)
            .filter((id): id is number => id != null);
          if (profileIds.length > 0) {
            const profileRes = await supabaseFetch(
              `/rest/v1/user_profile?select=id,gender,location_primary,birthday&id=in.(${profileIds.join(",")})`,
              { headers: { Range: "0-49999" } }
            );
            if (profileRes.ok) {
              const profiles = (await profileRes.json()) as Array<{
                id: number;
                gender: string | null;
                location_primary: string | null;
                birthday: string | null;
              }>;
              const profileById = new Map(profiles.map((p) => [p.id, p]));
              const userToProfile = new Map<number, (typeof profiles)[0]>();
              for (const u of users) {
                const p = u.user_profile_id ? profileById.get(u.user_profile_id) : undefined;
                if (p) userToProfile.set(u.id, p);
              }

              const fillSegments = (userIds: Iterable<number>) => {
                const country = new Map<string, number>();
                const gender = new Map<string, number>();
                const age = new Map<string, number>();
                for (const uid of userIds) {
                  const p = userToProfile.get(uid);
                  if (!p) continue;
                  if (p.location_primary)
                    country.set(p.location_primary, (country.get(p.location_primary) ?? 0) + 1);
                  if (p.gender) gender.set(p.gender, (gender.get(p.gender) ?? 0) + 1);
                  const b = ageBucket(p.birthday);
                  if (b) age.set(b, (age.get(b) ?? 0) + 1);
                }
                return {
                  country: buildPctRows(country),
                  gender: buildPctRows(gender),
                  age: buildPctRows(age),
                };
              };

              const compSeg = fillSegments(completedUserIds);
              response.segmentation.completion.country = compSeg.country;
              response.segmentation.completion.gender = compSeg.gender;
              response.segmentation.completion.age = compSeg.age;

              const paidSeg = fillSegments(paidUserIds);
              response.segmentation.paid.country = paidSeg.country;
              response.segmentation.paid.gender = paidSeg.gender;
              response.segmentation.paid.age = paidSeg.age;
            }
          }
        }
      }
    } catch (err) {
      logger.error({ err }, "core-kpis: segmentation query failed (non-blocking)");
    }

    // Top-N + Other for chart-friendly display
    response.segmentation.completion.country = topNWithOther(
      response.segmentation.completion.country,
      10,
      "label"
    ) as SegmentRow[];
    response.segmentation.paid.country = topNWithOther(
      response.segmentation.paid.country,
      10,
      "label"
    ) as SegmentRow[];

    // ─── 8. Period-over-period deltas ────────────────────────────────────────
    // Skip when window is "all time" — there is no prior window to compare against,
    // and a 0-row prev period would yield meaningless deltas.
    if (days <= 0) {
      return NextResponse.json(response);
    }
    try {
      const [prevSubsRes, prevPayRes] = await Promise.all([
        supabaseFetch(
          `/rest/v1/survey_submission?select=id&status=eq.completed&created_date_time=gte.${prevSince}&created_date_time=lt.${prevUntil}`,
          { headers: { Prefer: "count=exact", Range: "0-0" } }
        ),
        supabaseFetch(
          `/rest/v1/payment?select=id,amount&status=eq.succeeded&created_date_time=gte.${prevSince}&created_date_time=lt.${prevUntil}`,
          { headers: { Range: "0-49999" } }
        ),
      ]);
      const prevCompleted = prevSubsRes.ok
        ? parseInt(prevSubsRes.headers.get("content-range")?.split("/")[1] || "0", 10)
        : 0;
      let prevRevenue = 0;
      let prevPaid = 0;
      if (prevPayRes.ok) {
        const prevPayments = (await prevPayRes.json()) as Array<{ amount: string | number }>;
        prevPaid = prevPayments.length;
        prevRevenue = prevPayments.reduce((s, p) => s + Number(p.amount ?? 0), 0);
      }
      response.deltas = {
        completed: pctChange(response.surveyCompletion.completed, prevCompleted),
        revenue: pctChange(response.revenue.totalRevenueEur, prevRevenue),
        paidReports: pctChange(response.monetization.paidReports, prevPaid),
      };
    } catch (err) {
      logger.error({ err }, "core-kpis: deltas failed (non-blocking)");
    }

    return NextResponse.json(response);
  } catch (err) {
    logger.error({ err }, "core-kpis route fatal error");
    return NextResponse.json({ error: "Unable to load core KPIs." }, { status: 500 });
  }
}

// `safeDiv` is exported so tests + future routes can share it without
// re-implementing the divide-by-zero guard.
export { safeDiv };
