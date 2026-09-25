import { NextResponse } from "next/server";
import { fileCrmCalls, liveCrmDeps, SESSIONS_DB } from "@features/brain/server/crm-calls";
import { recordNotice } from "@features/brain/server/notice";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import { recordCronRun, verifyCronAuth } from "@shared/observability/slack-alert-dedup";
import logger from "@shared/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Far enough back that a run GitHub or Vercel skipped, or a late notes document, is caught. */
const LOOKBACK_DAYS = 14;

/**
 * GET /api/cron/brain-crm
 *
 * Every two hours: files each recorded call with someone on the Notion board "Therapists &
 * Coaches" into "Feedback Sessions" (features/brain/server/crm-calls.ts), and announces each
 * one as a notice so whoever ran the call finds the row waiting in Claude. A call already
 * filed is left alone, so the window overlaps without writing twice.
 *
 * `cron_run` says "error" when the notes or the Notion boards could not be read, or a row
 * could not be written; a run with nothing to file is a success.
 */
export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }
  const startedAtMs = Date.now();
  let status: "success" | "error" = "success";
  let detail: string | undefined;
  try {
    const since = new Date(startedAtMs - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
    const result = await fileCrmCalls(since, false, liveCrmDeps());
    const written = result.filed.filter((f) => !f.error);
    for (const f of written) {
      const who = f.people.map((p) => p.name.trim()).join(" & ");
      await recordNotice({
        headline: `Filed the call with ${who} on ${f.call.date} into ${SESSIONS_DB}`,
        detail:
          `The recorded call "${f.call.eventTitle ?? f.call.title}" is now a ${f.type} row in ` +
          `Notion: ${f.url ?? "(no link returned)"}. Outcome, signal strength and what landed ` +
          "are left to fill in." +
          (f.untouched ? ` Last touch could not be updated for ${f.untouched.join(", ")}.` : ""),
        kind: "brain-crm",
        evidence: `Gemini notes: ${f.call.url}`,
      });
    }
    const failed = result.filed.filter((f) => f.error);
    if (result.gaps.length || failed.length) status = "error";
    detail =
      `calls=${result.calls} filed=${written.length} skipped=${result.skips.length} ` +
      `near=${result.near.length}` +
      (result.gaps.length ? ` unread=${result.gaps.join(" ")}` : "") +
      (failed.length ? ` failed=${failed.map((f) => f.error).join("; ")}` : "");
    return NextResponse.json(
      { ok: status === "success", filed: written.length, skipped: result.skips.length },
      { status: status === "success" ? 200 : 502 }
    );
  } catch (err) {
    status = "error";
    detail = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "brain-crm failed");
    return NextResponse.json({ ok: false, error: "Internal" }, { status: 500 });
  } finally {
    await recordCronRun("brain-crm", startedAtMs, status, detail);
  }
}
