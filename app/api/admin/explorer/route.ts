import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { supabaseFetch } from "@features/admin/server/supabase";
import { logAdminAction } from "@features/admin/server/audit";
import { evaluateTestSubmission } from "@features/admin/server/test-submission";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";
import {
  applyFilters,
  buildBreakdown,
  buildCrossTab,
  buildFacets,
  canonicalizeRelationship,
  computeStats,
  DIMENSION_KEYS,
  normalizeLabel,
  type ArchetypeVersion,
  type DimensionKey,
  type EnrichedRow,
  type ExplorerFilters,
  type PaidStatusFilter,
} from "@features/admin/server/explorer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hard ceiling on candidate submissions pulled into memory for a single
// request. Pre-launch volume is in the hundreds; this is the same order as
// core-kpis' Range cap and keeps the request bounded. If a run hits it we log
// a capacity warning (the lead's older data would silently fall off otherwise).
const MAX_CANDIDATES = 20_000;
// Batch size for `?col=in.(…)` secondary fetches — keeps each URL well under
// server limits as the audience grows (581 ids today, but this scales).
const IN_CHUNK = 500;
const AGE_QID = "15003";

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

function parseDimension(value: string | null, fallback: DimensionKey | null): DimensionKey | null {
  if (value && (DIMENSION_KEYS as string[]).includes(value)) return value as DimensionKey;
  return fallback;
}

function parseUtmSource(tracker: string | null): string {
  if (!tracker?.trim()) return "Direct";
  try {
    const parsed = JSON.parse(tracker) as { utm_source?: string };
    return parsed.utm_source?.trim() || "Direct";
  } catch {
    return "Direct";
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Fetch `select` from `table` where `col` is in `ids`, batched so the URL never
 * grows unbounded. `ids` are numbers (safe to join). `extraFilter` is a trusted
 * literal (e.g. `&status=eq.succeeded`) — never user input.
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

function csvEscape(value: unknown): string {
  let s = value == null ? "" : String(value);
  // Formula-injection guard incl. tab/CR leaders (some parsers execute those).
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  // Quote on CR too, so an embedded \r can't split the field into a new row
  // that starts with a formula leader.
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
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
  const groupBy = parseDimension(sp.get("groupBy"), "country")!;
  const groupBy2Raw = parseDimension(sp.get("groupBy2"), null);
  const groupBy2 = groupBy2Raw && groupBy2Raw !== groupBy ? groupBy2Raw : null;
  const accessorOpts = { archetypeVersion, includeTest };

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

    // Resolve the age question's DB id once (reused by the answer fetch + the
    // option-text lookup). -1 when not found → age simply reads as "Unknown".
    const ageQuestionId = await resolveAgeQuestionId();

    // ── 2. Related data (chunked in.() fetches) ─────────────────────────────
    const [scoring, users, reports, ageAnswers] = await Promise.all([
      fetchByIds<{
        survey_submission_id: number;
        primary_archetype: string | null;
        v5_primary_archetype: string | null;
      }>(
        "scoring_result",
        "survey_submission_id",
        submissionIds,
        "survey_submission_id,primary_archetype,v5_primary_archetype"
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
      ageQuestionId >= 0
        ? fetchByIds<{
            survey_submission_id: number;
            answer_option_id: number | null;
            answer_text: string | null;
          }>(
            "survey_submission_answer",
            "survey_submission_id",
            submissionIds,
            "survey_submission_id,answer_option_id,answer_text",
            `&survey_question_id=eq.${ageQuestionId}`
          )
        : Promise.resolve(
            [] as Array<{
              survey_submission_id: number;
              answer_option_id: number | null;
              answer_text: string | null;
            }>
          ),
    ]);

    const profileIds = users.map((u) => u.user_profile_id).filter((id): id is number => id != null);
    const reportIds = reports.map((r) => r.id);

    const [profiles, payments, quotes, ageOptions] = await Promise.all([
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
      fetchByIds<{ personal_report_id: number | null; plan: string | null }>(
        "report_price_quote",
        "personal_report_id",
        reportIds,
        "personal_report_id,plan",
        "&purchased_at=not.is.null"
      ),
      fetchAgeOptions(ageQuestionId),
    ]);

    // ── 3. Build lookup maps ────────────────────────────────────────────────
    const scoringBySub = new Map(scoring.map((s) => [s.survey_submission_id, s]));
    const userById = new Map(users.map((u) => [u.id, u]));
    const profileById = new Map(profiles.map((p) => [p.id, p]));
    // personal_report is logically 1:1 with a submission; keep the first and warn
    // if a duplicate ever appears (a dropped report id would zero its revenue).
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
    const planByReport = new Map<number, string>();
    for (const q of quotes) {
      if (q.personal_report_id == null || !q.plan) continue;
      if (!planByReport.has(q.personal_report_id)) planByReport.set(q.personal_report_id, q.plan);
    }

    // ── 4. Enrich ───────────────────────────────────────────────────────────
    const enriched: EnrichedRow[] = submissions.map((s) => {
      const user = userById.get(s.user_id);
      const profile = user?.user_profile_id ? profileById.get(user.user_profile_id) : undefined;
      const scoringRow = scoringBySub.get(s.id);
      const report = reportBySub.get(s.id);
      const reportId = report?.id;
      const paidAmount = reportId != null ? (paidByReport.get(reportId) ?? 0) : 0;
      const hasSucceeded = reportId != null && succeededReports.has(reportId);
      const plan = reportId != null ? (planByReport.get(reportId) ?? null) : null;
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
        ageGroup: ageBySub.get(s.id) ?? null,
        gender: normalizeLabel(profile?.gender),
        country: normalizeLabel(profile?.location_primary),
        orientation: normalizeLabel(profile?.sexual_orientation),
        relationship: canonicalizeRelationship(profile?.relationship_status),
        plan,
        paidAmount,
        hasSucceededPayment: hasSucceeded,
        trafficSource: parseUtmSource(s.utm_tracker),
        durationMs: s.duration_ms,
        createdAt: s.created_date_time,
      };
    });

    // ── 5. Aggregate ────────────────────────────────────────────────────────
    const facetBase = includeTest ? enriched : enriched.filter((r) => !r.isTest);
    const facets = buildFacets(facetBase, accessorOpts);
    const filtered = applyFilters(enriched, filters);
    const stats = computeStats(filtered, includeTest);
    const breakdown = buildBreakdown(filtered, groupBy, { ...accessorOpts, topN: 12 });
    const crossTab = groupBy2 ? buildCrossTab(filtered, groupBy, groupBy2, filters, 8) : null;

    // ── 6. CSV export (full filtered set) ───────────────────────────────────
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

    // ── 7. Paginated row list for the table ─────────────────────────────────
    const total = filtered.length;
    const start = (page - 1) * limit;
    const rows = filtered.slice(start, start + limit).map((r) => ({
      submissionId: r.submissionId,
      email: r.email,
      archetype: archetypeVersion === "v4" ? r.archetypeV4 : r.archetypeV5,
      ageGroup: r.ageGroup,
      gender: r.gender,
      country: r.country,
      relationship: r.relationship,
      plan: r.plan,
      paid: filters.includeTest ? r.hasSucceededPayment : r.paidAmount > 0,
      paidAmount: r.paidAmount,
      createdAt: r.createdAt,
    }));

    return NextResponse.json({
      range: { days, since },
      filtersEcho: { ...filters, status, groupBy, groupBy2 },
      stats,
      facets,
      breakdown,
      crossTab,
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

// ── Age question resolution (Q15003 → DB id → option_text map) ──────────────

// The age question's DB id never changes at runtime — memoize across requests
// so the explorer doesn't pay a sequential round-trip on every load. Only
// successful lookups are cached (so a transient failure can recover next time).
let cachedAgeQuestionId: number | null = null;

async function resolveAgeQuestionId(): Promise<number> {
  if (cachedAgeQuestionId != null) return cachedAgeQuestionId;
  const res = await supabaseFetch(
    `/rest/v1/survey_question?frontend_qid=eq.${AGE_QID}&select=id&limit=1`
  );
  if (!res.ok) return -1;
  const rows = (await res.json()) as Array<{ id: number }>;
  const id = rows[0]?.id ?? -1;
  if (id >= 0) cachedAgeQuestionId = id;
  return id;
}

async function fetchAgeOptions(qid: number): Promise<Map<number, string>> {
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
