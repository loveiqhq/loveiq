/**
 * GET /api/cron/survey-paused
 *
 * Scheduled job that sends the "paused survey" email to users who started but
 * did not finish the survey. Protected by `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Windowing:
 *   - Candidate: saved_at between (now-24h) and (now-1h)
 *     — skip anything older to avoid spamming stale abandons
 *     — skip anything newer to give users time to return on their own
 *   - Must have email captured (answers["00000"])
 *   - Must have no matching survey_submission by session_id
 *   - Deduped per session via checkCooldown (30-day cooldown)
 */

import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { checkCooldown } from "@/lib/ratelimit";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { getBreaker } from "@/lib/circuit-breaker";
import logger from "@/lib/logger";
import { surveyPausedEmail } from "@/lib/emails/survey-paused";
import { surveyPausedBEmail } from "@/lib/emails/survey-paused-b";
import { pickEmailVariant } from "@/lib/emails/ab-variant";
import { buildUnsubscribeUrl } from "@/lib/emails/unsubscribe-token";
import { isEmailSuppressed } from "@/lib/emails/suppression";
import { getSurveyContactInfo } from "@/lib/survey/utils";
import type { SurveyAnswers } from "@/lib/survey/types";

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAUSE_AGE_MIN_MINUTES = 60;
const PAUSE_AGE_MAX_HOURS = 24;
const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const CANDIDATE_LIMIT = 100;

let _resend: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

interface PartialSaveRow {
  session_id: string;
  answers: Record<string, unknown> | null;
  saved_at: string;
}

async function supabaseGet(path: string) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("supabase_not_configured");

  return getBreaker("supabase").fire(() =>
    fetchWithTimeout(`${url}${path}`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      method: "GET",
      timeoutMs: 8_000,
    })
  );
}

async function fetchCandidates(): Promise<PartialSaveRow[]> {
  const now = Date.now();
  const minAgeIso = new Date(now - PAUSE_AGE_MIN_MINUTES * 60 * 1000).toISOString();
  const maxAgeIso = new Date(now - PAUSE_AGE_MAX_HOURS * 60 * 60 * 1000).toISOString();

  const path = `/rest/v1/survey_partial_save?saved_at=lte.${encodeURIComponent(minAgeIso)}&saved_at=gte.${encodeURIComponent(maxAgeIso)}&select=session_id,answers,saved_at&order=saved_at.desc&limit=${CANDIDATE_LIMIT}`;
  const response = await supabaseGet(path);
  if (!response.ok) {
    throw new Error(`survey_partial_save_query_failed:${response.status}`);
  }
  return (await response.json()) as PartialSaveRow[];
}

async function isSubmitted(sessionId: string): Promise<boolean> {
  const path = `/rest/v1/survey_submission?session_id=eq.${encodeURIComponent(sessionId)}&select=id&limit=1`;
  const response = await supabaseGet(path);
  if (!response.ok) return false;
  const rows = (await response.json()) as Array<{ id: number }>;
  return rows.length > 0;
}

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const auth = request.headers.get("authorization") || "";
  if (!safeCompare(auth, `Bearer ${expected}`)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 401 });
  }

  const resend = getResend();
  if (!resend) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://loveiq.org").replace(/\/$/, "");
  const resumeUrl = `${siteUrl}/survey`;

  const summary = {
    candidates: 0,
    sent: 0,
    skippedSubmitted: 0,
    skippedCooldown: 0,
    skippedSuppressed: 0,
    errors: 0,
  };

  try {
    const candidates = await fetchCandidates();
    summary.candidates = candidates.length;

    for (const row of candidates) {
      const answers = (row.answers ?? {}) as SurveyAnswers;
      const { email, firstName } = getSurveyContactInfo(answers);
      if (!email) continue;

      if (await isEmailSuppressed(email)) {
        summary.skippedSuppressed++;
        continue;
      }

      if (await isSubmitted(row.session_id)) {
        summary.skippedSubmitted++;
        continue;
      }

      const cooldown = await checkCooldown(row.session_id, "survey-paused-email", COOLDOWN_MS);
      if (!cooldown.allowed) {
        summary.skippedCooldown++;
        continue;
      }

      const unsubSecret = process.env.UNSUBSCRIBE_SECRET;
      const unsubscribeUrl = unsubSecret
        ? buildUnsubscribeUrl(email, siteUrl, unsubSecret)
        : undefined;

      const variant = pickEmailVariant(email, "survey-paused");
      const tpl =
        variant === "b"
          ? surveyPausedBEmail({ firstName, resumeUrl, siteUrl, unsubscribeUrl })
          : surveyPausedEmail({ firstName, resumeUrl, siteUrl, unsubscribeUrl });

      try {
        const { error } = await Promise.race([
          resend.emails.send({
            from: process.env.RESEND_FROM || "LoveIQ <hello@loveiq.org>",
            to: email,
            replyTo: process.env.RESEND_REPLY_TO || "hello@loveiq.org",
            subject: tpl.subject,
            html: tpl.html,
            text: tpl.text,
            headers: {
              "X-LoveIQ-Variant": variant,
              ...(unsubscribeUrl && {
                "List-Unsubscribe": `<${unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              }),
            },
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Resend timeout")), 8_000)
          ),
        ]);
        if (error) {
          summary.errors++;
          logger.error({ error, sessionId: row.session_id, variant }, "Paused email send failed");
        } else {
          summary.sent++;
        }
      } catch (err) {
        summary.errors++;
        logger.error({ err, sessionId: row.session_id, variant }, "Paused email error");
      }
    }

    logger.info(summary, "Survey-paused cron finished");
    return NextResponse.json({ success: true, ...summary });
  } catch (err) {
    logger.error({ err }, "Survey-paused cron failed");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
