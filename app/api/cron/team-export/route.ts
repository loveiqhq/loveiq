/**
 * GET /api/cron/team-export[?check=1]
 *
 * Refreshes the team's copy of the production data in its Google Drive folder
 * (features/admin/server/team-export.ts), on the server: nobody's laptop is needed, and the
 * data goes from the database to Drive without passing through a chat. Jarvis's
 * `export_all_data` tool starts it; it is not on a schedule.
 *
 * It answers in a few seconds and does the work after the response (a few minutes):
 *   - `?check=1`, 200: whether one is running, and how the last one went. Starts nothing.
 *   - 202: started; the folder's link and who can open it.
 *   - 409: one is already running.
 *   - 500: no Drive login, or no team-only folder to write to. Nothing written.
 *   - 503: Redis, which keeps runs to one at a time, is unset or did not answer.
 * Every run is recorded in Redis (`team-export:last`) before it starts and again when it
 * ends, so a run the platform kills shows as one that never finished instead of vanishing;
 * and in cron_run when it ends. A failed run is logged as an error, which reaches #prod-alerts.
 *
 * Protected by `Authorization: Bearer ${CRON_SECRET}`. Production only: the export is of
 * the production database, into the production team's folder.
 */
import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import {
  buildExport,
  findTeamFolder,
  TEAM_EXPORT_OWNER,
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
/** The most Vercel allows. A run takes a few minutes and gives up at nine. */
export const maxDuration = 800;

const NAME = "team-export";
/** Held while a run runs: {runId, startedAt}. */
const LOCK = "team-export:run";
/** The last run, written when it starts and again when it ends. */
const LAST = "team-export:last";
/** Longer than a run can last (its ceiling is 800 s), so a second never starts beside it. */
const LOCK_TTL_S = 900;
/**
 * Deletes the lock only while it still holds the value given. Every release goes through it:
 * a run freeing its lock late, or two requests clearing the same stale one, must never delete
 * a lock a newer run has taken since.
 */
const RELEASE =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) end return 0';

interface Lock {
  runId: string;
  startedAt: string;
}

interface LastRun extends Lock {
  folderUrl?: string;
  people?: string[];
  owner?: string;
  finishedAt?: string;
  status?: "success" | "error" | "timeout";
  error?: string;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
// The stored value is the lock as JSON (the client serialises objects that way).
const release = (redis: Redis, lock: Lock) => redis.eval(RELEASE, [LOCK], [JSON.stringify(lock)]);

async function run(redis: Redis, drive: string, folderId: string, lock: Lock, record: LastRun) {
  const startedAtMs = Date.parse(record.startedAt);
  // Nine minutes for the work. Checked before every page and every file, and the most one file
  // can take after its check (a retried 15 s start, the 90 s upload, a retried 15 s listing and
  // deletion: about 190 s) plus the records below still finish inside the 800-second ceiling.
  const isOutOfTime = () => Date.now() - startedAtMs > 540_000;
  let status: "success" | "error" | "timeout" = "success";
  let error: string | undefined;
  try {
    const files = await buildExport(await tableSpecs(), undefined, isOutOfTime);
    await uploadExport(drive, folderId, files, isOutOfTime);
    logger.info({ cron: NAME, files: files.length }, "team-export: done");
  } catch (err) {
    status = err instanceof OutOfTime ? "timeout" : "error";
    error = message(err);
    logger.error({ err, cron: NAME }, `team-export failed: ${error}`);
  }
  // The outcome before the lock goes: a run that starts in between must find it.
  await redis
    .set(LAST, { ...record, finishedAt: new Date().toISOString(), status, error })
    .catch((err) => logger.warn({ err, cron: NAME }, "team-export: could not record the run"));
  await release(redis, lock).catch((err) =>
    logger.warn({ err, cron: NAME }, "team-export: could not free the lock")
  );
  await recordCronRun(NAME, startedAtMs, status, error);
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
  // No retries: a retried SET NX whose first answer was lost would find its own lock and
  // report a run that is not happening. `{ retries: 0 }`, not `false`: in this client `false`
  // still sends twice.
  const redis = new Redis({
    url: kvUrl,
    token: kvToken,
    retry: { retries: 0 },
    signal: () => AbortSignal.timeout(3_000),
  });
  const unavailable = () =>
    NextResponse.json(
      { error: "Redis did not answer, so it is not known whether an export is running." },
      { status: 503 }
    );

  let lock: Lock | null;
  let last: LastRun | null;
  try {
    [lock, last] = await Promise.all([redis.get<Lock>(LOCK), redis.get<LastRun>(LAST)]);
  } catch (err) {
    logger.warn({ err, cron: NAME }, "team-export: Redis did not answer");
    return unavailable();
  }
  // A lock whose run has recorded its end, or older than any run can last, is one that was
  // never freed: the end's delete failed, or the platform killed the run first.
  const stale =
    lock !== null &&
    ((last !== null && last.runId === lock.runId && last.finishedAt !== undefined) ||
      !(Date.now() - Date.parse(lock.startedAt) <= maxDuration * 1000));
  if (new URL(request.url).searchParams.get("check") === "1") {
    return NextResponse.json({ running: stale ? null : (lock?.startedAt ?? null), last });
  }
  if (lock && !stale) return NextResponse.json({ running: lock.startedAt, last }, { status: 409 });

  const startedAtMs = Date.now();
  const mine: Lock = { runId: randomUUID(), startedAt: new Date(startedAtMs).toISOString() };
  try {
    if (stale) await release(redis, lock!);
    if (!(await redis.set(LOCK, mine, { nx: true, ex: LOCK_TTL_S }))) {
      const now = await redis.get<Lock>(LOCK);
      return NextResponse.json({ running: now?.startedAt ?? null, last }, { status: 409 });
    }
  } catch (err) {
    logger.warn({ err, cron: NAME }, "team-export: Redis did not answer the lock");
    // Free the lock if the SET landed and only its answer was lost.
    await release(redis, mine).catch(() => undefined);
    return unavailable();
  }

  // The Drive login and the folder before answering, inside the lock: the caller hears about
  // either at once, and the login comes from this request's identity, which the work after
  // the response cannot read.
  let drive: string;
  let folder: { id: string; people: string[]; owner: string };
  try {
    const token = await getDelegatedToken(
      TEAM_EXPORT_OWNER,
      DRIVE_WRITE_SCOPE,
      startedAtMs,
      readVercelOidcToken(request)
    );
    if (!token) throw new Error("no Drive login for ec@loveiq.org. Nothing written.");
    drive = token;
    folder = await findTeamFolder(drive);
  } catch (err) {
    const error = message(err);
    logger.error({ err, cron: NAME }, `team-export could not start: ${error}`);
    const failed: LastRun = {
      ...mine,
      finishedAt: new Date().toISOString(),
      status: "error",
      error,
    };
    await redis.set(LAST, failed).catch(() => undefined);
    await release(redis, mine).catch(() => undefined);
    await recordCronRun(NAME, startedAtMs, "error", error);
    return NextResponse.json({ error, last }, { status: 500 });
  }

  const record: LastRun = {
    ...mine,
    folderUrl: folderUrl(folder.id),
    people: folder.people,
    owner: folder.owner,
  };
  await redis
    .set(LAST, record)
    .catch((err) => logger.warn({ err, cron: NAME }, "team-export: could not record the start"));
  scheduleAfterResponse(NAME, () => run(redis, drive, folder.id, mine, record));
  return NextResponse.json({ ...record, last }, { status: 202 });
}
