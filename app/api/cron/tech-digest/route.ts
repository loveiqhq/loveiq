/**
 * GET /api/cron/tech-digest
 *
 * Daily tech-lead digest at 09:10 UTC. Five sections:
 *   - Service health (Supabase / Resend / etc.)
 *   - Stuck payments (paid-but-locked detection)
 *   - Webhook intake (Stripe events processed, Resend opens/clicks)
 *   - Cron alerts (cron_slow_run count in window)
 *   - Security signals (CSRF storms, rate-limit storms, circuit trips)
 *
 * Sections render only when they have something to say. Protected by
 * `Authorization: Bearer ${CRON_SECRET}`. Idempotent via slack_alert_sent
 * (kind="tech_digest").
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
import { clampToSlackLimit } from "@/app/api/cron/funnel-digest/route";
import { fetchTechMetrics, type TechMetrics } from "@features/admin/server/digest-tech";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function dayString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function statusEmoji(status: "healthy" | "degraded" | "down"): string {
  if (status === "down") return ":red_circle:";
  if (status === "degraded") return ":large_yellow_circle:";
  return ":large_green_circle:";
}

// -----------------------------------------------------------------------------
// Section renderers — pure functions, exported for tests.
// -----------------------------------------------------------------------------

export function formatHealth(m: TechMetrics): string[] {
  const h = m.health;
  if (!h || h.lines.length === 0) return [];
  const lines: string[] = [`*Service health* — overall ${statusEmoji(h.overall)} ${h.overall}`];
  for (const svc of h.lines) {
    const latency = svc.latencyMs != null ? ` (${svc.latencyMs}ms)` : "";
    lines.push(`• ${statusEmoji(svc.status)} ${escapeSlack(svc.name)}${latency}`);
  }
  return lines;
}

export function formatStuck(m: TechMetrics): string[] {
  const s = m.stuck;
  if (!s) return [];
  if (s.count === 0) {
    // Still render the line — strategy/tech leads want a daily "all clear" on
    // payment fulfillment. Keeps the metric visible.
    return ["*Stuck payments*", "• :white_check_mark: 0 stuck"];
  }
  const lines: string[] = ["*Stuck payments*"];
  const ids = s.sampleIds.slice(0, 3).join(", ");
  const more = s.count > s.sampleIds.length ? ` (sample: ${ids})` : ` (ids: ${ids})`;
  lines.push(`• :rotating_light: ${s.count} stuck${more} — investigate`);
  return lines;
}

export function formatWebhooks(m: TechMetrics): string[] {
  const w = m.webhooks;
  if (!w) return [];
  if (w.stripeTotal === 0 && w.resendOpened === 0 && w.resendClicked === 0) {
    return [];
  }
  const lines: string[] = ["*Webhook intake*"];
  if (w.stripeTotal > 0) {
    const topStr = w.stripeTopEvents
      .map((e) => `${escapeSlack(e.eventType)} (${e.count})`)
      .join(", ");
    const errEmoji = w.stripeErrors > 0 ? ":rotating_light:" : ":white_check_mark:";
    lines.push(
      `• Stripe: ${w.stripeProcessed}/${w.stripeTotal} processed | top: ${topStr || "—"} | ${errEmoji} errors: ${w.stripeErrors}`
    );
  }
  if (w.resendOpened > 0 || w.resendClicked > 0) {
    lines.push(`• Resend: ${w.resendOpened} opened, ${w.resendClicked} clicked`);
  }
  return lines;
}

export function formatCronHealth(m: TechMetrics): string[] {
  const c = m.cronHealth;
  if (!c) return [];
  if (c.totalRuns === 0) {
    return ["*Cron health (24h)*", "• :white_check_mark: no cron runs recorded"];
  }
  const errIcon = c.totalErrors === 0 ? ":white_check_mark:" : ":rotating_light:";
  const lines: string[] = ["*Cron health (24h)*"];
  lines.push(
    `• ${c.totalCrons} crons | ${c.totalRuns} runs | ${errIcon} ${c.totalErrors} errors | p95 ${(c.p95Ms / 1000).toFixed(2)}s`
  );
  // Worst-offender line — the cron with the most errors (or slowest p95 if no
  // errors anywhere). Capped to one to keep the digest scannable.
  const worst = c.byCron[0];
  if (worst && (worst.errors > 0 || worst.p95Ms > 0)) {
    lines.push(
      `• Worst: ${escapeSlack(worst.cronName)} — ${worst.runs} runs, ${worst.errors} errors, avg ${(worst.avgMs / 1000).toFixed(2)}s, p95 ${(worst.p95Ms / 1000).toFixed(2)}s`
    );
  }
  return lines;
}

export function formatSecurity(m: TechMetrics): string[] {
  const s = m.security;
  if (!s) return [];
  const total = s.csrfStorms + s.rateLimitStorms + s.circuitOpens + s.circuitRecovered;
  if (total === 0) {
    return ["*Security signals*", "• :white_check_mark: 0 storms / circuit trips"];
  }
  const lines: string[] = ["*Security signals*"];
  lines.push(
    `• CSRF storms: ${s.csrfStorms} | Rate-limit storms: ${s.rateLimitStorms} | Circuit opens: ${s.circuitOpens} | Circuit recovered: ${s.circuitRecovered}`
  );
  return lines;
}

// -----------------------------------------------------------------------------
// Top-level formatter — exported for tests.
// -----------------------------------------------------------------------------

/**
 * Single-line deploy marker, prepended above the title. Reads `VERCEL_GIT_COMMIT_SHA`
 * + `VERCEL_DEPLOYMENT_ID` and omits the whole line when env vars are unset
 * (local / dev). First 7 chars of the SHA are enough for human ID + git log lookup.
 */
export function formatDeployMarker(): string | null {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  const dpl = process.env.VERCEL_DEPLOYMENT_ID;
  if (!sha && !dpl) return null;
  const shortSha = sha ? sha.slice(0, 7) : "unknown";
  const dplPart = dpl ? ` (${dpl})` : "";
  return `:rocket: Deployed: \`${shortSha}\`${dplPart}`;
}

export function formatTechDigest(dayKey: string, m: TechMetrics): string {
  const lines: string[] = [`:wrench: *Tech digest — ${dayKey} UTC*`, ""];

  const deployLine = formatDeployMarker();
  if (deployLine) {
    lines.push(deployLine);
    lines.push("");
  }

  const sections = [
    formatHealth(m),
    formatStuck(m),
    formatWebhooks(m),
    formatCronHealth(m),
    formatSecurity(m),
  ];

  let anySection = false;
  for (const section of sections) {
    if (section.length === 0) continue;
    anySection = true;
    lines.push(...section);
    lines.push("");
  }

  if (!anySection) {
    lines.push("_No tech signals today._");
  }

  return clampToSlackLimit(lines.join("\n"));
}

// -----------------------------------------------------------------------------
// Handler
// -----------------------------------------------------------------------------

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  const trackDuration = startCronTimer("tech-digest", 60);
  const startMs = Date.now();
  let cronError: string | undefined;

  try {
    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const yesterdayStart = new Date(dayStart.getTime() - 86_400_000);
    const dayKey = dayString(yesterdayStart);

    const claimed = await tryClaimSlackAlert("tech_digest", "day", dayKey);
    if (!claimed) {
      return NextResponse.json({ ok: true, day: dayKey, alreadyClaimed: true });
    }

    const metrics = await fetchTechMetrics(yesterdayStart.toISOString(), dayStart.toISOString());

    await notifySlack({
      channel: "ops",
      kind: "tech_digest",
      text: formatTechDigest(dayKey, metrics),
      username: "ops_alerts",
    });

    return NextResponse.json({ ok: true, day: dayKey, sent: true });
  } catch (err) {
    logger.error({ err }, "tech-digest cron failed");
    cronError = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  } finally {
    await trackDuration();
    await recordCronRun("tech-digest", startMs, cronError ? "error" : "success", cronError);
  }
}
