/**
 * GET /api/cron/product-digest
 *
 * Daily product-lead digest at 09:05 UTC. Five sections:
 *   - Voice of customer (top-3 :thumbsdown: chapters + sample comment)
 *   - Survey question drop-off (top-3 abandoned questions)
 *   - Pricing tier conversion (per-plan quoted → paid)
 *   - UX quality (rage clicks + scroll depth)
 *   - Wizard slide funnel (pre-Q1 drop-off)
 *   - Onboarding funnel (invite → share → unlock)
 *
 * Sections render only when they have something to say — empty data ⇒ no
 * header. Protected by `Authorization: Bearer ${CRON_SECRET}`. Idempotent via
 * slack_alert_sent (kind="product_digest").
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
import { fetchProductMetrics, type ProductMetrics } from "@features/admin/server/digest-product";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function dayString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// -----------------------------------------------------------------------------
// Section renderers — pure functions, exported for tests.
// -----------------------------------------------------------------------------

export function formatVoiceOfCustomer(m: ProductMetrics): string[] {
  const voc = m.voiceOfCustomer;
  if (!voc) return [];
  if (voc.topChapters.length === 0 && voc.topIssueCategories.length === 0) return [];
  const lines: string[] = ["*Voice of customer*"];
  for (const row of voc.topChapters) {
    const sample = row.sampleComment ? ` — "${escapeSlack(row.sampleComment)}"` : "";
    lines.push(`• Chapter \`${escapeSlack(row.sectionId)}\`: ${row.downs} :thumbsdown:${sample}`);
  }
  if (voc.topIssueCategories.length > 0) {
    const list = voc.topIssueCategories
      .map((c) => `${escapeSlack(c.issue)} (${c.count})`)
      .join(", ");
    lines.push(`• ${voc.totalIssuesWithComment} free-text issues today (top: ${list})`);
  }
  return lines;
}

export function formatDropOff(m: ProductMetrics): string[] {
  if (m.dropOff.length === 0) return [];
  const lines: string[] = ["*Survey drop-off*"];
  for (const row of m.dropOff) {
    lines.push(`• Q${row.questionIndex}: ${row.abandonCount} abandons`);
  }
  return lines;
}

export function formatPricing(m: ProductMetrics): string[] {
  if (m.pricing.length === 0 && m.deviceMix.length === 0) return [];
  const lines: string[] = ["*Pricing tier conversion*"];
  for (const row of m.pricing) {
    lines.push(
      `• ${row.plan}: ${row.quoted} quoted → ${row.purchased} paid (${row.conversionPct.toFixed(1)}%, revenue ${row.revenueEur.toFixed(2)})`
    );
  }
  // Device mix inline — same denominator (quote-shown population), so it
  // lives alongside the per-plan funnel.
  if (m.deviceMix.length > 0) {
    const mixStr = m.deviceMix
      .map((d) => `${escapeSlack(d.deviceType)} ${d.pct.toFixed(0)}%`)
      .join(" | ");
    lines.push(`• Devices at paywall: ${mixStr}`);
  }
  return lines;
}

export function formatResume(m: ProductMetrics): string[] {
  const r = m.resume;
  if (!r || r.paused === 0) return [];
  const lines: string[] = ["*Resume behavior*"];
  const ratePct = r.resumeRatePct != null ? ` (${r.resumeRatePct.toFixed(1)}% resume rate)` : "";
  lines.push(`• ${r.paused} paused in last 7d → ${r.resumed} resumed today${ratePct}`);
  return lines;
}

export function formatUxQuality(m: ProductMetrics): string[] {
  const ux = m.uxQuality;
  if (!ux) return [];
  // If literally nothing happened (zero of everything), skip — no signal.
  if (
    ux.rageClicks === 0 &&
    ux.scroll25 === 0 &&
    ux.scroll50 === 0 &&
    ux.scroll75 === 0 &&
    ux.scroll100 === 0
  ) {
    return [];
  }
  const lines: string[] = ["*UX quality*"];
  const scroll75 = ux.scroll75ofMidPct != null ? `${ux.scroll75ofMidPct.toFixed(1)}%` : "—";
  const scroll100 = ux.scroll100ofMidPct != null ? `${ux.scroll100ofMidPct.toFixed(1)}%` : "—";
  lines.push(
    `• Rage clicks: ${ux.rageClicks} | Scroll 75%-of-50%: ${scroll75} | Scroll 100%-of-50%: ${scroll100}`
  );
  lines.push(
    `• Scroll counts: 25% ${ux.scroll25} | 50% ${ux.scroll50} | 75% ${ux.scroll75} | 100% ${ux.scroll100}`
  );
  return lines;
}

export function formatWizard(m: ProductMetrics): string[] {
  const wiz = m.wizard;
  if (!wiz || wiz.steps.length === 0) return [];
  const lines: string[] = ["*Wizard funnel*"];
  const stepStrs = wiz.steps.map((s) => {
    const pct = s.retainedPct != null ? ` (${s.retainedPct.toFixed(0)}% kept)` : "";
    return `${s.fromSlide}→${s.toSlide}: ${s.advanced}${pct}`;
  });
  lines.push(`• ${stepStrs.join(" | ")}`);
  return lines;
}

export function formatOnboarding(m: ProductMetrics): string[] {
  const ob = m.onboarding;
  if (!ob || ob.invitesSent === 0) return [];
  const lines: string[] = ["*Onboarding (invites → unlocks)*"];
  const openStr = ob.openRatePct != null ? ` (${ob.openRatePct.toFixed(1)}%)` : "";
  const unlockStr = ob.unlockRatePct != null ? ` (${ob.unlockRatePct.toFixed(1)}%)` : "";
  lines.push(
    `• ${ob.invitesSent} invites sent → ${ob.sharesOpened} opened${openStr} → ${ob.sharesUnlocked} unlocked${unlockStr}`
  );
  if (ob.viralKFactor != null) {
    lines.push(`• Viral K-factor: ${ob.viralKFactor.toFixed(2)} (invites per completion)`);
  }
  return lines;
}

// -----------------------------------------------------------------------------
// Top-level formatter — exported for tests.
// -----------------------------------------------------------------------------

export function formatProductDigest(dayKey: string, m: ProductMetrics): string {
  const lines: string[] = [`:art: *Product digest — ${dayKey} UTC*`, ""];

  const sections = [
    formatVoiceOfCustomer(m),
    formatDropOff(m),
    formatResume(m),
    formatPricing(m),
    formatUxQuality(m),
    formatWizard(m),
    formatOnboarding(m),
  ];

  let anySection = false;
  for (const section of sections) {
    if (section.length === 0) continue;
    anySection = true;
    lines.push(...section);
    lines.push("");
  }

  if (!anySection) {
    lines.push("_No product signals today._");
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

  // Skip on the staging Vercel project (shares prod DB).
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  const trackDuration = startCronTimer("product-digest", 60);
  const startMs = Date.now();
  let cronError: string | undefined;

  try {
    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const yesterdayStart = new Date(dayStart.getTime() - 86_400_000);
    const dayKey = dayString(yesterdayStart);

    const claimed = await tryClaimSlackAlert("product_digest", "day", dayKey);
    if (!claimed) {
      return NextResponse.json({ ok: true, day: dayKey, alreadyClaimed: true });
    }

    const metrics = await fetchProductMetrics(yesterdayStart.toISOString(), dayStart.toISOString());

    await notifySlack({
      channel: "ops",
      kind: "product_digest",
      text: formatProductDigest(dayKey, metrics),
      username: "ops_alerts",
    });

    return NextResponse.json({ ok: true, day: dayKey, sent: true });
  } catch (err) {
    logger.error({ err }, "product-digest cron failed");
    cronError = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  } finally {
    await trackDuration();
    await recordCronRun("product-digest", startMs, cronError ? "error" : "success", cronError);
  }
}
