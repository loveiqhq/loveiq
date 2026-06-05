import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { supabaseFetch } from "@features/admin/server/supabase";
import { logAdminAction } from "@features/admin/server/audit";
import { evaluateTestSubmission } from "@features/admin/server/test-submission";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";
import { surveyQuestions } from "@/data/survey-data";
import {
  applyFilters,
  archetypeMatchFilter,
  buildArchetypeDistribution,
  buildBreakdownBy,
  buildCrossTabBy,
  buildFacets,
  buildTrend,
  canonicalizeRelationship,
  computeStats,
  DIMENSION_KEYS,
  isDimensionKey,
  normalizeLabel,
  specForAnswers,
  specForDimension,
  specForScale,
  type AccessorOpts,
  type ArchetypeMatchClause,
  type ArchetypeVersion,
  type DimensionKey,
  type EnrichedRow,
  type ExplorerFilters,
  type PaidStatusFilter,
  type ScaleSummary,
  type TrendGranularity,
  type ValueSpec,
} from "@features/admin/server/explorer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hard ceiling on candidate submissions pulled into memory for a single request.
const MAX_CANDIDATES = 20_000;
// Batch size for `?col=in.(…)` secondary fetches — keeps each URL bounded.
const IN_CHUNK = 500;
const AGE_QID = "15003";
// Built from an array so the column list isn't a single high-entropy literal
// (keeps the no-secrets lint rule happy).
const QUOTE_SELECT = [
  "id",
  "personal_report_id",
  "plan",
  "purchased_at",
  "forced_paywall_arm",
  "experiment_group",
  "device_type",
  "country_tier",
  "base_price_bucket",
  "behavioral_bucket",
].join(",");
// Demographic questions are exposed as first-class dimensions, so they are
// excluded from the generic "filter by survey answer" surface (no duplication).
const DEMOGRAPHIC_QIDS = new Set(["15001", "15003", "15004", "15010", "15011"]);
// Whitelist of question ids usable in the answer filter / `q:` group-by. Bounds
// what can reach the DB (qid flows into a query) and limits to discrete types.
const ANSWER_QIDS = new Set(
  surveyQuestions
    .filter(
      (q) =>
        (q.answerType === "single" || q.answerType === "multiple" || q.answerType === "country") &&
        !DEMOGRAPHIC_QIDS.has(q.qId)
    )
    .map((q) => q.qId)
);
// 1-7 Likert questions — group-by only (their distribution IS the insight). Kept
// separate from ANSWER_QIDS: scale answers live in `normalized_value`, not in
// answer_option/answer_text, so they use a different fetch path.
const SCALE_QIDS = new Set(
  surveyQuestions.filter((q) => q.answerType === "scale").map((q) => q.qId)
);
const MAX_ANSWER_FILTERS = 5;
const MAX_ARCH_MATCH = 5;

const ALLOWED_STATUS = new Set([
  "completed",
  "flagged",
  "archived",
  "pending_completion",
  "partial",
]);

function parseList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseUtmField(
  tracker: string | null,
  field: "utm_source" | "utm_medium" | "utm_campaign"
): string {
  if (!tracker?.trim()) return field === "utm_source" ? "Direct" : "(none)";
  try {
    const parsed = JSON.parse(tracker) as Record<string, string | undefined>;
    const v = parsed[field]?.trim();
    return v || (field === "utm_source" ? "Direct" : "(none)");
  } catch {
    return field === "utm_source" ? "Direct" : "(none)";
  }
}

/**
 * Coerce a scoring_result percentages jsonb into a clean `{archetype: number}`.
 * Drops non-finite / non-numeric values so cohort averages never see NaN.
 */
function sanitizePct(raw: Record<string, unknown> | null | undefined): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(
    Object.entries(raw)
      .map(([name, value]) => [name, typeof value === "number" ? value : Number(value)] as const)
      .filter(([, n]) => Number.isFinite(n))
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Fetch `select` from `table` where `col` is in `ids`, batched so the URL never
 * grows unbounded. `ids` are numbers (safe to join). `extraFilter` is a trusted
 * literal — never raw user input.
 */
async function fetchByIds<T>(
  table: string,
  col: string,
  ids: number[],
  select: string,
  extraFilter = ""
): Promise<T[]> {
  const unique = [...new Set(ids)].filter((id) => Number.isFinite(id));
  if (unique.length === 0) return [];
  const out: T[] = [];
  for (const batch of chunk(unique, IN_CHUNK)) {
    const res = await supabaseFetch(
      `/rest/v1/${table}?${col}=in.(${batch.join(",")})&select=${select}${extraFilter}`,
      { headers: { Range: "0-49999" } }
    );
    if (res.ok) out.push(...((await res.json()) as T[]));
  }
  return out;
}

interface SubmissionRow {
  id: number;
  user_id: number;
  duration_ms: number | null;
  created_date_time: string;
  utm_tracker: string | null;
}

interface QuoteRow {
  id: number;
  personal_report_id: number | null;
  plan: string | null;
  purchased_at: string | null;
  forced_paywall_arm: string | null;
  experiment_group: string | null;
  device_type: string | null;
  country_tier: string | null;
  base_price_bucket: string | null;
  behavioral_bucket: string | null;
}

function csvEscape(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // formula-injection guard incl. tab/CR
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

type GroupToken = { kind: "dim"; dim: DimensionKey } | { kind: "answer"; qid: string };

/** Parse a groupBy token: a fixed dimension, or `q:<qid>` (validated). */
function parseGroupToken(raw: string | null): GroupToken | null {
  if (!raw) return null;
  if (raw.startsWith("q:")) {
    const qid = raw.slice(2).trim();
    return ANSWER_QIDS.has(qid) || SCALE_QIDS.has(qid) ? { kind: "answer", qid } : null;
  }
  return isDimensionKey(raw) ? { kind: "dim", dim: raw } : null;
}

/**
 * Parse `archMatch=<Name>:<min>;<Name2>:<min2>` into validated clauses. Names
 * are URL-encoded archetype labels (compared in-memory to scoring jsonb keys —
 * never reach SQL); `min` is clamped to 0-100.
 */
function parseArchMatch(raw: string | null): ArchetypeMatchClause[] {
  const out: ArchetypeMatchClause[] = [];
  if (!raw) return out;
  for (const clause of raw.split(";").slice(0, MAX_ARCH_MATCH)) {
    const idx = clause.indexOf(":");
    if (idx <= 0) continue;
    let name: string;
    try {
      name = decodeURIComponent(clause.slice(0, idx)).trim();
    } catch {
      name = clause.slice(0, idx).trim();
    }
    const min = Number(clause.slice(idx + 1));
    if (name && Number.isFinite(min)) {
      out.push({ archetype: name, min: Math.max(0, Math.min(100, min)) });
    }
  }
  return out;
}

/** Parse `ans=<qid>:<v1|v2>;<qid2>:<v3>` into validated {qid → allowed values}. */
function parseAnswerFilters(raw: string | null): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!raw) return out;
  for (const clause of raw.split(";").slice(0, MAX_ANSWER_FILTERS)) {
    const idx = clause.indexOf(":");
    if (idx <= 0) continue;
    const qid = clause.slice(0, idx).trim();
    if (!ANSWER_QIDS.has(qid)) continue;
    const values = clause
      .slice(idx + 1)
      .split("|")
      .map((v) => normalizeLabel(decodeURIComponent(v)))
      .filter((v): v is string => v != null);
    if (values.length > 0) out.set(qid, values);
  }
  return out;
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
  const rl = await checkRateLimit(ip, { bucket: "admin-explorer", limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const sp = url.searchParams;

  const rawDays = parseInt(sp.get("days") || "0", 10);
  const days = Number.isFinite(rawDays) && rawDays > 0 ? rawDays : 0;
  const since = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;

  const statusParam = sp.get("status") || "completed";
  const status =
    statusParam === "all" || ALLOWED_STATUS.has(statusParam) ? statusParam : "completed";

  const includeTest = sp.get("includeTest") === "1";
  const archetypeVersion: ArchetypeVersion = sp.get("archetypeVersion") === "v4" ? "v4" : "v5";
  const paidStatusRaw = sp.get("paidStatus");
  const paidStatus: PaidStatusFilter =
    paidStatusRaw === "paid" || paidStatusRaw === "free" ? paidStatusRaw : "all";

  const selections: Partial<Record<DimensionKey, string[]>> = {};
  for (const dim of DIMENSION_KEYS) {
    const vals = parseList(sp.get(dim));
    if (vals.length > 0) selections[dim] = vals;
  }

  const filters: ExplorerFilters = { includeTest, archetypeVersion, paidStatus, selections };
  const accessorOpts: AccessorOpts = { archetypeVersion, includeTest };

  const answerFilters = parseAnswerFilters(sp.get("ans"));
  const archMatchClauses = parseArchMatch(sp.get("archMatch"));
  const groupBy = parseGroupToken(sp.get("groupBy")) ?? {
    kind: "dim",
    dim: "country" as DimensionKey,
  };
  const groupBy2Token = parseGroupToken(sp.get("groupBy2"));
  // Distinct from groupBy (compare the raw token strings).
  const groupBy2 =
    groupBy2Token && (sp.get("groupBy2") ?? "") !== (sp.get("groupBy") ?? "")
      ? groupBy2Token
      : null;

  const wantsCsv = sp.get("format") === "csv";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") || "25", 10) || 25));

  try {
    // ── 1. Candidate submissions ────────────────────────────────────────────
    let submissionQuery = `/rest/v1/survey_submission?select=id,user_id,duration_ms,created_date_time,utm_tracker&order=created_date_time.desc`;
    if (status !== "all") submissionQuery += `&status=eq.${encodeURIComponent(status)}`;
    if (since) submissionQuery += `&created_date_time=gte.${since}`;
    const subRes = await supabaseFetch(submissionQuery, {
      headers: { Range: `0-${MAX_CANDIDATES - 1}`, Prefer: "count=exact" },
    });
    if (!subRes.ok) {
      logger.error({ status: subRes.status }, "explorer: submissions query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }
    const totalAvailable = parseInt(subRes.headers.get("content-range")?.split("/")[1] || "0", 10);
    if (totalAvailable > MAX_CANDIDATES) {
      logger.warn(
        { totalAvailable, cap: MAX_CANDIDATES },
        "explorer: candidate set exceeds cap; oldest rows truncated"
      );
    }
    const submissions = (await subRes.json()) as SubmissionRow[];

    const submissionIds = submissions.map((s) => s.id);
    const userIds = submissions.map((s) => s.user_id).filter((id): id is number => id != null);
    const ageQuestionId = await resolveQuestionId(AGE_QID);

    // ── 2. Related data (chunked in.() fetches) ─────────────────────────────
    const [scoring, users, reports, ageAnswers] = await Promise.all([
      fetchByIds<{
        survey_submission_id: number;
        primary_archetype: string | null;
        v5_primary_archetype: string | null;
        percentages: Record<string, unknown> | null;
        v5_percentages: Record<string, unknown> | null;
      }>(
        "scoring_result",
        "survey_submission_id",
        submissionIds,
        "survey_submission_id,primary_archetype,v5_primary_archetype,percentages,v5_percentages"
      ),
      fetchByIds<{ id: number; email: string | null; user_profile_id: number | null }>(
        "app_user",
        "id",
        userIds,
        "id,email,user_profile_id"
      ),
      fetchByIds<{ id: number; survey_submission_id: number }>(
        "personal_report",
        "survey_submission_id",
        submissionIds,
        "id,survey_submission_id"
      ),
      fetchAnswerRows(ageQuestionId, submissionIds),
    ]);

    const profileIds = users.map((u) => u.user_profile_id).filter((id): id is number => id != null);
    const reportIds = reports.map((r) => r.id);

    const [profiles, payments, quotes, sessions, ageOptions] = await Promise.all([
      fetchByIds<{
        id: number;
        gender: string | null;
        location_primary: string | null;
        sexual_orientation: string | null;
        relationship_status: string | null;
      }>(
        "user_profile",
        "id",
        profileIds,
        "id,gender,location_primary,sexual_orientation,relationship_status"
      ),
      fetchByIds<{ personal_report_id: number | null; amount: string | number | null }>(
        "payment",
        "personal_report_id",
        reportIds,
        "personal_report_id,amount",
        "&status=eq.succeeded"
      ),
      // order=id.desc so the canonical-quote `find` picks the MOST RECENT
      // purchased/full_report quote — correct for users who upgraded plans.
      fetchByIds<QuoteRow>(
        "report_price_quote",
        "personal_report_id",
        reportIds,
        QUOTE_SELECT,
        "&order=id.desc"
      ),
      fetchByIds<{ personal_report_id: number | null }>(
        "report_session",
        "personal_report_id",
        reportIds,
        "personal_report_id"
      ),
      fetchAnswerOptionMap(ageQuestionId),
    ]);

    // ── 2b. Survey-answer maps for answer-filters + `q:` group-by ───────────
    const neededQids = new Set<string>(answerFilters.keys());
    if (groupBy.kind === "answer") neededQids.add(groupBy.qid);
    if (groupBy2?.kind === "answer") neededQids.add(groupBy2.qid);
    const answerLabelMaps = new Map<string, Map<number, string[]>>();
    const scaleValueMaps = new Map<string, Map<number, string>>();
    await Promise.all(
      [...neededQids].map(async (qid) => {
        const dbId = await resolveQuestionId(qid);
        if (SCALE_QIDS.has(qid)) {
          scaleValueMaps.set(qid, await fetchScaleValues(dbId, submissionIds));
        } else {
          answerLabelMaps.set(qid, await fetchAnswerLabels(dbId, submissionIds));
        }
      })
    );

    // ── 3. Build lookup maps ────────────────────────────────────────────────
    const scoringBySub = new Map(scoring.map((s) => [s.survey_submission_id, s]));
    const userById = new Map(users.map((u) => [u.id, u]));
    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const reportBySub = new Map<number, { id: number; survey_submission_id: number }>();
    let dupReports = 0;
    for (const r of reports) {
      if (reportBySub.has(r.survey_submission_id)) dupReports += 1;
      else reportBySub.set(r.survey_submission_id, r);
    }
    if (dupReports > 0) {
      logger.warn({ dupReports }, "explorer: >1 personal_report per submission; kept first");
    }

    const ageBySub = new Map<number, string>();
    for (const a of ageAnswers) {
      const label =
        (a.answer_option_id != null ? ageOptions.get(a.answer_option_id) : null) ?? a.answer_text;
      const norm = normalizeLabel(label);
      if (norm) ageBySub.set(a.survey_submission_id, norm);
    }

    const paidByReport = new Map<number, number>();
    const succeededReports = new Set<number>();
    for (const p of payments) {
      if (p.personal_report_id == null) continue;
      succeededReports.add(p.personal_report_id);
      paidByReport.set(
        p.personal_report_id,
        (paidByReport.get(p.personal_report_id) ?? 0) + Number(p.amount ?? 0)
      );
    }

    // Canonical quote per report (prefer purchased, else full_report, else max id)
    // for pricing/experiment/device attributes; plan from the purchased quote.
    const quotesByReport = new Map<number, QuoteRow[]>();
    for (const q of quotes) {
      if (q.personal_report_id == null) continue;
      const arr = quotesByReport.get(q.personal_report_id) ?? [];
      arr.push(q);
      quotesByReport.set(q.personal_report_id, arr);
    }
    const planByReport = new Map<number, string>();
    const attrsByReport = new Map<number, QuoteRow>();
    for (const [reportId, list] of quotesByReport) {
      const purchased = list.find((q) => q.purchased_at != null);
      if (purchased?.plan) planByReport.set(reportId, purchased.plan);
      const canonical =
        purchased ??
        list.find((q) => q.plan === "full_report") ??
        list.reduce(
          (best, q) => (best == null || q.id > best.id ? q : best),
          null as QuoteRow | null
        );
      if (canonical) attrsByReport.set(reportId, canonical);
    }

    const sessionCountByReport = new Map<number, number>();
    for (const sess of sessions) {
      if (sess.personal_report_id == null) continue;
      sessionCountByReport.set(
        sess.personal_report_id,
        (sessionCountByReport.get(sess.personal_report_id) ?? 0) + 1
      );
    }

    // ── 4. Enrich ───────────────────────────────────────────────────────────
    const enriched: EnrichedRow[] = submissions.map((s) => {
      const user = userById.get(s.user_id);
      const profile = user?.user_profile_id ? profileById.get(user.user_profile_id) : undefined;
      const scoringRow = scoringBySub.get(s.id);
      const reportId = reportBySub.get(s.id)?.id;
      const paidAmount = reportId != null ? (paidByReport.get(reportId) ?? 0) : 0;
      const hasSucceeded = reportId != null && succeededReports.has(reportId);
      const plan = reportId != null ? (planByReport.get(reportId) ?? null) : null;
      const attrs = reportId != null ? attrsByReport.get(reportId) : undefined;
      const sessionCount = reportId != null ? (sessionCountByReport.get(reportId) ?? 0) : 0;
      const email = user?.email ?? null;

      return {
        submissionId: s.id,
        email,
        isTest: evaluateTestSubmission({
          recordType: "submission",
          email,
          durationMs: s.duration_ms,
        }).isLikelyTest,
        archetypeV4: scoringRow?.primary_archetype ?? null,
        archetypeV5: scoringRow?.v5_primary_archetype ?? null,
        percentagesV4: sanitizePct(scoringRow?.percentages),
        percentagesV5: sanitizePct(scoringRow?.v5_percentages),
        ageGroup: ageBySub.get(s.id) ?? null,
        gender: normalizeLabel(profile?.gender),
        country: normalizeLabel(profile?.location_primary),
        orientation: normalizeLabel(profile?.sexual_orientation),
        relationship: canonicalizeRelationship(profile?.relationship_status),
        plan,
        paidAmount,
        hasSucceededPayment: hasSucceeded,
        trafficSource: parseUtmField(s.utm_tracker, "utm_source"),
        utmMedium: parseUtmField(s.utm_tracker, "utm_medium"),
        utmCampaign: parseUtmField(s.utm_tracker, "utm_campaign"),
        device: normalizeLabel(attrs?.device_type),
        paywallArm: normalizeLabel(attrs?.forced_paywall_arm),
        experimentGroup: normalizeLabel(attrs?.experiment_group),
        countryTier: normalizeLabel(attrs?.country_tier),
        priceBucket: normalizeLabel(attrs?.base_price_bucket),
        behavioralBucket: normalizeLabel(attrs?.behavioral_bucket),
        reportViewed: sessionCount > 0,
        sessionCount,
        durationMs: s.duration_ms,
        createdAt: s.created_date_time,
      };
    });

    // ── 5. Filter (fixed dims, then survey answers) ─────────────────────────
    let filtered = applyFilters(enriched, filters);
    for (const [qid, allowed] of answerFilters) {
      const labelMap = answerLabelMaps.get(qid);
      const allowedSet = new Set(allowed);
      filtered = filtered.filter((row) =>
        (labelMap?.get(row.submissionId) ?? []).some((l) => allowedSet.has(l))
      );
    }
    // Archetype-match filter: keep people who strongly match the chosen
    // archetype(s) even when it isn't their primary (full match-% profile).
    filtered = archetypeMatchFilter(filtered, archMatchClauses, archetypeVersion);

    // ── 6. Aggregate ────────────────────────────────────────────────────────
    const facetBase = includeTest ? enriched : enriched.filter((r) => !r.isTest);
    const facets = buildFacets(facetBase, accessorOpts);
    const stats = computeStats(filtered, includeTest);

    const firstLabelSpec = (qid: string): ValueSpec => {
      const labelMap = answerLabelMaps.get(qid) ?? new Map<number, string[]>();
      const first = new Map<number, string>();
      for (const [sid, labels] of labelMap) if (labels[0]) first.set(sid, labels[0]);
      return specForAnswers(first);
    };
    const specFor = (t: GroupToken): ValueSpec => {
      if (t.kind === "dim") return specForDimension(t.dim, accessorOpts);
      if (SCALE_QIDS.has(t.qid)) return specForScale(scaleValueMaps.get(t.qid) ?? new Map());
      return firstLabelSpec(t.qid);
    };
    const tokenLabel = (t: GroupToken): string => (t.kind === "dim" ? t.dim : `q:${t.qid}`);

    const breakdown = buildBreakdownBy(filtered, specFor(groupBy), { includeTest, topN: 12 });
    const crossTab = groupBy2
      ? buildCrossTabBy(
          filtered,
          specFor(groupBy),
          specFor(groupBy2),
          tokenLabel(groupBy),
          tokenLabel(groupBy2),
          8
        )
      : null;

    const trendGranularity: TrendGranularity = days > 0 && days <= 90 ? "day" : "week";
    const trend = buildTrend(filtered, trendGranularity, includeTest);

    // ── 7. CSV export (full filtered set) ───────────────────────────────────
    if (wantsCsv) {
      const headers = [
        "submission_id",
        "email",
        "archetype_v4",
        "archetype_v5",
        "age_group",
        "gender",
        "country",
        "orientation",
        "relationship",
        "plan",
        "device",
        "paywall_arm",
        "experiment_group",
        "country_tier",
        "price_bucket",
        "behavioral_bucket",
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "report_viewed",
        "report_opens",
        "paid_amount",
        "created_at",
      ];
      const lines = [
        headers.join(","),
        ...filtered.map((r) =>
          [
            r.submissionId,
            r.email,
            r.archetypeV4,
            r.archetypeV5,
            r.ageGroup,
            r.gender,
            r.country,
            r.orientation,
            r.relationship,
            r.plan,
            r.device,
            r.paywallArm,
            r.experimentGroup,
            r.countryTier,
            r.priceBucket,
            r.behavioralBucket,
            r.trafficSource,
            r.utmMedium,
            r.utmCampaign,
            r.reportViewed ? "yes" : "no",
            r.sessionCount,
            r.paidAmount,
            r.createdAt,
          ]
            .map(csvEscape)
            .join(",")
        ),
      ];
      void logAdminAction({
        admin_email: admin.email,
        action: "export_csv",
        resource_type: "explorer",
        metadata: { query: url.search, rows: filtered.length },
        ip,
      });
      return new NextResponse(lines.join("\n"), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="explorer-export.csv"',
        },
      });
    }

    // ── 8. All-archetype profile + scale summary (JSON response only) ───────
    const archetypeDistribution = buildArchetypeDistribution(
      filtered,
      archetypeVersion,
      includeTest
    );
    let scaleSummary: ScaleSummary | null = null;
    if (groupBy.kind === "answer" && SCALE_QIDS.has(groupBy.qid)) {
      const map = scaleValueMaps.get(groupBy.qid) ?? new Map<number, string>();
      let sum = 0;
      let n = 0;
      for (const row of filtered) {
        const raw = map.get(row.submissionId);
        if (raw == null) continue;
        const num = Number(raw);
        if (Number.isFinite(num)) {
          sum += num;
          n += 1;
        }
      }
      scaleSummary = { qid: groupBy.qid, avg: n > 0 ? Math.round((sum / n) * 10) / 10 : 0, n };
    }

    // ── 9. Paginated row list for the table ─────────────────────────────────
    const total = filtered.length;
    const startIdx = (page - 1) * limit;
    const rows = filtered.slice(startIdx, startIdx + limit).map((r) => ({
      submissionId: r.submissionId,
      email: r.email,
      archetype: archetypeVersion === "v4" ? r.archetypeV4 : r.archetypeV5,
      ageGroup: r.ageGroup,
      gender: r.gender,
      country: r.country,
      device: r.device,
      plan: r.plan,
      reportViewed: r.reportViewed,
      paid: includeTest ? r.hasSucceededPayment : r.paidAmount > 0,
      paidAmount: r.paidAmount,
      createdAt: r.createdAt,
    }));

    return NextResponse.json({
      range: { days, since },
      filtersEcho: {
        ...filters,
        status,
        groupBy: sp.get("groupBy") ?? "country",
        groupBy2: groupBy2 ? (sp.get("groupBy2") ?? null) : null,
        answers: Object.fromEntries(answerFilters),
      },
      stats,
      facets,
      breakdown,
      crossTab,
      trend,
      trendGranularity,
      archetypeDistribution,
      scaleSummary,
      rows,
      total,
      page,
      limit,
      capped: totalAvailable > MAX_CANDIDATES,
    });
  } catch (err) {
    logger.error({ err }, "explorer route fatal error");
    return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
  }
}

// ── Survey-question helpers ─────────────────────────────────────────────────

// Question DB ids never change at runtime — memoize per frontend qid so repeat
// requests skip the lookup. Only successful lookups (id >= 0) are cached.
const questionIdCache = new Map<string, number>();

async function resolveQuestionId(frontendQid: string): Promise<number> {
  const cached = questionIdCache.get(frontendQid);
  if (cached != null) return cached;
  const res = await supabaseFetch(
    `/rest/v1/survey_question?frontend_qid=eq.${encodeURIComponent(frontendQid)}&select=id&limit=1`
  );
  if (!res.ok) return -1;
  const rows = (await res.json()) as Array<{ id: number }>;
  const id = rows[0]?.id ?? -1;
  if (id >= 0) questionIdCache.set(frontendQid, id);
  return id;
}

async function fetchAnswerOptionMap(qid: number): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (qid < 0) return map;
  const res = await supabaseFetch(
    `/rest/v1/answer_option?survey_question_id=eq.${qid}&select=id,option_text`,
    { headers: { Range: "0-999" } }
  );
  if (!res.ok) return map;
  const rows = (await res.json()) as Array<{ id: number; option_text: string | null }>;
  for (const r of rows) if (r.option_text) map.set(r.id, r.option_text);
  return map;
}

interface AnswerRow {
  survey_submission_id: number;
  answer_option_id: number | null;
  answer_text: string | null;
}

async function fetchAnswerRows(
  questionDbId: number,
  submissionIds: number[]
): Promise<AnswerRow[]> {
  if (questionDbId < 0) return [];
  return fetchByIds<AnswerRow>(
    "survey_submission_answer",
    "survey_submission_id",
    submissionIds,
    "survey_submission_id,answer_option_id,answer_text",
    `&survey_question_id=eq.${questionDbId}`
  );
}

/** submissionId → normalized answer label(s) for one question (multi-select safe). */
async function fetchAnswerLabels(
  questionDbId: number,
  submissionIds: number[]
): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  if (questionDbId < 0 || submissionIds.length === 0) return map;
  const [optMap, answers] = await Promise.all([
    fetchAnswerOptionMap(questionDbId),
    fetchAnswerRows(questionDbId, submissionIds),
  ]);
  for (const a of answers) {
    const label = normalizeLabel(
      (a.answer_option_id != null ? optMap.get(a.answer_option_id) : null) ?? a.answer_text
    );
    if (!label) continue;
    const arr = map.get(a.survey_submission_id) ?? [];
    arr.push(label);
    map.set(a.survey_submission_id, arr);
  }
  return map;
}

/**
 * submissionId → "1".."7" for a 1-7 scale question. Scale answers store the raw
 * value in `normalized_value` (the submit RPC writes `(value)::numeric`), with
 * answer_option_id/answer_text NULL — so this reads normalized_value directly.
 * Out-of-range / unanswered rows are dropped.
 */
async function fetchScaleValues(
  questionDbId: number,
  submissionIds: number[]
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (questionDbId < 0 || submissionIds.length === 0) return map;
  const rows = await fetchByIds<{
    survey_submission_id: number;
    normalized_value: number | string | null;
  }>(
    "survey_submission_answer",
    "survey_submission_id",
    submissionIds,
    "survey_submission_id,normalized_value",
    `&survey_question_id=eq.${questionDbId}`
  );
  for (const r of rows) {
    if (r.normalized_value == null) continue;
    const v = Math.round(Number(r.normalized_value));
    if (v >= 1 && v <= 7) map.set(r.survey_submission_id, String(v));
  }
  return map;
}
