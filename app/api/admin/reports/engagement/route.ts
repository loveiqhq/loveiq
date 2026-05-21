import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

interface ReportRow {
  id: number;
  created_date_time: string;
}

interface SessionRow {
  id: number;
  personal_report_id: number;
  started_at: string;
  ended_at: string | null;
}

interface SectionRatingRow {
  id: number;
  personal_report_section_id: number;
  rating: number;
  comment: string | null;
  personal_report_section: { report_section_id: number } | null;
}

interface AccessEmailRow {
  id: number;
  status: string;
}

interface ReportSectionRow {
  report_section_id: number;
}

interface SectionMeta {
  id: number;
  title: string;
}

function incrementCount<K>(map: Map<K, number>, key: K, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  const existing = map.get(key);
  if (existing) return existing;
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
    bucket: "admin-reports-engagement",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "0", 10);
  const since = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;

  try {
    // Build date filter suffix for each table's timestamp column
    const reportDateFilter = since ? `&created_date_time=gte.${since}` : "";
    const sessionDateFilter = since ? `&started_at=gte.${since}` : "";

    const [reportsRes, sessionsRes, ratingsRes, emailsRes, sectionCountsRes, sectionMetaRes] =
      await Promise.all([
        // Q1: Total reports
        supabaseFetch(
          `/rest/v1/personal_report?select=id,created_date_time${reportDateFilter}&order=created_date_time.asc`,
          { headers: { Prefer: "count=exact" } }
        ),
        // Q2: Sessions with duration data
        supabaseFetch(
          `/rest/v1/report_session?select=id,personal_report_id,started_at,ended_at${sessionDateFilter}&order=started_at.asc`,
          { headers: { Range: "0-49999" } }
        ),
        // Q3: Section ratings (join through personal_report_section to get report_section_id)
        supabaseFetch(
          `/rest/v1/report_section_rating?select=id,personal_report_section_id,rating,comment,personal_report_section(report_section_id)`,
          {
            headers: { Range: "0-49999" },
          }
        ),
        // Q4: Access emails
        supabaseFetch(`/rest/v1/report_access_email?select=id,status`, {
          headers: { Prefer: "count=exact" },
        }),
        // Q5: Per-section counts from personal_report_section
        supabaseFetch(`/rest/v1/personal_report_section?select=report_section_id`, {
          headers: { Range: "0-49999" },
        }),
        // Q6: Section metadata for names
        supabaseFetch(`/rest/v1/report_section?select=id,title`),
      ]);

    if (!reportsRes.ok || !sessionsRes.ok) {
      logger.error("Report engagement: core Supabase queries failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    // --- Reports ---
    const reports = (await reportsRes.json()) as ReportRow[];
    const totalReports = parseInt(
      reportsRes.headers.get("content-range")?.split("/")[1] || String(reports.length),
      10
    );

    // Daily opens
    const dailyMap = new Map<string, number>();
    for (const r of reports) {
      const day = r.created_date_time.slice(0, 10);
      incrementCount(dailyMap, day);
    }
    const dailyOpens = [...dailyMap.entries()].map(([date, count]) => ({ date, count }));

    // --- Sessions ---
    const sessions = (await sessionsRes.json()) as SessionRow[];
    const totalSessions = sessions.length;

    // View rate: unique reports with at least one session / total reports
    const reportsWithSessions = new Set(sessions.map((s) => s.personal_report_id)).size;
    const viewRate = totalReports > 0 ? Math.round((reportsWithSessions / totalReports) * 100) : 0;

    // Average session duration
    const durations: number[] = [];
    for (const s of sessions) {
      if (s.ended_at) {
        const durationSec =
          (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000;
        if (durationSec > 0 && durationSec < 86400) {
          durations.push(durationSec);
        }
      }
    }
    const avgSessionDurationSec =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;

    // --- Section Ratings (graceful degradation) ---
    let sectionRatings: Array<{
      sectionId: number;
      sectionName: string;
      avgRating: number;
      ratingCount: number;
      topComments: string[];
    }> = [];

    // Build section name lookup
    const sectionNameMap = new Map<number, string>();
    if (sectionMetaRes.ok) {
      const sectionMeta = (await sectionMetaRes.json()) as SectionMeta[];
      for (const s of sectionMeta) {
        sectionNameMap.set(s.id, s.title);
      }
    }

    if (ratingsRes.ok) {
      const ratings = (await ratingsRes.json()) as SectionRatingRow[];

      // Group by report_section_id (resolved via join)
      const ratingMap = new Map<number, { sum: number; count: number; comments: string[] }>();
      for (const r of ratings) {
        const sectionId = r.personal_report_section?.report_section_id;
        if (sectionId == null) continue;
        const ratingStats = getOrCreate(ratingMap, sectionId, () => ({
          sum: 0,
          count: 0,
          comments: [],
        }));
        ratingStats.sum += r.rating;
        ratingStats.count++;
        if (r.comment?.trim()) {
          ratingStats.comments.push(r.comment.trim());
        }
      }

      sectionRatings = [...ratingMap.entries()]
        .map(([sectionId, data]) => {
          return {
            sectionId,
            sectionName: sectionNameMap.get(sectionId) || `Section ${sectionId}`,
            avgRating: Math.round((data.sum / data.count) * 10) / 10,
            ratingCount: data.count,
            topComments: data.comments.slice(0, 5),
          };
        })
        .sort((a, b) => b.ratingCount - a.ratingCount);
    }

    // --- Sharing (graceful degradation) ---
    let emailsSent = 0;
    let tokensCreated = 0;
    let tokensUsed = 0;

    if (emailsRes.ok) {
      const emails = (await emailsRes.json()) as AccessEmailRow[];
      emailsSent = parseInt(
        emailsRes.headers.get("content-range")?.split("/")[1] || String(emails.length),
        10
      );
      // Count by status
      for (const e of emails) {
        if (e.status === "created" || e.status === "sent") tokensCreated++;
        if (e.status === "used" || e.status === "claimed") tokensUsed++;
      }
    }

    // --- Section-level metrics (graceful degradation) ---
    if (sectionCountsRes.ok) {
      const sectionCounts = (await sectionCountsRes.json()) as ReportSectionRow[];
      const countMap = new Map<number, number>();
      for (const sc of sectionCounts) {
        incrementCount(countMap, sc.report_section_id);
      }
      // Enrich sectionRatings with view counts if we have section counts but no ratings yet
      for (const sectionId of countMap.keys()) {
        const existing = sectionRatings.find((sr) => sr.sectionId === sectionId);
        if (!existing) {
          sectionRatings.push({
            sectionId,
            sectionName: sectionNameMap.get(sectionId) || `Section ${sectionId}`,
            avgRating: 0,
            ratingCount: 0,
            topComments: [],
          });
        }
      }
    }

    return NextResponse.json({
      totalReports,
      totalSessions,
      viewRate,
      avgSessionDurationSec,
      dailyOpens,
      sectionRatings,
      sharing: {
        emailsSent,
        tokensCreated,
        tokensUsed,
      },
    });
  } catch (err) {
    logger.error({ err }, "Report engagement error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
