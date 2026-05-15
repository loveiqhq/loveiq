import { maskEmail } from "@features/admin/server/format";
import { buildTrustDescriptor, clampDays, round1 } from "@features/admin/server/next-level";
import {
  evaluateSegmentRules,
  type SegmentComparableRow,
  type SegmentRules,
} from "@features/admin/server/segment-evaluator";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

interface InviteEventRow {
  id: number;
  referrer_email: string;
  recipient_email: string | null;
  invite_method: string | null;
  client_ip: string | null;
  created_at: string;
}

interface RpcReferrer {
  email: string;
  invite_count: number;
  completions: number;
  conversion_rate: number;
}

interface RpcMethodCount {
  method: string;
  count: number;
}

interface ReferralRpcResult {
  total_invites: number;
  unique_referrers: number;
  completions_from_invites: number;
  viral_coefficient: number;
  methods: RpcMethodCount[];
  top_referrers: RpcReferrer[];
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

interface SubmissionRow {
  id: number;
  user_id: number;
  status: string;
  duration_ms: number | null;
  created_date_time: string;
  utm_tracker: string | null;
}

interface ScoringRow {
  survey_submission_id: number;
  primary_archetype: string | null;
  v5_primary_archetype: string | null;
}

interface ReportRow {
  survey_submission_id: number;
  payment_id: number | null;
}

interface SegmentRow {
  id: number;
  name: string;
  rules: SegmentRules;
  match_count: number | null;
}

type ReferralAttention = "scale" | "watch" | "risk" | "blindspot";

export interface ReferralReferrerRow {
  email: string;
  segmentLabel: string;
  invites: number;
  recipientCoverageRate: number;
  conversionRate: number;
  chainDepth: number;
  downstreamReferrers: number;
  qualityScore: number;
  suspiciousScore: number;
  topMethod: string;
  attention: ReferralAttention;
  lead: string;
}

export interface ReferralSegmentRow {
  segmentLabel: string;
  referrers: number;
  invites: number;
  completions: number;
  conversionRate: number;
  avgChainDepth: number;
  avgQualityScore: number;
  flaggedReferrers: number;
}

export interface SuspiciousReferralRow {
  email: string;
  suspiciousScore: number;
  reasons: string[];
  invites: number;
  chainDepth: number;
  topMethod: string;
}

export interface ReferralRecommendation {
  title: string;
  detail: string;
  tone: "scale" | "watch" | "risk" | "blindspot";
}

export interface ReferralIntelligenceSnapshot {
  generatedAt: string;
  days: number;
  summary: {
    totalInvites: number;
    uniqueReferrers: number;
    completionsFromInvites: number;
    viralCoefficient: number;
    avgChainDepth: number;
    highQualityReferrers: number;
    suspiciousReferrers: number;
    blindspotInvites: number;
  };
  methods: RpcMethodCount[];
  referrers: ReferralReferrerRow[];
  segments: ReferralSegmentRow[];
  suspicious: SuspiciousReferralRow[];
  recommendations: ReferralRecommendation[];
  trust: {
    warning: string | null;
    notes: string[];
    recipientCoverageRate: number;
    sampleSize: number;
  };
}

interface ReferralReferrerDetail extends Omit<ReferralReferrerRow, "email"> {
  rawEmail: string;
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

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => !!value?.trim()))];
}

async function fetchBatches<T, V extends string | number = string | number>(
  values: V[],
  builder: (batch: V[]) => string
): Promise<T[]> {
  const responses = await Promise.all(
    chunk(values).map((batch) =>
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

function quoteEmailList(batch: string[]) {
  return batch.map((value) => `"${encodeURIComponent(value)}"`).join(",");
}

function toComparableRow(input: {
  submission: SubmissionRow;
  scoring: ScoringRow | null;
  profile: ProfileRow | null;
  reports: ReportRow[];
}): SegmentComparableRow {
  return {
    id: input.submission.id,
    status: input.submission.status,
    duration_ms: input.submission.duration_ms,
    created_date_time: input.submission.created_date_time,
    utm_tracker: input.submission.utm_tracker,
    scoring_result: input.scoring
      ? {
          primary_archetype: input.scoring.primary_archetype,
          v5_primary_archetype: input.scoring.v5_primary_archetype,
        }
      : null,
    app_user: {
      user_profile: {
        gender: input.profile?.gender ?? null,
        sexual_orientation: input.profile?.sexual_orientation ?? null,
        relationship_status: input.profile?.relationship_status ?? null,
        location_primary: input.profile?.location_primary ?? null,
      },
    },
    personal_report: input.reports.map((report, index) => ({
      id: index + 1,
      payment_id: report.payment_id,
    })),
  };
}

function inviteBurstScore(timestamps: number[]) {
  if (timestamps.length < 3) return 0;

  let strongestBurst = 1;
  for (let index = 0; index < timestamps.length; index += 1) {
    let end = index;
    const startTime = timestamps.at(index);
    if (startTime == null) continue;

    while (end + 1 < timestamps.length) {
      const nextTime = timestamps.at(end + 1);
      if (nextTime == null || nextTime - startTime > 10 * 60_000) break;
      end += 1;
    }
    strongestBurst = Math.max(strongestBurst, end - index + 1);
  }

  if (strongestBurst >= 6) return 30;
  if (strongestBurst >= 4) return 18;
  return 0;
}

function computeChainDepth(
  email: string,
  adjacency: Map<string, Set<string>>,
  memo: Map<string, number>,
  seen = new Set<string>()
): number {
  if (memo.has(email)) return memo.get(email) ?? 0;
  if (seen.has(email)) return 0;

  const next = adjacency.get(email);
  if (!next || next.size === 0) {
    memo.set(email, 0);
    return 0;
  }

  seen.add(email);
  let depth = 0;
  for (const recipient of next) {
    depth = Math.max(depth, 1 + computeChainDepth(recipient, adjacency, memo, seen));
  }
  seen.delete(email);
  memo.set(email, depth);
  return depth;
}

function qualityScore(input: {
  conversionRate: number;
  recipientCoverageRate: number;
  chainDepth: number;
  downstreamReferrers: number;
  suspiciousScore: number;
}): number {
  const chainSignal = Math.min(input.chainDepth * 30, 100);
  const downstreamSignal = Math.min(input.downstreamReferrers * 20, 100);
  return round1(
    input.conversionRate * 0.45 +
      input.recipientCoverageRate * 0.2 +
      chainSignal * 0.15 +
      downstreamSignal * 0.1 +
      Math.max(0, 100 - input.suspiciousScore) * 0.1
  );
}

function attentionForReferrer(input: {
  invites: number;
  recipientCoverageRate: number;
  conversionRate: number;
  qualityScore: number;
  suspiciousScore: number;
}): ReferralAttention {
  if (input.invites >= 3 && input.recipientCoverageRate < 20) return "blindspot";
  if (input.suspiciousScore >= 40 || (input.invites >= 5 && input.qualityScore < 35)) return "risk";
  if (input.invites >= 3 && input.qualityScore >= 70 && input.conversionRate >= 20) return "scale";
  return "watch";
}

export async function buildReferralIntelligenceSnapshot(
  inputDays: number,
  adminEmail: string
): Promise<ReferralIntelligenceSnapshot> {
  const days = clampDays(inputDays || 30, 7, 365);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  try {
    const [rpcRes, inviteRes, segmentsRes] = await Promise.all([
      supabaseFetch("/rest/v1/rpc/get_referral_chains", {
        method: "POST",
        body: JSON.stringify({ since_ts: since }),
      }),
      supabaseFetch(
        `/rest/v1/invite_event?select=id,referrer_email,recipient_email,invite_method,client_ip,created_at&created_at=gte.${since}&order=created_at.desc`,
        { headers: { Range: "0-49999" } }
      ),
      supabaseFetch(
        `/rest/v1/admin_segment?or=(admin_email.eq.${encodeURIComponent(adminEmail)},is_shared.eq.true)&select=id,name,rules,match_count&order=match_count.desc`,
        { headers: { Range: "0-49" } }
      ),
    ]);

    if (!rpcRes.ok || !inviteRes.ok || !segmentsRes.ok) {
      throw new Error("Unable to load referral intelligence data.");
    }

    const rpc = (await rpcRes.json()) as ReferralRpcResult;
    const inviteEvents = (await inviteRes.json()) as InviteEventRow[];
    const segments = (await segmentsRes.json()) as SegmentRow[];

    const referrerEmails = uniqueStrings(
      inviteEvents.map((event) => event.referrer_email.toLowerCase())
    );
    const recipientEmails = uniqueStrings(
      inviteEvents.map((event) => event.recipient_email?.toLowerCase() ?? null)
    );
    const allEmails = uniqueStrings([...referrerEmails, ...recipientEmails]);

    const appUsers =
      allEmails.length === 0
        ? []
        : await fetchBatches<AppUserRow>(allEmails, (batch) => {
            return `/rest/v1/app_user?select=id,email,user_profile_id&email=in.(${quoteEmailList(
              batch as string[]
            )})`;
          });

    const appUserByEmail = new Map(
      appUsers
        .filter((user) => user.email)
        .map((user) => [user.email!.toLowerCase(), user] as const)
    );

    const profileIds = uniqueNumbers(appUsers.map((user) => user.user_profile_id));
    const userIds = uniqueNumbers(appUsers.map((user) => user.id));

    const [profiles, submissions] = await Promise.all([
      profileIds.length === 0
        ? Promise.resolve([] as ProfileRow[])
        : fetchBatches<ProfileRow>(profileIds, (batch) => {
            return `/rest/v1/user_profile?select=id,gender,sexual_orientation,relationship_status,location_primary&id=in.(${(batch as number[]).join(",")})`;
          }),
      userIds.length === 0
        ? Promise.resolve([] as SubmissionRow[])
        : fetchBatches<SubmissionRow>(userIds, (batch) => {
            return `/rest/v1/survey_submission?select=id,user_id,status,duration_ms,created_date_time,utm_tracker&user_id=in.(${(batch as number[]).join(",")})`;
          }),
    ]);

    const submissionIds = submissions.map((submission) => submission.id);
    const [scoringRows, reportRows] = await Promise.all([
      submissionIds.length === 0
        ? Promise.resolve([] as ScoringRow[])
        : fetchBatches<ScoringRow>(submissionIds, (batch) => {
            const select = [
              "survey_submission_id",
              "primary_archetype",
              "v5_primary_archetype",
            ].join(",");
            return `/rest/v1/scoring_result?select=${select}&survey_submission_id=in.(${(batch as number[]).join(",")})`;
          }),
      submissionIds.length === 0
        ? Promise.resolve([] as ReportRow[])
        : fetchBatches<ReportRow>(submissionIds, (batch) => {
            return `/rest/v1/personal_report?select=survey_submission_id,payment_id&survey_submission_id=in.(${(batch as number[]).join(",")})`;
          }),
    ]);

    const profileById = new Map(profiles.map((profile) => [profile.id, profile] as const));
    const scoringBySubmission = new Map(
      scoringRows.map((row) => [row.survey_submission_id, row] as const)
    );
    const reportsBySubmission = new Map<number, ReportRow[]>();
    for (const report of reportRows) {
      const current = reportsBySubmission.get(report.survey_submission_id) ?? [];
      current.push(report);
      reportsBySubmission.set(report.survey_submission_id, current);
    }

    const latestSubmissionByUser = new Map<number, SubmissionRow>();
    for (const submission of submissions) {
      const current = latestSubmissionByUser.get(submission.user_id);
      if (
        !current ||
        new Date(submission.created_date_time) > new Date(current.created_date_time)
      ) {
        latestSubmissionByUser.set(submission.user_id, submission);
      }
    }

    const segmentCandidates = segments
      .filter(
        (segment) => Array.isArray(segment.rules?.conditions) && segment.rules.conditions.length > 0
      )
      .slice(0, 12);

    const rpcByEmail = new Map(
      (rpc.top_referrers ?? []).map((referrer) => [referrer.email.toLowerCase(), referrer] as const)
    );
    const adjacency = new Map<string, Set<string>>();
    const referrersByIp = new Map<string, Set<string>>();
    const memo = new Map<string, number>();

    for (const event of inviteEvents) {
      const referrer = event.referrer_email.toLowerCase();
      if (event.recipient_email) {
        const recipient = event.recipient_email.toLowerCase();
        const current = adjacency.get(referrer) ?? new Set<string>();
        current.add(recipient);
        adjacency.set(referrer, current);
      }

      if (event.client_ip) {
        const current = referrersByIp.get(event.client_ip) ?? new Set<string>();
        current.add(referrer);
        referrersByIp.set(event.client_ip, current);
      }
    }

    const eventsByReferrer = new Map<string, InviteEventRow[]>();
    for (const event of inviteEvents) {
      const referrer = event.referrer_email.toLowerCase();
      const current = eventsByReferrer.get(referrer) ?? [];
      current.push(event);
      eventsByReferrer.set(referrer, current);
    }

    const referrerDetails: ReferralReferrerDetail[] = [...eventsByReferrer.entries()]
      .map(([email, events]) => {
        const appUser = appUserByEmail.get(email) ?? null;
        const latestSubmission = appUser ? (latestSubmissionByUser.get(appUser.id) ?? null) : null;
        const scoring = latestSubmission
          ? (scoringBySubmission.get(latestSubmission.id) ?? null)
          : null;
        const profile =
          appUser?.user_profile_id != null
            ? (profileById.get(appUser.user_profile_id) ?? null)
            : null;
        const reports = latestSubmission
          ? (reportsBySubmission.get(latestSubmission.id) ?? [])
          : [];
        const comparable =
          latestSubmission != null
            ? toComparableRow({
                submission: latestSubmission,
                scoring,
                profile,
                reports,
              })
            : null;
        const matchingSegment =
          comparable == null
            ? null
            : (segmentCandidates.find((segment) =>
                evaluateSegmentRules(comparable, segment.rules)
              ) ?? null);

        const segmentLabel = matchingSegment?.name ?? scoring?.primary_archetype ?? "Unscored";
        const uniqueRecipients = new Set(
          events
            .map((event) => event.recipient_email?.toLowerCase() ?? null)
            .filter((value): value is string => !!value)
        );
        const recipientCoverageRate =
          events.length > 0 ? round1((uniqueRecipients.size / events.length) * 100) : 0;
        const rpcReferrer = rpcByEmail.get(email);
        const conversionRate = round1(rpcReferrer?.conversion_rate ?? 0);
        const chainDepth = computeChainDepth(email, adjacency, memo);
        const downstreamReferrers = [...(adjacency.get(email) ?? new Set<string>())].filter(
          (recipient) => eventsByReferrer.has(recipient)
        ).length;
        const methods = events.map((event) => event.invite_method || "unknown");
        const methodCounts = new Map<string, number>();
        for (const method of methods) {
          methodCounts.set(method, (methodCounts.get(method) ?? 0) + 1);
        }
        const topMethod =
          [...methodCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ??
          "unknown";
        const inviteTimes = events
          .map((event) => new Date(event.created_at).getTime())
          .filter((value) => Number.isFinite(value))
          .sort((left, right) => left - right);
        const repeatedRecipients = events.length - uniqueRecipients.size;
        const suspiciousReasons: string[] = [];
        let suspiciousScore = 0;

        const burstScore = inviteBurstScore(inviteTimes);
        if (burstScore > 0) {
          suspiciousScore += burstScore;
          suspiciousReasons.push(
            burstScore >= 30 ? "Heavy invite burst in a 10-minute window" : "Invite burst pattern"
          );
        }
        if (events.length >= 5 && recipientCoverageRate < 35) {
          suspiciousScore += 25;
          suspiciousReasons.push("Low recipient capture rate");
        }
        if (events.length >= 4 && repeatedRecipients >= 2) {
          suspiciousScore += 18;
          suspiciousReasons.push("Repeated targeting of the same recipients");
        }
        if (
          events.some(
            (event) => event.client_ip && (referrersByIp.get(event.client_ip)?.size ?? 0) >= 3
          )
        ) {
          suspiciousScore += 22;
          suspiciousReasons.push("Shared invite IP across multiple referrers");
        }

        suspiciousScore = Math.min(100, suspiciousScore);
        const quality = qualityScore({
          conversionRate,
          recipientCoverageRate,
          chainDepth,
          downstreamReferrers,
          suspiciousScore,
        });
        const attention = attentionForReferrer({
          invites: events.length,
          recipientCoverageRate,
          conversionRate,
          qualityScore: quality,
          suspiciousScore,
        });

        const lead =
          attention === "scale"
            ? `${maskEmail(email)} shows durable referral quality with ${chainDepth > 0 ? `chain depth ${chainDepth}` : "clean direct invite conversion"}.`
            : attention === "risk"
              ? `${maskEmail(email)} needs review because referral quality is weak or suspicious signals are elevated.`
              : attention === "blindspot"
                ? `${maskEmail(email)} drives invite volume, but recipient capture is too thin to trust downstream quality.`
                : `${maskEmail(email)} is contributing referral activity, but quality is not yet strong enough to scale.`;

        return {
          rawEmail: email,
          segmentLabel,
          invites: events.length,
          recipientCoverageRate,
          conversionRate,
          chainDepth,
          downstreamReferrers,
          qualityScore: quality,
          suspiciousScore,
          topMethod,
          attention,
          lead,
        } satisfies ReferralReferrerDetail;
      })
      .sort((left, right) => {
        const attentionWeight = (value: ReferralAttention) =>
          value === "scale" ? 0 : value === "watch" ? 1 : value === "risk" ? 2 : 3;
        return (
          attentionWeight(left.attention) - attentionWeight(right.attention) ||
          right.qualityScore - left.qualityScore ||
          right.invites - left.invites
        );
      });

    const referrers: ReferralReferrerRow[] = referrerDetails.map(({ rawEmail, ...detail }) => ({
      email: maskEmail(rawEmail),
      ...detail,
    }));

    const segmentsSnapshot = [...new Set(referrerDetails.map((referrer) => referrer.segmentLabel))]
      .map((segmentLabel) => {
        const rows = referrerDetails.filter((referrer) => referrer.segmentLabel === segmentLabel);
        const invites = rows.reduce((sum, row) => sum + row.invites, 0);
        const completions = rows.reduce(
          (sum, row) => sum + (rpcByEmail.get(row.rawEmail)?.completions ?? 0),
          0
        );
        return {
          segmentLabel,
          referrers: rows.length,
          invites,
          completions,
          conversionRate: invites > 0 ? round1((completions / invites) * 100) : 0,
          avgChainDepth: round1(
            rows.reduce((sum, row) => sum + row.chainDepth, 0) / Math.max(rows.length, 1)
          ),
          avgQualityScore: round1(
            rows.reduce((sum, row) => sum + row.qualityScore, 0) / Math.max(rows.length, 1)
          ),
          flaggedReferrers: rows.filter((row) => row.suspiciousScore >= 40).length,
        } satisfies ReferralSegmentRow;
      })
      .sort(
        (left, right) =>
          right.avgQualityScore - left.avgQualityScore || right.invites - left.invites
      )
      .slice(0, 8);

    const suspicious = referrerDetails
      .filter((referrer) => referrer.suspiciousScore > 0)
      .map((referrer) => {
        const rawEvents = eventsByReferrer.get(referrer.rawEmail) ?? [];
        const reasons: string[] = [];
        if (referrer.suspiciousScore >= 25 && referrer.recipientCoverageRate < 35) {
          reasons.push("Low recipient capture rate");
        }
        if (rawEvents.length >= 4) {
          const uniqueRecipients = new Set(
            rawEvents
              .map((event) => event.recipient_email?.toLowerCase() ?? null)
              .filter((value): value is string => !!value)
          );
          if (rawEvents.length - uniqueRecipients.size >= 2) {
            reasons.push("Repeated targeting of the same recipients");
          }
        }
        if (
          rawEvents.some(
            (event) => event.client_ip && (referrersByIp.get(event.client_ip)?.size ?? 0) >= 3
          )
        ) {
          reasons.push("Shared invite IP across multiple referrers");
        }
        const inviteTimes = rawEvents
          .map((event) => new Date(event.created_at).getTime())
          .filter((value) => Number.isFinite(value))
          .sort((left, right) => left - right);
        if (inviteBurstScore(inviteTimes) > 0) {
          reasons.push("Invite burst pattern");
        }

        return {
          email: maskEmail(referrer.rawEmail),
          suspiciousScore: referrer.suspiciousScore,
          reasons: reasons.length > 0 ? reasons : ["Elevated referral-risk pattern"],
          invites: referrer.invites,
          chainDepth: referrer.chainDepth,
          topMethod: referrer.topMethod,
        } satisfies SuspiciousReferralRow;
      })
      .sort(
        (left, right) =>
          right.suspiciousScore - left.suspiciousScore || right.invites - left.invites
      )
      .slice(0, 8);

    const recipientKnownCount = inviteEvents.filter((event) => !!event.recipient_email).length;
    const recipientCoverageRate =
      inviteEvents.length > 0 ? round1((recipientKnownCount / inviteEvents.length) * 100) : 0;
    const avgChainDepth =
      referrerDetails.length > 0
        ? round1(
            referrerDetails.reduce((sum, row) => sum + row.chainDepth, 0) / referrerDetails.length
          )
        : 0;
    const blindspotInvites = inviteEvents.length - recipientKnownCount;

    const recommendations: ReferralRecommendation[] = [];
    const bestReferrer = referrers.find((referrer) => referrer.attention === "scale");
    if (bestReferrer) {
      recommendations.push({
        title: `Scale the ${bestReferrer.segmentLabel} referral loop`,
        detail: `${bestReferrer.email} is generating the cleanest referral quality right now. Reuse the ${bestReferrer.topMethod} motion and monitor for higher chain depth.`,
        tone: "scale",
      });
    }
    if (recipientCoverageRate < 40) {
      recommendations.push({
        title: "Recipient attribution is the main blindspot",
        detail: `${blindspotInvites} invites in this window do not capture a recipient email, so downstream conversion and chain quality are partially hidden.`,
        tone: "blindspot",
      });
    }
    const riskyReferrer = suspicious[0];
    if (riskyReferrer) {
      recommendations.push({
        title: `Review suspicious referral pressure from ${riskyReferrer.email}`,
        detail: `${riskyReferrer.reasons.join(", ")}. Do not scale referral volume until the pattern is understood.`,
        tone: "risk",
      });
    }
    if (!bestReferrer && !riskyReferrer) {
      recommendations.push({
        title: "Referral loop is active but shallow",
        detail:
          "Depth and conversion are not yet strong enough to treat referrals as a durable growth engine.",
        tone: "watch",
      });
    }

    const trust = buildTrustDescriptor({
      source: "invite_event + get_referral_chains + app_user + survey_submission",
      mode: "derived",
      sampleSize: inviteEvents.length,
      lastUpdated: new Date().toISOString(),
      warning:
        inviteEvents.length < 12
          ? "Referral intelligence is based on a small invite sample in the selected window."
          : recipientCoverageRate < 50
            ? "Most invites in this window do not capture a recipient email, so referral attribution is partially directional."
            : null,
    });

    return {
      generatedAt: new Date().toISOString(),
      days,
      summary: {
        totalInvites: rpc.total_invites ?? inviteEvents.length,
        uniqueReferrers: rpc.unique_referrers ?? referrers.length,
        completionsFromInvites: rpc.completions_from_invites ?? 0,
        viralCoefficient: round1(rpc.viral_coefficient ?? 0),
        avgChainDepth,
        highQualityReferrers: referrerDetails.filter((referrer) => referrer.attention === "scale")
          .length,
        suspiciousReferrers: suspicious.length,
        blindspotInvites,
      },
      methods: rpc.methods ?? [],
      referrers,
      segments: segmentsSnapshot,
      suspicious,
      recommendations,
      trust: {
        warning: trust.warning,
        notes: [
          "Invite quality blends conversion rate, recipient capture, chain depth, and suspicious-pattern pressure.",
          "Chain depth only counts explicit invite_event recipient links where the recipient later becomes a referrer.",
          "Referral segment quality is grouped by the referrer's saved segment match when available, with archetype fallback otherwise.",
          recipientCoverageRate < 50
            ? "Recipient capture is the main attribution blindspot in this window."
            : "Recipient capture is strong enough to trust chain-depth trends.",
        ],
        recipientCoverageRate,
        sampleSize: inviteEvents.length,
      },
    };
  } catch (err) {
    logger.error({ err }, "Referral intelligence build error");
    throw err;
  }
}
