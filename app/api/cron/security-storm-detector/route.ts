/**
 * GET /api/cron/security-storm-detector
 *
 * Every 15 minutes, scans Upstash KV for two abuse signals:
 *
 *  1. Rate-limit storms — `rl:<bucket>:<ip>` counters exceeding STORM_THRESHOLD
 *     (the same bucket has 100+ hits in the active window).
 *  2. CSRF-fail storms — `csrf:<ip>:<15-min-bucket>` counters exceeding
 *     CSRF_THRESHOLD. shared/http/csrf.ts increments these on every CSRF
 *     verification failure.
 *
 * Each flagged IP fires one Slack ping per (kind, ip) per day — deduped via
 * the `slack_alert_sent` table.
 *
 * Protected by `Authorization: Bearer ${CRON_SECRET}`.
 */

import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import logger from "@shared/observability/logger";
import { notifySlack, escapeSlack } from "@shared/observability/slack";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import {
  recordCronRun,
  startCronTimer,
  tryClaimSlackAlert,
  verifyCronAuth,
} from "@shared/observability/slack-alert-dedup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 50;

const STORM_THRESHOLD = 100;
const CSRF_THRESHOLD = 20;
const SCAN_COUNT = 500;

/** Scan a Redis key-pattern, accumulating any counter >= threshold. */
async function scanForStorms(
  redis: Redis,
  match: string,
  threshold: number
): Promise<{ scanned: number; flagged: Array<{ key: string; count: number }> }> {
  let cursor: string = "0";
  let scanned = 0;
  const flagged: Array<{ key: string; count: number }> = [];
  do {
    const [next, keys] = (await redis.scan(cursor, {
      match,
      count: SCAN_COUNT,
    })) as [string, string[]];
    cursor = next;
    if (keys.length > 0) {
      const values = (await redis.mget(...keys)) as Array<number | string | null>;
      for (let i = 0; i < keys.length; i++) {
        scanned += 1;
        const raw = values[i];
        const count = typeof raw === "number" ? raw : Number(raw ?? 0);
        if (!Number.isFinite(count) || count < threshold) continue;
        flagged.push({ key: keys[i]!, count });
      }
    }
  } while (cursor !== "0" && scanned < SCAN_COUNT * 10);
  return { scanned, flagged };
}

function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Skip on the staging Vercel project (shares the prod KV namespace).
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  const trackDuration = startCronTimer("security-storm-detector", 50);
  const startMs = Date.now();
  let cronError: string | undefined;

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ skipped: "kv_not_configured" });
  }

  try {
    // Run both scans in parallel — independent KV namespaces.
    const [rlResult, csrfResult] = await Promise.all([
      scanForStorms(redis, "rl:*", STORM_THRESHOLD),
      scanForStorms(redis, "csrf:*", CSRF_THRESHOLD),
    ]);

    const pendingPings: Promise<void>[] = [];

    // Rate-limit storms — key format: rl:<bucket>:<ip>
    for (const { key, count } of rlResult.flagged) {
      const parts = key.split(":");
      const bucket = parts[1] ?? "unknown";
      const ip = parts.slice(2).join(":") || "unknown";

      const claimed = await tryClaimSlackAlert("rate_limit_storm", "ip", `${bucket}:${ip}`);
      if (!claimed) continue;
      pendingPings.push(
        notifySlack({
          channel: "ops",
          kind: "rate_limit_storm",
          text: `:warning: Rate-limit storm — bucket *${escapeSlack(bucket)}* hit by IP \`${escapeSlack(ip)}\` ${count} times in the current window`,
          username: "ops_alerts",
        })
      );
    }

    // CSRF storms — key format: csrf:<ip>:<15-min-bucket>
    for (const { key, count } of csrfResult.flagged) {
      const parts = key.split(":");
      const ip = parts[1] ?? "unknown";
      const bucket = parts[2] ?? "unknown";

      const claimed = await tryClaimSlackAlert("csrf_storm", "ip", `${ip}:${bucket}`);
      if (!claimed) continue;
      pendingPings.push(
        notifySlack({
          channel: "ops",
          kind: "csrf_storm",
          text: `:shield: CSRF storm — IP \`${escapeSlack(ip)}\` failed CSRF verification ${count} times in 15 min. Likely abuse / scanner.`,
          username: "ops_alerts",
        })
      );
    }

    await Promise.allSettled(pendingPings);
    const pinged = pendingPings.length;

    return NextResponse.json({
      scanned: rlResult.scanned + csrfResult.scanned,
      flagged: rlResult.flagged.length + csrfResult.flagged.length,
      pinged,
    });
  } catch (err) {
    logger.error({ err }, "security-storm-detector cron failed");
    cronError = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  } finally {
    await trackDuration();
    await recordCronRun(
      "security-storm-detector",
      startMs,
      cronError ? "error" : "success",
      cronError
    );
  }
}
