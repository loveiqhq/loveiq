import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import { maskEmail } from "@/lib/admin/format";
import logger from "@/lib/logger";

interface UserProfile {
  id: number;
  gender: string | null;
  birthday: string | null;
  sexual_orientation: string | null;
  relationship_status: string | null;
  location_primary: string | null;
  language_primary: string | null;
  goals: string | null;
  challenges: string | null;
  created_date_time: string;
}

interface AppUser {
  id: number;
  email: string;
  first_name: string | null;
  created_date_time: string;
}

interface ScoringResult {
  survey_submission_id: number;
  primary_archetype: string;
}

interface Submission {
  id: number;
  user_id: number;
}

function calculateAge(birthday: string | null): number | null {
  if (!birthday) return null;
  const birth = new Date(birthday);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--;
  return age > 0 && age < 150 ? age : null;
}

function ageBracket(age: number | null): string {
  if (age == null) return "Unknown";
  if (age < 18) return "Under 18";
  if (age < 25) return "18-24";
  if (age < 35) return "25-34";
  if (age < 45) return "35-44";
  if (age < 55) return "45-54";
  return "55+";
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
    bucket: "admin-profiles",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    const [profilesRes, usersRes, submissionsRes, scoringRes] = await Promise.all([
      supabaseFetch(
        `/rest/v1/user_profile?select=id,gender,birthday,sexual_orientation,relationship_status,location_primary,language_primary,goals,challenges,created_date_time&order=created_date_time.desc`,
        { headers: { Range: "0-999" } }
      ),
      supabaseFetch(`/rest/v1/app_user?select=id,email,first_name,created_date_time`, {
        headers: { Range: "0-999" },
      }),
      supabaseFetch(`/rest/v1/survey_submission?select=id,user_id&status=eq.completed`, {
        headers: { Range: "0-999" },
      }),
      // eslint-disable-next-line no-secrets/no-secrets -- Supabase REST path
      supabaseFetch(`/rest/v1/scoring_result?select=survey_submission_id,primary_archetype`, {
        headers: { Range: "0-999" },
      }),
    ]);

    if (!profilesRes.ok || !usersRes.ok) {
      logger.error("Profiles: Supabase queries failed");
      return NextResponse.json({ error: "Unable to load profiles." }, { status: 500 });
    }

    const profiles = (await profilesRes.json()) as UserProfile[];
    const users = (await usersRes.json()) as AppUser[];
    const submissions = submissionsRes.ok ? ((await submissionsRes.json()) as Submission[]) : [];
    const scoring = scoringRes.ok ? ((await scoringRes.json()) as ScoringResult[]) : [];

    // Build lookup maps
    const userMap = new Map(users.map((u) => [u.id, u]));
    const submissionsByUser = new Map<number, number>();
    for (const s of submissions) submissionsByUser.set(s.user_id, s.id);
    const archetypeBySubmission = new Map(
      scoring.map((s) => [s.survey_submission_id, s.primary_archetype])
    );

    // Build profiles list
    const profileList = profiles.map((p) => {
      const user = userMap.get(p.id);
      const submissionId = submissionsByUser.get(p.id);
      const archetype = submissionId ? archetypeBySubmission.get(submissionId) : null;
      const age = calculateAge(p.birthday);
      return {
        id: p.id,
        email: user ? maskEmail(user.email) : "—",
        firstName: user?.first_name || null,
        gender: p.gender,
        age,
        sexualOrientation: p.sexual_orientation,
        relationshipStatus: p.relationship_status,
        location: p.location_primary,
        language: p.language_primary,
        goals: p.goals,
        challenges: p.challenges,
        createdAt: p.created_date_time,
        hasSubmission: !!submissionId,
        archetype: archetype || null,
      };
    });

    // Demographics distributions
    const genderDist: Record<string, number> = {};
    const ageDist: Record<string, number> = {};
    const orientationDist: Record<string, number> = {};
    const relationshipDist: Record<string, number> = {};
    const locationDist: Record<string, number> = {};

    for (const p of profileList) {
      const g = p.gender || "Not specified";
      genderDist[g] = (genderDist[g] || 0) + 1;
      const ab = ageBracket(p.age);
      ageDist[ab] = (ageDist[ab] || 0) + 1;
      const o = p.sexualOrientation || "Not specified";
      orientationDist[o] = (orientationDist[o] || 0) + 1;
      const r = p.relationshipStatus || "Not specified";
      relationshipDist[r] = (relationshipDist[r] || 0) + 1;
      const l = p.location || "Not specified";
      locationDist[l] = (locationDist[l] || 0) + 1;
    }

    const ages = profileList.map((p) => p.age).filter((a): a is number => a != null);
    const avgAge =
      ages.length > 0 ? Math.round(ages.reduce((s, a) => s + a, 0) / ages.length) : null;
    const withSubmission = profileList.filter((p) => p.hasSubmission).length;
    const topLocation =
      Object.entries(locationDist)
        .filter(([k]) => k !== "Not specified")
        .sort(([, a], [, b]) => b - a)[0]?.[0] || "—";

    return NextResponse.json({
      profiles: profileList,
      demographics: {
        genderDistribution: genderDist,
        ageDistribution: ageDist,
        orientationDistribution: orientationDist,
        relationshipDistribution: relationshipDist,
        locationDistribution: locationDist,
        totalProfiles: profiles.length,
        avgAge,
        withSubmission,
        topLocation,
      },
    });
  } catch (err) {
    logger.error({ err }, "Profiles dashboard error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
