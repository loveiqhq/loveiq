/**
 * GET /api/cron/team-export
 *
 * Refreshes the team's copy of the production data in its Google Drive folder
 * (features/admin/server/team-export.ts), on the server: nobody's laptop is needed, and the
 * data goes from the database to Drive without passing through a chat. Jarvis's
 * `export_all_data` tool starts it; it is not on a schedule.
 *
 * It answers in a few seconds and does the work after the response (about three minutes):
 *   - 202: started; the folder's link and the previous run's outcome.
 *   - 409: one is running, or one finished in the last ten minutes and is reused.
 *   - 500: no Drive login, or no team-only folder to write to. Nothing written.
 * One run at a time, by a Redis lock. A failed run is logged as an error, which reaches
 * #prod-alerts, and records `error` (or `timeout`) in cron_run.
 *
 * Protected by `Authorization: Bearer ${CRON_SECRET}`. Production only: the export is of
 * the production database, into the production team's folder.
 */
import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { supabaseFetch } from "@features/admin/server/supabase";
import {
  buildExport,
  findTeamFolder,
  folderUrl,
  OutOfTime,
  tableSpecs,
  uploadExport,
} from "@features/admin/server/team-export";
import { scheduleAfterResponse } from "@shared/http/after-response";
import {
  DRIVE_WRITE_SCOPE,
  getDelegatedToken,
  readVercelOidcToken,
} from "@shared/http/google-oauth";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import logger from "@shared/observability/logger";
import { recordCronRun, verifyCronAuth } from "@shared/observability/slack-alert-dedup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** The most Vercel allows. A run takes about three minutes and gives itself ten. */
export const maxDuration = 800;

const NAME = "team-export";
const LOCK = "team-export:run";
/** Longer than a run can last (its ceiling is 800 s), so a second never starts beside it. */
const RUNNING_TTL_S = 900;
/** A copy this fresh is reused: asking again soon after is a question, not a request. */
const FRESH_TTL_S = 600;

interface RunState {
  startedAt: string;
  folderUrl: string;
  finishedAt?: string;
}

/** The last recorded run, so a caller hears about a failure the alert already reported. */
async function previousRun() {
  try {
    const res = await supabaseFetch(
      `/rest/v1/cron_run?cron_name=eq.${NAME}&select=started_at,completed_at,status,error_message&order=started_at.desc&limit=1`
    );
    if (!res.ok) return null;
    return (((await res.json()) as unknown[])[0] ?? null) as Record<string, unknown> | null;
  } catch {
    return null;
  }
}

async function run(redis: Redis, drive: string, folderId: string, state: RunState) {
  const startedAtMs = Date.parse(state.startedAt);
  // Ten minutes for the work, so the slowest request still in flight (two minutes for an
  // upload) and the record below finish inside the 800-second ceiling.
  const isOutOfTime = () => Date.now() - startedAtMs > 600_000;
  let status: "success" | "error" | "timeout" = "success";
  let message: string | undefined;
  try {
    const files = await buildExport(await tableSpecs(), undefined, isOutOfTime);
    await uploadExport(drive, folderId, files, isOutOfTime);
    logger.info({ cron: NAME, files: files.length }, "team-export: done");
  } catch (err) {
    status = err instanceof OutOfTime ? "timeout" : "error";
    message = err instanceof Error ? err.message : String(err);
    logger.error({ err, cron: NAME }, `team-export failed: ${message}`);
  }
  try {
    // A failed run frees the lock at once, so asking again retries; a good one is reused.
    if (status === "success") {
      await redis.set(
        LOCK,
        { ...state, finishedAt: new Date().toISOString() },
        { ex: FRESH_TTL_S }
      );
    } else {
      await redis.del(LOCK);
    }
  } catch (err) {
    logger.warn({ err, cron: NAME }, "team-export: could not update the lock");
  }
  await recordCronRun(NAME, startedAtMs, status, message);
}

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (!kvUrl || !kvToken) {
    return NextResponse.json(
      { error: "Redis is not configured, so runs cannot be kept to one at a time." },
      { status: 503 }
    );
  }
  const redis = new Redis({ url: kvUrl, token: kvToken });

  const startedAtMs = Date.now();
  const previous = await previousRun();
  // The Drive login and the folder before answering: the caller hears about either at once,
  // and the login comes from this request's identity, which the work after it cannot read.
  let drive: string;
  let folderId: string;
  try {
    const token = await getDelegatedToken(
      "ec@loveiq.org",
      DRIVE_WRITE_SCOPE,
      startedAtMs,
      readVercelOidcToken(request)
    );
    if (!token) throw new Error("no Drive login for ec@loveiq.org. Nothing written.");
    drive = token;
    folderId = await findTeamFolder(drive);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, cron: NAME }, `team-export could not start: ${message}`);
    await recordCronRun(NAME, startedAtMs, "error", message);
    return NextResponse.json({ error: message, previous }, { status: 500 });
  }

  const state: RunState = {
    startedAt: new Date(startedAtMs).toISOString(),
    folderUrl: folderUrl(folderId),
  };
  let claimed: unknown;
  try {
    claimed = await redis.set(LOCK, state, { nx: true, ex: RUNNING_TTL_S });
  } catch (err) {
    logger.error({ err, cron: NAME }, "team-export: Redis refused the lock");
    return NextResponse.json(
      { error: "Could not make sure no other export is running. Nothing started." },
      { status: 503 }
    );
  }
  if (!claimed) {
    const current = await redis.get<RunState>(LOCK).catch(() => null);
    return NextResponse.json({ ...current, folderUrl: state.folderUrl, previous }, { status: 409 });
  }
  scheduleAfterResponse(NAME, () => run(redis, drive, folderId, state));
  return NextResponse.json({ ...state, previous }, { status: 202 });
}
