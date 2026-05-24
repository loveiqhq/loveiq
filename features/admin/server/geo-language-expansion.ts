import { buildTrustDescriptor, clampDays, round1 } from "@features/admin/server/next-level";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

interface SubmissionRow {
  id: number;
  user_id: number | null;
  status: string;
  duration_ms: number | null;
  created_date_time: string;
  session_id: string | null;
}

interface AppUserRow {
  id: number;
  user_profile_id: number | null;
}

interface ProfileRow {
  id: number;
  location_primary: string | null;
  language_primary: string | null;
}

interface ReportRow {
  id: number;
  survey_submission_id: number;
}

interface ReportSessionRow {
  personal_report_id: number;
}

interface PaymentRow {
  personal_report_id: number;
  status: string;
}

interface PartialRow {
  session_id: string;
}

type ExpansionAttention = "expand" | "test" | "fix" | "blindspot";

interface ExpansionAggregate {
  starts: number;
  completed: number;
  viewed: number;
  paid: number;
  resumed: number;
  durationTotalMs: number;
  durationCount: number;
  profileIds: Set<number>;
}

export interface RegionExpansionRow {
  region: string;
  dominantLanguage: string;
  starts: number;
  profiles: number;
  completionRate: number;
  reportViewRate: number;
  paidRate: number;
  resumedShare: number;
  avgDurationMin: number | null;
  frictionScore: number;
  readinessScore: number;
  attention: ExpansionAttention;
  lead: string;
}

export interface LanguageExpansionRow {
  language: string;
  topRegion: string;
  starts: number;
  profiles: number;
  completionRate: number;
  reportViewRate: number;
  paidRate: number;
  resumedShare: number;
  avgDurationMin: number | null;
  frictionScore: number;
  readinessScore: number;
  attention: ExpansionAttention;
  lead: string;
}

export interface ExpansionRecommendation {
  title: string;
  detail: string;
  tone: "expand" | "watch" | "risk" | "blindspot";
}

export interface GeoLanguageExpansionSnapshot {
  generatedAt: string;
  days: number;
  summary: {
    totalStarts: number;
    uniqueRegions: number;
    uniqueLanguages: number;
    readyRegions: number;
    atRiskRegions: number;
    blindspots: number;
    strongestRegion: string | null;
    strongestLanguage: string | null;
  };
  topRegions: Array<{ label: string; value: number }>;
  regions: RegionExpansionRow[];
  languages: LanguageExpansionRow[];
  recommendations: ExpansionRecommendation[];
  trust: {
    warning: string | null;
    notes: string[];
    sampleSize: number;
  };
}

const BATCH_SIZE = 500;

function chunk<T>(values: T[], size = BATCH_SIZE): T[][] {
  if (values.length === 0) return [];

  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function uniqueNumbers(values: Array<number | null | undefined>): number[] {
  return [...new Set(values.filter((value): value is number => Number.isFinite(value)))];
}

async function fetchBatches<T>(ids: number[], builder: (batch: number[]) => string): Promise<T[]> {
  const responses = await Promise.all(
    chunk(ids).map((batch) =>
      supabaseFetch(builder(batch), {
        headers: { Range: "0-49999" },
      })
    )
  );

  if (responses.some((response) => !response.ok)) {
    throw new Error("Batched query failed.");
  }

  const rows = await Promise.all(responses.map((response) => response.json() as Promise<T[]>));
  return rows.flat();
}

function emptyAggregate(): ExpansionAggregate {
  return {
    starts: 0,
    completed: 0,
    viewed: 0,
    paid: 0,
    resumed: 0,
    durationTotalMs: 0,
    durationCount: 0,
    profileIds: new Set<number>(),
  };
}

function frictionScore(input: {
  completionRate: number;
  reportViewRate: number;
  paidRate: number;
  resumedShare: number;
  avgDurationMin: number | null;
}): number {
  const completionPenalty = Math.max(0, 60 - input.completionRate) / 8;
  const reportPenalty = Math.max(0, 25 - input.reportViewRate) / 5;
  const paidPenalty = Math.max(0, 5 - input.paidRate) * 0.8;
  const resumedPenalty = input.resumedShare / 12;
  const durationPenalty =
    input.avgDurationMin != null && input.avgDurationMin > 10
      ? Math.min((input.avgDurationMin - 10) * 0.6, 4)
      : 0;

  return round1(
    Math.min(10, completionPenalty + reportPenalty + paidPenalty + resumedPenalty + durationPenalty)
  );
}

function readinessScore(input: {
  completionRate: number;
  reportViewRate: number;
  paidRate: number;
  frictionScore: number;
}): number {
  return round1(
    input.completionRate * 0.35 +
      input.reportViewRate * 0.3 +
      Math.min(input.paidRate * 12, 100) * 0.2 +
      Math.max(0, 100 - input.frictionScore * 10) * 0.15
  );
}

function attentionForRow(input: {
  starts: number;
  readinessScore: number;
  frictionScore: number;
  regionOrLanguage: string;
}): ExpansionAttention {
  if (input.regionOrLanguage === "Unknown" || input.regionOrLanguage === "Not specified") {
    return "blindspot";
  }
  if (input.starts >= 5 && input.readinessScore >= 60 && input.frictionScore <= 4) return "expand";
  if (input.frictionScore >= 6 || input.readinessScore < 35) return "fix";
  return "test";
}

function leadForRow(input: {
  label: string;
  completionRate: number;
  reportViewRate: number;
  paidRate: number;
  resumedShare: number;
  attention: ExpansionAttention;
}): string {
  if (input.attention === "blindspot") {
    return `${input.label} is under-instrumented for expansion decisions because profile language or region coverage is missing.`;
  }
  if (input.completionRate < 45) {
    return `${input.label} drops before completion; inspect localized onboarding, intent matching, and region-specific friction.`;
  }
  if (input.reportViewRate < 20) {
    return `${input.label} completes but does not consume the report cleanly; inspect language clarity and value handoff.`;
  }
  if (input.resumedShare >= 18) {
    return `${input.label} shows repeated resume behavior; investigate wording, comprehension, and trust friction in this market.`;
  }
  if (input.paidRate < 3) {
    return `${input.label} sees the product but monetization is weak; validate market fit and pricing expectations before scaling.`;
  }
  return `${input.label} looks ready for deeper localization and broader acquisition testing.`;
}

function addSubmission(
  target: Map<string, ExpansionAggregate>,
  key: string,
  submission: SubmissionRow,
  profileId: number | null,
  viewed: boolean,
  paid: boolean,
  resumed: boolean
) {
  const aggregate = target.get(key) ?? emptyAggregate();
  aggregate.starts += 1;
  if (submission.status === "completed") aggregate.completed += 1;
  if (viewed) aggregate.viewed += 1;
  if (paid) aggregate.paid += 1;
  if (resumed) aggregate.resumed += 1;
  if (submission.duration_ms != null && submission.duration_ms > 0) {
    aggregate.durationTotalMs += submission.duration_ms;
    aggregate.durationCount += 1;
  }
  if (profileId != null) aggregate.profileIds.add(profileId);
  target.set(key, aggregate);
}

export async function buildGeoLanguageExpansionSnapshot(
  inputDays: number
): Promise<GeoLanguageExpansionSnapshot> {
  const days = clampDays(inputDays || 30, 7, 365);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  try {
    const submissionsRes = await supabaseFetch(
      `/rest/v1/survey_submission?select=id,user_id,status,duration_ms,created_date_time,session_id&created_date_time=gte.${since}`,
      { headers: { Range: "0-49999" } }
    );

    if (!submissionsRes.ok) {
      throw new Error("Unable to load geo/language submissions.");
    }

    const submissions = (await submissionsRes.json()) as SubmissionRow[];
    const userIds = uniqueNumbers(submissions.map((submission) => submission.user_id));
    const submissionIds = submissions.map((submission) => submission.id);

    const [appUsers, partials, reports] = await Promise.all([
      userIds.length === 0
        ? Promise.resolve([] as AppUserRow[])
        : fetchBatches<AppUserRow>(userIds, (batch) => {
            return `/rest/v1/app_user?select=id,user_profile_id&id=in.(${batch.join(",")})`;
          }),
      supabaseFetch(`/rest/v1/survey_partial_save?select=session_id&saved_at=gte.${since}`, {
        headers: { Range: "0-49999" },
      }),
      submissionIds.length === 0
        ? Promise.resolve([] as ReportRow[])
        : fetchBatches<ReportRow>(submissionIds, (batch) => {
            return `/rest/v1/personal_report?select=id,survey_submission_id&survey_submission_id=in.(${batch.join(",")})`;
          }),
    ]);

    if (!partials.ok) {
      throw new Error("Unable to load geo/language recovery data.");
    }

    const profileIds = uniqueNumbers(appUsers.map((user) => user.user_profile_id));
    const profiles =
      profileIds.length === 0
        ? []
        : await fetchBatches<ProfileRow>(profileIds, (batch) => {
            return `/rest/v1/user_profile?select=id,location_primary,language_primary&id=in.(${batch.join(",")})`;
          });

    const reportIds = reports.map((report) => report.id);
    const [reportSessions, payments] = await Promise.all([
      reportIds.length === 0
        ? Promise.resolve([] as ReportSessionRow[])
        : fetchBatches<ReportSessionRow>(reportIds, (batch) => {
            return `/rest/v1/report_session?select=personal_report_id&personal_report_id=in.(${batch.join(",")})`;
          }),
      reportIds.length === 0
        ? Promise.resolve([] as PaymentRow[])
        : fetchBatches<PaymentRow>(reportIds, (batch) => {
            return `/rest/v1/payment?select=personal_report_id,status&personal_report_id=in.(${batch.join(",")})`;
          }),
    ]);

    const partialRows = (await partials.json()) as PartialRow[];
    const appUserById = new Map(appUsers.map((user) => [user.id, user] as const));
    const profileById = new Map(profiles.map((profile) => [profile.id, profile] as const));
    const reportBySubmission = new Map(
      reports.map((report) => [report.survey_submission_id, report.id] as const)
    );
    const viewedReports = new Set(reportSessions.map((row) => row.personal_report_id));
    const paidReports = new Set(
      payments
        .filter((payment) => payment.status === "succeeded")
        .map((payment) => payment.personal_report_id)
    );
    const resumedSessions = new Set(partialRows.map((row) => row.session_id));

    const regionAggregates = new Map<string, ExpansionAggregate>();
    const languageAggregates = new Map<string, ExpansionAggregate>();
    const regionLanguageCounts = new Map<string, Map<string, number>>();
    const languageRegionCounts = new Map<string, Map<string, number>>();

    for (const submission of submissions) {
      const appUser =
        submission.user_id != null ? (appUserById.get(submission.user_id) ?? null) : null;
      const profile =
        appUser?.user_profile_id != null
          ? (profileById.get(appUser.user_profile_id) ?? null)
          : null;
      const region = profile?.location_primary?.trim() || "Unknown";
      const language = profile?.language_primary?.trim() || "Not specified";
      const reportId = reportBySubmission.get(submission.id);
      const viewed = !!(reportId && viewedReports.has(reportId));
      const paid = !!(reportId && paidReports.has(reportId));
      const resumed = !!(submission.session_id && resumedSessions.has(submission.session_id));
      const profileId = appUser?.user_profile_id ?? null;

      addSubmission(regionAggregates, region, submission, profileId, viewed, paid, resumed);
      addSubmission(languageAggregates, language, submission, profileId, viewed, paid, resumed);

      const languageCounts = regionLanguageCounts.get(region) ?? new Map<string, number>();
      languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1);
      regionLanguageCounts.set(region, languageCounts);

      const regionCounts = languageRegionCounts.get(language) ?? new Map<string, number>();
      regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1);
      languageRegionCounts.set(language, regionCounts);
    }

    const baseMetrics = (label: string, aggregate: ExpansionAggregate) => {
      const completionRate =
        aggregate.starts > 0 ? round1((aggregate.completed / aggregate.starts) * 100) : 0;
      const reportViewRate =
        aggregate.starts > 0 ? round1((aggregate.viewed / aggregate.starts) * 100) : 0;
      const paidRate = aggregate.starts > 0 ? round1((aggregate.paid / aggregate.starts) * 100) : 0;
      const resumedShare =
        aggregate.starts > 0 ? round1((aggregate.resumed / aggregate.starts) * 100) : 0;
      const avgDurationMin =
        aggregate.durationCount > 0
          ? round1(aggregate.durationTotalMs / aggregate.durationCount / 60_000)
          : null;
      const friction = frictionScore({
        completionRate,
        reportViewRate,
        paidRate,
        resumedShare,
        avgDurationMin,
      });
      const readiness = readinessScore({
        completionRate,
        reportViewRate,
        paidRate,
        frictionScore: friction,
      });
      const attention = attentionForRow({
        starts: aggregate.starts,
        readinessScore: readiness,
        frictionScore: friction,
        regionOrLanguage: label,
      });
      const lead = leadForRow({
        label,
        completionRate,
        reportViewRate,
        paidRate,
        resumedShare,
        attention,
      });

      return {
        starts: aggregate.starts,
        profiles: aggregate.profileIds.size,
        completionRate,
        reportViewRate,
        paidRate,
        resumedShare,
        avgDurationMin,
        frictionScore: friction,
        readinessScore: readiness,
        attention,
        lead,
      };
    };

    const buildRegionRow = (
      region: string,
      aggregate: ExpansionAggregate,
      dominantLanguage: string
    ): RegionExpansionRow => {
      const metrics = baseMetrics(region, aggregate);
      return {
        region,
        dominantLanguage,
        ...metrics,
      };
    };

    const buildLanguageRow = (
      language: string,
      aggregate: ExpansionAggregate,
      topRegion: string
    ): LanguageExpansionRow => {
      const metrics = baseMetrics(language, aggregate);
      return {
        language,
        topRegion,
        ...metrics,
      };
    };

    const regions = [...regionAggregates.entries()]
      .map(([region, aggregate]) => {
        const dominantLanguage =
          [...(regionLanguageCounts.get(region) ?? new Map<string, number>()).entries()].sort(
            (left, right) => right[1] - left[1]
          )[0]?.[0] ?? "Not specified";
        return buildRegionRow(region, aggregate, dominantLanguage);
      })
      .sort(
        (left, right) => right.readinessScore - left.readinessScore || right.starts - left.starts
      );

    const languages = [...languageAggregates.entries()]
      .map(([language, aggregate]) => {
        const topRegion =
          [...(languageRegionCounts.get(language) ?? new Map<string, number>()).entries()].sort(
            (left, right) => right[1] - left[1]
          )[0]?.[0] ?? "Unknown";
        return buildLanguageRow(language, aggregate, topRegion);
      })
      .sort(
        (left, right) => right.readinessScore - left.readinessScore || right.starts - left.starts
      );

    const readyRegions = regions.filter((region) => region.attention === "expand").length;
    const atRiskRegions = regions.filter((region) => region.attention === "fix").length;
    const blindspots = [...regions, ...languages].filter(
      (row) => row.attention === "blindspot"
    ).length;
    const topRegions = regions.slice(0, 8).map((region) => ({
      label: region.region,
      value: region.starts,
    }));

    const recommendations: ExpansionRecommendation[] = [];
    const strongestRegion = regions.find((region) => region.attention === "expand");
    if (strongestRegion) {
      recommendations.push({
        title: `Push deeper into ${strongestRegion.region}`,
        detail: `${strongestRegion.region} is the strongest current expansion candidate with ${strongestRegion.dominantLanguage} as the dominant language signal and a readiness score of ${strongestRegion.readinessScore}.`,
        tone: "expand",
      });
    }
    const weakestRegion = regions.find((region) => region.attention === "fix");
    if (weakestRegion) {
      recommendations.push({
        title: `Fix localized friction in ${weakestRegion.region}`,
        detail: weakestRegion.lead,
        tone: "risk",
      });
    }
    const blindspotLanguage = languages.find((language) => language.attention === "blindspot");
    if (blindspotLanguage) {
      recommendations.push({
        title: `Instrumentation blindspot in ${blindspotLanguage.language}`,
        detail: `${blindspotLanguage.language} cannot be trusted for expansion planning until profile language or location coverage improves.`,
        tone: "blindspot",
      });
    }
    if (recommendations.length === 0) {
      recommendations.push({
        title: "Expansion signals are mixed",
        detail:
          "No region is clearly ready to scale yet, but there is enough signal to continue market tests and tighten localization quality.",
        tone: "watch",
      });
    }

    const unknownRegionStarts = regions.find((region) => region.region === "Unknown")?.starts ?? 0;
    const trust = buildTrustDescriptor({
      source:
        "survey_submission + app_user + user_profile + personal_report + report_session + payment",
      mode: "derived",
      sampleSize: submissions.length,
      lastUpdated: new Date().toISOString(),
      warning:
        submissions.length < 20
          ? "Geo/language expansion is based on a small sample in the selected window."
          : unknownRegionStarts / Math.max(submissions.length, 1) >= 0.2
            ? "A meaningful share of submissions have missing region data, so expansion readiness is partially directional."
            : null,
    });

    return {
      generatedAt: new Date().toISOString(),
      days,
      summary: {
        totalStarts: submissions.length,
        uniqueRegions: regions.length,
        uniqueLanguages: languages.length,
        readyRegions,
        atRiskRegions,
        blindspots,
        strongestRegion: regions[0]?.region ?? null,
        strongestLanguage: languages[0]?.language ?? null,
      },
      topRegions,
      regions,
      languages,
      recommendations,
      trust: {
        warning: trust.warning,
        notes: [
          "Readiness blends completion, report consumption, monetization, and localized friction into one expansion score.",
          "Localized friction rises when completion is weak, report view is weak, resumes are high, or sessions run long.",
          "Region and language attribution use the user's linked profile, not answer-text geography guesses.",
          unknownRegionStarts > 0
            ? "Unknown region rows are treated as blindspots, not scale recommendations."
            : "Region coverage is strong enough to trust market ranking in this window.",
        ],
        sampleSize: submissions.length,
      },
    };
  } catch (err) {
    // warn-not-error: caller decides Slack-worthiness. See
    // channel-efficiency.ts for full rationale.
    logger.warn({ err }, "Geo/language expansion build error");
    throw err;
  }
}
