/**
 * GET /api/cron/anomaly-watcher
 *
 * Hourly: pulls the current anomaly snapshot (admin_alert_rule breaches +
 * health/strategy guardrails). For each RISK-severity finding, fires a single
 * Slack alert to ops, deduped per (target_key, UTC day) via slack_alert_sent.
 *
 * Watch-severity stays in the daily digest's *Alerts* section — only risk
 * earns a real-time ping.
 *
 * Protected by `Authorization: Bearer ${CRON_SECRET}`. Skipped on staging
 * (shares prod DB; `isProdCronHost()` gate).
 */

import { NextResponse } from "next/server";
import logger from "@shared/observability/logger";
import { notifySlack, escapeSlack } from "@shared/observability/slack";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import {
  recordCronRun,
  startCronTimer,
  tryClaimSlackAlert,
  verifyCronAuth,
} from "@shared/observability/slack-alert-dedup";
import { buildAnomalySnapshot } from "@features/admin/server/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  const trackDuration = startCronTimer("anomaly-watcher", 60);
  const startMs = Date.now();
  let cronError: string | undefined;

  try {
    // 7-day window matches the snapshot builder's lower clamp; the items
    // returned represent CURRENT breach state regardless of window length.
    const snapshot = await buildAnomalySnapshot(7);
    const dayKey = new Date().toISOString().slice(0, 10);

    const risks = snapshot.items.filter((item) => item.severity === "risk");
    // Cap per-run firings to avoid a Slack storm if many rules trip at once.
    // Excess are silently deferred — the next hourly run will pick them up
    // (subject to per-day dedup). Daily digest *Alerts* section still shows
    // all breaches even beyond the cap.
    const MAX_FIRINGS_PER_RUN = 10;
    const considered = risks.slice(0, MAX_FIRINGS_PER_RUN);
    const deferred = risks.length - considered.length;
    let fired = 0;
    let suppressed = 0;

    for (const item of considered) {
      const claimed = await tryClaimSlackAlert(`anomaly_realtime:${item.targetKey}`, "day", dayKey);
      if (!claimed) {
        suppressed += 1;
        continue;
      }

      const ruleSuffix =
        item.matchedRules.length > 0 ? ` (rule: ${escapeSlack(item.matchedRules[0]!.label)})` : "";
      await notifySlack({
        channel: "ops",
        kind: "anomaly_realtime",
        username: "ops_alerts",
        text: `:rotating_light: *Anomaly — ${escapeSlack(item.title)}*\n${escapeSlack(item.detail)}${ruleSuffix}\nValue: ${item.value} | Owner: ${item.ownerEmail ?? "unassigned"}`,
        context: { targetKey: item.targetKey, severity: item.severity },
      });
      fired += 1;
    }

    return NextResponse.json({
      ok: true,
      day: dayKey,
      riskItems: risks.length,
      fired,
      suppressed,
      deferred,
    });
  } catch (err) {
    logger.error({ err }, "anomaly-watcher cron failed");
    cronError = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  } finally {
    await trackDuration();
    await recordCronRun("anomaly-watcher", startMs, cronError ? "error" : "success", cronError);
  }
}
