import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

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
    bucket: "admin-language-analytics",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    const [profilesRes, submissionsRes, scoringRes] = await Promise.all([
      supabaseFetch(`/rest/v1/user_profile?select=id,language_primary,location_primary`, {
        headers: { Range: "0-999" },
      }),
      supabaseFetch(
        `/rest/v1/survey_submission?select=id,user_id,status,duration_ms,created_date_time`,
        { headers: { Range: "0-999" } }
      ),
      // eslint-disable-next-line no-secrets/no-secrets -- Supabase REST path
      supabaseFetch(`/rest/v1/scoring_result?select=survey_submission_id,primary_archetype`, {
        headers: { Range: "0-999" },
      }),
    ]);

    if (!profilesRes.ok || !submissionsRes.ok) {
      logger.error("Language analytics: Supabase queries failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const profiles = (await profilesRes.json()) as Array<{
      id: number;
      language_primary: string | null;
      location_primary: string | null;
    }>;
    const submissions = (await submissionsRes.json()) as Array<{
      id: number;
      user_id: number;
      status: string;
      duration_ms: number | null;
      created_date_time: string;
    }>;
    const scoring = scoringRes.ok
      ? ((await scoringRes.json()) as Array<{
          survey_submission_id: number;
          primary_archetype: string;
        }>)
      : [];

    // Build user→language map
    const userLanguageMap = new Map(
      profiles.map((p) => [p.id, p.language_primary || "Not specified"])
    );
    const archetypeMap = new Map(scoring.map((s) => [s.survey_submission_id, s.primary_archetype]));

    // Language distribution from profiles
    const langDist: Record<string, number> = {};
    for (const p of profiles) {
      const lang = p.language_primary || "Not specified";
      langDist[lang] = (langDist[lang] || 0) + 1;
    }

    // Per-language submission stats
    const langStats: Record<
      string,
      {
        total: number;
        completed: number;
        totalDurationMs: number;
        archetypes: Record<string, number>;
      }
    > = {};

    for (const s of submissions) {
      const lang = userLanguageMap.get(s.user_id) || "Not specified";
      if (!langStats[lang]) {
        langStats[lang] = { total: 0, completed: 0, totalDurationMs: 0, archetypes: {} };
      }
      langStats[lang].total++;
      if (s.status === "completed") {
        langStats[lang].completed++;
        if (s.duration_ms) langStats[lang].totalDurationMs += s.duration_ms;
        const archetype = archetypeMap.get(s.id);
        if (archetype) {
          langStats[lang].archetypes[archetype] = (langStats[lang].archetypes[archetype] || 0) + 1;
        }
      }
    }

    const languageBreakdown = Object.entries(langStats)
      .map(([language, stats]) => ({
        language,
        totalSubmissions: stats.total,
        completed: stats.completed,
        completionRate: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0,
        avgDurationMin:
          stats.completed > 0
            ? Math.round((stats.totalDurationMs / stats.completed / 60_000) * 10) / 10
            : null,
        topArchetype:
          Object.entries(stats.archetypes).sort(([, a], [, b]) => b - a)[0]?.[0] || null,
        archetypes: stats.archetypes,
      }))
      .sort((a, b) => b.totalSubmissions - a.totalSubmissions);

    // Location by language
    const locationByLang: Record<string, Record<string, number>> = {};
    for (const p of profiles) {
      const lang = p.language_primary || "Not specified";
      const loc = p.location_primary || "Not specified";
      if (!locationByLang[lang]) locationByLang[lang] = {};
      locationByLang[lang][loc] = (locationByLang[lang][loc] || 0) + 1;
    }

    return NextResponse.json({
      languageDistribution: langDist,
      languageBreakdown,
      locationByLanguage: locationByLang,
      totalProfiles: profiles.length,
      totalLanguages: Object.keys(langDist).length,
    });
  } catch (err) {
    logger.error({ err }, "Language analytics error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
