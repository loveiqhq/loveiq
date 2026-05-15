import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { getBreaker, CircuitOpenError } from "@shared/http/circuit-breaker";
import { verifyCsrfToken } from "@shared/http/csrf";
import { reportSections } from "@/data/report-general";
import { resolveSubmissionAccessContext } from "@features/report/server/personalReport";
import { REPORT_ACCESS_TOKEN_REGEX } from "@features/checkout/server/reportPurchase";
import logger from "@shared/observability/logger";

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

  const row: Record<string, string | number | null> = {
    section_id: parsed.data.sectionId,
    feedback: parsed.data.feedback,
    survey_submission_id: submissionId,
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

  return NextResponse.json({ success: true });
}
