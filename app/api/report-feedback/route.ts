import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { scheduleAfterResponse } from "@shared/http/after-response";
import { getBreaker, CircuitOpenError } from "@shared/http/circuit-breaker";
import { verifyCsrfToken } from "@shared/http/csrf";
import { reportSections } from "@/data/report-general";
import { resolveReportNavTitle } from "@features/report/sectionTitles";
import { resolveSubmissionAccessContext } from "@features/report/server/personalReport";
import { REPORT_ACCESS_TOKEN_REGEX } from "@features/checkout/server/reportPurchase";
import logger from "@shared/observability/logger";
import { notifySlack } from "@shared/observability/slack";

// Whitelist sectionId against the canonical section list. Without this
// allowlist, an attacker can pollute the feedback table with fictional
// section IDs ("premium_unlocked", "secret_archetype", etc.) and use the
// endpoint to enumerate or fingerprint internal section names.
const VALID_SECTION_IDS = new Set<string>(reportSections.map((section) => section.id));

// Either sessionId or token must be present. Both are accepted so feedback
// captures even when the survey session UUID is no longer in browser storage
// (e.g. user clicks the report link from an email on a different device).
const schema = z
  .object({
    sessionId: z.string().uuid().optional(),
    token: z.string().regex(REPORT_ACCESS_TOKEN_REGEX).optional(),
    sectionId: z
      .string()
      .min(1)
      .max(200)
      .refine((id) => VALID_SECTION_IDS.has(id), { message: "unknown_section" }),
    feedback: z.enum(["up", "down"]),
    comment: z.string().max(1000).optional(),
    issue: z.string().max(100).optional(),
  })
  .refine((value) => Boolean(value.sessionId || value.token), {
    message: "sessionId_or_token_required",
  });

const RATE_LIMIT_CONFIG = {
  bucket: "report-feedback",
  limit: 60,
  windowMs: 60_000,
};

const SECTION_BY_ID = new Map(reportSections.map((section) => [section.id, section]));

function maskEmail(email: string): string {
  return email.replace(/^(.).+(@.+)$/, "$1***$2");
}

// Slack treats `&<>*_~``` as formatting characters. Escape so user-supplied
// strings render literally and can't break the message layout.
function escapeSlack(value: string): string {
  return value.replace(/[&<>*_~`]/g, (c) => `\\${c}`);
}

async function lookupFeedbackRecipient(
  supabaseUrl: string,
  serviceRoleKey: string,
  submissionId: number
): Promise<{ email: string | null; archetype: string | null }> {
  const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };

  const [submissionRes, scoringRes] = await Promise.all([
    fetchWithTimeout(
      `${supabaseUrl}/rest/v1/survey_submission?id=eq.${submissionId}&select=app_user!fk_survey_submission_user(email)&limit=1`,
      { headers, timeoutMs: 3000 }
    ).catch(() => null),
    fetchWithTimeout(
      `${supabaseUrl}/rest/v1/scoring_result?survey_submission_id=eq.${submissionId}&select=primary_archetype,v5_primary_archetype&limit=1`,
      { headers, timeoutMs: 3000 }
    ).catch(() => null),
  ]);

  let email: string | null = null;
  if (submissionRes && submissionRes.ok) {
    const rows = (await submissionRes.json().catch(() => [])) as Array<{
      app_user?: { email?: string | null } | null;
    }>;
    email = rows[0]?.app_user?.email ?? null;
  }

  // Prefer V5 — it's the archetype the user actually sees on /report/[token].
  // V4 (`primary_archetype`) is kept as fallback for older submissions only.
  let archetype: string | null = null;
  if (scoringRes && scoringRes.ok) {
    const rows = (await scoringRes.json().catch(() => [])) as Array<{
      primary_archetype?: string | null;
      v5_primary_archetype?: string | null;
    }>;
    archetype = rows[0]?.v5_primary_archetype ?? rows[0]?.primary_archetype ?? null;
  }

  return { email, archetype };
}

async function notifySlackReportFeedback(input: {
  supabaseUrl: string;
  serviceRoleKey: string;
  submissionId: number;
  sectionId: string;
  feedback: "up" | "down";
  comment: string | null;
  issue: string | null;
}): Promise<void> {
  const webhookUrl = process.env.SLACK_SURVEY_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.warn(
      { submissionId: input.submissionId, sectionId: input.sectionId },
      "Slack webhook missing: set SLACK_SURVEY_WEBHOOK_URL to enable report-feedback alerts."
    );
    return;
  }

  const { email, archetype } = await lookupFeedbackRecipient(
    input.supabaseUrl,
    input.serviceRoleKey,
    input.submissionId
  );

  const section = SECTION_BY_ID.get(input.sectionId);
  const chapterName = section
    ? resolveReportNavTitle(section, archetype ?? "your archetype")
    : input.sectionId;

  const emoji = input.feedback === "up" ? ":thumbsup:" : ":thumbsdown:";
  // Domain part of the email is interpolated verbatim — escape so a value like
  // `j***@a&b.com` can't inject Slack formatting.
  const maskedEmail = email ? escapeSlack(maskEmail(email)) : "no-email";
  const archetypeSuffix = archetype ? ` (${escapeSlack(archetype)})` : "";

  const lines = [
    `:book: Report feedback — ${emoji} *${escapeSlack(chapterName)}*`,
    `• From: ${maskedEmail}${archetypeSuffix}`,
  ];
  if (input.issue) {
    lines.push(`• Issue: ${escapeSlack(input.issue)}`);
  }
  if (input.comment) {
    const trimmed = input.comment.length > 200 ? `${input.comment.slice(0, 200)}…` : input.comment;
    lines.push(`• Comment: "${escapeSlack(trimmed)}"`);
  }

  try {
    const res = await fetchWithTimeout(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: lines.join("\n"), username: "report_feedback" }),
      timeoutMs: 5000,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.error(
        { status: res.status, body, submissionId: input.submissionId },
        "Slack report-feedback webhook failed"
      );
    }
  } catch (err) {
    logger.error({ err, submissionId: input.submissionId }, "Slack report-feedback webhook error");
  }

  // Second ping: route every 👎 (and any feedback that carries an issue
  // category or written comment) into the ops channel for product triage.
  // The survey-channel ping above is the audit trail; this one is the
  // "needs attention" signal. Must be awaited so scheduleAfterResponse
  // keeps the sandbox alive until the POST completes.
  const opsWorthy = input.feedback === "down" || Boolean(input.issue) || Boolean(input.comment);
  if (opsWorthy) {
    await notifySlack({
      channel: "ops",
      kind: "report_feedback_negative",
      text: lines.join("\n"),
      username: "ops_alerts",
    });
  }
}

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const ip = getClientIp(request);
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

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  // Resolve submission_id + user_id from whichever identifier the client sent.
  // We always persist these so feedback joins to the user even if session
  // storage was cleared between survey submission and report viewing.
  let submissionId: number | null = null;
  let userId: number | null = null;
  try {
    const context = await resolveSubmissionAccessContext({
      reportSessionId: parsed.data.sessionId ?? null,
      reportToken: parsed.data.token ?? null,
    });
    submissionId = context?.submissionId ?? null;
    userId = context?.userId ?? null;
  } catch (err) {
    logger.warn({ err }, "Unable to resolve submission context for report feedback");
  }

  // Without a survey_submission_id the row would be orphaned (no path back to
  // a user). Refuse rather than silently dropping the click.
  if (!submissionId) {
    return NextResponse.json({ error: "Unknown report context." }, { status: 400 });
  }

  // Pin the narrowed value into a const so the after-response closure can't
  // see a future re-assignment of the outer `let` binding.
  const resolvedSubmissionId: number = submissionId;

  const row: Record<string, string | number | null> = {
    section_id: parsed.data.sectionId,
    feedback: parsed.data.feedback,
    survey_submission_id: resolvedSubmissionId,
    user_id: userId,
    session_id: parsed.data.sessionId ?? null,
  };
  if (parsed.data.comment) row.comment = parsed.data.comment;
  if (parsed.data.issue) row.issue = parsed.data.issue;

  try {
    // on_conflict targets the new partial unique index on
    // (survey_submission_id, section_id) so a user clicking up→down on
    // the same section overwrites cleanly.
    // eslint-disable-next-line no-secrets/no-secrets -- REST URL, not a credential
    const upsertUrl = `${url}/rest/v1/report_section_feedback?on_conflict=survey_submission_id,section_id`;
    const response = await getBreaker("supabase-tracking").fire(() =>
      fetchWithTimeout(upsertUrl, {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(row),
        timeoutMs: 5000,
      })
    );

    if (!response.ok) {
      logger.error({ status: response.status }, "Supabase report feedback upsert failed");
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      logger.warn("Supabase-tracking circuit open (report-feedback)");
    } else {
      logger.error({ err }, "Supabase error on report feedback");
    }
    return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
  }

  scheduleAfterResponse("report-feedback-slack-notification", () =>
    notifySlackReportFeedback({
      supabaseUrl: url,
      serviceRoleKey,
      submissionId: resolvedSubmissionId,
      sectionId: parsed.data.sectionId,
      feedback: parsed.data.feedback,
      comment: parsed.data.comment ?? null,
      issue: parsed.data.issue ?? null,
    })
  );

  return NextResponse.json({ success: true });
}
