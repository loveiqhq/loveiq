/* eslint-disable no-secrets/no-secrets */
import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@/lib/logger";

function parseUtmSource(tracker: string | null): string {
  if (!tracker?.trim()) return "Direct";
  try {
    const parsed = JSON.parse(tracker);
    return parsed.utm_source || "Direct";
  } catch {
    return tracker.trim();
  }
}

function incrementCount<K>(map: Map<K, number>, key: K, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

async function fetchPeriodStats(since: string, until: string) {
  // Submissions
  const subRes = await supabaseFetch(
    `/rest/v1/survey_submission?select=id,status,duration_ms,utm_tracker,created_date_time&created_date_time=gte.${since}&created_date_time=lte.${until}`,
    { headers: { Range: "0-9999" } }
  );
  const subs = subRes.ok
    ? ((await subRes.json()) as Array<{
        id: number;
        status: string;
        duration_ms: number | null;
        utm_tracker: string | null;
      }>)
    : [];

  const total = subs.length;
  const completed = subs.filter((s) => s.status === "completed").length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const durations = subs.filter((s) => s.duration_ms).map((s) => s.duration_ms!);
  const avgDuration =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 1000)
      : 0;

  // Waitlist
  const wlRes = await supabaseFetch(
    `/rest/v1/waitlist_user?select=id&created_date_time=gte.${since}&created_date_time=lte.${until}`,
    { headers: { Range: "0-9999" } }
  );
  const waitlistCount = wlRes.ok ? ((await wlRes.json()) as Array<unknown>).length : 0;

  // Scoring
  const scoreRes = await supabaseFetch(
    `/rest/v1/scoring_result?select=primary_archetype,survey_submission_id&scored_at=gte.${since}&scored_at=lte.${until}`,
    { headers: { Range: "0-9999" } }
  );
  const scores = scoreRes.ok
    ? ((await scoreRes.json()) as Array<{ primary_archetype: string }>)
    : [];

  const archetypeCounts = new Map<string, number>();
  for (const s of scores) {
    if (s.primary_archetype) {
      incrementCount(archetypeCounts, s.primary_archetype);
    }
  }
  const topArchetypes = [...archetypeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  // UTM sources
  const utmCounts = new Map<string, number>();
  for (const s of subs) {
    const src = parseUtmSource(s.utm_tracker);
    incrementCount(utmCounts, src);
  }
  const topUtm = [...utmCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return {
    total,
    completed,
    completionRate,
    avgDurationSec: avgDuration,
    waitlistCount,
    scoredCount: scores.length,
    topArchetypes,
    topUtm,
  };
}

function delta(curr: number, prev: number): string {
  if (prev === 0) return curr > 0 ? "+100%" : "—";
  const pct = Math.round(((curr - prev) / prev) * 100);
  return pct > 0 ? `+${pct}%` : `${pct}%`;
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
