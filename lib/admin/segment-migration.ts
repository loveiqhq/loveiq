import { buildTrustDescriptor, clampDays, round1, sourceLabel } from "@/lib/admin/next-level";
import {
  evaluateSegmentRules,
  type SegmentComparableRow,
  type SegmentRules,
} from "@/lib/admin/segment-evaluator";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

interface SubmissionRow {
  id: number;
  user_id: number | null;
  status: string;
  duration_ms: number | null;
  created_date_time: string;
  utm_tracker: string | null;
  session_id: string | null;
}

interface AppUserRow {
  id: number;
  email: string | null;
  user_profile_id: number | null;
}

interface ProfileRow {
  id: number;
  gender: string | null;
  sexual_orientation: string | null;
  relationship_status: string | null;
  location_primary: string | null;
}

interface ScoringRow {
  survey_submission_id: number;
  primary_archetype: string | null;
  v5_primary_archetype: string | null;
}

interface ReportRow {
  id: number;
  survey_submission_id: number;
}

interface ReportSessionRow {
  personal_report_id: number;
  started_at: string | null;
}

interface ShareRow {
  personal_report_id: number;
}

interface PaymentRow {
  personal_report_id: number;
  status: string;
}

interface InviteRow {
  referrer_email: string | null;
}

interface SegmentRow {
  id: number;
  name: string;
  rules: SegmentRules;
  match_count: number | null;
}

type CohortKey = "weak" | "emerging" | "activated" | "strong";
type MovementType = "upgrade" | "downgrade" | "stable";
type RecommendationTone = "scale" | "risk" | "watch";

interface UserWindowState {
  userId: number;
  submissionId: number;
  createdAt: string;
  cohortKey: CohortKey;
  cohortLabel: string;
  strengthScore: number;
  segmentLabel: string;
  source: string;
  archetype: string;
}

export interface SegmentMigrationMatrixCell {
  fromKey: CohortKey;
  fromLabel: string;
  toKey: CohortKey;
  toLabel: string;
  users: number;
  shareOfTracked: number;
  avgScoreDelta: number;
  movement: MovementType;
}

export interface SegmentMigrationPathRow {
  path: string;
  fromLabel: string;
  toLabel: string;
  movement: MovementType;
  users: number;
  shareOfTracked: number;
  avgPreviousScore: number;
  avgCurrentScore: number;
  avgScoreDelta: number;
  primaryCurrentSegment: string;
  primaryCurrentSource: string;
}

export interface SegmentMigrationClusterRow {
  label: string;
  currentUsers: number;
  previousUsers: number;
  upgradedUsers: number;
  downgradedUsers: number;
  strongNow: number;
  weakNow: number;
  netStrengthDelta: number;
  topPath: string;
}

export interface SegmentMigrationRecommendation {
  title: string;
  detail: string;
  tone: RecommendationTone;
}

export interface SegmentMigrationSnapshot {
  generatedAt: string;
  days: number;
  summary: {
    trackedUsers: number;
    newUsers: number;
    churnedUsers: number;
    upgradedUsers: number;
    downgradedUsers: number;
    steadyStrongUsers: number;
    stuckWeakUsers: number;
    topUpgradePath: string | null;
    topDowngradePath: string | null;
  };
  cohorts: Array<{ key: CohortKey; label: string; description: string; rank: number }>;
  matrix: SegmentMigrationMatrixCell[];
  paths: SegmentMigrationPathRow[];
  clusters: SegmentMigrationClusterRow[];
  recommendations: SegmentMigrationRecommendation[];
  trust: {
    warning: string | null;
    notes: string[];
    sampleSize: number;
    trackedUsers: number;
  };
}

const BATCH_SIZE = 500;
const DAY_MS = 86_400_000;

const COHORTS: Array<{
  key: CohortKey;
  label: string;
  description: string;
  rank: number;
}> = [
  { key: "weak", label: "Weak", description: "Low downstream value realization.", rank: 0 },
  {
    key: "emerging",
    label: "Emerging",
    description: "Some progress exists, but value capture is still fragile.",
    rank: 1,
  },
  {
    key: "activated",
    label: "Activated",
    description: "Users are completing and engaging with meaningful product value.",
    rank: 2,
  },
  {
    key: "strong",
    label: "Strong",
    description: "High-intent users with durable value, retention, or monetization signals.",
    rank: 3,
  },
];

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

function cohortFromScore(score: number) {
  // COHORTS is a static 4-tuple; every index 0–3 is defined.
  if (score >= 75) return COHORTS[3]!;
  if (score >= 50) return COHORTS[2]!;
  if (score >= 25) return COHORTS[1]!;
  return COHORTS[0]!;
}

function movementType(previousKey: CohortKey, currentKey: CohortKey): MovementType {
  const previousRank = COHORTS.find((cohort) => cohort.key === previousKey)?.rank ?? 0;
  const currentRank = COHORTS.find((cohort) => cohort.key === currentKey)?.rank ?? 0;
  if (currentRank > previousRank) return "upgrade";
  if (currentRank < previousRank) return "downgrade";
  return "stable";
}

function strengthScore(input: {
  status: string;
  scored: boolean;
  hasReport: boolean;
  viewedReport: boolean;
  retained: boolean;
  shared: boolean;
  referred: boolean;
  paid: boolean;
}) {
  let score = 0;
  if (input.status === "completed") score += 15;
  if (input.scored) score += 10;
  if (input.hasReport) score += 5;
  if (input.viewedReport) score += 10;
  if (input.retained) score += 15;
  if (input.shared) score += 10;
  if (input.referred) score += 10;
  if (input.paid) score += 25;
  return Math.min(score, 100);
}

function topLabel(counts: Map<string, number>, fallback: string) {
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? fallback;
}

function sortSegments(segments: SegmentRow[]) {
  return [...segments]
    .filter(
      (segment) => Array.isArray(segment.rules?.conditions) && segment.rules.conditions.length > 0
    )
    .sort(
      (left, right) =>
        (right.match_count ?? -1) - (left.match_count ?? -1) || left.name.localeCompare(right.name)
    );
}

function toSegmentComparableRow(input: {
  submission: SubmissionRow;
  archetype: string | null;
  v5Archetype: string | null;
  profile: ProfileRow | null;
  hasReport: boolean;
  paid: boolean;
  reportId: number | null;
}): SegmentComparableRow {
  return {
    id: input.submission.id,
    status: input.submission.status,
    duration_ms: input.submission.duration_ms,
    created_date_time: input.submission.created_date_time,
    utm_tracker: input.submission.utm_tracker,
    scoring_result:
      input.archetype || input.v5Archetype
        ? {
            primary_archetype: input.archetype,
            v5_primary_archetype: input.v5Archetype,
          }
        : null,
    app_user: input.profile
      ? {
          user_profile: {
            gender: input.profile.gender,
            sexual_orientation: input.profile.sexual_orientation,
            relationship_status: input.profile.relationship_status,
            location_primary: input.profile.location_primary,
          },
        }
      : null,
    personal_report: input.hasReport
      ? [
          {
            id: input.reportId ?? input.submission.id,
            payment_id: input.paid ? 1 : null,
          },
        ]
      : [],
  };
}

function resolveSegmentLabel(
  comparable: SegmentComparableRow,
  segments: SegmentRow[],
  fallbackArchetype: string | null,
  fallbackSource: string
) {
  const matched = segments.find((segment) => evaluateSegmentRules(comparable, segment.rules));
  if (matched) return matched.name;
  if (fallbackArchetype) return `Archetype: ${fallbackArchetype}`;
  return `Source: ${fallbackSource}`;
}

export async function buildSegmentMigrationSnapshot(
  inputDays: number,
  adminEmail: string
): Promise<SegmentMigrationSnapshot> {
  const days = clampDays(inputDays || 30, 7, 365);
  const currentSince = new Date(Date.now() - days * DAY_MS);
  const previousSince = new Date(Date.now() - days * 2 * DAY_MS);

  try {
    const submissionsRes = await supabaseFetch(
      `/rest/v1/survey_submission?select=id,user_id,status,duration_ms,created_date_time,utm_tracker,session_id&created_date_time=gte.${previousSince.toISOString()}&order=created_date_time.desc`,
      { headers: { Range: "0-49999" } }
    );

    if (!submissionsRes.ok) {
      throw new Error("Unable to load segment migration submissions.");
    }

    const submissions = (await submissionsRes.json()) as SubmissionRow[];
    const identifiedSubmissions = submissions.filter(
      (submission): submission is SubmissionRow & { user_id: number } =>
        Number.isFinite(submission.user_id)
    );
    const submissionIds = identifiedSubmissions.map((submission) => submission.id);
    const userIds = uniqueNumbers(identifiedSubmissions.map((submission) => submission.user_id));

    const [appUsers, scoringRows, reports, segmentsRes, invitesRes] = await Promise.all([
      userIds.length === 0
        ? Promise.resolve([] as AppUserRow[])
        : fetchBatches<AppUserRow>(userIds, (batch) => {
            return `/rest/v1/app_user?select=id,email,user_profile_id&id=in.(${batch.join(",")})`;
          }),
      submissionIds.length === 0
        ? Promise.resolve([] as ScoringRow[])
        : fetchBatches<ScoringRow>(submissionIds, (batch) => {
            const select = [
              "survey_submission_id",
              "primary_archetype",
              "v5_primary_archetype",
            ].join(",");
            return `/rest/v1/scoring_result?select=${select}&survey_submission_id=in.(${batch.join(",")})`;
          }),
      submissionIds.length === 0
        ? Promise.resolve([] as ReportRow[])
        : fetchBatches<ReportRow>(submissionIds, (batch) => {
            return `/rest/v1/personal_report?select=id,survey_submission_id&survey_submission_id=in.(${batch.join(",")})`;
          }),
      supabaseFetch(
        `/rest/v1/admin_segment?or=(admin_email.eq.${encodeURIComponent(adminEmail)},is_shared.eq.true)&select=id,name,rules,match_count&order=match_count.desc`,
        { headers: { Range: "0-99" } }
      ),
      supabaseFetch(
        `/rest/v1/invite_event?select=referrer_email&created_at=gte.${previousSince.toISOString()}`,
        {
          headers: { Range: "0-49999" },
        }
      ),
    ]);

    if (!segmentsRes.ok || !invitesRes.ok) {
      throw new Error("Unable to load segment migration support data.");
    }

    const profileIds = uniqueNumbers(appUsers.map((user) => user.user_profile_id));
    const reportIds = reports.map((report) => report.id);

    const [profiles, reportSessions, shares, payments] = await Promise.all([
      profileIds.length === 0
        ? Promise.resolve([] as ProfileRow[])
        : fetchBatches<ProfileRow>(profileIds, (batch) => {
            return `/rest/v1/user_profile?select=id,gender,sexual_orientation,relationship_status,location_primary&id=in.(${batch.join(",")})`;
          }),
      reportIds.length === 0
        ? Promise.resolve([] as ReportSessionRow[])
        : fetchBatches<ReportSessionRow>(reportIds, (batch) => {
            return `/rest/v1/report_session?select=personal_report_id,started_at&personal_report_id=in.(${batch.join(",")})`;
          }),
      reportIds.length === 0
        ? Promise.resolve([] as ShareRow[])
        : fetchBatches<ShareRow>(reportIds, (batch) => {
            return `/rest/v1/report_access_email?select=personal_report_id&personal_report_id=in.(${batch.join(",")})`;
          }),
      reportIds.length === 0
        ? Promise.resolve([] as PaymentRow[])
        : fetchBatches<PaymentRow>(reportIds, (batch) => {
            return `/rest/v1/payment?select=personal_report_id,status&personal_report_id=in.(${batch.join(",")})`;
          }),
    ]);

    const segments = sortSegments((await segmentsRes.json()) as SegmentRow[]);
    const invites = (await invitesRes.json()) as InviteRow[];
    const appUserById = new Map(appUsers.map((user) => [user.id, user] as const));
    const profileById = new Map(profiles.map((profile) => [profile.id, profile] as const));
    const scoringBySubmission = new Map(
      scoringRows.map((row) => [row.survey_submission_id, row] as const)
    );
    const reportBySubmission = new Map(
      reports.map((report) => [report.survey_submission_id, report] as const)
    );
    const sessionStatsByReport = new Map<number, { count: number; days: Set<string> }>();

    for (const session of reportSessions) {
      const current = sessionStatsByReport.get(session.personal_report_id) ?? {
        count: 0,
        days: new Set<string>(),
      };
      current.count += 1;
      if (session.started_at) current.days.add(session.started_at.slice(0, 10));
      sessionStatsByReport.set(session.personal_report_id, current);
    }

    const sharedReports = new Set(shares.map((share) => share.personal_report_id));
    const paidReports = new Set(
      payments
        .filter((payment) => payment.status === "succeeded")
        .map((payment) => payment.personal_report_id)
    );
    const referredEmails = new Set(
      invites
        .map((invite) => invite.referrer_email?.toLowerCase() ?? null)
        .filter((value): value is string => !!value)
    );

    const currentStates = new Map<number, UserWindowState>();
    const previousStates = new Map<number, UserWindowState>();

    for (const submission of identifiedSubmissions) {
      const createdAtMs = new Date(submission.created_date_time).getTime();
      if (Number.isNaN(createdAtMs)) continue;

      const appUser = appUserById.get(submission.user_id) ?? null;
      const profile =
        appUser?.user_profile_id != null
          ? (profileById.get(appUser.user_profile_id) ?? null)
          : null;
      const scoring = scoringBySubmission.get(submission.id);
      const report = reportBySubmission.get(submission.id) ?? null;
      const sessionStats = report ? sessionStatsByReport.get(report.id) : undefined;
      const hasReport = Boolean(report);
      const viewedReport = Boolean(sessionStats);
      const retained = (sessionStats?.count ?? 0) >= 2 || (sessionStats?.days.size ?? 0) >= 2;
      const shared = Boolean(report && sharedReports.has(report.id));
      const paid = Boolean(report && paidReports.has(report.id));
      const referred = !!appUser?.email && referredEmails.has(appUser.email.toLowerCase());
      const strength = strengthScore({
        status: submission.status,
        scored: Boolean(scoring),
        hasReport,
        viewedReport,
        retained,
        shared,
        referred,
        paid,
      });
      const cohort = cohortFromScore(strength);
      const source = sourceLabel(submission.utm_tracker);
      const comparable = toSegmentComparableRow({
        submission,
        archetype: scoring?.primary_archetype ?? null,
        v5Archetype: scoring?.v5_primary_archetype ?? null,
        profile,
        hasReport,
        paid,
        reportId: report?.id ?? null,
      });
      const state: UserWindowState = {
        userId: submission.user_id,
        submissionId: submission.id,
        createdAt: submission.created_date_time,
        cohortKey: cohort.key,
        cohortLabel: cohort.label,
        strengthScore: strength,
        segmentLabel: resolveSegmentLabel(
          comparable,
          segments,
          scoring?.primary_archetype ?? null,
          source
        ),
        source,
        archetype: scoring?.primary_archetype ?? "Unscored",
      };

      if (createdAtMs >= currentSince.getTime()) {
        if (!currentStates.has(submission.user_id)) {
          currentStates.set(submission.user_id, state);
        }
        continue;
      }

      if (createdAtMs >= previousSince.getTime() && !previousStates.has(submission.user_id)) {
        previousStates.set(submission.user_id, state);
      }
    }

    const currentUserIds = new Set(currentStates.keys());
    const previousUserIds = new Set(previousStates.keys());
    const trackedUserIds = [...currentUserIds].filter((userId) => previousUserIds.has(userId));

    const pathMap = new Map<
      string,
      {
        fromLabel: string;
        toLabel: string;
        movement: MovementType;
        users: number;
        previousScoreTotal: number;
        currentScoreTotal: number;
        deltaTotal: number;
        segmentCounts: Map<string, number>;
        sourceCounts: Map<string, number>;
      }
    >();

    const clusterMap = new Map<
      string,
      {
        label: string;
        currentUsers: number;
        previousUsers: number;
        upgradedUsers: number;
        downgradedUsers: number;
        strongNow: number;
        weakNow: number;
        deltaTotal: number;
        deltaCount: number;
        pathCounts: Map<string, number>;
      }
    >();

    function ensureCluster(label: string) {
      const current = clusterMap.get(label) ?? {
        label,
        currentUsers: 0,
        previousUsers: 0,
        upgradedUsers: 0,
        downgradedUsers: 0,
        strongNow: 0,
        weakNow: 0,
        deltaTotal: 0,
        deltaCount: 0,
        pathCounts: new Map<string, number>(),
      };
      clusterMap.set(label, current);
      return current;
    }

    for (const state of currentStates.values()) {
      const cluster = ensureCluster(state.segmentLabel);
      cluster.currentUsers += 1;
      if ((COHORTS.find((cohort) => cohort.key === state.cohortKey)?.rank ?? 0) >= 2) {
        cluster.strongNow += 1;
      } else {
        cluster.weakNow += 1;
      }
    }

    for (const state of previousStates.values()) {
      ensureCluster(state.segmentLabel).previousUsers += 1;
    }

    let upgradedUsers = 0;
    let downgradedUsers = 0;
    let steadyStrongUsers = 0;
    let stuckWeakUsers = 0;

    for (const userId of trackedUserIds) {
      const previous = previousStates.get(userId);
      const current = currentStates.get(userId);
      if (!previous || !current) continue;

      const movement = movementType(previous.cohortKey, current.cohortKey);
      const delta = current.strengthScore - previous.strengthScore;
      const pathKey = `${previous.cohortKey}->${current.cohortKey}`;
      const currentPath = pathMap.get(pathKey) ?? {
        fromLabel: previous.cohortLabel,
        toLabel: current.cohortLabel,
        movement,
        users: 0,
        previousScoreTotal: 0,
        currentScoreTotal: 0,
        deltaTotal: 0,
        segmentCounts: new Map<string, number>(),
        sourceCounts: new Map<string, number>(),
      };

      currentPath.users += 1;
      currentPath.previousScoreTotal += previous.strengthScore;
      currentPath.currentScoreTotal += current.strengthScore;
      currentPath.deltaTotal += delta;
      currentPath.segmentCounts.set(
        current.segmentLabel,
        (currentPath.segmentCounts.get(current.segmentLabel) ?? 0) + 1
      );
      currentPath.sourceCounts.set(
        current.source,
        (currentPath.sourceCounts.get(current.source) ?? 0) + 1
      );
      pathMap.set(pathKey, currentPath);

      const cluster = ensureCluster(current.segmentLabel);
      cluster.deltaTotal += delta;
      cluster.deltaCount += 1;
      const pathLabel = `${previous.cohortLabel} -> ${current.cohortLabel}`;
      cluster.pathCounts.set(pathLabel, (cluster.pathCounts.get(pathLabel) ?? 0) + 1);

      if (movement === "upgrade") upgradedUsers += 1;
      if (movement === "downgrade") downgradedUsers += 1;

      const previousRank = COHORTS.find((cohort) => cohort.key === previous.cohortKey)?.rank ?? 0;
      const currentRank = COHORTS.find((cohort) => cohort.key === current.cohortKey)?.rank ?? 0;
      if (movement === "stable" && previousRank >= 2 && currentRank >= 2) steadyStrongUsers += 1;
      if (movement === "stable" && previousRank <= 1 && currentRank <= 1) stuckWeakUsers += 1;

      if (movement === "upgrade") cluster.upgradedUsers += 1;
      if (movement === "downgrade") cluster.downgradedUsers += 1;
    }

    const matrix = COHORTS.flatMap((fromCohort) =>
      COHORTS.map((toCohort) => {
        const aggregate = pathMap.get(`${fromCohort.key}->${toCohort.key}`);
        return {
          fromKey: fromCohort.key,
          fromLabel: fromCohort.label,
          toKey: toCohort.key,
          toLabel: toCohort.label,
          users: aggregate?.users ?? 0,
          shareOfTracked:
            trackedUserIds.length > 0
              ? round1(((aggregate?.users ?? 0) / trackedUserIds.length) * 100)
              : 0,
          avgScoreDelta:
            aggregate && aggregate.users > 0 ? round1(aggregate.deltaTotal / aggregate.users) : 0,
          movement: movementType(fromCohort.key, toCohort.key),
        } satisfies SegmentMigrationMatrixCell;
      })
    );

    const paths = [...pathMap.values()]
      .map((path) => ({
        path: `${path.fromLabel} -> ${path.toLabel}`,
        fromLabel: path.fromLabel,
        toLabel: path.toLabel,
        movement: path.movement,
        users: path.users,
        shareOfTracked:
          trackedUserIds.length > 0 ? round1((path.users / trackedUserIds.length) * 100) : 0,
        avgPreviousScore: round1(path.previousScoreTotal / path.users),
        avgCurrentScore: round1(path.currentScoreTotal / path.users),
        avgScoreDelta: round1(path.deltaTotal / path.users),
        primaryCurrentSegment: topLabel(path.segmentCounts, "No cluster"),
        primaryCurrentSource: topLabel(path.sourceCounts, "Direct"),
      }))
      .sort(
        (left, right) =>
          right.users - left.users ||
          right.avgScoreDelta - left.avgScoreDelta ||
          left.path.localeCompare(right.path)
      );

    const clusters = [...clusterMap.values()]
      .map((cluster) => ({
        label: cluster.label,
        currentUsers: cluster.currentUsers,
        previousUsers: cluster.previousUsers,
        upgradedUsers: cluster.upgradedUsers,
        downgradedUsers: cluster.downgradedUsers,
        strongNow: cluster.strongNow,
        weakNow: cluster.weakNow,
        netStrengthDelta:
          cluster.deltaCount > 0 ? round1(cluster.deltaTotal / cluster.deltaCount) : 0,
        topPath: topLabel(cluster.pathCounts, "No tracked migration yet"),
      }))
      .sort(
        (left, right) =>
          Math.abs(right.netStrengthDelta) - Math.abs(left.netStrengthDelta) ||
          right.currentUsers - left.currentUsers ||
          left.label.localeCompare(right.label)
      )
      .slice(0, 12);

    const topUpgradePath = paths.find((path) => path.movement === "upgrade")?.path ?? null;
    const topDowngradePath = paths.find((path) => path.movement === "downgrade")?.path ?? null;

    const recommendations: SegmentMigrationRecommendation[] = [];
    if (topDowngradePath) {
      recommendations.push({
        title: `Arrest ${topDowngradePath}`,
        detail:
          "This is the heaviest current downgrade path. Trace what changed in the segment, source, or release context before more users decay.",
        tone: "risk",
      });
    }
    if (topUpgradePath) {
      recommendations.push({
        title: `Scale what is driving ${topUpgradePath}`,
        detail:
          "This is the strongest upgrade path in the current back-to-back windows. Protect the segment and source conditions producing the move.",
        tone: "scale",
      });
    }
    if (stuckWeakUsers > 0) {
      recommendations.push({
        title: "Weak users are not graduating fast enough",
        detail: `${stuckWeakUsers} tracked users stayed in the weak or emerging bands across both windows. Pair this with leak debugger and recovery playbooks before buying more traffic.`,
        tone: "watch",
      });
    }

    const trust = buildTrustDescriptor({
      source:
        "survey_submission + app_user + user_profile + scoring_result + personal_report + report_session + report_access_email + payment + invite_event",
      mode: "derived",
      sampleSize: currentUserIds.size + previousUserIds.size,
      lastUpdated: new Date().toISOString(),
      warning:
        trackedUserIds.length < 10
          ? "Segment migration is based on a small tracked-user sample in the selected windows."
          : currentUserIds.size === 0
            ? "No identified users exist in the current comparison window."
            : null,
    });

    return {
      generatedAt: new Date().toISOString(),
      days,
      summary: {
        trackedUsers: trackedUserIds.length,
        newUsers: [...currentUserIds].filter((userId) => !previousUserIds.has(userId)).length,
        churnedUsers: [...previousUserIds].filter((userId) => !currentUserIds.has(userId)).length,
        upgradedUsers,
        downgradedUsers,
        steadyStrongUsers,
        stuckWeakUsers,
        topUpgradePath,
        topDowngradePath,
      },
      cohorts: COHORTS,
      matrix,
      paths,
      clusters,
      recommendations,
      trust: {
        warning: trust.warning,
        notes: [
          `This compares two back-to-back ${days}-day windows using the latest identified submission per user in each window.`,
          "Cohort strength is derived from completion, scoring, report generation, report consumption, retention, sharing, referral, and payment signals.",
          segments.length > 0
            ? "Segment overlays use saved admin segments first and fall back to archetype or source only when nothing matches."
            : "No saved admin segments exist yet, so migration clusters fall back to archetype or source labels.",
          "Anonymous submissions without a stable user_id are excluded from migration paths because they cannot be tracked across windows.",
        ],
        sampleSize: currentUserIds.size + previousUserIds.size,
        trackedUsers: trackedUserIds.length,
      },
    };
  } catch (err) {
    logger.error({ err }, "Segment migration build error");
    throw err;
  }
}
