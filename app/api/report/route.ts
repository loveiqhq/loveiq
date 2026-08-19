import { NextResponse } from "next/server";
import { z } from "zod";
import { scheduleAfterResponse } from "@shared/http/after-response";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { getBreaker, CircuitOpenError } from "@shared/http/circuit-breaker";
import { verifyCsrfToken } from "@shared/http/csrf";
import { isFeatureEnabled } from "@shared/flags/system-flags";
import {
  ensurePersonalReportForSubmission,
  getReportAccessPlanForSubmission,
  recordReportSessionView,
  resolveUnlockedArchetypeTiers,
  resolveUnlockedArchetypes,
} from "@features/report/server/personalReport";
import { getReportPriceQuotesForContext } from "@features/pricing/logic/reportPricing";
import {
  buildArchetypeContentForUser,
  buildPracticeTendenciesForUser,
  stripLockedEduBodyFromPayload,
} from "@features/report/server/contentGating";
import { getReport2Section, getReport2Config } from "@/data/report2";
import { getAttachmentPlaneForFamily } from "@/data/report2-attachment-planes";
import { getRewardProfile } from "@/data/report2-reward";
import { archetypeSlug as report2ArchetypeSlug } from "@/data/report2-config";
import { getRelationshipFit } from "@/data/report2-relationship-fit";
import { getPowerZone } from "@/data/report2-power-zones";
import { getLoveLanguageOrder } from "@/data/report2-love-languages";
import { getLibidoLoopSteps } from "@/data/report2-libido-loops";
import { getPartnershipLoop } from "@/data/report2-partnership-loops";
import { getFantasyMapDots } from "@features/report/server/fantasyMap";
import { isSectionUnlockedForPlan } from "@features/report/server/access";
import type { AttachmentPlane } from "@features/report/ui/sections/AttachmentPatternsSection";
import logger from "@shared/observability/logger";
import { notifySlack, escapeSlack } from "@shared/observability/slack";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";
import type { ReportPurchasePlanId } from "@features/checkout/server/reportPurchase";
import {
  REPORT_SHARE_TOKEN_REGEX,
  markShareViewed,
  resolveShareFromToken,
} from "@features/report/server/shareAccess";
import { maskEmail, verifyCookieForShare } from "@features/report/server/shareVerify";
import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";

const sessionIdSchema = z.object({
  pricingSessionId: z.string().uuid().optional(),
  sessionId: z.string().uuid(),
});

const tokenSchema = z.object({
  pricingSessionId: z.string().uuid().optional(),
  token: z.string().regex(/^(rpt_[a-zA-Z0-9]{20}|rpts_[A-Za-z0-9]{20})$/),
});

const RATE_LIMIT_CONFIG = {
  bucket: "report-view",
  limit: 10,
  windowMs: 60_000,
};

const SUPABASE_TIMEOUT_MS = 5_000;
const SNAPSHOT_QUESTION_QIDS = ["01002", "16013"] as const;

type SnapshotQuestionQid = (typeof SNAPSHOT_QUESTION_QIDS)[number];

interface SubmissionUser {
  first_name: string | null;
  email: string | null;
}

interface SubmissionRow {
  id: number;
  created_date_time: string;
  app_user: SubmissionUser | SubmissionUser[] | null;
  utm_tracker: string | null;
  user_id: number | null;
}

interface SnapshotAnswers {
  currentSexualSatisfaction: number | null;
  importanceOfSex: number | null;
}

type ReportPricingQuotesResponse = Record<ReportPurchasePlanId, ReportPriceQuoteSnapshot> | null;

function getSubmissionUserName(submission: SubmissionRow): string | null {
  if (Array.isArray(submission.app_user)) {
    return submission.app_user[0]?.first_name ?? null;
  }

  return submission.app_user?.first_name ?? null;
}

function getSubmissionUserEmail(submission: SubmissionRow): string | null {
  if (Array.isArray(submission.app_user)) {
    return submission.app_user[0]?.email ?? null;
  }

  return submission.app_user?.email ?? null;
}

function normalizeScaleAnswer(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 1 || rounded > 7) return null;
  return rounded;
}

// The attachment-plane config coords (e.g. Spiritual Lover home=[150,372]) live
// in a ~0..520 design space over the Figma map box (8427:1488). Dividing by 520
// lands the dots at the exact fractions the Figma renders them (home ≈ 28.8%/
// 71.4%, strain ≈ 34.6%/34.2%), verified against node 8427:1488. Returns null
// for the 13 archetypes whose `attachment_plane` is null or malformed — coords
// are NEVER fabricated (per DECISIONS-2026-07-30).
const ATTACHMENT_PLANE_SPACE = 520;
const ATTACHMENT_CORNERS = new Set(["ANXIOUS", "FEARFUL", "SECURE", "AVOIDANT"]);

function normalizeAttachmentPlane(raw: unknown): AttachmentPlane | null {
  if (!raw || typeof raw !== "object") return null;
  const plane = raw as Record<string, unknown>;
  const toPoint = (v: unknown): { x: number; y: number } | null => {
    if (!Array.isArray(v) || v.length < 2) return null;
    const [x, y] = v;
    if (typeof x !== "number" || typeof y !== "number") return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x: x / ATTACHMENT_PLANE_SPACE, y: y / ATTACHMENT_PLANE_SPACE };
  };

  const home = toPoint(plane.home);
  if (!home) return null; // no home dot ⇒ nothing meaningful to draw.

  const accent = typeof plane.accent_corner === "string" ? plane.accent_corner : "";
  return {
    home,
    strain: toPoint(plane.strain),
    homeLabel: typeof plane.home_label === "string" ? plane.home_label : "",
    strainLabel: typeof plane.strain_label === "string" ? plane.strain_label : "",
    accentCorner: (ATTACHMENT_CORNERS.has(accent)
      ? accent
      : "SECURE") as AttachmentPlane["accentCorner"],
  };
}

// Reward-meter config → the client shape. `reward_order` is the four
// neurochemicals in the reader's rank order; `reward_roles` the role per rank;
// `reward_meters` the fill % per rank. Returns null (⇒ no bars) when there is no
// real `order`, so meters/rankings are NEVER fabricated for the 11 archetypes
// without config (only Spiritual Lover has full meters today; Spark Seeker /
// Sensual Connector carry order but null meters). Called only when unlocked.
function normalizeRewardConfig(cfg: Record<string, unknown> | null | undefined): {
  order: string[];
  roles: string[];
  meters: number[];
} | null {
  if (!cfg) return null;
  const order = Array.isArray(cfg.reward_order)
    ? cfg.reward_order.filter((v): v is string => typeof v === "string")
    : [];
  if (order.length === 0) return null;
  const roles = Array.isArray(cfg.reward_roles)
    ? cfg.reward_roles.filter((v): v is string => typeof v === "string")
    : [];
  const meters = Array.isArray(cfg.reward_meters)
    ? cfg.reward_meters.filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    : [];
  return { order, roles, meters };
}

// Energy config → the client shape. `families.energy` (wave/spike/steady/
// conditional) selects the highlighted curve; `energy_scale_graph.highlighted_curve`
// is the specific curve id (kept for parity). `energy_readouts` = { energy, risk,
// endurance } small integer levels drive the readout meters — returned only when
// all three are finite integers, so meters are NEVER fabricated for the 13
// archetypes whose `energy_readouts` is null (only Spiritual Lover has them
// today). Called only when unlocked; the curve family always resolves (falls back
// to "wave", the Figma default) so the graph framing renders for every archetype.
function normalizeEnergyConfig(cfg: Record<string, unknown> | null | undefined): {
  curveFamily: string;
  curveId: string | null;
  readouts: { energy: number; risk: number; endurance: number } | null;
} | null {
  if (!cfg) return null;
  const families = (cfg.families as Record<string, unknown> | undefined) ?? undefined;
  const curveFamily = typeof families?.energy === "string" ? families.energy : "wave";
  const scaleGraph = (cfg.energy_scale_graph as Record<string, unknown> | null | undefined) ?? null;
  const curveId =
    scaleGraph && typeof scaleGraph.highlighted_curve === "string"
      ? scaleGraph.highlighted_curve
      : null;
  const ro = (cfg.energy_readouts as Record<string, unknown> | null | undefined) ?? null;
  const level = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const energy = level(ro?.energy);
  const risk = level(ro?.risk);
  const endurance = level(ro?.endurance);
  const readouts =
    energy != null && risk != null && endurance != null ? { energy, risk, endurance } : null;
  return { curveFamily, curveId, readouts };
}

// Arousal config → the client shape. `families.arousal` (responsive/spontaneous/
// contextual) selects the arc shape; `arousal_acts` is the 3-part phase-label
// array (e.g. ["The build","The dip","The return"]). The family always resolves
// (falls back to "responsive", the Figma default) so the arc always renders;
// `acts` is null when the archetype has no `arousal_acts` (⇒ the component uses
// the family's default Figma labels — never fabricated). Called only when
// unlocked.
function normalizeArousalConfig(cfg: Record<string, unknown> | null | undefined): {
  family: string;
  acts: string[] | null;
} | null {
  if (!cfg) return null;
  const families = (cfg.families as Record<string, unknown> | undefined) ?? undefined;
  const family = typeof families?.arousal === "string" ? families.arousal : "responsive";
  const rawActs = Array.isArray(cfg.arousal_acts)
    ? cfg.arousal_acts.filter((v): v is string => typeof v === "string")
    : [];
  const acts = rawActs.length === 3 ? rawActs : null;
  return { family, acts };
}

// Initiation timeline-chart config → the client shape. `families.initiation`
// (lost-in-translation/heard-too-loudly) selects the two-column mismatch shape
// + labels; `initiation_variant` (e.g. "presence-led") is a per-archetype
// accent. The family always resolves (falls back to "lost-in-translation", the
// Figma default) so the chart always renders. Called only when unlocked.
function normalizeInitiationConfig(cfg: Record<string, unknown> | null | undefined): {
  family: string;
  variant: string | null;
} | null {
  if (!cfg) return null;
  const families = (cfg.families as Record<string, unknown> | undefined) ?? undefined;
  const family =
    typeof families?.initiation === "string" ? families.initiation : "lost-in-translation";
  const variant = typeof cfg.initiation_variant === "string" ? cfg.initiation_variant : null;
  return { family, variant };
}

export async function GET(request: Request) {
  // 1. Parse params first to decide auth strategy
  const url = new URL(request.url);
  const rawToken = url.searchParams.get("token");
  const rawSessionId = url.searchParams.get("sessionId");
  const isTokenAccess = !!rawToken;

  // 2. CSRF verification — skip for token-based access (email links won't have CSRF cookie)
  if (!isTokenAccess && !(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  // 3. Rate limiting
  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent");
  const rateLimit = await checkRateLimit(ip, RATE_LIMIT_CONFIG);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000)),
        },
      }
    );
  }

  const rawPricingSessionId = url.searchParams.get("pricingSessionId") ?? undefined;
  const tokenParsed = rawToken
    ? tokenSchema.safeParse({ pricingSessionId: rawPricingSessionId, token: rawToken })
    : null;
  const sessionParsed = rawSessionId
    ? sessionIdSchema.safeParse({
        pricingSessionId: rawPricingSessionId,
        sessionId: rawSessionId,
      })
    : null;

  if (!tokenParsed?.success && !sessionParsed?.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // 4. Supabase config
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  try {
    // 5. Look up survey_submission — by token or session_id
    let submissionQuery: string;

    let isShareAccess = false;
    let shareId: number | null = null;
    // Captured for the first-view Slack ping below — the share row + owner
    // email are loaded inside the share-token branch but the ping fires
    // later, outside that scope.
    let shareIsFirstView = false;
    let shareRecipientEmailForPing: string | null = null;
    let shareOwnerEmailForPing: string | null = null;

    if (tokenParsed?.success) {
      const token = tokenParsed.data.token;
      let submissionId: number | null = null;

      if (REPORT_SHARE_TOKEN_REGEX.test(token)) {
        // Shared viewer — resolve via report_share, reject if revoked.
        const shareContext = await resolveShareFromToken(token);
        if (!shareContext) {
          return NextResponse.json({ error: "Report not found." }, { status: 404 });
        }
        // Email-verification gate: recipient must have proven their identity
        // (POST /api/report/share/verify) and received the HMAC cookie.
        if (
          !verifyCookieForShare(request, shareContext.share.id, shareContext.share.recipient_email)
        ) {
          return NextResponse.json(
            {
              needsVerification: true,
              recipientEmailHint: maskEmail(shareContext.share.recipient_email),
              ownerFirstName: shareContext.ownerFirstName,
            },
            { status: 401 }
          );
        }
        isShareAccess = true;
        shareId = shareContext.share.id;
        submissionId = shareContext.submissionId;
        shareIsFirstView = shareContext.share.last_viewed_at === null;
        shareRecipientEmailForPing = shareContext.share.recipient_email;
        shareOwnerEmailForPing = shareContext.ownerEmail;
      } else {
        // Owner — look up report_access_token → submission_id.
        const tokenRes = await getBreaker("supabase").fire(() =>
          fetchWithTimeout(
            // revoked_at=is.null lets ops invalidate a leaked token without
            // dropping the row. expires_at filter (F-17) honors optional
            // per-token expiry when set; NULL means permanent (the default).
            // Backed by idx_report_access_token_active.
            `${supabaseUrl}/rest/v1/report_access_token?token=eq.${encodeURIComponent(token)}&revoked_at=is.null&or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(new Date().toISOString())})&select=survey_submission_id&limit=1`,
            { headers, cache: "no-store", timeoutMs: SUPABASE_TIMEOUT_MS }
          )
        );

        if (!tokenRes.ok) {
          logger.error({ status: tokenRes.status }, "Token lookup failed");
          return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
        }

        const tokenRows = (await tokenRes.json()) as Array<{ survey_submission_id: number }>;
        if (!Array.isArray(tokenRows) || tokenRows.length === 0) {
          return NextResponse.json({ error: "Report not found." }, { status: 404 });
        }
        // tokenRows.length checked > 0 above, so [0] is non-undefined.
        submissionId = tokenRows[0]!.survey_submission_id;
      }

      if (!submissionId) {
        return NextResponse.json({ error: "Report not found." }, { status: 404 });
      }

      submissionQuery = `${supabaseUrl}/rest/v1/survey_submission?id=eq.${submissionId}&select=id,user_id,utm_tracker,created_date_time,app_user!fk_survey_submission_user(first_name,email)&limit=1`;
    } else {
      const sid = (sessionParsed as { success: true; data: { sessionId: string } }).data.sessionId;
      submissionQuery = `${supabaseUrl}/rest/v1/survey_submission?session_id=eq.${encodeURIComponent(sid)}&select=id,user_id,utm_tracker,created_date_time,app_user!fk_survey_submission_user(first_name,email)&limit=1`;
    }

    const submissionRes = await getBreaker("supabase").fire(() =>
      fetchWithTimeout(submissionQuery, {
        headers,
        cache: "no-store",
        timeoutMs: SUPABASE_TIMEOUT_MS,
      })
    );

    if (!submissionRes.ok) {
      logger.error({ status: submissionRes.status }, "Supabase survey_submission lookup failed");
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }

    const submissions = (await submissionRes.json()) as SubmissionRow[];

    if (!Array.isArray(submissions) || submissions.length === 0) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }

    // submissions.length checked > 0 above; [0] is non-undefined.
    const submission = submissions[0]!;

    // 6. Look up scoring_result by survey_submission_id
    const snapshotAnswerQids = SNAPSHOT_QUESTION_QIDS.join(",");
    const snapshotAnswersSelect = ["normalized_value", "survey_question!inner(frontend_qid)"].join(
      ","
    );
    const snapshotAnswersQuery =
      `${supabaseUrl}/rest/v1/survey_submission_answer` +
      `?survey_submission_id=eq.${submission.id}` +
      `&select=${snapshotAnswersSelect}` +
      `&survey_question.frontend_qid=in.(${snapshotAnswerQids})`;

    const [scoringRes, snapshotAnswersRes] = await Promise.all([
      getBreaker("supabase").fire(() =>
        fetchWithTimeout(
          `${supabaseUrl}/rest/v1/scoring_result?survey_submission_id=eq.${submission.id}&select=primary_archetype,v5_primary_archetype,percentages,v5_percentages,diagnostics&limit=1`,
          {
            headers,
            cache: "no-store",
            timeoutMs: SUPABASE_TIMEOUT_MS,
          }
        )
      ),
      getBreaker("supabase")
        .fire(() =>
          fetchWithTimeout(snapshotAnswersQuery, {
            headers,
            cache: "no-store",
            timeoutMs: SUPABASE_TIMEOUT_MS,
          })
        )
        .catch((err) => {
          logger.warn({ err, submissionId: submission.id }, "Snapshot answers lookup failed");
          return null;
        }),
    ]);

    if (!scoringRes.ok) {
      logger.error({ status: scoringRes.status }, "Supabase scoring_result lookup failed");
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }

    const scoringRows = (await scoringRes.json()) as Array<{
      primary_archetype: string;
      v5_primary_archetype: string | null;
      percentages: Record<string, number> | null;
      v5_percentages: Record<string, number> | null;
      diagnostics: Record<string, unknown> | null;
    }>;

    if (!Array.isArray(scoringRows) || scoringRows.length === 0) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }

    // scoringRows.length checked > 0 above; [0] is non-undefined.
    const scoring = scoringRows[0]!;
    let snapshotAnswers: SnapshotAnswers = {
      currentSexualSatisfaction: null,
      importanceOfSex: null,
    };

    if (snapshotAnswersRes?.ok) {
      const snapshotAnswerRows = (await snapshotAnswersRes.json()) as Array<{
        normalized_value: number | null;
        survey_question: { frontend_qid: string } | null;
      }>;
      snapshotAnswers = snapshotAnswerRows.reduce<SnapshotAnswers>(
        (acc, row) => {
          const normalized = normalizeScaleAnswer(row.normalized_value);
          const qid = row.survey_question?.frontend_qid as SnapshotQuestionQid | undefined;

          if (qid === "01002") {
            acc.currentSexualSatisfaction = normalized;
          } else if (qid === "16013") {
            acc.importanceOfSex = normalized;
          }

          return acc;
        },
        {
          currentSexualSatisfaction: null,
          importanceOfSex: null,
        }
      );
    } else if (snapshotAnswersRes) {
      logger.warn(
        { status: snapshotAnswersRes.status, submissionId: submission.id },
        "Snapshot answers lookup returned a non-OK response"
      );
    }

    let accessPlan: "essentials" | "full_report" | "core" | "all_reports" | null = null;
    let pricingQuotes: ReportPricingQuotesResponse = null;
    let unlockedArchetypeColumn: string[] = [];
    let archetypeTiersFromDb: Record<string, "essentials" | "full_report"> = {};

    try {
      await ensurePersonalReportForSubmission({
        reportToken: tokenParsed?.success ? tokenParsed.data.token : null,
        submissionId: submission.id,
      });

      const access = await getReportAccessPlanForSubmission(submission.id);
      accessPlan = access.accessPlan;
      unlockedArchetypeColumn = access.unlockedArchetypeColumn ?? [];
      archetypeTiersFromDb = access.archetypeTiers ?? {};

      if (access.personalReportId && !accessPlan) {
        await recordReportSessionView({
          ipAddress: ip,
          personalReportId: access.personalReportId,
          userAgent,
          userId: submission.user_id,
          utmTracker: submission.utm_tracker,
        });
      } else if (access.personalReportId) {
        scheduleAfterResponse("report-session-capture", async () => {
          await recordReportSessionView({
            ipAddress: ip,
            personalReportId: access.personalReportId!,
            userAgent,
            userId: submission.user_id,
            utmTracker: submission.utm_tracker,
          });
        });
      }
    } catch (err) {
      logger.warn({ err, submissionId: submission.id }, "Unable to sync report access state");
    }

    // F-12: emergency paywall kill switch. When an admin sets the
    // `report_paywall_enforced` system flag to false (e.g. a Stripe outage, or
    // a decision to comp everyone), every owner report renders as if fully
    // purchased. Overriding the effective accessPlan here is the single
    // chokepoint that flows to BOTH server content-gating and the client (which
    // recomputes lock state from the accessPlan it receives) — no UI change.
    // Fail-secure: isFeatureEnabled defaults to ENFORCED when the flag row is
    // absent or Supabase is unreachable, so an infra blip can never give the
    // product away. Share-link viewers keep their curated gift view; the switch
    // only lifts the owner's paywall.
    if (!isShareAccess && !(await isFeatureEnabled("report_paywall_enforced", true))) {
      accessPlan = "all_reports";
    }

    // Fetch quotes for any user who can still upgrade (no plan, or essentials/
    // full_report — they may want a higher tier). Skip only `all_reports`
    // (top tier; nothing left to sell) and shared viewers.
    if (accessPlan !== "all_reports" && !isShareAccess) {
      try {
        pricingQuotes = await getReportPriceQuotesForContext({
          pricingSessionId: tokenParsed?.success
            ? (tokenParsed.data.pricingSessionId ?? null)
            : sessionParsed?.success
              ? (sessionParsed.data.pricingSessionId ?? null)
              : null,
          reportSessionId: sessionParsed?.success ? sessionParsed.data.sessionId : null,
          reportToken: tokenParsed?.success ? tokenParsed.data.token : null,
          submissionId: submission.id,
          userAgent,
        });
      } catch (err) {
        logger.warn({ err, submissionId: submission.id }, "Unable to resolve report pricing");
      }
    }

    // 7. Build response — prefer v5 fields, fall back to v4
    const primaryArchetype = scoring.v5_primary_archetype || scoring.primary_archetype;
    const unlockedArchetypes = resolveUnlockedArchetypes({
      accessPlan,
      archetypeTiers: archetypeTiersFromDb,
      columnValues: unlockedArchetypeColumn,
      primaryArchetype,
    });
    const archetypeTiers = resolveUnlockedArchetypeTiers({
      accessPlan,
      archetypeTiers: archetypeTiersFromDb,
      columnValues: unlockedArchetypeColumn,
      primaryArchetype,
    });

    if (isShareAccess && shareId !== null) {
      const viewedShareId = shareId;
      const wasFirstView = shareIsFirstView;
      const recipientEmailForPing = shareRecipientEmailForPing;
      const ownerEmailForPing = shareOwnerEmailForPing;
      scheduleAfterResponse("report-share-view", async () => {
        await markShareViewed(viewedShareId);
        if (wasFirstView) {
          const ownerLabel = ownerEmailForPing ? maskEmail(ownerEmailForPing) : "owner";
          const recipientLabel = recipientEmailForPing
            ? maskEmail(recipientEmailForPing)
            : "recipient";
          await notifySlack({
            channel: "ops",
            kind: "share_first_view",
            text: `:eyes: Shared report opened — ${escapeSlack(ownerLabel)} → ${escapeSlack(recipientLabel)} (share #${viewedShareId})`,
            username: "ops_alerts",
          });
        }
      });
    }

    // Owner token lookup — needed so the share modal can authenticate POST
    // /api/report/share. Session-based views (`/report?dev_session=...` or
    // sessionId cookie flow) otherwise have no `rpt_` handle. Skip for shared
    // viewers; they must not see the owner's token.
    let ownerToken: string | null = null;
    if (!isShareAccess) {
      if (tokenParsed?.success) {
        ownerToken = tokenParsed.data.token;
      } else {
        try {
          const ownerTokenRes = await getBreaker("supabase").fire(() =>
            fetchWithTimeout(
              `${supabaseUrl}/rest/v1/report_access_token?survey_submission_id=eq.${submission.id}&select=token&order=created_at.desc&limit=1`,
              { headers, cache: "no-store", timeoutMs: SUPABASE_TIMEOUT_MS }
            )
          );
          if (ownerTokenRes.ok) {
            const rows = (await ownerTokenRes.json()) as Array<{ token: string | null }>;
            ownerToken = rows[0]?.token ?? null;
          }
        } catch (err) {
          logger.warn({ err, submissionId: submission.id }, "owner-token lookup failed");
        }
      }
    }

    // Report 2.0 Snapshot section copy — resolved server-side (the 634KB copy
    // module is server-only) and passed to the client SnapshotSection. Only the
    // slots that section renders are threaded, keyed to the viewer's primary
    // archetype. Empty object for archetypes without a snapshot copy block.
    const snapshotSection = getReport2Section(primaryArchetype, "snapshot");
    // Card 1's stat lives in the initiation section (see the note below). Resolved
    // here rather than reusing `initiationSection`, which is declared further down.
    const snapshotInitiation = getReport2Section(primaryArchetype, "initiation");
    const snapshotCopy = {
      "compare1.stat": snapshotSection["compare1.stat"] ?? null,
      "compare1.caption": snapshotSection["compare1.caption"] ?? null,
      "compare2.stat": snapshotSection["compare2.stat"] ?? null,
      "compare2.caption": snapshotSection["compare2.caption"] ?? null,
      "compare3.stat": snapshotSection["compare3.stat"] ?? null,
      "compare3.caption": snapshotSection["compare3.caption"] ?? null,
      "stage.subline": snapshotSection["stage.subline"] ?? null,
      // Snapshot card 1. Figma (8719:8875) mocked this as "Your Hidden Edge" with
      // the value `1 in 3`, but STATS-AUDIT.md records that number as a retracted
      // `arousal.stat1` matrix value ("Used real. Wrong before." → 52%), and no
      // per-archetype hidden-edge copy exists in the matrix at all. `initiation
      // .stat1` IS audited ("RESOLVED — reframed to ROLE", share choosing "I make
      // the first move"), present for all 14, distinct per archetype, and its
      // caption names the archetype the way Figma's teaser did — so the card is
      // driven by the real share instead of shipping the retracted stat.
      "openingMove.stat": snapshotInitiation["stat1"] ?? null,
      "openingMove.caption": snapshotInitiation["stat1.caption"] ?? null,
    };

    // Report 2.0 Findings section copy — findings 1-3 are always the real
    // head/body; findings 4-5 are gated. A user WITHOUT a paid plan
    // (accessPlan === null) receives ONLY the universal `.locked.` teaser text
    // for f4-5 — the real f4-5 head/body is never shipped to a locked client.
    // (Three free findings since 2026-08-19, Eman's call; it was two.)
    // Any purchase (essentials/full_report/all_reports/core, or the paywall
    // kill-switch's all_reports) unlocks the real findings. Shared viewers
    // inherit the owner's plan here, matching the report's gift-view gating.
    const findingsSection = getReport2Section(primaryArchetype, "findings");
    const findingsUnlocked = accessPlan !== null;
    const findingsCopy = {
      "f1.head": findingsSection["f1.head"] ?? null,
      "f1.body": findingsSection["f1.body"] ?? null,
      "f2.head": findingsSection["f2.head"] ?? null,
      "f2.body": findingsSection["f2.body"] ?? null,
      "f3.head": findingsSection["f3.head"] ?? null,
      "f3.body": findingsSection["f3.body"] ?? null,
      "f4.head": findingsUnlocked
        ? (findingsSection["f4.head"] ?? null)
        : (findingsSection["f4.locked.head"] ?? null),
      "f4.body": findingsUnlocked
        ? (findingsSection["f4.body"] ?? null)
        : (findingsSection["f4.locked.body"] ?? null),
      "f5.head": findingsUnlocked
        ? (findingsSection["f5.head"] ?? null)
        : (findingsSection["f5.locked.head"] ?? null),
      "f5.body": findingsUnlocked
        ? (findingsSection["f5.body"] ?? null)
        : (findingsSection["f5.locked.body"] ?? null),
      "upsell.line": findingsSection["upsell.line"] ?? null,
      locked: !findingsUnlocked,
    };

    // NOTE: `gate.hook` used to ship with every one of these blocks and render as
    // a small uppercase line above the paywall card ("Your confidence anchors in
    // one place. Knowing where changes what actually builds it."). The design has
    // no such line — not in the section frames (8427:1656) and not on the paywall
    // card (8988:16141, which carries no copy above its button) — so it is neither
    // sent nor drawn any more. The copy still exists in data/report2-copy.ts if a
    // future design wants it back.
    // Report 2.0 Beliefs ("Typical Beliefs") section copy — a Part II,
    // essentials-tier PREMIUM section. The educational slots (`edu.*`,
    // `learn.*`) are universal and always shipped. The per-archetype
    // payload (`body.p1`, `keep.*`, `loosen.N.{belief,shift}`) is the gated
    // content: shipped ONLY when the report is unlocked at the essentials tier
    // (or above) — a locked client (`accessPlan === null`, or a tier that
    // doesn't cover essentials) NEVER receives the per-archetype belief text.
    // Shared viewers inherit the owner's plan via `accessPlan`, matching the
    // rest of the report's gift-view gating. Keyed to the primary archetype
    // (same handoff as snapshot/findings/stage).
    const beliefsSection = getReport2Section(primaryArchetype, "beliefs");
    const beliefsUnlocked = isSectionUnlockedForPlan({
      accessPlan,
      isPremium: true,
      sectionId: "typical_beliefs",
    });
    /**
     * A locked client receives only the FIRST FEW rows.
     *
     * Shipping the whole list and fading it made the entire chapter legible — the
     * fade is gentle enough that all nine keeps and ten loosens could be read, so
     * there was nothing left to buy. SIX per column is the tease (Eman,
     * 2026-08-19; it was three): at three the two columns barely cleared the
     * paywall card and the chapter looked as though it held almost nothing, which
     * is the opposite of what a locked chapter should say. Six rows show the
     * volume; how much of it is READABLE is set by the mask, which fades on
     * percentages of each column's own height, so the readable band stays the
     * first two rows regardless of how many are shipped.
     *
     * This is the real boundary: strip the mask in devtools and there is simply
     * nothing past row six in the DOM — the remaining three keeps and four loosens
     * never leave the server. `body.p1`, the per-archetype closing paragraph, stays
     * withheld as well.
     */
    const BELIEFS_TEASER_ROWS = 6;
    const beliefsKeep: (string | null)[] = Array.from(
      { length: beliefsUnlocked ? 9 : BELIEFS_TEASER_ROWS },
      (_, i) => beliefsSection[`keep.${i + 1}`] ?? null
    );
    const beliefsLoosen = Array.from(
      { length: beliefsUnlocked ? 10 : BELIEFS_TEASER_ROWS },
      (_, i) => ({
        belief: beliefsSection[`loosen.${i + 1}.belief`] ?? null,
        shift: beliefsSection[`loosen.${i + 1}.shift`] ?? null,
      })
    );

    const beliefsCopy = {
      "edu.eyebrow": beliefsSection["edu.eyebrow"] ?? null,
      "edu.teaser": beliefsSection["edu.teaser"] ?? null,
      "edu.body.p1": beliefsSection["edu.body.p1"] ?? null,
      "edu.body.p2": beliefsSection["edu.body.p2"] ?? null,
      "edu.body.p3": beliefsSection["edu.body.p3"] ?? null,
      // Per-archetype — withheld from locked clients.
      "body.p1": beliefsUnlocked ? (beliefsSection["body.p1"] ?? null) : null,
      keep: beliefsKeep,
      loosen: beliefsLoosen,
      "learn.eyebrow": beliefsSection["learn.eyebrow"] ?? null,
      "learn.body": beliefsSection["learn.body"] ?? null,
      locked: !beliefsUnlocked,
    };

    // Report 2.0 Attachment Style section copy — a Part II, essentials-tier
    // PREMIUM section (section 8). The universal slots (`eyebrow`,
    // `edu.*`, `learn.*`) are always shipped. The per-archetype payload — the
    // result word, the three row VALUES, the insight value, the map caption
    // (`body.p1`), and the attachment-plane coordinates — is the gated content:
    // shipped ONLY when the report is unlocked at the essentials tier (or
    // above). A locked client NEVER receives it. Shared viewers inherit the
    // owner's plan via `accessPlan`. Keyed to the primary archetype. The row2/
    // row3 LABELS are family-specific and resolved client-side from
    // `attachmentFamily` (below), not from copy. `attachmentPlane` carries the
    // config geometry normalized to the map's 0..1 axis box; null for the 13
    // archetypes without real coords (never fabricated).
    const attachmentSection = getReport2Section(primaryArchetype, "attachment");
    const attachmentUnlocked = isSectionUnlockedForPlan({
      accessPlan,
      isPremium: true,
      sectionId: "attachment_style",
    });
    const attachmentConfig = getReport2Config(primaryArchetype);
    const attachmentFamily = attachmentConfig?.families?.attachment ?? null;
    // Geometry is keyed by attachment FAMILY, per Mark's handoff ("chart geometry
    // ... lives in the Figma components, not the copy. Only the ... dot-position
    // slot changes per archetype, from the `families` value") and the designer's
    // three scales (Figma 9108:549 / 9107:549 / 9107:571), which together cover
    // 7 + 6 + 1 = all 14 archetypes. `attachment_plane` is only ever set on
    // spiritual-lover, so without the family fallback 13 of 14 drew an empty map.
    // Per-archetype config still wins where present.
    const attachmentPlane = attachmentUnlocked
      ? normalizeAttachmentPlane(
          attachmentConfig?.attachment_plane ?? getAttachmentPlaneForFamily(attachmentFamily)
        )
      : null;
    const attachmentCopy = {
      eyebrow: attachmentSection.eyebrow ?? null,
      "edu.eyebrow": attachmentSection["edu.eyebrow"] ?? null,
      "edu.teaser": attachmentSection["edu.teaser"] ?? null,
      "edu.body.p1": attachmentSection["edu.body.p1"] ?? null,
      "edu.body.p2": attachmentSection["edu.body.p2"] ?? null,
      "edu.body.p3": attachmentSection["edu.body.p3"] ?? null,
      "edu.body.p4": attachmentSection["edu.body.p4"] ?? null,
      "edu.body.p5": attachmentSection["edu.body.p5"] ?? null,
      "edu.body.p6": attachmentSection["edu.body.p6"] ?? null,
      "edu.body.p7": attachmentSection["edu.body.p7"] ?? null,
      "learn.eyebrow": attachmentSection["learn.eyebrow"] ?? null,
      "learn.body": attachmentSection["learn.body"] ?? null,
      // Per-archetype — withheld from locked clients.
      result: attachmentUnlocked ? (attachmentSection.result ?? null) : null,
      "row1.label": attachmentSection["row1.label"] ?? null,
      "row1.value": attachmentUnlocked ? (attachmentSection["row1.value"] ?? null) : null,
      "row2.value": attachmentUnlocked ? (attachmentSection["row2.value"] ?? null) : null,
      "row3.value": attachmentUnlocked ? (attachmentSection["row3.value"] ?? null) : null,
      "insight.label": attachmentSection["insight.label"] ?? null,
      "insight.value": attachmentUnlocked ? (attachmentSection["insight.value"] ?? null) : null,
      "body.p1": attachmentUnlocked ? (attachmentSection["body.p1"] ?? null) : null,
      locked: !attachmentUnlocked,
    };

    // Report 2.0 Accelerators & Brakes section copy — a Part II, essentials-tier
    // PREMIUM section. The educational slots (`edu.*`, `learn.*`)
    // are universal and always shipped. `takeaway` is the ONLY per-archetype
    // slot (a single verdict sentence whose polarity flips per archetype) — the
    // gated content: shipped ONLY when the report is unlocked at the essentials
    // tier (or above). A locked client NEVER receives it. Shared viewers inherit
    // the owner's plan via `accessPlan`. Keyed to the primary archetype.
    const accelSection = getReport2Section(primaryArchetype, "accel");
    const accelUnlocked = isSectionUnlockedForPlan({
      accessPlan,
      isPremium: true,
      sectionId: "typical_arousal_accelerators_turn_ons_of_the_core_archetype",
    });
    const accelCopy = {
      "edu.eyebrow": accelSection["edu.eyebrow"] ?? null,
      "edu.teaser": accelSection["edu.teaser"] ?? null,
      "edu.body.p1": accelSection["edu.body.p1"] ?? null,
      "edu.body.p2": accelSection["edu.body.p2"] ?? null,
      "edu.body.p3": accelSection["edu.body.p3"] ?? null,
      // Per-archetype — withheld from locked clients.
      takeaway: accelUnlocked ? (accelSection.takeaway ?? null) : null,
      "learn.eyebrow": accelSection["learn.eyebrow"] ?? null,
      "learn.body": accelSection["learn.body"] ?? null,
      locked: !accelUnlocked,
    };

    // Report 2.0 Core Insecurities section copy — a Part II, essentials-tier
    // PREMIUM section (section 9). The universal slots (`practical.label`,
    // `learn.*`) are always shipped. The per-archetype
    // payload — `takeaway`, the practical teaser + three practical lines, and
    // the `body.p1` sensitivity paragraph — is the gated content: shipped ONLY
    // when the report is unlocked at the essentials tier (or above). A locked
    // client NEVER receives it (nor the highlighted-curve/axis specifics; the
    // cue family + graph config below are only sent when unlocked). Shared
    // viewers inherit the owner's plan via `accessPlan`. Keyed to the primary
    // archetype. The cue family drives the graph's highlighted curve + axis
    // labels client-side (config `insecurity_graph` wins when present — only
    // Spiritual Lover has a full one today; the rest derive from the family).
    const insecuritiesSection = getReport2Section(primaryArchetype, "insecurities");
    const insecuritiesUnlocked = isSectionUnlockedForPlan({
      accessPlan,
      isPremium: true,
      sectionId: "core_insecurities",
    });
    const insecuritiesConfig = getReport2Config(primaryArchetype);
    const insecurityCueFamily = insecuritiesUnlocked
      ? (insecuritiesConfig?.families?.insecurity_cue ?? null)
      : null;
    const insecurityGraph = insecuritiesUnlocked
      ? ((insecuritiesConfig?.insecurity_graph as {
          highlighted_curve?: string | null;
          y_axis?: string | null;
          x_axis?: string | null;
        } | null) ?? null)
      : null;
    const insecuritiesCopy = {
      "practical.label": insecuritiesSection["practical.label"] ?? null,
      "learn.eyebrow": insecuritiesSection["learn.eyebrow"] ?? null,
      "learn.body": insecuritiesSection["learn.body"] ?? null,
      // Per-archetype — withheld from locked clients.
      takeaway: insecuritiesUnlocked ? (insecuritiesSection.takeaway ?? null) : null,
      "practical.teaser": insecuritiesUnlocked
        ? (insecuritiesSection["practical.teaser"] ?? null)
        : null,
      "practical.line1": insecuritiesUnlocked
        ? (insecuritiesSection["practical.line1"] ?? null)
        : null,
      "practical.line2": insecuritiesUnlocked
        ? (insecuritiesSection["practical.line2"] ?? null)
        : null,
      "practical.line3": insecuritiesUnlocked
        ? (insecuritiesSection["practical.line3"] ?? null)
        : null,
      "body.p1": insecuritiesUnlocked ? (insecuritiesSection["body.p1"] ?? null) : null,
      locked: !insecuritiesUnlocked,
    };

    // Report 2.0 Reward System ("Biochemical Reward System Dynamics") section
    // copy — a Part III, FULL_REPORT-tier PREMIUM section (section 12; NOT in
    // ESSENTIALS_SECTION_IDS, so it unlocks only at the full_report tier). The
    // educational slots (`edu.*`, `learn.*`) are universal and
    // always shipped, as are `stat1`/`stat1.caption` (universal-safe education).
    // The per-archetype payload — `takeaway` (verdict) and the reward config
    // (chemical order / roles / meter fills) — is the gated content: shipped
    // ONLY when the report is unlocked at the full_report tier. A locked client
    // (`rewardCopy.locked`) NEVER receives it and renders the hook teaser +
    // PremiumOverlay. Only Spiritual Lover carries full meters today; the other
    // archetypes fall back to no bars rather than fabricating. Shared viewers
    // inherit the owner's plan via `accessPlan`. Keyed to the primary archetype.
    const rewardSection = getReport2Section(primaryArchetype, "reward");
    const rewardUnlocked = isSectionUnlockedForPlan({
      accessPlan,
      isPremium: true,
      sectionId: "biochemical_reward_system_dynamics",
    });
    // `reward_order` is set for 3 of 14 archetypes, `reward_roles` for 2 and
    // `reward_meters` for 1, so this returned null and the section drew no rows at
    // all for 11 of 14. The per-archetype fallback in `data/report2-reward.ts` is
    // derived from each archetype's own reward prose and reproduces all three
    // existing configs exactly. Per-archetype config still wins where present.
    const rewardFallback = getRewardProfile(report2ArchetypeSlug(primaryArchetype));
    const rewardConfig = rewardUnlocked
      ? (normalizeRewardConfig(
          getReport2Config(primaryArchetype) as Record<string, unknown> | null
        ) ??
        (rewardFallback
          ? normalizeRewardConfig({
              reward_order: rewardFallback.order,
              reward_roles: rewardFallback.roles,
              reward_meters: rewardFallback.meters,
            })
          : null))
      : null;
    const rewardCopy = {
      "edu.eyebrow": rewardSection["edu.eyebrow"] ?? null,
      "edu.teaser": rewardSection["edu.teaser"] ?? null,
      "edu.body.p1": rewardSection["edu.body.p1"] ?? null,
      "edu.body.p2": rewardSection["edu.body.p2"] ?? null,
      "edu.body.p3": rewardSection["edu.body.p3"] ?? null,
      // Deliberate teaser, shipped to locked clients too. NOT universal: the
      // value and caption are per-archetype ("2 in 5 of Relational Nurturers"
      // vs "1 in 2 of Spark Seekers"), so never hardcode one archetype's copy
      // here. It names only the archetype the reader already sees for free, so
      // giving it away costs nothing — the paid verdict is `takeaway` below.
      // Rendered only when both parts exist (never fabricated).
      stat1: rewardSection.stat1 ?? null,
      "stat1.caption": rewardSection["stat1.caption"] ?? null,
      "learn.eyebrow": rewardSection["learn.eyebrow"] ?? null,
      "learn.body": rewardSection["learn.body"] ?? null,
      // Per-archetype — withheld from locked clients.
      takeaway: rewardUnlocked ? (rewardSection.takeaway ?? null) : null,
      locked: !rewardUnlocked,
    };

    // Report 2.0 Energy & Risk ("Energy Level") section copy — a Part III,
    // FULL_REPORT-tier PREMIUM section (section 13; NOT in ESSENTIALS_SECTION_IDS,
    // so it unlocks only at the full_report tier). The educational slots (`edu.*`,
    // `chartnote1`, `learn.*`) are universal (verified: `chartnote1` is identical
    // across all 14) and always shipped. The per-archetype payload —
    // (the per-archetype hook, shown as the locked teaser) and `takeaway` (the
    // verdict) plus the energy config (readouts + highlighted curve family) — is
    // the gated content: shipped ONLY when the report is unlocked at the
    // full_report tier. A locked client (`energyCopy.locked`) receives the hook
    // teaser but null `takeaway` + null config, and renders the PremiumOverlay.
    // Only Spiritual Lover carries `energy_readouts` today; the other archetypes
    // render the curve framing WITHOUT the reader's readouts rather than
    // fabricating. Shared viewers inherit the owner's plan via `accessPlan`. Keyed
    // to the primary archetype.
    const energySection = getReport2Section(primaryArchetype, "energy");
    const energyUnlocked = isSectionUnlockedForPlan({
      accessPlan,
      isPremium: true,
      sectionId: "energy_level",
    });
    const energyConfig = energyUnlocked
      ? normalizeEnergyConfig(getReport2Config(primaryArchetype) as Record<string, unknown> | null)
      : null;
    const energyCopy = {
      "edu.eyebrow": energySection["edu.eyebrow"] ?? null,
      "edu.teaser": energySection["edu.teaser"] ?? null,
      "edu.body.p1": energySection["edu.body.p1"] ?? null,
      "edu.body.p2": energySection["edu.body.p2"] ?? null,
      "edu.body.p3": energySection["edu.body.p3"] ?? null,
      // Universal chart caption under the wave graph.
      chartnote1: energySection.chartnote1 ?? null,
      "learn.eyebrow": energySection["learn.eyebrow"] ?? null,
      "learn.body": energySection["learn.body"] ?? null,
      // Per-archetype — withheld from locked clients.
      takeaway: energyUnlocked ? (energySection.takeaway ?? null) : null,
      locked: !energyUnlocked,
    };

    // Report 2.0 Arousal Style section copy — a Part III, FULL_REPORT-tier
    // PREMIUM section (`arousal_style`, section 21; NOT in ESSENTIALS_SECTION_IDS,
    // so it unlocks only at the full_report tier). The educational slots
    // (`eyebrow`, `insight.label`, `edu.*`, `learn.*`) are UNIVERSAL (identical
    // across all 14) and always shipped. The per-archetype payload —
    // `result` (e.g. "Responsive"), `insight.value`, the two mini-stats
    // (`stat1`/`stat1.caption`, `stat2`/`stat2.caption`) plus the arc config
    // (family + act labels) — is the gated content: shipped ONLY when unlocked at
    // the full_report tier. A locked client (`arousalCopy.locked`) receives those
    // null + null config and renders the PremiumOverlay. All 14
    // archetypes carry full arousal copy (result/insight.value/stats),
    // so nothing is fabricated. Shared viewers inherit the owner's plan via
    // `accessPlan`. Keyed to the primary archetype.
    const arousalSection = getReport2Section(primaryArchetype, "arousal");
    const arousalUnlocked = isSectionUnlockedForPlan({
      accessPlan,
      isPremium: true,
      sectionId: "arousal_style",
    });
    const arousalConfig = arousalUnlocked
      ? normalizeArousalConfig(getReport2Config(primaryArchetype) as Record<string, unknown> | null)
      : null;
    const arousalCopy = {
      // Universal — always shipped (frame the section for locked clients too).
      eyebrow: arousalSection.eyebrow ?? null,
      "insight.label": arousalSection["insight.label"] ?? null,
      "edu.eyebrow": arousalSection["edu.eyebrow"] ?? null,
      "edu.teaser": arousalSection["edu.teaser"] ?? null,
      "edu.body.p1": arousalSection["edu.body.p1"] ?? null,
      "edu.body.p2": arousalSection["edu.body.p2"] ?? null,
      "edu.body.p3": arousalSection["edu.body.p3"] ?? null,
      "edu.body.p4": arousalSection["edu.body.p4"] ?? null,
      "learn.eyebrow": arousalSection["learn.eyebrow"] ?? null,
      "learn.body": arousalSection["learn.body"] ?? null,
      // Per-archetype — withheld from locked clients.
      result: arousalUnlocked ? (arousalSection.result ?? null) : null,
      "insight.value": arousalUnlocked ? (arousalSection["insight.value"] ?? null) : null,
      stat1: arousalUnlocked ? (arousalSection.stat1 ?? null) : null,
      "stat1.caption": arousalUnlocked ? (arousalSection["stat1.caption"] ?? null) : null,
      stat2: arousalUnlocked ? (arousalSection.stat2 ?? null) : null,
      "stat2.caption": arousalUnlocked ? (arousalSection["stat2.caption"] ?? null) : null,
      locked: !arousalUnlocked,
    };

    // Report 2.0 Initiation Style section copy — a Part III, FULL_REPORT-tier
    // PREMIUM section (`initiation_style`, section 22; NOT in
    // ESSENTIALS_SECTION_IDS, so it unlocks only at the full_report tier). The
    // framing slots (`eyebrow`, `row1.label`, `practical.label`,
    // `learn.*`) are UNIVERSAL (identical across all 14) and always shipped. The
    // per-archetype payload — `result` (e.g. "Presence-led"), `row1.value`,
    // `takeaway`, `practical.teaser`, `practical.line1..3`, `body.p1`, the
    // mini-stat (`stat1`/`stat1.caption`) plus the timeline-chart config (family
    // + variant) — is the gated content: shipped ONLY when unlocked at the
    // full_report tier. A locked client (`initiationCopy.locked`) receives those
    // null + null config and renders the hook teaser + PremiumOverlay. The
    // two-column sent→received chart is family framing (drawn even locked, under
    // the blur). All 14 archetypes carry full initiation copy, so nothing is
    // fabricated. Shared viewers inherit the owner's plan. Keyed to the primary
    // archetype.
    const initiationSection = getReport2Section(primaryArchetype, "initiation");
    const initiationUnlocked = isSectionUnlockedForPlan({
      accessPlan,
      isPremium: true,
      sectionId: "initiation_style",
    });
    const initiationConfig = initiationUnlocked
      ? normalizeInitiationConfig(
          getReport2Config(primaryArchetype) as Record<string, unknown> | null
        )
      : null;
    const initiationCopy = {
      // Universal — always shipped (frame the section for locked clients too).
      eyebrow: initiationSection.eyebrow ?? null,
      "row1.label": initiationSection["row1.label"] ?? null,
      "practical.label": initiationSection["practical.label"] ?? null,
      "learn.eyebrow": initiationSection["learn.eyebrow"] ?? null,
      "learn.body": initiationSection["learn.body"] ?? null,
      // Per-archetype — withheld from locked clients.
      result: initiationUnlocked ? (initiationSection.result ?? null) : null,
      "row1.value": initiationUnlocked ? (initiationSection["row1.value"] ?? null) : null,
      takeaway: initiationUnlocked ? (initiationSection.takeaway ?? null) : null,
      "practical.teaser": initiationUnlocked
        ? (initiationSection["practical.teaser"] ?? null)
        : null,
      "practical.line1": initiationUnlocked ? (initiationSection["practical.line1"] ?? null) : null,
      "practical.line2": initiationUnlocked ? (initiationSection["practical.line2"] ?? null) : null,
      "practical.line3": initiationUnlocked ? (initiationSection["practical.line3"] ?? null) : null,
      "body.p1": initiationUnlocked ? (initiationSection["body.p1"] ?? null) : null,
      stat1: initiationUnlocked ? (initiationSection.stat1 ?? null) : null,
      "stat1.caption": initiationUnlocked ? (initiationSection["stat1.caption"] ?? null) : null,
      locked: !initiationUnlocked,
    };

    // Report 2.0 Libido Challenges section copy — a Part IV, FULL_REPORT-tier
    // PREMIUM section (`libido_challenges_in_relationships`, section 28; NOT in
    // ESSENTIALS_SECTION_IDS, so it unlocks only at the full_report tier). The
    // framing slots (`eyebrow`, `row1..4.label`, `practical.label`,
    // `learn.*`) are UNIVERSAL and always shipped. The per-archetype payload —
    // `result` (the loop name, e.g. "The Waiting Loop"), `row1..4.value`,
    // `practical.teaser`, `practical.line1..3` PLUS the loop config (name +
    // steps) — is the gated content: shipped ONLY when unlocked at the
    // full_report tier. A locked client (`libidoCopy.locked`) receives those
    // null + null loop and renders the hook teaser + PremiumOverlay. The named
    // loop renders as a cycle of `steps` connected chips; only 3 archetypes
    // carry a `loop` today (the other 11 are null → the client renders no chips
    // rather than fabricating). All 14 carry full libido copy. Shared viewers
    // inherit the owner's plan. Keyed to the primary archetype.
    const libidoSection = getReport2Section(primaryArchetype, "libido");
    const libidoUnlocked = isSectionUnlockedForPlan({
      accessPlan,
      isPremium: true,
      sectionId: "libido_challenges_in_relationships",
    });
    /*
     * The loop's three steps. Config `loop` only ever carried { name, steps } and
     * existed for 3 of 14 — its `name` duplicates `libido.result` and `steps` is
     * always 3 — so it gated the chips off for 11 archetypes. The frames' footer
     * says "every archetype has its own named loop, three rows and three steps",
     * so the real step text now comes from `data/report2-libido-loops.ts` (all 14)
     * and the config is no longer consulted. Still withheld when locked.
     */
    const libidoConfig = libidoUnlocked
      ? getLibidoLoopSteps(report2ArchetypeSlug(primaryArchetype))
      : null;
    const libidoCopy = {
      // Universal — always shipped (frame the section for locked clients too).
      eyebrow: libidoSection.eyebrow ?? null,
      "row1.label": libidoSection["row1.label"] ?? null,
      "row2.label": libidoSection["row2.label"] ?? null,
      "row3.label": libidoSection["row3.label"] ?? null,
      "row4.label": libidoSection["row4.label"] ?? null,
      "practical.label": libidoSection["practical.label"] ?? null,
      "learn.eyebrow": libidoSection["learn.eyebrow"] ?? null,
      "learn.body": libidoSection["learn.body"] ?? null,
      // Per-archetype — withheld from locked clients.
      result: libidoUnlocked ? (libidoSection.result ?? null) : null,
      "row1.value": libidoUnlocked ? (libidoSection["row1.value"] ?? null) : null,
      "row2.value": libidoUnlocked ? (libidoSection["row2.value"] ?? null) : null,
      "row3.value": libidoUnlocked ? (libidoSection["row3.value"] ?? null) : null,
      "row4.value": libidoUnlocked ? (libidoSection["row4.value"] ?? null) : null,
      "practical.teaser": libidoUnlocked ? (libidoSection["practical.teaser"] ?? null) : null,
      "practical.line1": libidoUnlocked ? (libidoSection["practical.line1"] ?? null) : null,
      "practical.line2": libidoUnlocked ? (libidoSection["practical.line2"] ?? null) : null,
      "practical.line3": libidoUnlocked ? (libidoSection["practical.line3"] ?? null) : null,
      locked: !libidoUnlocked,
    };

    // Report 2.0 "Challenges in Partnership" section copy — renders INLINE right
    // after Libido (section 28); it has no own row in report-general.ts, so it
    // shares Libido's gate: a Part IV, FULL_REPORT-tier PREMIUM section (NOT in
    // ESSENTIALS_SECTION_IDS, so it unlocks only at the full_report tier). The
    // framing slots (`eyebrow`, `row1..3.label`, `edu.*`, `learn.*`)
    // are UNIVERSAL (verified identical across all 14) and always shipped. The
    // per-archetype payload — `result` (the loop name, e.g. "The Resonance Loop")
    // and `row1..3.value` — is the gated content: shipped ONLY when unlocked at
    // the full_report tier. A locked client (`partnershipCopy.locked`) receives
    // those null and renders the hook teaser + PremiumOverlay. There is no
    // per-archetype orbit/stage copy, so no cycle visual is fabricated — the
    // three rows carry the loop. All 14 carry full partnership copy. Shared
    // viewers inherit the owner's plan. Keyed to the primary archetype.
    const partnershipSection = getReport2Section(primaryArchetype, "partnership");
    const partnershipUnlocked = libidoUnlocked;
    // The orbit's three steps + the reader's own bid. All 14 have their own (the
    // frames' footer: "All 14 need their own"); withheld when locked.
    const partnershipLoop = partnershipUnlocked
      ? getPartnershipLoop(report2ArchetypeSlug(primaryArchetype))
      : null;
    const partnershipCopy = {
      // Universal — always shipped (frame the section for locked clients too).
      eyebrow: partnershipSection.eyebrow ?? null,
      "row1.label": partnershipSection["row1.label"] ?? null,
      "row2.label": partnershipSection["row2.label"] ?? null,
      "row3.label": partnershipSection["row3.label"] ?? null,
      "edu.eyebrow": partnershipSection["edu.eyebrow"] ?? null,
      "edu.teaser": partnershipSection["edu.teaser"] ?? null,
      "edu.body.p1": partnershipSection["edu.body.p1"] ?? null,
      "edu.body.p2": partnershipSection["edu.body.p2"] ?? null,
      "edu.body.p3": partnershipSection["edu.body.p3"] ?? null,
      "learn.eyebrow": partnershipSection["learn.eyebrow"] ?? null,
      "learn.body": partnershipSection["learn.body"] ?? null,
      // Per-archetype — withheld from locked clients.
      result: partnershipUnlocked ? (partnershipSection.result ?? null) : null,
      "row1.value": partnershipUnlocked ? (partnershipSection["row1.value"] ?? null) : null,
      "row2.value": partnershipUnlocked ? (partnershipSection["row2.value"] ?? null) : null,
      "row3.value": partnershipUnlocked ? (partnershipSection["row3.value"] ?? null) : null,
      locked: !partnershipUnlocked,
    };

    // Report 2.0 "Challenges to Enjoy Sex" (Enjoyment) section copy — a Part IV,
    // FULL_REPORT-tier PREMIUM section
    // (`typical_challenges_to_enjoy_sex_for_the_core_archetype`, section 29; NOT
    // in ESSENTIALS_SECTION_IDS, so it unlocks only at the full_report tier). The
    // unlocked-report Figma anchor has no dedicated frame for it, so the client
    // renders it in the established Arousal pattern (result card + labelled rows
    // + insight + edu block). The framing slots (`eyebrow`, `row1..3.label`,
    // `insight.label`, `edu.*`, `learn.*`) are UNIVERSAL (identical across all
    // 14) and always shipped. The per-archetype payload — `result`
    // (e.g. "Wanting to Want"), `row1..3.value`, and `insight.value` — is the
    // gated content: shipped ONLY when unlocked at the full_report tier. A locked
    // client (`enjoyCopy.locked`) receives those null and renders the hook teaser
    // + PremiumOverlay. All 14 carry full enjoy copy, so nothing is fabricated.
    // Shared viewers inherit the owner's plan. Keyed to the primary archetype.
    const enjoySection = getReport2Section(primaryArchetype, "enjoy");
    const enjoyUnlocked = isSectionUnlockedForPlan({
      accessPlan,
      isPremium: true,
      sectionId: "typical_challenges_to_enjoy_sex_for_the_core_archetype",
    });
    const enjoyCopy = {
      // Universal — always shipped (frame the section for locked clients too).
      eyebrow: enjoySection.eyebrow ?? null,
      "row1.label": enjoySection["row1.label"] ?? null,
      "row2.label": enjoySection["row2.label"] ?? null,
      "row3.label": enjoySection["row3.label"] ?? null,
      "insight.label": enjoySection["insight.label"] ?? null,
      "edu.eyebrow": enjoySection["edu.eyebrow"] ?? null,
      "edu.teaser": enjoySection["edu.teaser"] ?? null,
      "edu.body.p1": enjoySection["edu.body.p1"] ?? null,
      "edu.body.p2": enjoySection["edu.body.p2"] ?? null,
      "edu.body.p3": enjoySection["edu.body.p3"] ?? null,
      "learn.eyebrow": enjoySection["learn.eyebrow"] ?? null,
      "learn.body": enjoySection["learn.body"] ?? null,
      // Per-archetype — withheld from locked clients.
      result: enjoyUnlocked ? (enjoySection.result ?? null) : null,
      "row1.value": enjoyUnlocked ? (enjoySection["row1.value"] ?? null) : null,
      "row2.value": enjoyUnlocked ? (enjoySection["row2.value"] ?? null) : null,
      "row3.value": enjoyUnlocked ? (enjoySection["row3.value"] ?? null) : null,
      "insight.value": enjoyUnlocked ? (enjoySection["insight.value"] ?? null) : null,
      locked: !enjoyUnlocked,
    };

    // Report 2.0 "Growth Potentials" section copy — a Part IV, FULL_REPORT-tier
    // PREMIUM section (`typical_growth_potentials_for_the_core_archetype`,
    // section 31; NOT in ESSENTIALS_SECTION_IDS, so it unlocks only at the
    // full_report tier). The framing slots (`learn.eyebrow`,
    // `learn.body`) are UNIVERSAL and always shipped. The per-archetype payload —
    // `takeaway`, `ladder.headline`, `rung1..5.{from,to,move}` (the growth-ladder
    // rungs; counts vary per archetype) and `ladder.close` — is the gated
    // content: shipped ONLY when unlocked at the full_report tier. A locked
    // client (`growthCopy.locked`) receives those null and renders the hook
    // teaser + PremiumOverlay. Render only rungs whose slots exist (never
    // fabricated). `growthRungs` (config `growth_rungs`) is a client-safe hint
    // for the elevation-profile step count when the rungs are withheld. All 14
    // carry full growth copy. Shared viewers inherit the owner's plan. Keyed to
    // the primary archetype.
    const growthSection = getReport2Section(primaryArchetype, "growth");
    const growthUnlocked = isSectionUnlockedForPlan({
      accessPlan,
      isPremium: true,
      sectionId: "typical_growth_potentials_for_the_core_archetype",
    });
    const rawGrowthRungs = getReport2Config(primaryArchetype)?.growth_rungs;
    const growthRungs =
      typeof rawGrowthRungs === "number" && Number.isFinite(rawGrowthRungs) && rawGrowthRungs > 0
        ? rawGrowthRungs
        : null;
    const growthCopy = {
      // Universal — always shipped (frame the section for locked clients too).
      "learn.eyebrow": growthSection["learn.eyebrow"] ?? null,
      "learn.body": growthSection["learn.body"] ?? null,
      // Per-archetype — withheld from locked clients.
      takeaway: growthUnlocked ? (growthSection.takeaway ?? null) : null,
      "ladder.headline": growthUnlocked ? (growthSection["ladder.headline"] ?? null) : null,
      ...Object.fromEntries(
        [1, 2, 3, 4, 5].flatMap((i) =>
          (["from", "to", "move"] as const).map((slot) => [
            `rung${i}.${slot}`,
            growthUnlocked ? (growthSection[`rung${i}.${slot}`] ?? null) : null,
          ])
        )
      ),
      "ladder.close": growthUnlocked ? (growthSection["ladder.close"] ?? null) : null,
      locked: !growthUnlocked,
    };

    // Report 2.0 "Reading Recommendations" section copy — a Part IV,
    // FULL_REPORT-tier PREMIUM section (`recommendations`, section 32; NOT in
    // ESSENTIALS_SECTION_IDS, so it unlocks only at the full_report tier). The
    // framing slots (universal category tags `book1..4.tag`,
    // `closing.lead`, `learn.eyebrow`, `learn.body`) are UNIVERSAL and always
    // shipped. The per-archetype payload — each book's `title` / `author` /
    // `blurb` plus `closing.formula` — is the gated content: shipped ONLY when
    // unlocked at the full_report tier. A locked client (`readingCopy.locked`)
    // receives those null and renders the hook teaser + PremiumOverlay. Render
    // only the books whose title exists (counts vary; never fabricated). All 14
    // carry full reading copy. Shared viewers inherit the owner's plan. Keyed to
    // the primary archetype.
    const readingSection = getReport2Section(primaryArchetype, "reading");
    const readingUnlocked = isSectionUnlockedForPlan({
      accessPlan,
      isPremium: true,
      sectionId: "recommendations",
    });
    const readingCopy = {
      // Universal — always shipped (frame the section for locked clients too).
      "closing.lead": readingSection["closing.lead"] ?? null,
      "learn.eyebrow": readingSection["learn.eyebrow"] ?? null,
      "learn.body": readingSection["learn.body"] ?? null,
      // Per-archetype — withheld from locked clients (tag is universal, kept).
      ...Object.fromEntries(
        [1, 2, 3, 4].flatMap((i) => [
          [`book${i}.tag`, readingSection[`book${i}.tag`] ?? null],
          [`book${i}.title`, readingUnlocked ? (readingSection[`book${i}.title`] ?? null) : null],
          [`book${i}.author`, readingUnlocked ? (readingSection[`book${i}.author`] ?? null) : null],
          [`book${i}.blurb`, readingUnlocked ? (readingSection[`book${i}.blurb`] ?? null) : null],
        ])
      ),
      "closing.formula": readingUnlocked ? (readingSection["closing.formula"] ?? null) : null,
      locked: !readingUnlocked,
    };

    // Report 2.0 Power Orientation section copy — a Part III, FULL_REPORT-tier
    // PREMIUM section (`power_orientation`, section 15; NOT in
    // ESSENTIALS_SECTION_IDS, so it unlocks only at the full_report tier). The
    // educational slots (`edu.*`, `learn.*`) are always shipped. The per-archetype
    // payload — `takeaway` (verdict), `body.p1` (the reader's own read on the
    // map) and `zone` (the reader's power-zone region label, which drives the
    // top label + the highlighted "You" zone + dot on the plane) — is the gated
    // content: shipped ONLY when the report is unlocked at the full_report tier.
    // A locked client (`powerCopy.locked`) receives null takeaway/body/zone and
    // renders the hook teaser + PremiumOverlay; the 14-dot plane itself is a
    // fixed universal layout and still draws, but without the "You"/zone
    // highlight. `zone` derives from config `families.power_zone` (the only
    // per-archetype power datum today — no per-archetype dot positions exist, so
    // the plane layout is hardcoded client-side from the Figma). Shared viewers
    // inherit the owner's plan via `accessPlan`. Keyed to the primary archetype.
    const powerSection = getReport2Section(primaryArchetype, "power");
    const powerUnlocked = isSectionUnlockedForPlan({
      accessPlan,
      isPremium: true,
      sectionId: "power_orientation",
    });
    const powerZoneInfo = powerUnlocked
      ? getPowerZone(getReport2Config(primaryArchetype)?.families?.power_zone)
      : null;
    const powerCopy = {
      "edu.eyebrow": powerSection["edu.eyebrow"] ?? null,
      "edu.teaser": powerSection["edu.teaser"] ?? null,
      "edu.body.p1": powerSection["edu.body.p1"] ?? null,
      "edu.body.p2": powerSection["edu.body.p2"] ?? null,
      "edu.body.p3": powerSection["edu.body.p3"] ?? null,
      "edu.body.p4": powerSection["edu.body.p4"] ?? null,
      "learn.eyebrow": powerSection["learn.eyebrow"] ?? null,
      "learn.body": powerSection["learn.body"] ?? null,
      // Per-archetype — withheld from locked clients.
      takeaway: powerUnlocked ? (powerSection.takeaway ?? null) : null,
      "body.p1": powerUnlocked ? (powerSection["body.p1"] ?? null) : null,
      zone: powerZoneInfo?.label ?? null,
      "zone.result": powerZoneInfo?.result ?? null,
      locked: !powerUnlocked,
    };

    // Report 2.0 Fantasy ("Fantasy vs. Reality") section copy — a Part III,
    // FULL_REPORT-tier PREMIUM section (this is section 27,
    // `typical_sexual_fantasy_amp_practice_tendencies`; NOT in
    // ESSENTIALS_SECTION_IDS, so it unlocks only at the full_report tier). UNLIKE
    // the sibling sections EVERY fantasy copy slot is universal (all 12 are
    // `universal: true` in report2-sections-schema.json — hook, edu.*, the two
    // chart-notes, learn.*), so there is nothing per-archetype to withhold: all
    // slots are always shipped and frame the section for locked clients too. The
    // ONLY gated element is the map's per-user dot layout — and no per-user or
    // per-archetype fantasy dot data exists today (`getReport2Config().fantasy_map`
    // is null for all 14, carrying only meta for one), so the client draws the
    // Figma's fixed representative dot layout (node 8427:2479) for everyone and
    // the chartnote states placements are illustrative. Nothing is fabricated.
    // `locked` only drives whether the client blurs the map behind the overlay.
    // Shared viewers inherit the owner's plan via `accessPlan`. Keyed to primary.
    const fantasySection = getReport2Section(primaryArchetype, "fantasy");
    const fantasyUnlocked = isSectionUnlockedForPlan({
      accessPlan,
      isPremium: true,
      sectionId: "typical_sexual_fantasy_amp_practice_tendencies",
    });
    // Per-archetype map dots, DERIVED from the practice-tendency scores (fantasy
    // pull × lived pleasure) rather than hand-authored — see
    // `features/report/server/fantasyMap.ts`. Withheld when locked: the client
    // then falls back to the universal illustrative layout behind the blur, so no
    // per-archetype placement leaks to an unpaid reader.
    const fantasyDots = fantasyUnlocked ? getFantasyMapDots(primaryArchetype) : null;
    const fantasyCopy = {
      "edu.eyebrow": fantasySection["edu.eyebrow"] ?? null,
      "edu.teaser": fantasySection["edu.teaser"] ?? null,
      "edu.body.p1": fantasySection["edu.body.p1"] ?? null,
      "edu.body.p2": fantasySection["edu.body.p2"] ?? null,
      "edu.body.p3": fantasySection["edu.body.p3"] ?? null,
      "edu.body.p4": fantasySection["edu.body.p4"] ?? null,
      chartnote1: fantasySection.chartnote1 ?? null,
      chartnote2: fantasySection.chartnote2 ?? null,
      "learn.eyebrow": fantasySection["learn.eyebrow"] ?? null,
      "learn.body": fantasySection["learn.body"] ?? null,
      locked: !fantasyUnlocked,
    };

    // Report 2.0 Curiosity & Relationship Form section copy — a Part III,
    // FULL_REPORT-tier PREMIUM section (`curiosity_level`, section 16; NOT in
    // ESSENTIALS_SECTION_IDS, so it unlocks only at the full_report tier). The
    // universal slots — `edu.*` (incl. the 14-item `edu.struct.N`
    // list of relationship structures) and `learn.*` — are always shipped. The
    // per-archetype payload — `takeaway` (the italic pull-quote), `body.p1` (the
    // bold intro read) and `body.p2/p3` — is the gated content: shipped ONLY when
    // unlocked. The reader's fit across relationship forms comes from config
    // `relationship_fit` (structure → 0..3 score); only Spiritual Lover carries
    // one in config, so the other 13 fall back to `data/report2-relationship-fit.ts`
    // (read off each archetype's own curiosity copy; the Spiritual Lover entry
    // reproduces the real config exactly) — without it 13 of 14 drew a fit table
    // with no segments. Withheld from a locked client. Shared viewers inherit the
    // owner's plan via `accessPlan`. Keyed to the primary archetype.
    const curiositySection = getReport2Section(primaryArchetype, "curiosity");
    const curiosityUnlocked = isSectionUnlockedForPlan({
      accessPlan,
      isPremium: true,
      sectionId: "curiosity_level",
    });
    const rawFit =
      getReport2Config(primaryArchetype)?.relationship_fit ??
      getRelationshipFit(report2ArchetypeSlug(primaryArchetype));
    const relationshipFit =
      curiosityUnlocked && rawFit && typeof rawFit === "object"
        ? (rawFit as Record<string, number>)
        : null;
    const curiosityCopy = {
      "edu.eyebrow": curiositySection["edu.eyebrow"] ?? null,
      "edu.teaser": curiositySection["edu.teaser"] ?? null,
      "edu.body.p1": curiositySection["edu.body.p1"] ?? null,
      "edu.body.p2": curiositySection["edu.body.p2"] ?? null,
      // Universal 14-item list of relationship structures (edu.struct.1..14).
      ...Object.fromEntries(
        Array.from({ length: 14 }, (_, i) => [
          `edu.struct.${i + 1}`,
          curiositySection[`edu.struct.${i + 1}`] ?? null,
        ])
      ),
      "learn.eyebrow": curiositySection["learn.eyebrow"] ?? null,
      "learn.body": curiositySection["learn.body"] ?? null,
      // Per-archetype — withheld from locked clients.
      takeaway: curiosityUnlocked ? (curiositySection.takeaway ?? null) : null,
      "body.p1": curiosityUnlocked ? (curiositySection["body.p1"] ?? null) : null,
      "body.p2": curiosityUnlocked ? (curiositySection["body.p2"] ?? null) : null,
      "body.p3": curiosityUnlocked ? (curiositySection["body.p3"] ?? null) : null,
      locked: !curiosityUnlocked,
    };

    // Report 2.0 Love Language section copy — a Part III, FULL_REPORT-tier
    // PREMIUM section (`love_language`, section 19; NOT in ESSENTIALS_SECTION_IDS,
    // so it unlocks only at the full_report tier). The universal slots —
    // `edu.*` and `learn.*` — are always shipped. The per-archetype
    // payload — `body.p1` (the "catch" line) plus the reader's ranked ordering of
    // the five languages (config `love_language_order`) — is the gated content:
    // shipped ONLY when unlocked. The five languages themselves are universal
    // (same five, only the ORDER varies); only some archetypes carry an order
    // (e.g. Spiritual Lover), so an archetype without one renders the framing +
    // edu WITHOUT the ranked list rather than fabricating. Also withheld from a
    // locked client. Shared viewers inherit the owner's plan via `accessPlan`.
    // Keyed to the primary archetype.
    const lovelangSection = getReport2Section(primaryArchetype, "lovelang");
    const lovelangUnlocked = isSectionUnlockedForPlan({
      accessPlan,
      isPremium: true,
      sectionId: "love_language",
    });
    // Config carries `love_language_order` for Spiritual Lover only, so the other
    // 13 fall back to `data/report2-love-languages.ts` (each order read off that
    // archetype's own lovelang copy; the Spiritual Lover entry reproduces the real
    // config exactly). Without it 13 of 14 rendered NO ranked list at all.
    const rawLoveOrder =
      getReport2Config(primaryArchetype)?.love_language_order ??
      getLoveLanguageOrder(report2ArchetypeSlug(primaryArchetype));
    const loveLanguageOrder =
      lovelangUnlocked && Array.isArray(rawLoveOrder)
        ? rawLoveOrder.filter((v): v is string => typeof v === "string")
        : null;
    const lovelangCopy = {
      "edu.eyebrow": lovelangSection["edu.eyebrow"] ?? null,
      "edu.teaser": lovelangSection["edu.teaser"] ?? null,
      "edu.body.p1": lovelangSection["edu.body.p1"] ?? null,
      "edu.body.p2": lovelangSection["edu.body.p2"] ?? null,
      "edu.body.p3": lovelangSection["edu.body.p3"] ?? null,
      "learn.eyebrow": lovelangSection["learn.eyebrow"] ?? null,
      "learn.body": lovelangSection["learn.body"] ?? null,
      // Per-archetype — withheld from locked clients.
      "body.p1": lovelangUnlocked ? (lovelangSection["body.p1"] ?? null) : null,
      locked: !lovelangUnlocked,
    };

    // Report 2.0 Confidence Level section copy — a Part II, essentials-tier
    // PREMIUM section (section 10). UNLIKE the other Part II sections, EVERY copy
    // slot here is universal education (`edu.*`, `chartnote1`,
    // `learn.*`) — always shipped. The per-archetype specificity is the confidence
    // RESULT, which lives in config `confidence_strip` = { you_dot_x, result_word }
    // — that is the gated bit: shipped ONLY when the report is unlocked at the
    // essentials tier (or above). A locked client receives `confidenceStrip: null`
    // and renders the universal strip framing + a blurred stand-in + overlay.
    // Only Spiritual Lover carries a real `confidence_strip` today; the other 13
    // are null, so even unlocked they render the strip WITHOUT the reader's dot/
    // result (never fabricated). Keyed to the primary archetype.
    const confidenceSection = getReport2Section(primaryArchetype, "confidence");
    const confidenceUnlocked = isSectionUnlockedForPlan({
      accessPlan,
      isPremium: true,
      sectionId: "confidence_level",
    });
    const confidenceStripCfg = getReport2Config(primaryArchetype)?.confidence_strip as
      | {
          you_dot_x?: number | null;
          result_word?: string | null;
        }
      | null
      | undefined;
    const confidenceStrip =
      confidenceUnlocked && confidenceStripCfg?.result_word
        ? {
            you_dot_x: confidenceStripCfg.you_dot_x ?? null,
            result_word: confidenceStripCfg.result_word,
          }
        : null;
    const confidenceCopy = {
      "edu.eyebrow": confidenceSection["edu.eyebrow"] ?? null,
      "edu.teaser": confidenceSection["edu.teaser"] ?? null,
      "edu.body.p1": confidenceSection["edu.body.p1"] ?? null,
      "edu.body.p2": confidenceSection["edu.body.p2"] ?? null,
      chartnote1: confidenceSection.chartnote1 ?? null,
      "learn.eyebrow": confidenceSection["learn.eyebrow"] ?? null,
      "learn.body": confidenceSection["learn.body"] ?? null,
      locked: !confidenceUnlocked,
    };

    // Report 2.0 Insight Map section copy — the tile labels/symbols/CTAs are
    // universal (hardcoded in the client InsightMapSection per Figma); only the
    // per-archetype sublines + featured title/sub are threaded here. The frame
    // shows every tile unlocked ("Arousal · always unlocked" + full labels), so
    // no gating: the pill CTAs route to the shared pricing modal, same as
    // Findings' unlock CTA.
    const mapSection = getReport2Section(primaryArchetype, "map");
    const mapCopy = {
      "tile1.sub": mapSection["tile1.sub"] ?? null,
      "tile2.sub": mapSection["tile2.sub"] ?? null,
      "tile3.sub": mapSection["tile3.sub"] ?? null,
      "tile4.sub": mapSection["tile4.sub"] ?? null,
      "tile5.sub": mapSection["tile5.sub"] ?? null,
      "featured.title": mapSection["featured.title"] ?? null,
      "featured.sub": mapSection["featured.sub"] ?? null,
    };

    // Report 2.0 Sexual Stage card copy — the static "Your Likely Stage" card
    // above the orbit explorer. Labels (eyebrow, row labels, practical label)
    // are universal; `result` + row/practical values are per-archetype. Free
    // (Part I) section — no gating.
    const stageSection = getReport2Section(primaryArchetype, "stage");
    const stageCopy = {
      eyebrow: stageSection.eyebrow ?? null,
      result: stageSection.result ?? null,
      "row1.label": stageSection["row1.label"] ?? null,
      "row1.value": stageSection["row1.value"] ?? null,
      "row2.label": stageSection["row2.label"] ?? null,
      "row2.value": stageSection["row2.value"] ?? null,
      "row3.label": stageSection["row3.label"] ?? null,
      "row3.value": stageSection["row3.value"] ?? null,
      "practical.label": stageSection["practical.label"] ?? null,
      "practical.body": stageSection["practical.body"] ?? null,
    };

    // Report 2.0 Constellation ("Other Archetypes") section — the last Part I
    // block lists all 14 archetypes ranked by match %, each with its own motto.
    // Unlike the other sections this needs EVERY archetype's motto (not just the
    // primary's), so resolve the whole set here. `motto` is the only per-row copy
    // slot; the rest of the row (icon, accent, name, %) is derived client-side.
    // Free (Part I) section — no gating.
    const constellationMottos = Object.fromEntries(
      KNOWN_ARCHETYPES.map((name) => [name, getReport2Section(name, "constellation").motto ?? null])
    ) as Record<string, string | null>;

    const filteredArchetypeContent = buildArchetypeContentForUser(accessPlan, unlockedArchetypes);
    const filteredPracticeTendencies = buildPracticeTendenciesForUser(
      accessPlan,
      unlockedArchetypes,
      archetypeTiers
    );

    // When forced_paywall_enabled is OFF the report is freely viewable and the
    // pricing modal is opt-in only (no non-dismissible screen). Shared viewers
    // never see the forced wall regardless.
    const forcedPaywallEnabled = isShareAccess
      ? false
      : await isFeatureEnabled("forced_paywall_enabled", true);

    // Every section copy goes out through one gate: on a locked section the
    // "Learn:" body paragraphs come off the wire entirely, so the peek→expand
    // control has nothing to reveal to a reader who hasn't bought.
    const response = NextResponse.json(
      stripLockedEduBodyFromPayload({
        submissionId: submission.id,
        accessPlan,
        forcedPaywallEnabled,
        userName: getSubmissionUserName(submission),
        userEmail: isShareAccess ? null : getSubmissionUserEmail(submission),
        ownerFirstName: isShareAccess ? getSubmissionUserName(submission) : null,
        ownerToken,
        viewMode: isShareAccess ? ("shared" as const) : ("owner" as const),
        primaryArchetype,
        percentages: scoring.v5_percentages || scoring.percentages || {},
        reportDate: submission.created_date_time,
        diagnostics: scoring.diagnostics ?? null,
        // snapshotAnswers contains the owner's intimate survey responses
        // (current satisfaction, importance of sex). Owner sees them; shared
        // viewers do NOT — those are personal, not part of the archetype gift.
        snapshotAnswers: isShareAccess ? null : snapshotAnswers,
        pricingQuotes,
        unlockedArchetypes,
        archetypeTiers,
        archetypeContent: filteredArchetypeContent,
        practiceTendencies: filteredPracticeTendencies,
        snapshotCopy,
        findingsCopy,
        beliefsCopy,
        attachmentCopy,
        attachmentFamily,
        attachmentPlane,
        accelCopy,
        insecuritiesCopy,
        insecurityCueFamily,
        insecurityGraph,
        rewardCopy,
        rewardConfig,
        energyCopy,
        energyConfig,
        arousalCopy,
        arousalConfig,
        initiationCopy,
        initiationConfig,
        libidoCopy,
        libidoConfig,
        partnershipCopy,
        partnershipLoop,
        enjoyCopy,
        growthCopy,
        growthRungs,
        readingCopy,
        powerCopy,
        fantasyCopy,
        fantasyDots,
        curiosityCopy,
        relationshipFit,
        lovelangCopy,
        loveLanguageOrder,
        confidenceCopy,
        confidenceStrip,
        mapCopy,
        stageCopy,
        constellationMottos,
      })
    );
    // Personal report data — never let public proxies, browsers, or shared
    // computers cache the response. Stripe payment status, owner email, and
    // unlocked archetype lists must always come from the live origin.
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    response.headers.set("Pragma", "no-cache");
    return response;
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      logger.warn("Supabase circuit open on report lookup");
      return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
    }
    logger.error({ err }, "Error processing report request");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
