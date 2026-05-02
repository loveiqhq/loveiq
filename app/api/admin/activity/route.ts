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
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function incrementCount<K>(map: Map<K, number>, key: K, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  const existing = map.get(key);
  if (existing) return existing;
  const value = create();
  map.set(key, value);
  return value;
}

function classifySeverity(action: string, resourceType: string): "high" | "medium" | "low" {
  const normalized = `${action} ${resourceType}`.toLowerCase();
  if (
    /(delete|remove|pause|disable|rollback|status|close|flag|governance|scoring|survey-status)/.test(
      normalized
    )
  ) {
    return "high";
  }
  if (/(create|update|edit|assign|benchmark|experiment|goal|decision|changelog)/.test(normalized)) {
    return "medium";
  }
  return "low";
}

function summarizeMetadata(metadata: Record<string, unknown> | null): string {
  if (!metadata || Object.keys(metadata).length === 0) return "No metadata";
  const pairs = Object.entries(metadata)
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`);
  return pairs.join(" · ");
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
        `/rest/v1/admin_audit_log?select=id,admin_email,action,resource_type,resource_id,metadata,created_at${dateFilter}&order=created_at.desc`,
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
    const adminMap = new Map<
      string,
      { count: number; actions: Map<string, number>; lastActive: string }
    >();
    for (const log of auditLogs) {
      const adminStats = getOrCreate(adminMap, log.admin_email, () => ({
        count: 0,
        actions: new Map<string, number>(),
        lastActive: log.created_at,
      }));
      adminStats.count++;
      incrementCount(adminStats.actions, log.action);
      if (log.created_at > adminStats.lastActive) adminStats.lastActive = log.created_at;
    }

    const perAdmin = [...adminMap.entries()]
      .map(([email, d]) => {
        const topAction = [...d.actions.entries()].sort((a, b) => b[1] - a[1])[0];
        return {
          email,
          actionCount: d.count,
          topAction: topAction ? topAction[0] : "—",
          lastActive: d.lastActive,
        };
      })
      .sort((a, b) => b.actionCount - a.actionCount);

    // Action type distribution
    const actionMap = new Map<string, number>();
    for (const log of auditLogs) {
      incrementCount(actionMap, log.action);
    }
    const actionDistribution = [...actionMap.entries()]
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count);

    const severityMap = new Map<string, number>([
      ["high", 0],
      ["medium", 0],
      ["low", 0],
    ]);
    const resourceMap = new Map<
      string,
      { count: number; lastTouched: string; highSeverityCount: number }
    >();
    for (const log of auditLogs) {
      const severity = classifySeverity(log.action, log.resource_type);
      incrementCount(severityMap, severity);
      const resourceType = log.resource_type || "unknown";
      const current = getOrCreate(resourceMap, resourceType, () => ({
        count: 0,
        lastTouched: log.created_at,
        highSeverityCount: 0,
      }));
      current.count += 1;
      if (severity === "high") current.highSeverityCount += 1;
      if (log.created_at > current.lastTouched) current.lastTouched = log.created_at;
    }

    // Daily actions
    const dailyMap = new Map<string, number>();
    for (const log of auditLogs) {
      const day = log.created_at.slice(0, 10);
      incrementCount(dailyMap, day);
    }
    const dailyActions = [...dailyMap.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const changeWindows = [
      {
        label: "24h",
        count: auditLogs.filter(
          (log) => Date.now() - new Date(log.created_at).getTime() <= 86_400_000
        ).length,
      },
      {
        label: "7d",
        count: auditLogs.filter(
          (log) => Date.now() - new Date(log.created_at).getTime() <= 7 * 86_400_000
        ).length,
      },
      {
        label: "30d",
        count: auditLogs.filter(
          (log) => Date.now() - new Date(log.created_at).getTime() <= 30 * 86_400_000
        ).length,
      },
    ];

    return NextResponse.json({
      totalActions: auditLogs.length,
      activeAdmins: adminMap.size,
      unreviewedCount: unreviewedTotal,
      perAdmin,
      actionDistribution,
      dailyActions,
      severitySummary: {
        high: severityMap.get("high") ?? 0,
        medium: severityMap.get("medium") ?? 0,
        low: severityMap.get("low") ?? 0,
      },
      resourceHotspots: [...resourceMap.entries()]
        .map(([resourceType, value]) => ({
          resourceType,
          count: value.count,
          lastTouched: value.lastTouched,
          highSeverityCount: value.highSeverityCount,
        }))
        .sort((a, b) => b.highSeverityCount - a.highSeverityCount || b.count - a.count)
        .slice(0, 12),
      changeWindows,
      entries: auditLogs.slice(0, 100).map((log) => ({
        id: log.id,
        adminEmail: log.admin_email,
        action: log.action,
        resourceType: log.resource_type || "unknown",
        resourceId: log.resource_id,
        severity: classifySeverity(log.action, log.resource_type),
        createdAt: log.created_at,
        metadataSummary: summarizeMetadata(log.metadata),
      })),
    });
  } catch (err) {
    logger.error({ err }, "Admin activity error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
