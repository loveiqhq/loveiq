/**
 * /api/mira/checks — a signed-in person's self-checks (features/mira/content/checks.ts): the
 * anxiety check (GAD-7), the mood check (PHQ-9) and the loneliness check, for self-reflection and
 * coaching, never diagnosis.
 *
 *   GET    → each check's results (scored here), when it may be taken again, the body check's
 *            dates, the LoveIQ result, the two "Mira may use" switches, the support country, and
 *            the name and email the signed-in frame shows
 *   POST   { check, answers } → scores and stores a finished check. Refused (409) before the
 *            check's retake date (14 days, 28 for loneliness), so a result covers its own two
 *            weeks; the browser never sends a score.
 *   PATCH  { useChecks } → "Mira may use my check results"
 *   DELETE → deletes every check result
 *
 * Someone Mira stopped as under 18 (server/minor.ts) gets 403 on every method, as their data is
 * gone. KPI events carry ids only: which check and whether it was a retake, never answers, scores
 * or bands.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CHECKS,
  CHECK_IDS,
  bandOf,
  checkById,
  isValidAnswers,
  nextTakeAt,
  scoreOf,
  supportNow,
  type CheckId,
} from "@features/mira/content/checks";
import { FOLLOW_UP_DAYS, bodyCheckDue, listBodyChecks } from "@features/mira/server/body-check";
import {
  addCheck,
  deleteChecks,
  lastCheck,
  readChecks,
  setUseChecks,
} from "@features/mira/server/checks";
import { crisisFor, requestCountry } from "@features/mira/server/crisis";
import { isMinor } from "@features/mira/server/minor";
import { getMiraAccount } from "@features/mira/server/session";
import { findAssessment, logMiraEvent } from "@features/mira/server/store";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

const postSchema = z.object({
  check: z.enum(CHECK_IDS as [CheckId, ...CheckId[]]),
  answers: z.array(z.number().int()).max(20),
});
const patchSchema = z.object({ useChecks: z.boolean() }).strict();

/** CSRF on writes, the rate limit, a signed-in account, and never someone stopped as under 18. */
async function guard(request: Request, write: boolean) {
  if (write && !(await verifyCsrfToken(request))) {
    return { error: NextResponse.json({ error: "Invalid request." }, { status: 403 }) };
  }
  const saving = request.method === "POST";
  const rate = await checkRateLimit(getClientIp(request), {
    bucket: saving ? "mira-check-save" : "mira-checks",
    limit: saving ? 20 : 60,
    windowMs: saving ? 60 * 60 * 1000 : 60_000,
  });
  if (!rate.allowed) {
    return { error: NextResponse.json({ error: "Please try again later." }, { status: 429 }) };
  }
  const account = await getMiraAccount();
  if (!account) return { error: NextResponse.json({ error: "Please sign in." }, { status: 401 }) };
  if (await isMinor(account.id)) {
    return { error: NextResponse.json({ error: "Mira is only for adults." }, { status: 403 }) };
  }
  return { account };
}

function failed(err: unknown, message: string) {
  logger.error({ err }, "mira: a self-check request failed");
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const g = await guard(request, false);
    if ("error" in g) return g.error;
    const [state, bodyChecks, assessment] = await Promise.all([
      readChecks(g.account.id),
      // Extras for the cards: a failed read leaves them out rather than failing the page.
      listBodyChecks(g.account.id).catch(() => null),
      findAssessment(g.account.email).catch(() => null),
    ]);
    if (!state) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const now = new Date();
    const checks = CHECKS.map((check) => {
      const results = state.rows
        .filter((r) => r.scale === check.scale)
        .map((r) => {
          const score = scoreOf(check, r.answers);
          return { at: r.created_at, score, band: bandOf(check, score).id };
        });
      const last = results.at(-1);
      const next = last ? nextTakeAt(check, last.at) : null;
      return { id: check.id, results, nextAt: next && next > now ? next.toISOString() : null };
    });
    const country =
      state.country && state.country !== "OTHER" ? state.country : requestCountry(request);
    const bodyTaken = bodyChecks?.map((b) => b.created_at) ?? null;
    return NextResponse.json(
      {
        account: g.account.id,
        email: g.account.email,
        name: state.name,
        useChecks: state.useChecks,
        useAssessment: state.useAssessment,
        support: crisisFor(country).code,
        checks,
        bodyCheck: bodyTaken
          ? {
              taken: bodyTaken,
              due: bodyCheckDue(bodyTaken, now),
              nextAt:
                bodyTaken.length === 1
                  ? new Date(Date.parse(bodyTaken[0]!) + FOLLOW_UP_DAYS * DAY_MS).toISOString()
                  : null,
            }
          : null,
        assessment,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return failed(err, "Unable to load your checks.");
  }
}

export async function POST(request: Request) {
  try {
    const g = await guard(request, true);
    if ("error" in g) return g.error;
    const parsed = postSchema.safeParse(await request.json().catch(() => ({})));
    const check = parsed.success ? checkById(parsed.data.check) : undefined;
    if (!parsed.success || !check || !isValidAnswers(check, parsed.data.answers)) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { answers } = parsed.data;
    const last = await lastCheck(g.account.id, check.scale);
    const opens = last ? nextTakeAt(check, last.created_at) : null;
    const saved =
      opens && opens > new Date() ? null : await addCheck(g.account.id, check.scale, answers);
    if (!saved || saved === "duplicate") {
      return NextResponse.json(
        {
          error: "You've taken this check recently.",
          nextAt: (opens ?? nextTakeAt(check, new Date())).toISOString(),
        },
        { status: 409 }
      );
    }
    const score = scoreOf(check, answers);
    logMiraEvent(
      `${check.id}_check_done`,
      { userId: g.account.id },
      { scale: check.scale, retake: last !== null }
    );
    return NextResponse.json({
      result: { at: saved.created_at, score, band: bandOf(check, score).id },
      previous: last ? { at: last.created_at, score: scoreOf(check, last.answers) } : null,
      support: supportNow(check, answers),
    });
  } catch (err) {
    return failed(err, "Your answers didn't save. Please try again.");
  }
}

export async function PATCH(request: Request) {
  try {
    const g = await guard(request, true);
    if ("error" in g) return g.error;
    const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    await setUseChecks(g.account.id, parsed.data.useChecks);
    logMiraEvent("settings_saved", { userId: g.account.id }, { fields: ["use_checks"] });
    return NextResponse.json({ success: true });
  } catch (err) {
    return failed(err, "Unable to save.");
  }
}

export async function DELETE(request: Request) {
  try {
    const g = await guard(request, true);
    if ("error" in g) return g.error;
    await deleteChecks(g.account.id);
    logMiraEvent("checks_deleted", { userId: g.account.id });
    return NextResponse.json({ success: true });
  } catch (err) {
    return failed(err, "Unable to delete right now. Please try again.");
  }
}
