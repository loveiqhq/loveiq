import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import { maskEmail } from "@features/admin/server/format";
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
  created_date_time: string;
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

function incrementCount<K>(map: Map<K, number>, key: K, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
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
    const [
      profilesRes,
      usersRes,
      submissionsRes,
      scoringRes,
      waitlistRes,
      reportsRes,
      paymentsRes,
    ] = await Promise.all([
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
      supabaseFetch(`/rest/v1/waitlist_user?select=email,source,created_date_time,utm_tracker`, {
        headers: { Range: "0-9999" },
      }),
      supabaseFetch(
        `/rest/v1/personal_report?select=id,survey_submission_id,created_date_time,payment_status`,
        {
          headers: { Range: "0-9999" },
        }
      ),
      supabaseFetch(`/rest/v1/payment?select=personal_report_id,status,payment_date_time,amount`, {
        headers: { Range: "0-9999" },
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
    const waitlist = waitlistRes.ok
      ? ((await waitlistRes.json()) as Array<{
          email: string;
          source: string | null;
          created_date_time: string;
          utm_tracker: string | null;
        }>)
      : [];
    const reports = reportsRes.ok
      ? ((await reportsRes.json()) as Array<{
          id: number;
          survey_submission_id: number;
          created_date_time: string;
          payment_status: string | null;
        }>)
      : [];
    const payments = paymentsRes.ok
      ? ((await paymentsRes.json()) as Array<{
          personal_report_id: number;
          status: string;
          payment_date_time: string | null;
          amount: number | null;
        }>)
      : [];

    // Build lookup maps
    const userMap = new Map(users.map((u) => [u.id, u]));
    const submissionsByUser = new Map<number, number>();
    for (const s of submissions) submissionsByUser.set(s.user_id, s.id);
    const archetypeBySubmission = new Map(
      scoring.map((s) => [s.survey_submission_id, s.primary_archetype])
    );
    const waitlistByEmail = new Map(waitlist.map((row) => [row.email.toLowerCase(), row]));
    const reportBySubmission = new Map(
      reports.map((report) => [report.survey_submission_id, report])
    );
    const paymentByReport = new Map(
      payments
        .filter((payment) => payment.status === "succeeded")
        .map((payment) => [payment.personal_report_id, payment])
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
    const genderDist = new Map<string, number>();
    const ageDist = new Map<string, number>();
    const orientationDist = new Map<string, number>();
    const relationshipDist = new Map<string, number>();
    const locationDist = new Map<string, number>();

    for (const p of profileList) {
      const g = p.gender || "Not specified";
      incrementCount(genderDist, g);
      const ab = ageBracket(p.age);
      incrementCount(ageDist, ab);
      const o = p.sexualOrientation || "Not specified";
      incrementCount(orientationDist, o);
      const r = p.relationshipStatus || "Not specified";
      incrementCount(relationshipDist, r);
      const l = p.location || "Not specified";
      incrementCount(locationDist, l);
    }

    const ages = profileList.map((p) => p.age).filter((a): a is number => a != null);
    const avgAge =
      ages.length > 0 ? Math.round(ages.reduce((s, a) => s + a, 0) / ages.length) : null;
    const withSubmission = profileList.filter((p) => p.hasSubmission).length;
    const topLocation =
      [...locationDist.entries()]
        .filter(([k]) => k !== "Not specified")
        .sort(([, a], [, b]) => b - a)[0]?.[0] || "—";

    return NextResponse.json({
      profiles: profileList,
      demographics: {
        genderDistribution: Object.fromEntries(genderDist),
        ageDistribution: Object.fromEntries(ageDist),
        orientationDistribution: Object.fromEntries(orientationDist),
        relationshipDistribution: Object.fromEntries(relationshipDist),
        locationDistribution: Object.fromEntries(locationDist),
        totalProfiles: profiles.length,
        avgAge,
        withSubmission,
        topLocation,
      },
      timelines: profileList
        .map((profile) => {
          const waitlistRow = waitlistByEmail.get(
            users.find((user) => user.id === profile.id)?.email.toLowerCase() ?? ""
          );
          const submissionId = submissionsByUser.get(profile.id);
          const submission = submissions.find((row) => row.id === submissionId);
          const report = submissionId ? (reportBySubmission.get(submissionId) ?? null) : null;
          const payment = report ? (paymentByReport.get(report.id) ?? null) : null;

          return {
            profileId: profile.id,
            label: profile.firstName || profile.email,
            source: waitlistRow?.source || "Direct",
            archetype: profile.archetype,
            events: [
              waitlistRow
                ? {
                    label: "Waitlist",
                    at: waitlistRow.created_date_time,
                    detail: waitlistRow.source || "Unknown source",
                  }
                : null,
              {
                label: "Profile Created",
                at: profile.createdAt,
                detail: profile.location || "Unknown location",
              },
              submission
                ? {
                    label: "Survey Completed",
                    at: submission.created_date_time,
                    detail: profile.archetype || "No archetype yet",
                  }
                : null,
              report
                ? {
                    label: "Report Generated",
                    at: report.created_date_time,
                    detail: report.payment_status || "No payment status",
                  }
                : null,
              payment
                ? {
                    label: "Payment",
                    at: payment.payment_date_time,
                    detail: payment.amount != null ? `$${payment.amount}` : "Succeeded",
                  }
                : null,
            ].filter(Boolean),
          };
        })
        .slice(0, 30),
    });
  } catch (err) {
    logger.error({ err }, "Profiles dashboard error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
