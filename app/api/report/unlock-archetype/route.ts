/**
 * POST /api/report/unlock-archetype
 *
 * Persists a single non-primary archetype unlock onto personal_report.unlocked_archetypes.
 *
 * Beta note: While the paywall is globally disabled (NEXT_PUBLIC_DISABLE_PAYWALL=1),
 * this route grants the unlock directly. Once paywall gating is restored, the
 * checkout success path is expected to be the only writer for non-primary unlocks.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { CircuitOpenError } from "@/lib/circuit-breaker";
import logger from "@/lib/logger";
import {
  addUnlockedArchetypeForSubmission,
  resolveSubmissionAccessContext,
  getReportAccessPlanForSubmission,
  resolveUnlockedArchetypes,
} from "@/lib/report/personalReport";
import { KNOWN_ARCHETYPES } from "@/lib/report/archetypeSlug";

const RATE_LIMIT_CONFIG = {
  bucket: "report-unlock-archetype",
  limit: 20,
  windowMs: 60_000,
};

const bodySchema = z
  .object({
    archetype: z.enum(KNOWN_ARCHETYPES as unknown as [string, ...string[]]),
    sessionId: z.string().uuid().optional(),
    token: z
      .string()
      .regex(/^rpt_[a-zA-Z0-9]{20}$/)
      .optional(),
  })
  .refine((v) => !!v.token || !!v.sessionId, {
    message: "token or sessionId is required",
  });

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

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // Gate on beta flag. Once real paywall is restored this route should only be
  // invoked by trusted server-side checkout handlers, not from the browser.
  const betaUnlockAllowed = process.env.NEXT_PUBLIC_DISABLE_PAYWALL === "1";
  if (!betaUnlockAllowed) {
    return NextResponse.json({ error: "Payment required." }, { status: 402 });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  try {
    const context = await resolveSubmissionAccessContext({
      reportSessionId: parsed.data.sessionId ?? null,
      reportToken: parsed.data.token ?? null,
    });

    if (!context) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }

    const columnValues = await addUnlockedArchetypeForSubmission({
      archetype: parsed.data.archetype,
      submissionId: context.submissionId,
    });

    const access = await getReportAccessPlanForSubmission(context.submissionId);
    const unlockedArchetypes = resolveUnlockedArchetypes({
      accessPlan: access.accessPlan,
      columnValues,
      // Primary archetype cannot be derived here without the scoring lookup;
      // callers receive the column-derived list. ReportPage layers primary in
      // on the client too.
      primaryArchetype: "",
    });

    return NextResponse.json({ unlockedArchetypes });
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      logger.warn("Supabase circuit open on unlock-archetype");
      return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
    }
    logger.error({ err }, "Error processing unlock-archetype");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
