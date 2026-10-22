import { NextResponse } from "next/server";
import { z } from "zod";

import { apGuard, NO_STORE } from "@features/admin/server/ap/route-guard";
import { supabaseFetch } from "@features/admin/server/supabase";
import { SUBJECT_ARMS } from "@features/unlock-feedback/logic/subjects";
import type { CandidateRow } from "@features/unlock-feedback/logic/audience";
import {
  claimAndSend,
  eligibility,
  fetchCandidateForSubmission,
  fetchCandidatesBefore,
  getResend,
  type Eligible,
  type SendContext,
} from "@features/unlock-feedback/server/send";
import { getEmailSiteUrl } from "@shared/emails/site-url";
import { isStaffEmail } from "@shared/env/staff-email";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

/**
 * POST /api/admin/ap/unlock-feedback/send: the admin's two buttons on AP-Analytics › Unlock
 * feedback, by the hourly cron's own rules (features/unlock-feedback/server/send.ts).
 *
 * - `test`: the email, with the chosen subject, to the admin's own newest report that is
 *   unpaid and opened, so its links run the real /why and free unlock on a team report. A
 *   second test replaces the first row, so only the newest test's links work.
 * - `tranche`: the newest readers whose report is at least three hours old and who never had
 *   it (Mark and Eman, 22.10: the first 250). `dryRun` counts who would get it and sends
 *   nothing; the real send must be confirmed with the words "send <size>". Each call works
 *   for about 40 seconds and says where it stopped (`nextBefore`); the page calls again until
 *   `done`. The batch's count is read from the table, so a call that dies loses nothing and
 *   never sends to anyone twice; a dry run passes on what it `counted` so far.
 *
 * Admins only, CSRF and rate limited; every call is in the admin audit log before it sends.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TRANCHE_AGE_MS = 3 * 60 * 60 * 1000;
const BUDGET_MS = 40_000;
const PAGE = 50;

const BODY = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("test"), arm: z.enum(SUBJECT_ARMS).default("A") }),
  z.object({
    mode: z.literal("tranche"),
    batch: z.string().regex(/^[a-z0-9_-]{1,40}$/),
    size: z.number().int().min(1).max(500),
    dryRun: z.boolean(),
    before: z.string().datetime({ offset: true }).optional(),
    /** A dry run's readers counted by its earlier calls. */
    counted: z.number().int().min(0).max(500).default(0),
    confirm: z.string().max(40).optional(),
  }),
]);

type Body = z.infer<typeof BODY>;

async function audit(
  adminEmail: string,
  request: Request,
  body: Body,
  resourceId: string
): Promise<void> {
  const res = await supabaseFetch("/rest/v1/admin_audit_log", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      admin_email: adminEmail,
      action: body.mode === "test" ? "unlock_feedback_test" : "unlock_feedback_tranche",
      resource_type: "unlock_feedback",
      resource_id: resourceId,
      metadata: body,
      ip: getClientIp(request),
    }),
  });
  if (!res.ok) throw new Error(`audit log ${res.status}`);
}

/** The admin's newest report that is unpaid and opened, or null. */
async function ownTestReport(
  adminEmail: string
): Promise<{ row: CandidateRow; eligible: Eligible } | null> {
  const res = await supabaseFetch(
    `/rest/v1/survey_submission?select=id,app_user!fk_survey_submission_user!inner(email)` +
      `&app_user.email=eq.${encodeURIComponent(adminEmail.trim().toLowerCase())}&order=id.desc&limit=20`
  );
  if (!res.ok) throw new Error(`own_submissions_failed:${res.status}`);
  for (const { id } of (await res.json()) as Array<{ id: number }>) {
    const row = await fetchCandidateForSubmission(id);
    if (!row) continue;
    const eligible = await eligibility(row, { staffTest: true });
    if (!("skip" in eligible)) return { row, eligible };
  }
  return null;
}

async function batchSent(batch: string): Promise<number> {
  const res = await supabaseFetch(
    `/rest/v1/unlock_feedback?send_batch=eq.${encodeURIComponent(batch)}&sent_at=not.is.null&select=id&limit=1000`
  );
  if (!res.ok) throw new Error(`batch_count_failed:${res.status}`);
  return ((await res.json()) as unknown[]).length;
}

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  const rate = await checkRateLimit(getClientIp(request), {
    bucket: "admin-ap-unlock-feedback-send",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  const admin = await apGuard(request, { role: "admin", write: true });
  if (admin instanceof NextResponse) return admin;
  const parsed = BODY.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  const body = parsed.data;

  const resend = getResend();
  const unsubSecret = process.env.UNSUBSCRIBE_SECRET;
  if (!resend || !unsubSecret) {
    return NextResponse.json({ error: "Email is not configured here." }, { status: 503 });
  }
  const ctx: SendContext = { resend, siteUrl: getEmailSiteUrl(), unsubSecret };

  try {
    if (body.mode === "test") {
      // A test goes only to a team address: the admin's own.
      if (!isStaffEmail(admin.email)) {
        return NextResponse.json({ error: "Tests go to team addresses only." }, { status: 400 });
      }
      const own = await ownTestReport(admin.email);
      if (!own) {
        return NextResponse.json(
          { error: "No unpaid, opened report under your address to send the test for." },
          { status: 400 }
        );
      }
      const submissionId = own.row.survey_submission_id;
      await audit(admin.email, request, body, `test:${submissionId}`);
      const outcome = await claimAndSend(own.row, own.eligible, ctx, {
        batch: "test",
        arm: body.arm,
      });
      if (!outcome.sent) {
        const why = "skip" in outcome ? outcome.skip : outcome.failed;
        return NextResponse.json({ error: `Not sent: ${why}` }, { status: 502 });
      }
      return NextResponse.json(
        { sent: true, to: own.eligible.reader.email, arm: outcome.arm, submissionId },
        { headers: NO_STORE }
      );
    }

    // A tranche.
    const batch = `tranche:${body.batch}` as const;
    if (!body.dryRun && body.confirm !== `send ${body.size}`) {
      return NextResponse.json({ error: `Type "send ${body.size}" to confirm.` }, { status: 400 });
    }
    await audit(admin.email, request, body, batch);
    const startedAt = Date.now();
    const already = await batchSent(batch);
    let before = body.before ?? new Date(startedAt - TRANCHE_AGE_MS).toISOString();
    let sent = 0;
    let eligibleCount = 0;
    let failed = 0;
    let newestEligible: string | null = null;
    let oldestEligible: string | null = null;
    const skipped: Record<string, number> = {};
    const problems: string[] = [];
    const goal = body.size - already - (body.dryRun ? body.counted : 0);
    let exhausted = false;

    outer: while (goal > 0 && Date.now() - startedAt < BUDGET_MS) {
      const rows = await fetchCandidatesBefore(before, PAGE);
      if (rows.length === 0) {
        exhausted = true;
        break;
      }
      for (const row of rows) {
        if (Date.now() - startedAt >= BUDGET_MS) break outer;
        const eligible = await eligibility(row);
        before = row.created_date_time ?? before;
        if ("skip" in eligible) {
          skipped[eligible.skip] = (skipped[eligible.skip] ?? 0) + 1;
          continue;
        }
        newestEligible ??= row.created_date_time ?? null;
        oldestEligible = row.created_date_time ?? oldestEligible;
        if (body.dryRun) {
          eligibleCount++;
          if (eligibleCount >= goal) break outer;
          continue;
        }
        const outcome = await claimAndSend(row, eligible, ctx, { batch });
        if (outcome.problem) problems.push(outcome.problem);
        if (outcome.sent) {
          sent++;
          if (sent >= goal) break outer;
        } else if ("skip" in outcome) {
          skipped[outcome.skip] = (skipped[outcome.skip] ?? 0) + 1;
        } else {
          failed++;
          problems.push(outcome.failed);
        }
      }
    }

    const batchTotal = already + sent;
    const reached = body.dryRun ? eligibleCount >= goal : batchTotal >= body.size;
    return NextResponse.json(
      {
        dryRun: body.dryRun,
        batch,
        size: body.size,
        batchSent: batchTotal,
        sent,
        eligible: eligibleCount,
        failed,
        skipped,
        problems: [...new Set(problems)].slice(0, 5),
        newestEligible,
        oldestEligible,
        nextBefore: before,
        done: reached || exhausted || goal <= 0,
        exhausted,
      },
      { headers: NO_STORE }
    );
  } catch (err) {
    logger.error({ err }, "unlock-feedback admin send failed");
    return NextResponse.json({ error: "Unable to send." }, { status: 500 });
  }
}
