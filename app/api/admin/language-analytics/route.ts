import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

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
    const langDist = new Map<string, number>();
    for (const p of profiles) {
      const lang = p.language_primary || "Not specified";
      incrementCount(langDist, lang);
    }

    // Per-language submission stats
    const langStats = new Map<
      string,
      {
        total: number;
        completed: number;
        totalDurationMs: number;
        archetypes: Map<string, number>;
      }
    >();

    for (const s of submissions) {
      const lang = userLanguageMap.get(s.user_id) || "Not specified";
      const stats = getOrCreate(langStats, lang, () => ({
        total: 0,
        completed: 0,
        totalDurationMs: 0,
        archetypes: new Map<string, number>(),
      }));
      stats.total++;
      if (s.status === "completed") {
        stats.completed++;
        if (s.duration_ms) stats.totalDurationMs += s.duration_ms;
        const archetype = archetypeMap.get(s.id);
        if (archetype) {
          incrementCount(stats.archetypes, archetype);
        }
      }
    }

    const languageBreakdown = [...langStats.entries()]
      .map(([language, stats]) => ({
        language,
        totalSubmissions: stats.total,
        completed: stats.completed,
        completionRate: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0,
        avgDurationMin:
          stats.completed > 0
            ? Math.round((stats.totalDurationMs / stats.completed / 60_000) * 10) / 10
            : null,
        topArchetype: [...stats.archetypes.entries()].sort(([, a], [, b]) => b - a)[0]?.[0] || null,
        archetypes: Object.fromEntries(stats.archetypes),
      }))
      .sort((a, b) => b.totalSubmissions - a.totalSubmissions);

    // Location by language
    const locationByLang = new Map<string, Map<string, number>>();
    for (const p of profiles) {
      const lang = p.language_primary || "Not specified";
      const loc = p.location_primary || "Not specified";
      const languageLocations = getOrCreate(locationByLang, lang, () => new Map<string, number>());
      incrementCount(languageLocations, loc);
    }

    return NextResponse.json({
      languageDistribution: Object.fromEntries(langDist),
      languageBreakdown,
      locationByLanguage: Object.fromEntries(
        [...locationByLang.entries()].map(([language, locations]) => [
          language,
          Object.fromEntries(locations),
        ])
      ),
      totalProfiles: profiles.length,
      totalLanguages: langDist.size,
    });
  } catch (err) {
    logger.error({ err }, "Language analytics error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
