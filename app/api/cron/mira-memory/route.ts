/**
 * GET /api/cron/mira-memory: Mira's memory limit (Sanjin's coach config: "Memory kept for 12
 * months after last chat"). Daily, it deletes a person's chats once the last message they wrote
 * is more than 12 months old (supabase function mira_forget_old_memory), sign-in codes issued
 * more than a day ago (a code lives an hour; an unused one would keep the address it was sent to
 * for good), KPI events (mira_event) older than 12 months, and the logins Mira's sign-in made for
 * a sign-up that never finished. Since 22 Nov 2026 also passkey challenges past their 5 minutes,
 * email changes waiting more than a day, and signed-in devices not seen for 90 days (they sign in
 * again; features/mira/server/devices.ts). Production host only. Protected by
 * `Authorization: Bearer ${CRON_SECRET}`.
 */
import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { supabaseFetch } from "@features/admin/server/supabase";
import { DEVICE_IDLE_DAYS } from "@features/mira/server/devices";
import { MIRA_CREATED } from "@features/mira/server/sign-in";
import { deleteAccount } from "@features/mira/server/store";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import logger from "@shared/observability/logger";
import { recordCronRun } from "@shared/observability/slack-alert-dedup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Months after the last message a person wrote; also how long the KPI log keeps an event. */
export const MEMORY_MONTHS = 12;

const DAY_MS = 86_400_000;
/** Events deleted per statement: one id range of the primary key. */
const EVENT_BATCH = 5_000;
/** Unfinished sign-ups removed side by side. */
const CONCURRENCY = 4;

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

/** Rows a `count=exact` DELETE removed, from its Content-Range header (after the slash). */
function deletedCount(res: Response): number {
  const n = Number((res.headers.get("content-range") ?? "").split("/")[1]);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The KPI log keeps an event 12 months. ids grow with time, so the oldest event is the lowest id
 * (read off the primary key, no table scan), and each batch deletes an id range from there.
 */
async function forgetOldEvents(outOfTime: () => boolean) {
  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - MEMORY_MONTHS);
  const before = encodeURIComponent(cutoff.toISOString());
  let deleted = 0;
  for (;;) {
    if (outOfTime()) return { deleted, stoppedEarly: true };
    const res = await supabaseFetch(
      "/rest/v1/mira_event?select=id,created_at&order=id.asc&limit=1"
    );
    if (!res.ok) throw new Error(`old events: status ${res.status}`);
    const [oldest] = (await res.json()) as Array<{ id: number; created_at: string }>;
    if (!(oldest && Date.parse(oldest.created_at) < cutoff.getTime())) {
      return { deleted, stoppedEarly: false };
    }
    const del = await supabaseFetch(
      `/rest/v1/mira_event?id=lt.${oldest.id + EVENT_BATCH}&created_at=lt.${before}`,
      { method: "DELETE", headers: { Prefer: "return=minimal,count=exact" } }
    );
    if (!del.ok) throw new Error(`old events: status ${del.status}`);
    const n = deletedCount(del);
    deleted += n;
    if (n === 0) return { deleted, stoppedEarly: false };
  }
}

type AuthUser = { id: string; email?: string; created_at?: string; app_metadata?: unknown };

/**
 * Logins Mira's sign-in made (sign-in.ts MIRA_CREATED) for a sign-up that never finished: more
 * than a day old, still no mira_user row, and no code sent in the last day (one that is still
 * signing up keeps theirs). Deleted with Mira's own account deletion, which never deletes the
 * login of staff, admin_users or Jarvis members (store.ts deleteAccount).
 */
async function removeUnfinishedSignUps(now: number, outOfTime: () => boolean) {
  const dayAgo = now - DAY_MS;
  const stale: Array<{ id: string; email: string }> = [];
  for (let page = 1; ; page++) {
    if (outOfTime()) return { deleted: 0, failed: 0, stoppedEarly: true };
    const res = await supabaseFetch(`/auth/v1/admin/users?page=${page}&per_page=1000`);
    if (!res.ok) throw new Error(`unfinished sign-ups: status ${res.status}`);
    const users = ((await res.json()) as { users?: AuthUser[] }).users ?? [];
    if (users.length === 0) break;
    for (const u of users) {
      const mark = (u.app_metadata as { created_by?: unknown } | undefined)?.created_by;
      if (mark === MIRA_CREATED.created_by && u.email && Date.parse(u.created_at ?? "") < dayAgo) {
        stale.push({ id: u.id, email: u.email });
      }
    }
  }

  // ponytail: one person at a time per worker, checked again just before the delete; at the
  // sign-in caps (at most 1,440 new logins a day) a backlog drains over a few runs, each recorded
  // as stopped early. Raise CONCURRENCY when that shows up.
  const summary = { deleted: 0, failed: 0, stoppedEarly: false };
  const has = async (path: string) => {
    const res = await supabaseFetch(path);
    if (!res.ok) throw new Error(`unfinished sign-ups: status ${res.status}`);
    return ((await res.json()) as unknown[]).length > 0;
  };
  const enc = encodeURIComponent;
  let next = 0;
  const worker = async () => {
    while (next < stale.length) {
      if (outOfTime()) {
        summary.stoppedEarly = true;
        return;
      }
      const login = stale[next++]!;
      try {
        if (await has(`/rest/v1/mira_user?id=eq.${enc(login.id)}&select=id&limit=1`)) continue;
        if (await has(`/rest/v1/mira_sign_in_code?email=eq.${enc(login.email)}&select=email`)) {
          continue;
        }
        await deleteAccount(login);
        summary.deleted++;
      } catch (err) {
        summary.failed++;
        logger.error({ err }, "mira: an unfinished sign-up was not removed");
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return summary;
}

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  if (!safeCompare(request.headers.get("authorization") || "", `Bearer ${expected}`)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 401 });
  }
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }
  const startedAtMs = Date.now();
  // Nothing new is started after 20 s, so the step in flight ends well inside the 60 s ceiling
  // (features/cron/tests/cron-budgets.test.ts); what is left waits for the next day.
  const isOutOfTime = () => Date.now() - startedAtMs > 20_000;
  try {
    const res = await supabaseFetch("/rest/v1/rpc/mira_forget_old_memory", {
      method: "POST",
      body: JSON.stringify({ p_months: MEMORY_MONTHS }),
    });
    if (!res.ok) throw new Error(`memory limit: status ${res.status}`);
    const deleted = (await res.json()) as number;
    const dayAgo = new Date(startedAtMs - DAY_MS).toISOString();
    const codes = await supabaseFetch(
      `/rest/v1/mira_sign_in_code?issued_at=lt.${encodeURIComponent(dayAgo)}`,
      { method: "DELETE" }
    );
    if (!codes.ok) throw new Error(`old sign-in codes: status ${codes.status}`);
    const iso = (ms: number) => encodeURIComponent(new Date(ms).toISOString());
    for (const path of [
      `/rest/v1/mira_webauthn_challenge?expires_at=lt.${iso(startedAtMs)}`,
      `/rest/v1/mira_email_change?issued_at=lt.${iso(startedAtMs - DAY_MS)}`,
      `/rest/v1/mira_session?last_seen_at=lt.${iso(startedAtMs - DEVICE_IDLE_DAYS * DAY_MS)}`,
    ]) {
      const res = await supabaseFetch(path, { method: "DELETE" });
      if (!res.ok) throw new Error(`sign-in leftovers: status ${res.status}`);
    }
    const events = await forgetOldEvents(isOutOfTime);
    const signUps = await removeUnfinishedSignUps(startedAtMs, isOutOfTime);
    const stoppedEarly = events.stoppedEarly || signUps.stoppedEarly;
    if (stoppedEarly || signUps.failed > 0) {
      // Left for tomorrow or failed: an error in cron_run, and one line to ops (logger.error).
      const reason =
        `${events.deleted} old events and ${signUps.deleted} unfinished sign-ups deleted, ` +
        `${signUps.failed} failed` +
        (stoppedEarly ? ", stopped at the time budget (the rest wait for the next run)" : "");
      logger.error({ cron: "mira-memory", reason }, "mira-memory: work was left over");
      await recordCronRun("mira-memory", startedAtMs, "error", reason);
    } else {
      await recordCronRun("mira-memory", startedAtMs, "success");
    }
    return NextResponse.json({
      ok: true,
      chatsDeleted: deleted,
      eventsDeleted: events.deleted,
      signUpsDeleted: signUps.deleted,
      signUpsFailed: signUps.failed,
      stoppedEarly,
    });
  } catch (err) {
    const reason = (err as Error)?.message;
    logger.error({ err, reason }, "mira-memory cron failed");
    await recordCronRun("mira-memory", startedAtMs, "error", reason);
    return NextResponse.json({ error: "Unable to apply the memory limit." }, { status: 500 });
  }
}
