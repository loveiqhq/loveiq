/**
 * GET /api/cron/security-storm-detector
 *
 * Every 15 minutes, scans Upstash KV for rate-limit storms — IPs that have
 * burned through one bucket's per-window quota multiple times in succession.
 * Pings the ops Slack channel once per IP per 24 hours.
 *
 * The rate-limit keys live in Redis under `rl:<bucket>:<ip>` (see
 * shared/http/ratelimit.ts). For each scanned key, the current counter
 * value is compared against a static heuristic threshold; values above the
 * threshold are flagged.
 *
 * Note: this does NOT detect CSRF-fail bursts in this pass — those land in
 * pino runtime logs (shared/http/csrf.ts emits structured warn lines) and
 * are queried out-of-band when a storm is suspected. A future revision
 * could mirror the same KV-scan pattern after adding a per-IP CSRF counter.
 *
 * Protected by `Authorization: Bearer ${CRON_SECRET}`.
 */

import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import logger from "@shared/observability/logger";
import { notifySlack, escapeSlack } from "@shared/observability/slack";
import { tryClaimSlackAlert, verifyCronAuth } from "@shared/observability/slack-alert-dedup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 50;

const STORM_THRESHOLD = 100;
const SCAN_COUNT = 500;

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

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ skipped: "kv_not_configured" });
  }

  try {
    let cursor: string = "0";
    let scanned = 0;
    let pinged = 0;
    const flagged: Array<{ key: string; count: number }> = [];

    do {
      const [next, keys] = (await redis.scan(cursor, {
        match: "rl:*",
        count: SCAN_COUNT,
      })) as [string, string[]];
      cursor = next;

      if (keys.length > 0) {
        // Multi-get the counter values in one round-trip.
        const values = (await redis.mget(...keys)) as Array<number | string | null>;
        for (let i = 0; i < keys.length; i++) {
          scanned += 1;
          const raw = values[i];
          const count = typeof raw === "number" ? raw : Number(raw ?? 0);
          if (!Number.isFinite(count) || count < STORM_THRESHOLD) continue;
          flagged.push({ key: keys[i]!, count });
        }
      }
    } while (cursor !== "0" && scanned < SCAN_COUNT * 10);

    for (const { key, count } of flagged) {
      // Key format: rl:<bucket>:<ip>
      const parts = key.split(":");
      const bucket = parts[1] ?? "unknown";
      const ip = parts.slice(2).join(":") || "unknown";

      const claimed = await tryClaimSlackAlert("rate_limit_storm", "ip", `${bucket}:${ip}`);
      if (!claimed) continue;
      void notifySlack({
        channel: "ops",
        kind: "rate_limit_storm",
        text: `:warning: Rate-limit storm — bucket *${escapeSlack(bucket)}* hit by IP \`${escapeSlack(ip)}\` ${count} times in the current window`,
        username: "ops_alerts",
      });
      pinged += 1;
    }

    return NextResponse.json({ scanned, flagged: flagged.length, pinged });
  } catch (err) {
    logger.error({ err }, "security-storm-detector cron failed");
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  }
}
