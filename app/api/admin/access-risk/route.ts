import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole, ROUTE_PERMISSIONS, type AdminRole } from "@features/admin/server/roles";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

interface AdminUserRow {
  email: string;
  role: AdminRole;
}

interface AuditRow {
  id: number;
  admin_email: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
}

interface ReviewRow {
  id: number;
  status: string;
}

type RiskLevel = "critical" | "high" | "medium" | "low";

function summarizeMetadata(metadata: Record<string, unknown> | null): string {
  if (!metadata || Object.keys(metadata).length === 0) return "No metadata";
  return Object.entries(metadata)
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" | ");
}

function classifyRisk(action: string, resourceType: string | null): RiskLevel {
  const normalized = `${action} ${resourceType ?? ""}`.toLowerCase();
  if (
    /(delete|remove|rollback|pause|toggle_survey|survey-status|admin_users|permission|review_request|scoring|decision|rejected)/.test(
      normalized
    )
  ) {
    return "critical";
  }
  if (
    /(alert|benchmark|goal|experiment|metric_registry|strategy|update_|create_|review_|approve|changes-requested)/.test(
      normalized
    )
  ) {
    return "high";
  }
  if (/(note|comment|tag|view|annotation|export)/.test(normalized)) {
    return "medium";
  }
  return "low";
}

function riskWeight(level: RiskLevel): number {
  if (level === "critical") return 4;
  if (level === "high") return 3;
  if (level === "medium") return 2;
  return 1;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
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
    bucket: "admin-access-risk",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const rawDays = Number.parseInt(url.searchParams.get("days") ?? "30", 10);
  const days = Math.min(Math.max(Number.isNaN(rawDays) ? 30 : rawDays, 7), 90);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();

  try {
    const [adminsRes, auditRes, reviewsRes] = await Promise.all([
      supabaseFetch("/rest/v1/admin_users?select=email,role&order=role.desc,email.asc", {
        headers: { Range: "0-199" },
      }),
      supabaseFetch(
        `/rest/v1/admin_audit_log?select=id,admin_email,action,resource_type,resource_id,metadata,ip,created_at&created_at=gte.${since}&order=created_at.desc`,
        { headers: { Range: "0-999" } }
      ),
      supabaseFetch(
        "/rest/v1/admin_review_request?select=id,status&status=in.(requested,in-review,changes-requested)",
        { headers: { Range: "0-199" } }
      ),
    ]);

    if (!adminsRes.ok || !auditRes.ok || !reviewsRes.ok) {
      logger.error(
        {
          adminsStatus: adminsRes.status,
          auditStatus: auditRes.status,
          reviewsStatus: reviewsRes.status,
        },
        "Access risk query failed"
      );
      return NextResponse.json({ error: "Unable to load access and risk." }, { status: 500 });
    }

    const admins = (await adminsRes.json()) as AdminUserRow[];
    const auditLogs = (await auditRes.json()) as AuditRow[];
    const openReviews = (await reviewsRes.json()) as ReviewRow[];

    const auditByAdmin = new Map<string, AuditRow[]>();
    for (const row of auditLogs) {
      const existing = auditByAdmin.get(row.admin_email) ?? [];
      existing.push(row);
      auditByAdmin.set(row.admin_email, existing);
    }

    const adminRoster = admins.map((entry) => {
      const activity = auditByAdmin.get(entry.email) ?? [];
      const riskEntries = activity.filter((row) => {
        const level = classifyRisk(row.action, row.resource_type);
        return level === "critical" || level === "high";
      });
      const uniqueIps = unique(activity.map((row) => row.ip).filter(Boolean));
      return {
        email: entry.email,
        role: entry.role,
        actionCount: activity.length,
        highRiskCount: riskEntries.length,
        riskScore: riskEntries.reduce(
          (sum, row) => sum + riskWeight(classifyRisk(row.action, row.resource_type)),
          0
        ),
        lastActive: activity[0]?.created_at ?? null,
        uniqueIps: uniqueIps.length,
        topActions: Object.entries(
          activity.reduce<Record<string, number>>((acc, row) => {
            acc[row.action] = (acc[row.action] ?? 0) + 1;
            return acc;
          }, {})
        )
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([action, count]) => ({ action, count })),
        stale:
          !activity[0] || Date.now() - new Date(activity[0].created_at).getTime() > 30 * 86_400_000,
      };
    });

    const highRiskActions = auditLogs
      .map((row) => ({
        id: row.id,
        adminEmail: row.admin_email,
        action: row.action,
        resourceType: row.resource_type ?? "unknown",
        resourceId: row.resource_id,
        ip: row.ip,
        createdAt: row.created_at,
        risk: classifyRisk(row.action, row.resource_type),
        metadataSummary: summarizeMetadata(row.metadata),
      }))
      .filter((row) => row.risk === "critical" || row.risk === "high")
      .slice(0, 30);

    const routeMatrix = [
      { role: "viewer" as const, routes: 0 },
      { role: "editor" as const, routes: 0 },
      { role: "admin" as const, routes: 0 },
    ].map((group) => ({
      ...group,
      routes: Object.values(ROUTE_PERMISSIONS).filter((role) => role === group.role).length,
      examples: Object.entries(ROUTE_PERMISSIONS)
        .filter(([, role]) => role === group.role)
        .slice(0, 6)
        .map(([route]) => route),
    }));

    const topRiskResourceMap = highRiskActions.reduce<
      Map<string, { count: number; lastTouched: string; admins: Set<string> }>
    >((acc, row) => {
      const current = acc.get(row.resourceType) ?? {
        count: 0,
        lastTouched: row.createdAt,
        admins: new Set<string>(),
      };
      current.count += 1;
      current.admins.add(row.adminEmail);
      if (row.createdAt > current.lastTouched) current.lastTouched = row.createdAt;
      acc.set(row.resourceType, current);
      return acc;
    }, new Map());

    const topRiskResources = [...topRiskResourceMap.entries()]
      .map(([resourceType, value]) => ({
        resourceType,
        count: value.count,
        lastTouched: value.lastTouched,
        uniqueAdmins: value.admins.size,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return NextResponse.json({
      summary: {
        admins: admins.length,
        staleAdmins: adminRoster.filter((entry) => entry.stale).length,
        highRiskActions7d: highRiskActions.filter((row) => row.createdAt >= since7d).length,
        uniqueIps30d: unique(auditLogs.map((row) => row.ip).filter(Boolean)).length,
        adminOnlyRoutes: Object.values(ROUTE_PERMISSIONS).filter((role) => role === "admin").length,
        openReviews: openReviews.length,
      },
      adminRoster: adminRoster.sort(
        (a, b) =>
          b.riskScore - a.riskScore ||
          b.actionCount - a.actionCount ||
          a.email.localeCompare(b.email)
      ),
      highRiskActions,
      routeMatrix,
      topRiskResources,
      days,
    });
  } catch (err) {
    logger.error({ err }, "Access risk GET error");
    return NextResponse.json({ error: "Unable to load access and risk." }, { status: 500 });
  }
}
