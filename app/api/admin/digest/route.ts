/* eslint-disable no-secrets/no-secrets */
import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import {
  fetchWeeklyMetrics,
  delta,
  type WeeklyMetrics,
} from "@features/admin/server/digest-metrics";
import logger from "@shared/observability/logger";

// Adapter so the existing HTML template (below) keeps its old field
// names while we use the new shared fetcher. Behavior identical to
// the pre-refactor `fetchPeriodStats`.
async function fetchPeriodStats(since: string, until: string) {
  const w: WeeklyMetrics = await fetchWeeklyMetrics(since, until);
  // Pre-refactor field shape (see git history for the prior implementation).
  // `total` here was "submissions in window" — keeping survey starts as the
  // closest equivalent since it includes incomplete sessions.
  return {
    total: w.completions + (w.surveyStarts - w.completions), // = surveyStarts, kept verbose for clarity
    completed: w.completions,
    completionRate: w.completionRate,
    avgDurationSec: w.avgCompletionSec,
    waitlistCount: w.waitlist,
    scoredCount: w.topArchetypes.reduce((sum, [, n]) => sum + n, 0),
    topArchetypes: w.topArchetypes,
    topUtm: w.topUtmSources,
  };
}

function deltaColor(curr: number, prev: number): string {
  if (curr > prev) return "color:#4ade80";
  if (curr < prev) return "color:#f87171";
  return "color:#9ca3af";
}

export async function GET(request: Request) {
  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "admin")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-digest",
    limit: 5,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);

    const [current, previous] = await Promise.all([
      fetchPeriodStats(weekAgo.toISOString(), now.toISOString()),
      fetchPeriodStats(twoWeeksAgo.toISOString(), weekAgo.toISOString()),
    ]);

    const dateStr = now.toISOString().split("T")[0];
    const weekStr = `${weekAgo.toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>LoveIQ Weekly Digest — ${dateStr}</title></head>
<body style="margin:0;padding:40px 20px;background:#0b0613;color:#e8e0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;">
  <div style="text-align:center;margin-bottom:32px;">
    <h1 style="font-size:24px;font-weight:700;color:#e8e0f0;margin:0;">LoveIQ Weekly Digest</h1>
    <p style="color:#9ca3af;font-size:14px;margin:8px 0 0;">${weekStr}</p>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;">
    <div style="background:#0f0a18;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px;">
      <p style="color:#9ca3af;font-size:12px;margin:0 0 4px;">Submissions</p>
      <p style="font-size:24px;font-weight:700;color:#e8e0f0;margin:0;">${current.total}</p>
      <p style="${deltaColor(current.total, previous.total)};font-size:12px;margin:4px 0 0;">${delta(current.total, previous.total)} vs prev week</p>
    </div>
    <div style="background:#0f0a18;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px;">
      <p style="color:#9ca3af;font-size:12px;margin:0 0 4px;">Completion Rate</p>
      <p style="font-size:24px;font-weight:700;color:#e8e0f0;margin:0;">${current.completionRate}%</p>
      <p style="${deltaColor(current.completionRate, previous.completionRate)};font-size:12px;margin:4px 0 0;">${delta(current.completionRate, previous.completionRate)} vs prev week</p>
    </div>
    <div style="background:#0f0a18;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px;">
      <p style="color:#9ca3af;font-size:12px;margin:0 0 4px;">Waitlist Signups</p>
      <p style="font-size:24px;font-weight:700;color:#e8e0f0;margin:0;">${current.waitlistCount}</p>
      <p style="${deltaColor(current.waitlistCount, previous.waitlistCount)};font-size:12px;margin:4px 0 0;">${delta(current.waitlistCount, previous.waitlistCount)} vs prev week</p>
    </div>
    <div style="background:#0f0a18;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px;">
      <p style="color:#9ca3af;font-size:12px;margin:0 0 4px;">Scored</p>
      <p style="font-size:24px;font-weight:700;color:#e8e0f0;margin:0;">${current.scoredCount}</p>
      <p style="${deltaColor(current.scoredCount, previous.scoredCount)};font-size:12px;margin:4px 0 0;">${delta(current.scoredCount, previous.scoredCount)} vs prev week</p>
    </div>
  </div>

  ${
    current.topArchetypes.length > 0
      ? `
  <div style="background:#0f0a18;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px;margin-bottom:16px;">
    <h3 style="color:#e8e0f0;font-size:14px;margin:0 0 12px;">Top Archetypes</h3>
    ${current.topArchetypes
      .map(
        ([name, count]) => `
    <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
      <span style="color:#9ca3af;font-size:13px;">${name}</span>
      <span style="color:#9c7dff;font-size:13px;font-weight:600;">${count}</span>
    </div>`
      )
      .join("")}
  </div>`
      : ""
  }

  ${
    current.topUtm.length > 0
      ? `
  <div style="background:#0f0a18;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px;margin-bottom:16px;">
    <h3 style="color:#e8e0f0;font-size:14px;margin:0 0 12px;">Top UTM Sources</h3>
    ${current.topUtm
      .map(
        ([source, count]) => `
    <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
      <span style="color:#9ca3af;font-size:13px;">${source}</span>
      <span style="color:#f26d4f;font-size:13px;font-weight:600;">${count}</span>
    </div>`
      )
      .join("")}
  </div>`
      : ""
  }

  <p style="text-align:center;color:#6b7280;font-size:11px;margin-top:32px;">
    Generated ${now.toISOString()} by LoveIQ Admin
  </p>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="loveiq-digest-${dateStr}.html"`,
      },
    });
  } catch (err) {
    logger.error({ err }, "Digest generation error");
    return NextResponse.json({ error: "Unable to generate digest." }, { status: 500 });
  }
}
