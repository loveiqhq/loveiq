import { NextResponse, after } from "next/server";
import { z } from "zod";
import { checkRateLimit, checkCooldown, getClientIp } from "@/lib/ratelimit";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { getBreaker, CircuitOpenError } from "@/lib/circuit-breaker";
import { verifyCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";
import { scoreArchetypes, getScoringConfig } from "@/lib/scoring";
import type { ScoringResult } from "@/lib/scoring";

const surveySchema = z.object({
  email: z.string().email().max(320),
  firstName: z.string().max(80),
  answers: z.record(
    z.string(),
    z.union([
      z.string().max(1000),
      z.array(z.string().max(500)).max(20),
      z.number().int().min(1).max(7),
    ])
  ),
  startedAt: z.string().datetime(),
  durationMs: z.number().int().min(0).max(86_400_000),
  utmTracker: z.string().max(500).optional().nullable(),
  website: z.string().max(0).optional().nullable(), // honeypot
});

const RATE_LIMIT_CONFIG = {
  bucket: "survey",
  limit: 3,
  windowMs: 60_000,
};

const EMAIL_COOLDOWN_MS = 300_000; // 5 minutes

/**
 * Schedule a side-effect to run after the response is sent.
 * Uses Next.js `after()` so the serverless function stays alive.
 * Falls back to fire-and-forget in test environments.
 */
function scheduleAfterResponse(fn: () => Promise<void>): void {
  try {
    after(fn);
  } catch {
    void fn();
  }
}

const notifySlackSurvey = async ({
  email,
  firstName,
  questionCount,
  durationMs,
}: {
  email: string;
  firstName: string;
  questionCount: number;
  durationMs: number;
}) => {
  const url = process.env.SLACK_SURVEY_WEBHOOK_URL;

  if (!url) {
    logger.warn("Slack webhook missing: set SLACK_SURVEY_WEBHOOK_URL to enable survey alerts.");
    return;
  }

  const maskedEmail = email.replace(/^(.).+(@.+)$/, "$1***$2");
  const minutes = Math.round(durationMs / 60_000);
  const text = `Survey completed: *${firstName}* (${maskedEmail}) — ${questionCount} questions in ~${minutes} min`;

  try {
    logger.info({ maskedEmail }, "Sending Slack survey notification");
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, username: "survey_response" }),
      timeoutMs: 5000,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.error({ status: res.status, body }, "Slack survey webhook failed");
    } else {
      logger.info({ status: res.status }, "Slack survey webhook sent");
    }
  } catch (err) {
    logger.error({ err }, "Slack survey webhook error");
  }
};

export async function POST(request: Request) {
  // 1. CSRF verification
  const csrfValid = await verifyCsrfToken(request);
  if (!csrfValid) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  // 2. Rate limiting
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

  // 3. Validation
  const parsed = surveySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { email, firstName, answers, startedAt, durationMs, utmTracker, website } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedFirstName = firstName.trim();

  // 4. Honeypot
  if (website) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // 5. Email cooldown
  const cooldown = await checkCooldown(normalizedEmail, "survey-email", EMAIL_COOLDOWN_MS);
  if (!cooldown.allowed) {
    return NextResponse.json(
      { error: "Please wait before retrying." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(cooldown.retryAfterMs / 1000)) },
      }
    );
  }

  // 6. Supabase RPC: submit_survey
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const questionCount = Object.keys(answers).filter((k) => !k.endsWith("_other")).length;

  const rpcPayload = {
    p_email: normalizedEmail,
    p_first_name: normalizedFirstName,
    p_answers: answers,
    p_started_at: startedAt,
    p_duration_ms: durationMs,
    p_utm_tracker: utmTracker || null,
  };

  let response: Response;
  try {
    response = await getBreaker("supabase").fire(() =>
      fetchWithTimeout(`${url}/rest/v1/rpc/submit_survey`, {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(rpcPayload),
        timeoutMs: 8000,
      })
    );
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      logger.warn("Supabase circuit open on survey submission");
    } else {
      logger.error({ err }, "Supabase error on survey submission");
    }
    return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
  }

  if (!response.ok) {
    logger.error({ status: response.status }, "Supabase survey RPC failed");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }

  const rpcResult = await response.json();
  if (rpcResult?.success === false) {
    logger.error({ error: rpcResult.error }, "Survey RPC returned failure");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }

  // 7. Score the submission (pure CPU, ~5ms)
  let scoringResult: ScoringResult | null = null;
  try {
    const config = getScoringConfig();
    scoringResult = scoreArchetypes(config, answers);
    logger.info({ primaryArchetype: scoringResult.primaryArchetype }, "Survey scored");
  } catch (err) {
    logger.error({ err }, "Scoring error — submission saved without score");
  }

  // 8. Store scoring result + Slack notification (after response)
  const submissionId =
    typeof rpcResult === "number"
      ? rpcResult
      : typeof rpcResult?.submission_id === "number"
        ? rpcResult.submission_id
        : null;

  scheduleAfterResponse(async () => {
    // Store scoring result in Supabase
    if (scoringResult && submissionId && url && serviceRoleKey) {
      try {
        const storeRes = await getBreaker("supabase").fire(() =>
          fetchWithTimeout(`${url}/rest/v1/scoring_result`, {
            method: "POST",
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
              Prefer: "return=minimal",
            },
            body: JSON.stringify({
              survey_submission_id: submissionId,
              engine_version: "v3",
              primary_archetype: scoringResult.primaryArchetype,
              percentages: scoringResult.percent,
              raw_scores: scoringResult.rawScore,
              diagnostics: scoringResult.diagnostics,
            }),
            timeoutMs: 5000,
          })
        );
        if (!storeRes.ok) {
          logger.error({ status: storeRes.status }, "Failed to store scoring result");
        }
      } catch (err) {
        if (err instanceof CircuitOpenError) {
          logger.warn("Supabase circuit open on scoring result storage");
        } else {
          logger.error({ err }, "Error storing scoring result");
        }
      }
    }

    // Slack notification
    await notifySlackSurvey({
      email: normalizedEmail,
      firstName: normalizedFirstName,
      questionCount,
      durationMs,
    });
  });

  return NextResponse.json({
    success: true,
    ...(scoringResult ? { primaryArchetype: scoringResult.primaryArchetype } : {}),
  });
}
