import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

interface AuditRow {
  id: number;
  admin_email: string;
  action: string;
  resource_type: string;
  created_at: string;
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
    bucket: "admin-activity",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const since = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
  const dateFilter = since ? `&created_at=gte.${since}` : "";

  try {
    const [auditRes, unreviewedRes] = await Promise.all([
      supabaseFetch(
        `/rest/v1/admin_audit_log?select=id,admin_email,action,resource_type,created_at${dateFilter}&order=created_at.desc`,
        { headers: { Range: "0-49999" } }
      ),
      supabaseFetch(
        `/rest/v1/survey_submission?select=id,created_date_time&status=eq.completed&order=created_date_time.asc`,
        { headers: { Prefer: "count=exact", Range: "0-99" } }
      ),
    ]);

    const auditLogs = auditRes.ok ? ((await auditRes.json()) as AuditRow[]) : [];
    const unreviewed = unreviewedRes.ok ? await unreviewedRes.json() : [];
    const unreviewedTotal = parseInt(
      unreviewedRes.headers?.get("content-range")?.split("/")[1] || String(unreviewed.length),
      10
    );

    // Per-admin stats
    const adminMap: Record<
      string,
      { count: number; actions: Record<string, number>; lastActive: string }
    > = {};
    for (const log of auditLogs) {
      if (!adminMap[log.admin_email]) {
        adminMap[log.admin_email] = { count: 0, actions: {}, lastActive: log.created_at };
      }
      adminMap[log.admin_email].count++;
      adminMap[log.admin_email].actions[log.action] =
        (adminMap[log.admin_email].actions[log.action] || 0) + 1;
    }

    const perAdmin = Object.entries(adminMap)
      .map(([email, d]) => {
        const topAction = Object.entries(d.actions).sort((a, b) => b[1] - a[1])[0];
        return {
          email,
          actionCount: d.count,
          topAction: topAction ? topAction[0] : "—",
          lastActive: d.lastActive,
        };
      })
      .sort((a, b) => b.actionCount - a.actionCount);

    // Action type distribution
    const actionMap: Record<string, number> = {};
    for (const log of auditLogs) {
      actionMap[log.action] = (actionMap[log.action] || 0) + 1;
    }
    const actionDistribution = Object.entries(actionMap)
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count);

    // Daily actions
    const dailyMap: Record<string, number> = {};
    for (const log of auditLogs) {
      const day = log.created_at.slice(0, 10);
      dailyMap[day] = (dailyMap[day] || 0) + 1;
    }
    const dailyActions = Object.entries(dailyMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      totalActions: auditLogs.length,
      activeAdmins: Object.keys(adminMap).length,
      unreviewedCount: unreviewedTotal,
      perAdmin,
      actionDistribution,
      dailyActions,
    });
  } catch (err) {
    logger.error({ err }, "Admin activity error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
