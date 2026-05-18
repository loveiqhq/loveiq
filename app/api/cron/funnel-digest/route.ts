/**
 * GET /api/cron/funnel-digest
 *
 * Daily ops digest. Runs at 09:00 UTC every day and surfaces yesterday's
 * topline numbers; on Mondays also surfaces the top-3 highest drop-off
 * questions across the previous 7 days of survey behavior.
 *
 * Numbers come from analytics_event + survey_submission + payment via
 * lightweight REST + count queries — no RPC needed.
 *
 * Protected by `Authorization: Bearer ${CRON_SECRET}`.
 */

import { NextResponse } from "next/server";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { getBreaker } from "@shared/http/circuit-breaker";
import logger from "@shared/observability/logger";
import { notifySlack } from "@shared/observability/slack";
import { tryClaimSlackAlert, verifyCronAuth } from "@shared/observability/slack-alert-dedup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 50;

async function supabaseFetch(path: string, init?: RequestInit) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("supabase_not_configured");
  return getBreaker("supabase").fire(() =>
    fetchWithTimeout(`${url}${path}`, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "count=exact",
        ...(init?.headers ?? {}),
      },
      timeoutMs: 8000,
    })
  );
}

// Returns the `count` from the PostgREST Content-Range header.
function readCount(res: Response): number {
  const cr = res.headers.get("content-range");
  if (!cr) return 0;
  const m = cr.match(/\/(\d+)$/);
  return m ? Number(m[1]!) : 0;
}

async function countWhere(table: string, filters: string): Promise<number> {
  const res = await supabaseFetch(`/rest/v1/${table}?${filters}&select=id`, {
    headers: { Range: "0-0" },
  });
  return res.ok ? readCount(res) : 0;
}

interface DigestNumbers {
  submissions: number;
  reportViews: number;
  unlocks: number;
  payments: number;
  bounces: number;
  unsubscribes: number;
}

async function fetchDigestNumbers(sinceIso: string, untilIso: string): Promise<DigestNumbers> {
  const range = (col: string) =>
    `${col}=gte.${encodeURIComponent(sinceIso)}&${col}=lt.${encodeURIComponent(untilIso)}`;
  const [submissions, reportViews, unlocks, payments, bounces, unsubscribes] = await Promise.all([
    countWhere("survey_submission", range("created_date_time")),
    countWhere("analytics_event", `event_type=eq.report_viewed&${range("event_time")}`),
    countWhere("analytics_event", `event_type=eq.paywall_unlocked&${range("event_time")}`),
    countWhere("payment", `status=eq.succeeded&${range("created_date_time")}`),
    countWhere("email_suppression", `reason=eq.hard_bounce&${range("created_at")}`),
    countWhere("email_suppression", `reason=eq.unsubscribed&${range("created_at")}`),
  ]);
  return { submissions, reportViews, unlocks, payments, bounces, unsubscribes };
}

interface WorstQuestion {
  questionIndex: number;
  abandonCount: number;
}

async function fetchWeeklyDropOff(sinceIso: string): Promise<WorstQuestion[]> {
  // Pull up to N abandon events from the past week.
  const res = await supabaseFetch(
    `/rest/v1/survey_behavior_event?direction=eq.abandon&event_time=gte.${encodeURIComponent(sinceIso)}&select=question_index&limit=5000`
  );
  if (!res.ok) return [];
  const rows = (await res.json()) as Array<{ question_index: number | null }>;
  const counts = new Map<number, number>();
  for (const r of rows) {
    if (r.question_index == null) continue;
    counts.set(r.question_index, (counts.get(r.question_index) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([questionIndex, abandonCount]) => ({ questionIndex, abandonCount }))
    .sort((a, b) => b.abandonCount - a.abandonCount)
    .slice(0, 3);
}

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const yesterdayStart = new Date(dayStart.getTime() - 86_400_000);
    const dayKey = yesterdayStart.toISOString().slice(0, 10);

    // Once-per-day claim so a duplicate cron fire (Vercel retry) never
    // double-sends the digest.
    const claimed = await tryClaimSlackAlert("daily_digest", "day", dayKey);
    if (!claimed) {
      return NextResponse.json({ skipped: "already_sent_for_day", day: dayKey });
    }

    const numbers = await fetchDigestNumbers(yesterdayStart.toISOString(), dayStart.toISOString());

    const lines = [
      `:bar_chart: *Daily digest — ${dayKey}*`,
      `• Submissions: ${numbers.submissions}`,
      `• Report views: ${numbers.reportViews}`,
      `• Paywall unlocks: ${numbers.unlocks}`,
      `• Successful payments: ${numbers.payments}`,
      `• Hard bounces: ${numbers.bounces}`,
      `• Unsubscribes: ${numbers.unsubscribes}`,
    ];

    // Mondays (UTC): append last-week funnel drop-off summary.
    if (now.getUTCDay() === 1) {
      const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
      const worst = await fetchWeeklyDropOff(weekAgo.toISOString());
      if (worst.length > 0) {
        lines.push("", "*Top survey drop-offs (last 7 days):*");
        for (const w of worst) {
          lines.push(`• Q${w.questionIndex}: ${w.abandonCount} abandons`);
        }
      }
    }

    await notifySlack({
      channel: "ops",
      kind: "daily_digest",
      text: lines.join("\n"),
      username: "ops_alerts",
    });

    return NextResponse.json({ ok: true, day: dayKey, numbers });
  } catch (err) {
    logger.error({ err }, "funnel-digest cron failed");
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  }
}
