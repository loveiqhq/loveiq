import { NextResponse } from "next/server";
import { z } from "zod";
import { scheduleAfterResponse } from "@shared/http/after-response";
import { isProbeRequest } from "@shared/http/probe-cookie";
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
import { refreshJourneyMessage } from "@features/attribution/server/journey-message";
import {
  buildArchetypeContentForUser,
  buildPracticeTendenciesForUser,
  stripLockedEduBodyFromPayload,
} from "@features/report/server/contentGating";
import { getReport2Section } from "@/data/report2";
import { buildTypicalBeliefs } from "@/data/report3-typical-beliefs";
import { buildAccelerators } from "@/data/report3-accelerators";
import { buildPartnership } from "@/data/report3-partnership";
import { buildFantasy } from "@/data/report3-fantasy";
import { REPORT_V4_LEARN_MORE } from "@/data/report3-learn-more";
import { splitArticleForReader } from "@features/report/server/contentGating";
import { isSectionUnlockedForPlan } from "@features/report/server/access";
import { buildPartnershipCopy } from "@features/report/server/partnershipCopy";
import { buildFantasyCopy } from "@features/report/server/fantasyCopy";
import { buildReport2ChapterCopies } from "@features/report/server/report2ChapterCopies";
import logger from "@shared/observability/logger";
import { notifySlack, escapeSlack } from "@shared/observability/slack";
import type { ReportPriceQuotes } from "@features/pricing/logic/reportPricing";
import {
  REPORT_SHARE_TOKEN_REGEX,
  markShareViewed,
  resolveShareFromToken,
} from "@features/report/server/shareAccess";
import { maskEmail, verifyCookieForShare } from "@features/report/server/shareVerify";
import { fromArchetypeSlug, KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";

const sessionIdSchema = z.object({
  pricingSessionId: z.string().uuid().optional(),
  sessionId: z.string().uuid(),
});

const tokenSchema = z.object({
  pricingSessionId: z.string().uuid().optional(),
  token: z.string().regex(/^(rpt_[a-zA-Z0-9]{20}|rpts_[A-Za-z0-9]{20})$/),
});

/**
 * Per IP. It was 10, and every archetype a reader switches to is a fetch, so an
 * all-reports buyer looking through their 14 got "Too many attempts" on the 11th within
 * a minute, as did people sharing one address (a mobile carrier's, an office's). The
 * links are 20 random characters, so the limit guards load, not guessing.
 */
const RATE_LIMIT_CONFIG = {
  bucket: "report-view",
  limit: 60,
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

type ReportPricingQuotesResponse = ReportPriceQuotes | null;

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
  // Report V4's chapters travel only to the V4 page, which says so (`v4=1`, sent by
  // useReportData). Every other version draws none of them, and since review 26.09 a
  // locked reader's copy of them is the real one under the blur (lockedBlurCopy.ts),
  // so building them for every request handed the default report's locked readers
  // paid copy they are never shown (final review, 26.09).
  const isV4Request = url.searchParams.get("v4") === "1";
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
    // The strongest plan across EVERY payment, whichever archetype it was for: "has bought
    // anything". Gates the Findings and, on the client, every pay-screen auto-open.
    let purchasedPlan: "essentials" | "full_report" | "core" | "all_reports" | null = null;
    let pricingQuotes: ReportPricingQuotesResponse = null;
    let unlockedArchetypeColumn: string[] = [];
    let archetypeTiersFromDb: Record<string, "essentials" | "full_report"> = {};

    /**
     * Kicked off here rather than awaited at its use site below, so it overlaps
     * the access-plan round trips instead of adding another one after them. The
     * flag is independent of everything in this block. Share viewers keep their
     * curated view regardless, so they never need it and never pay for it.
     */
    const paywallEnforcedPromise = isShareAccess
      ? null
      : isFeatureEnabled("report_paywall_enforced", true).catch(() => true);

    try {
      // `ensure` reads the personal_report row and returns it; handing that row
      // to the access-plan lookup below saves it re-reading the same row.
      const ensuredReport = await ensurePersonalReportForSubmission({
        reportToken: tokenParsed?.success ? tokenParsed.data.token : null,
        submissionId: submission.id,
      });

      // Scoped to the reader's own archetype: every gate below that falls back to
      // `accessPlan` is gating THAT report, so a single report bought for another
      // archetype must not open it (it opens its own archetype via the tiers).
      const access = await getReportAccessPlanForSubmission(
        submission.id,
        ensuredReport,
        scoring.v5_primary_archetype || scoring.primary_archetype
      );
      accessPlan = access.accessPlan;
      purchasedPlan = access.anyPlan;
      unlockedArchetypeColumn = access.unlockedArchetypeColumn ?? [];
      archetypeTiersFromDb = access.archetypeTiers ?? {};

      /**
       * A PROBE IS NOT A READER.
       *
       * scripts/probes/ opens `/report/<token>` on every CI run and the server
       * records a row per open. Measured 2026-09-21: 73% of `report_session`
       * over 30 days is internal traffic, 1,505 rows of it on the one report
       * the probes hammer, and the share is climbing — 52% all time, 63% over
       * 90 days, 73% over 30 — as this pipeline runs more often. Eight admin
       * routes read that table for retention, journey, flow and embed
       * performance and none of them filter, so those dashboards are computed
       * over data that is now mostly robots.
       *
       * The probes cannot be spotted any other way: they emulate real devices,
       * so the user agent is a real phone's by design, and the account is no
       * help because the team genuinely reads its own reports in a real browser
       * — that IS a visit. So they say so, in a cookie set by the one helper 27
       * of the 34 already share.
       *
       * Everything else on this request is unaffected: the report renders, the
       * access plan resolves, the Slack journey still advances. Only the
       * telemetry row is skipped.
       */
      // Read off the raw Cookie header: this handler takes a plain `Request`,
      // which has no `cookies` accessor.
      const isProbe = isProbeRequest(request.headers.get("cookie"));
      if (isProbe) {
        logger.info({ path: "/api/report" }, "probe request — report_session row skipped");
      }

      if (isProbe) {
        // no row
      } else if (access.personalReportId && !accessPlan) {
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

      // Advance the Slack journey message now that the report has actually been
      // opened. report_session is the server-side truth here — analytics_event's
      // report_viewed sits behind the consent gate and undercounts it by ~31%.
      // After-response and self-skipping, so a re-read costs nothing.
      if (access.personalReportId) {
        scheduleAfterResponse("journey-message-report-open", async () => {
          await refreshJourneyMessage(submission.id, "report_opened");
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
    if (paywallEnforcedPromise && !(await paywallEnforcedPromise)) {
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

    /**
     * The archetype whose Report 2.0 copy this payload carries.
     *
     * Every `getReport2Section` / `getReport2Config` lookup below used to be
     * keyed to `primaryArchetype`, and the client — knowing the payload could
     * only describe the primary — passed `null` for every section when the
     * reader was viewing a different one. So a `core` buyer (top 3) or an
     * `all_reports` buyer (all 14) who followed one of the other archetype
     * links in their email got the section shells, the feedback widgets and
     * nothing in between: a blank report for something they had paid for.
     * The copy for all 14 archetypes has always existed in `report2-copy.ts`;
     * only the archetype to resolve it for was missing.
     *
     * Validated against the unlocked set HERE rather than trusted from the
     * query string, so asking for an archetype you have not bought falls back
     * to your primary instead of handing over another archetype's premium copy.
     */
    const requestedArchetype = fromArchetypeSlug(url.searchParams.get("archetype"));
    const contentArchetype =
      requestedArchetype && unlockedArchetypes.includes(requestedArchetype)
        ? requestedArchetype
        : primaryArchetype;
    /**
     * The tier the reader holds for the archetype they are actually viewing.
     * Passing this is what makes per-archetype gating work: without it every
     * call below fell back to the global `accessPlan`, which does not describe
     * a per-archetype purchase at all.
     */
    // eslint-disable-next-line security/detect-object-injection -- contentArchetype is a validated KNOWN_ARCHETYPES name, never raw user input.
    const contentArchetypeTier = archetypeTiers[contentArchetype] ?? null;

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
    /**
     * Part I stays keyed to the reader's PRIMARY archetype even when they are
     * browsing another one. These four sections describe the reader — their
     * findings, their insight map, their sexual stage, their comparison stats —
     * not a Part II archetype chapter, so switching them would replace the
     * reader's own values with the browsed archetype's. Pre-existing product
     * decision, pinned by features/report/tests/ReportPage.archetypeHandoff.test.ts;
     * revisit all four together if the browse view should describe the browsed
     * archetype end to end.
     */
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
    // Any purchase, not only the reader's own report: a single report bought for another
    // archetype still opens the reader's own findings, as it always did.
    const findingsUnlocked = accessPlan !== null || purchasedPlan !== null;
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
    const beliefsSection = getReport2Section(contentArchetype, "beliefs");
    const beliefsUnlocked = isSectionUnlockedForPlan({
      accessPlan,
      archetypeTier: contentArchetypeTier,
      isPremium: true,
      sectionId: "typical_beliefs",
    });
    /**
     * A locked client receives only the FIRST FEW rows.
     *
     * Shipping the whole list and fading it made the entire chapter legible — the
     * fade is gentle enough that all nine keeps and ten loosens could be read, so
     * there was nothing left to buy. FIVE keeps and THREE loosens as of 2026-08-20,
     * because the rows past them no longer come from here at all: the column
     * carries `beliefs-keep` / `beliefs-loosen`, build-time rasters of the real
     * remaining rows whose pixels were blurred and quarter-scaled before they ever
     * left the build machine (see scripts/generate-locked-previews.mjs). The
     * chapter therefore stands at its true length — nine keeps, ten loosens — with
     * only these rows actually in the payload. More than two per column so the blur
     * can COME ON GRADUALLY in live text (the last two rows of each column carry
     * 1.2px and 2.6px) and the raster picks up where heavy blur already looks
     * natural; starting the image earlier put a visible seam between sharp text and
     * a fully blurred block.
     *
     * The counts DIFFER per column on purpose. A keep row is one line (51px at
     * 1440); a loosen row carries its THE SHIFT reframe underneath (111px). Four
     * and four therefore started the blur 214px lower in the loosen column than in
     * the keep column — a stepped edge across the card. Five and three land the two
     * bands within ~30px at every desktop width, and the columns share grid row
     * tracks (see .report-beliefs__cols in globals.css) so the rasters begin on one
     * straight line.
     *
     * `keepRows` in COLUMN_CAPTURES must match these numbers per column, or the
     * sharp rows and the image will either double up or skip a row.
     *
     * This is the real boundary: strip every filter in devtools and there is
     * nothing past these rows in the DOM. `body.p1`, the per-archetype closing
     * paragraph, stays withheld as well.
     */
    const BELIEFS_TEASER_KEEP_ROWS = 5;
    const BELIEFS_TEASER_LOOSEN_ROWS = 3;
    const BELIEFS_KEEP_ROWS = 9;
    const BELIEFS_LOOSEN_ROWS = 10;
    const beliefsKeep: (string | null)[] = Array.from(
      { length: beliefsUnlocked ? BELIEFS_KEEP_ROWS : BELIEFS_TEASER_KEEP_ROWS },
      (_, i) => beliefsSection[`keep.${i + 1}`] ?? null
    );
    const beliefsLoosen = Array.from(
      { length: beliefsUnlocked ? BELIEFS_LOOSEN_ROWS : BELIEFS_TEASER_LOOSEN_ROWS },
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

    /**
     * Report 3.0's Typical Beliefs chapter — Figma 304:256, and 348:213 locked.
     *
     * Rides beside beliefsCopy rather than replacing it, because `?v4=1` is a COPY
     * of V2 and every section it does not swap still renders V2's. This is NULL for
     * any archetype Mark and Sanjin have not written yet, which is the signal
     * ReportPage falls back on, so no reader ever meets an empty chapter. Since 02.10
     * every known archetype has it (data/report3-copy); the fallback is for a name
     * with no V4 copy.
     *
     * Same gate as beliefsCopy, so the chapter body and the "Go deeper" article
     * below it can never disagree about who has paid. Locked readers receive the
     * first three turns in full and the remaining seven WITHOUT their shift, and
     * everything they only ever see under the full blur — rows 5-10, and the prose
     * past each ramp — as lockedBlurCopy.ts decides: the copy itself since review
     * 26.09, scrambled in decoy mode. See buildTypicalBeliefs. Built for the V4 page
     * only (isV4Request).
     */
    const typicalBeliefs = isV4Request
      ? buildTypicalBeliefs(contentArchetype, { locked: !beliefsUnlocked })
      : null;

    /**
     * The "Go deeper & learn more" article that closes the same chapter — Figma
     * 153:2260, and 153:2280 locked.
     *
     * Gated on `beliefsUnlocked` like the chapter above it rather than through
     * isLearnMoreArticleLocked, because that helper resolves the identical
     * typical_beliefs section and this way the two cannot drift apart. A locked
     * reader gets only the paid blocks the gated window (LOCKED_ARTICLE_WINDOW_PX)
     * can show; the rest never leaves here.
     *
     * The article itself is archetype-agnostic, but it ships only alongside the
     * chapter it belongs to — see the swap in ReportPage. Half a redesigned
     * chapter under V2's section would read worse than either on its own.
     */
    const typicalBeliefsArticle =
      isV4Request && REPORT_V4_LEARN_MORE.typical_beliefs
        ? {
            article: splitArticleForReader(REPORT_V4_LEARN_MORE.typical_beliefs, !beliefsUnlocked),
            locked: !beliefsUnlocked,
          }
        : null;

    // Report 2.0's chapters, Attachment Style through Confidence Level: their copy and
    // chart configs, through one builder the staging preview route shares
    // (report2ChapterCopies.ts), so a preview gates every chapter exactly as this route
    // does. Each gate is asked for the tier held for the archetype on screen.
    const unlockedChapter = (sectionId: string) =>
      isSectionUnlockedForPlan({
        accessPlan,
        archetypeTier: contentArchetypeTier,
        isPremium: true,
        sectionId,
      });
    const {
      attachmentCopy,
      attachmentFamily,
      attachmentPlane,
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
      enjoyCopy,
      growthCopy,
      growthRungs,
      readingCopy,
      powerCopy,
      curiosityCopy,
      relationshipFit,
      lovelangCopy,
      loveLanguageOrder,
      confidenceCopy,
      confidenceStrip,
    } = buildReport2ChapterCopies(contentArchetype, unlockedChapter);

    // Report 2.0 Accelerators & Brakes section copy — a Part II, essentials-tier
    // PREMIUM section. The educational slots (`edu.*`, `learn.*`)
    // are universal and always shipped. `takeaway` is the ONLY per-archetype
    // slot (a single verdict sentence whose polarity flips per archetype) — the
    // gated content: shipped ONLY when the report is unlocked at the essentials
    // tier (or above). A locked client NEVER receives it. Shared viewers inherit
    // the owner's plan via `accessPlan`. Keyed to the primary archetype.
    const accelSection = getReport2Section(contentArchetype, "accel");
    const accelUnlocked = isSectionUnlockedForPlan({
      accessPlan,
      archetypeTier: contentArchetypeTier,
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

    /**
     * Report 3.0's Accelerator & Brakes chapter — Figma 310:221, and 314:211 locked.
     *
     * Rides beside accelCopy rather than replacing it, as typicalBeliefs rides beside
     * beliefsCopy: `?v4=1` is a copy of V2, and this is NULL for any archetype whose
     * chapter is not written yet, which is the signal ReportPage keeps V2's section
     * on. Same gate as accelCopy. A locked reader receives rows 1-2 of each card, the
     * intro and the free paragraphs verbatim, row 3 (the ramp) and each ramp
     * paragraph through its fade band as written, and everything past them as
     * lockedBlurCopy.ts decides (the copy itself since review 26.09, scrambled in decoy
     * mode) — see buildAccelerators. Built for the V4 page only (isV4Request).
     */
    const accelerators = isV4Request
      ? buildAccelerators(contentArchetype, { locked: !accelUnlocked })
      : null;

    /**
     * The "Go deeper & learn more" article closing the same chapter — Figma 235:254,
     * and 235:317 locked. Gated on `accelUnlocked` like the chapter, so the two can
     * never disagree about who has paid, and shipped only alongside the chapter it
     * belongs to, so a report that falls back to V2's section (a name with no V4 copy)
     * carries none of it.
     */
    const acceleratorsArticle =
      accelerators &&
      REPORT_V4_LEARN_MORE.typical_arousal_accelerators_turn_ons_of_the_core_archetype
        ? {
            article: splitArticleForReader(
              REPORT_V4_LEARN_MORE.typical_arousal_accelerators_turn_ons_of_the_core_archetype,
              !accelUnlocked
            ),
            locked: !accelUnlocked,
          }
        : null;

    // Report 2.0 "Challenges in Partnership" section copy and its loop — Libido's
    // full-report gate (the section has no row of its own in report-general.ts).
    // The helper's own doc says what a locked reader receives; the staging preview
    // route builds the copy through it too. Shared viewers inherit the owner's plan.
    // Keyed to the content archetype.
    const partnershipUnlocked = unlockedChapter("libido_challenges_in_relationships");
    const { partnershipCopy, partnershipLoop } = buildPartnershipCopy(
      contentArchetype,
      partnershipUnlocked
    );

    /**
     * Report 3.0's Challenges in Partnerships chapter — Figma 38:1672, and 305:350
     * locked. Rides beside partnershipCopy as `accelerators` rides beside accelCopy:
     * NULL for any archetype whose chapter is not written yet, which is the signal
     * ReportPage keeps V2's section on. Same gate as partnershipCopy. A locked reader
     * of Spark Seeker's (another archetype's wall sits at its own cuts) receives
     * paragraphs 1-4 and the practice's opening verbatim, paragraph 5 as
     * written through its fade band, and everything past it — the loop and the result
     * included — as lockedBlurCopy.ts decides (the copy itself since review 26.09,
     * scrambled in decoy mode); see buildPartnership. Built for the V4 page only.
     */
    const partnership = isV4Request
      ? buildPartnership(contentArchetype, { locked: !partnershipUnlocked })
      : null;

    // Report 2.0 Fantasy ("Fantasy vs. Reality") section copy and map dots — section
    // 27, full report only. The helper's own doc says what a locked reader receives;
    // the staging preview route builds the copy through it too. Shared viewers
    // inherit the owner's plan via `accessPlan`. Keyed to the content archetype.
    const fantasyUnlocked = isSectionUnlockedForPlan({
      accessPlan,
      archetypeTier: contentArchetypeTier,
      isPremium: true,
      sectionId: "typical_sexual_fantasy_amp_practice_tendencies",
    });
    const { fantasyCopy, fantasyDots } = buildFantasyCopy(contentArchetype, fantasyUnlocked);

    /**
     * Report 3.0's Fantasy vs. Reality chapter — Figma 304:281, and 305:217 locked.
     * Rides beside fantasyCopy as `partnership` rides beside partnershipCopy: NULL for
     * any archetype whose chapter is not written yet, which is the signal ReportPage
     * keeps V2's section on. Same gate as fantasyCopy. A locked reader receives the
     * intro, three rows of the first three table categories and practice paragraphs
     * 1-4 verbatim; the drawn rows past them, "Common challenges" and the rest of the
     * practice as lockedBlurCopy.ts decides — the copy (rows with their scores, and the
     * map's dots) since review 26.09, stand-ins with no scores in decoy mode — see
     * buildFantasy. Built for the V4 page only (isV4Request).
     */
    const fantasy = isV4Request
      ? buildFantasy(contentArchetype, { locked: !fantasyUnlocked })
      : null;

    /**
     * The "Go deeper & learn more" article closing the same chapter — Figma 244:258,
     * and 482:6479 locked. Gated on `fantasyUnlocked` like the chapter, so the two can
     * never disagree about who has paid, and shipped only alongside the chapter it
     * belongs to, so a report that falls back to V2's section (a name with no V4 copy)
     * carries none of it.
     */
    const fantasyArticle =
      fantasy && REPORT_V4_LEARN_MORE.typical_sexual_fantasy_amp_practice_tendencies
        ? {
            article: splitArticleForReader(
              REPORT_V4_LEARN_MORE.typical_sexual_fantasy_amp_practice_tendencies,
              !fantasyUnlocked
            ),
            locked: !fantasyUnlocked,
          }
        : null;

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

    // Every section copy goes out through one gate: on a locked section the
    // "Learn:" body paragraphs come off the wire entirely, so the peek→expand
    // control has nothing to reveal to a reader who hasn't bought.
    const response = NextResponse.json(
      stripLockedEduBodyFromPayload({
        submissionId: submission.id,
        accessPlan,
        // A recipient never pays, so they get null and every auto-open stays off for them.
        purchasedPlan: isShareAccess ? null : purchasedPlan,
        userName: getSubmissionUserName(submission),
        userEmail: isShareAccess ? null : getSubmissionUserEmail(submission),
        ownerFirstName: isShareAccess ? getSubmissionUserName(submission) : null,
        ownerToken,
        viewMode: isShareAccess ? ("shared" as const) : ("owner" as const),
        primaryArchetype,
        contentArchetype,
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
        typicalBeliefs,
        typicalBeliefsArticle,
        attachmentCopy,
        attachmentFamily,
        attachmentPlane,
        accelCopy,
        accelerators,
        acceleratorsArticle,
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
        partnership,
        enjoyCopy,
        growthCopy,
        growthRungs,
        readingCopy,
        powerCopy,
        fantasyCopy,
        fantasyDots,
        fantasy,
        fantasyArticle,
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
