import { buildCreativeIntelligenceSnapshot } from "@features/admin/server/creative-intelligence";
import { buildHealthStatusSnapshot } from "@features/admin/server/health";
import type {
  AdminIntelligenceDraft,
  AdminIntelligenceEvidence,
  AdminIntelligenceItem,
  AdminIntelligenceSection,
  AdminIntelligenceSnapshot,
  AdminIntelligenceSurface,
  AdminIntelligenceTone,
} from "@features/admin/server/intelligence-types";
import { buildMetricLineageSnapshot } from "@features/admin/server/metric-lineage";
import { clampDays } from "@features/admin/server/next-level";
import { buildReferralIntelligenceSnapshot } from "@features/admin/server/referral-intelligence";
import { supabaseFetch } from "@features/admin/server/supabase";

type ResilienceSurface = Extract<AdminIntelligenceSurface, "growth" | "health">;
type RiskLevel = "critical" | "high" | "medium" | "low";

interface AdminUserRow {
  email: string;
  role: "viewer" | "editor" | "admin";
}

interface AuditRow {
  admin_email: string;
  action: string;
  resource_type: string | null;
  ip: string | null;
  created_at: string;
}

interface PermissionAnomalyCandidate {
  email: string;
  role: AdminUserRow["role"];
  anomalyScore: number;
  actionCount: number;
  criticalCount: number;
  highRiskCount: number;
  uniqueIps: number;
  resourceSpread: number;
  stale: boolean;
  reasons: string[];
  lastActive: string | null;
}

function ensureDays(value: number): number {
  return clampDays(Number.isFinite(value) ? Math.round(value) : 30, 7, 365);
}

function makeEvidence(label: string, value: string, href: string): AdminIntelligenceEvidence {
  return { label, value, href };
}

function makeDraft(
  kind: AdminIntelligenceDraft["kind"],
  title: string,
  detail: string,
  href: string
): AdminIntelligenceDraft {
  const sourceType =
    kind === "experiment"
      ? "experiment"
      : kind === "hypothesis" || kind === "investigation"
        ? "investigation"
        : "general";

  return {
    kind,
    title,
    detail,
    href,
    actionSeed:
      kind === "brief" || kind === "segment"
        ? null
        : {
            title,
            description: detail,
            sourceType,
            metricKey: null,
            expectedImpact: null,
            linkedHref: href,
          },
  };
}

function makeItem(input: {
  id: string;
  title: string;
  detail: string;
  tone: AdminIntelligenceTone;
  confidence: "high" | "medium" | "low";
  capabilities: string[];
  recommendation: string;
  href: string;
  caveat?: string | null;
  evidence?: AdminIntelligenceEvidence[];
  draft?: AdminIntelligenceDraft | null;
}): AdminIntelligenceItem {
  return {
    id: input.id,
    title: input.title,
    detail: input.detail,
    tone: input.tone,
    confidence: input.confidence,
    capabilities: input.capabilities,
    recommendation: input.recommendation,
    caveat: input.caveat ?? null,
    href: input.href,
    evidence: input.evidence ?? [],
    draft: input.draft ?? null,
  };
}

function makeSection(
  key: string,
  title: string,
  summary: string,
  items: AdminIntelligenceItem[]
): AdminIntelligenceSection | null {
  if (items.length === 0) return null;
  return { key, title, summary, items };
}

function filterSections(
  sections: Array<AdminIntelligenceSection | null>
): AdminIntelligenceSection[] {
  return sections.filter((section): section is AdminIntelligenceSection => Boolean(section));
}

function growthTabHref(tab: string) {
  return `/admin/growth?${new URLSearchParams({ tab }).toString()}`;
}

function parseResilienceSurface(value: string | null): ResilienceSurface {
  return value === "health" ? "health" : "growth";
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

function confidenceFromCount(value: number): "high" | "medium" | "low" {
  if (value >= 40) return "high";
  if (value >= 15) return "medium";
  return "low";
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

async function fetchPermissionCandidates(days: number): Promise<{
  candidates: PermissionAnomalyCandidate[];
  sharedHotspot: {
    resourceType: string;
    count: number;
    uniqueAdmins: number;
    lastTouched: string;
  } | null;
}> {
  const lookbackDays = Math.max(days, 30);
  const since = new Date(Date.now() - lookbackDays * 86_400_000).toISOString();

  const [adminsRes, auditRes] = await Promise.all([
    supabaseFetch("/rest/v1/admin_users?select=email,role&order=role.desc,email.asc", {
      headers: { Range: "0-199" },
    }),
    supabaseFetch(
      `/rest/v1/admin_audit_log?select=admin_email,action,resource_type,ip,created_at&created_at=gte.${since}&order=created_at.desc`,
      { headers: { Range: "0-999" } }
    ),
  ]);

  if (!adminsRes.ok || !auditRes.ok) {
    throw new Error("Unable to load permission anomaly inputs.");
  }

  const admins = (await adminsRes.json()) as AdminUserRow[];
  const auditLogs = (await auditRes.json()) as AuditRow[];
  const auditByAdmin = new Map<string, AuditRow[]>();

  for (const row of auditLogs) {
    const current = auditByAdmin.get(row.admin_email) ?? [];
    current.push(row);
    auditByAdmin.set(row.admin_email, current);
  }

  const candidates = admins
    .map((entry) => {
      const activity = auditByAdmin.get(entry.email) ?? [];
      const highRiskCount = activity.filter((row) => {
        const risk = classifyRisk(row.action, row.resource_type);
        return risk === "critical" || risk === "high";
      }).length;
      const criticalCount = activity.filter(
        (row) => classifyRisk(row.action, row.resource_type) === "critical"
      ).length;
      const uniqueIps = unique(activity.map((row) => row.ip).filter(Boolean)).length;
      const resourceSpread = unique(activity.map((row) => row.resource_type ?? "unknown")).length;
      const lastActive = activity[0]?.created_at ?? null;
      const stale = !lastActive || Date.now() - new Date(lastActive).getTime() > 30 * 86_400_000;
      const recent7d = activity.filter(
        (row) => Date.now() - new Date(row.created_at).getTime() <= 7 * 86_400_000
      ).length;
      const anomalyScore =
        highRiskCount * 6 +
        criticalCount * 8 +
        Math.max(0, uniqueIps - 1) * 6 +
        Math.max(0, resourceSpread - 3) * 3 +
        (recent7d >= 8 ? 10 : 0) +
        (stale && entry.role !== "viewer" ? 12 : 0);

      const reasons: string[] = [];
      if (criticalCount > 0) reasons.push(`${criticalCount} critical control-plane changes`);
      if (highRiskCount >= 4) reasons.push(`${highRiskCount} high-risk changes in window`);
      if (uniqueIps >= 3) reasons.push(`${uniqueIps} unique IPs touched admin`);
      if (resourceSpread >= 5) reasons.push(`activity spans ${resourceSpread} resource types`);
      if (recent7d >= 8) reasons.push(`spike of ${recent7d} actions in the last 7 days`);
      if (stale && entry.role !== "viewer") reasons.push("elevated access is stale");

      return {
        email: entry.email,
        role: entry.role,
        anomalyScore,
        actionCount: activity.length,
        criticalCount,
        highRiskCount,
        uniqueIps,
        resourceSpread,
        stale,
        reasons,
        lastActive,
      } satisfies PermissionAnomalyCandidate;
    })
    .sort(
      (left, right) =>
        right.anomalyScore - left.anomalyScore ||
        right.highRiskCount - left.highRiskCount ||
        left.email.localeCompare(right.email)
    );

  const sharedHotspotMap = auditLogs.reduce<
    Map<string, { count: number; lastTouched: string; admins: Set<string> }>
  >((acc, row) => {
    const resourceType = row.resource_type ?? "unknown";
    const current = acc.get(resourceType) ?? {
      count: 0,
      lastTouched: row.created_at,
      admins: new Set<string>(),
    };
    current.count += 1;
    current.admins.add(row.admin_email);
    if (row.created_at > current.lastTouched) current.lastTouched = row.created_at;
    acc.set(resourceType, current);
    return acc;
  }, new Map());

  const sharedHotspot =
    [...sharedHotspotMap.entries()]
      .map(([resourceType, value]) => ({
        resourceType,
        count: value.count,
        uniqueAdmins: value.admins.size,
        lastTouched: value.lastTouched,
      }))
      .sort(
        (left, right) =>
          right.uniqueAdmins - left.uniqueAdmins ||
          right.count - left.count ||
          right.lastTouched.localeCompare(left.lastTouched)
      )
      .find((entry) => entry.uniqueAdmins >= 2 && entry.count >= 3) ?? null;

  return { candidates, sharedHotspot };
}

function buildCreativeFatigueItems(
  creative: Awaited<ReturnType<typeof buildCreativeIntelligenceSnapshot>>
): AdminIntelligenceItem[] {
  const creativeHref = growthTabHref("Creative Intelligence");
  const themeMap = new Map(creative.messageThemes.map((theme) => [theme.theme, theme]));
  const fatigueCandidates = creative.creatives
    .filter(
      (entry) =>
        entry.starts >= 12 &&
        entry.attention !== "blindspot" &&
        (entry.attention === "fix" || entry.qualityScore < 60 || entry.paidRate < 2.5)
    )
    .map((entry) => {
      const theme = themeMap.get(entry.theme);
      const fatigueScore =
        entry.starts * 0.7 +
        Math.max(0, 60 - entry.qualityScore) * 1.8 +
        Math.max(0, 3 - entry.paidRate) * 8 +
        (theme && theme.creatives >= 3 ? 10 : 0) +
        (entry.attention === "fix" ? 12 : 0);
      return { entry, theme, fatigueScore };
    })
    .sort(
      (left, right) =>
        right.fatigueScore - left.fatigueScore || right.entry.starts - left.entry.starts
    )
    .slice(0, 2)
    .map(({ entry, theme }) =>
      makeItem({
        id: `creative-fatigue-${entry.creativeKey}`,
        title: `Creative fatigue: ${entry.content}`,
        detail: `${entry.starts} starts on ${entry.source} / ${entry.campaign}, quality ${entry.qualityScore}, paid rate ${entry.paidRate}%, theme ${entry.theme}.`,
        tone: entry.attention === "fix" || entry.qualityScore < 45 ? "risk" : "watch",
        confidence: entry.confidence,
        capabilities: ["creative fatigue predictor", "message durability", "growth efficiency"],
        recommendation:
          theme && theme.creatives >= 3
            ? "This message angle is showing wear. Refresh the hook or retire this creative before it drags the whole theme average lower."
            : "Refresh the promise or landing continuity before scaling more spend into this creative.",
        href: creativeHref,
        caveat:
          creative.trust.warning ??
          (theme ? `${theme.creatives} creatives are currently mapped to this theme.` : null),
        evidence: [
          makeEvidence("Starts", String(entry.starts), creativeHref),
          makeEvidence("Quality", String(entry.qualityScore), creativeHref),
          makeEvidence("Paid rate", `${entry.paidRate}%`, creativeHref),
          makeEvidence("Theme", entry.theme, creativeHref),
        ],
        draft: makeDraft(
          "hypothesis",
          `Refresh fatigued creative: ${entry.content}`,
          `Test a new hook for ${entry.theme.toLowerCase()} messaging while preserving downstream quality guardrails.`,
          creativeHref
        ),
      })
    );

  const tiredTheme = creative.messageThemes.find(
    (theme) => theme.creatives >= 3 && theme.starts >= 30 && theme.paidRate < 2.5
  );
  if (tiredTheme) {
    fatigueCandidates.push(
      makeItem({
        id: `creative-fatigue-theme-${tiredTheme.theme}`,
        title: `Theme fatigue: ${tiredTheme.theme}`,
        detail: `${tiredTheme.creatives} creatives and ${tiredTheme.starts} starts are clustered around this theme, but paid rate is only ${tiredTheme.paidRate}%.`,
        tone: tiredTheme.paidRate < 1.5 ? "risk" : "watch",
        confidence: tiredTheme.confidence,
        capabilities: ["creative fatigue predictor", "message portfolio", "growth planning"],
        recommendation:
          "Rotate away from this theme as the default spend sink. Keep the best performer, then test a clearly different angle against it.",
        href: creativeHref,
        evidence: [
          makeEvidence("Creatives", String(tiredTheme.creatives), creativeHref),
          makeEvidence("Starts", String(tiredTheme.starts), creativeHref),
          makeEvidence("Paid rate", `${tiredTheme.paidRate}%`, creativeHref),
          makeEvidence("Top creative", tiredTheme.topCreative, creativeHref),
        ],
        draft: makeDraft(
          "experiment",
          `Theme refresh test: ${tiredTheme.theme}`,
          `Pit a new theme against ${tiredTheme.theme.toLowerCase()} messaging and use paid rate plus completion as guardrails.`,
          creativeHref
        ),
      })
    );
  }

  return fatigueCandidates.slice(0, 3);
}

function buildReferralContagionItems(
  referral: Awaited<ReturnType<typeof buildReferralIntelligenceSnapshot>>
): AdminIntelligenceItem[] {
  const referralHref = growthTabHref("Referral Chains");
  const items: AdminIntelligenceItem[] = [];
  const leadingReferrer = [...referral.referrers]
    .sort(
      (left, right) =>
        right.chainDepth - left.chainDepth ||
        right.downstreamReferrers - left.downstreamReferrers ||
        right.qualityScore - left.qualityScore
    )
    .find((referrer) => referrer.chainDepth > 0 || referrer.downstreamReferrers > 0);

  if (leadingReferrer) {
    items.push(
      makeItem({
        id: `referral-contagion-referrer-${leadingReferrer.email}`,
        title: `Referral contagion leader: ${leadingReferrer.segmentLabel}`,
        detail: `${leadingReferrer.email} has chain depth ${leadingReferrer.chainDepth} with ${leadingReferrer.downstreamReferrers} downstream referrer${leadingReferrer.downstreamReferrers === 1 ? "" : "s"} and quality ${leadingReferrer.qualityScore}.`,
        tone:
          leadingReferrer.attention === "scale"
            ? "good"
            : leadingReferrer.suspiciousScore >= 35
              ? "risk"
              : "watch",
        confidence: confidenceFromCount(leadingReferrer.invites),
        capabilities: ["referral contagion model", "loop quality", "network growth"],
        recommendation:
          leadingReferrer.attention === "scale"
            ? "Use this referrer pattern as the template for referral prompts, incentive design, and onboarding nudges."
            : "This loop propagates, but quality is mixed. Tighten eligibility or invite framing before trying to scale it.",
        caveat: referral.trust.warning,
        href: referralHref,
        evidence: [
          makeEvidence("Chain depth", String(leadingReferrer.chainDepth), referralHref),
          makeEvidence(
            "Downstream referrers",
            String(leadingReferrer.downstreamReferrers),
            referralHref
          ),
          makeEvidence("Quality", String(leadingReferrer.qualityScore), referralHref),
          makeEvidence("Invites", String(leadingReferrer.invites), referralHref),
        ],
        draft: makeDraft(
          "brief",
          `Document referral contagion pattern: ${leadingReferrer.segmentLabel}`,
          `Capture the invite method, segment, and loop quality behind ${leadingReferrer.email}'s referral pattern.`,
          referralHref
        ),
      })
    );
  }

  const scalableSegment = [...referral.segments]
    .sort(
      (left, right) =>
        right.avgChainDepth - left.avgChainDepth ||
        right.avgQualityScore - left.avgQualityScore ||
        right.invites - left.invites
    )
    .find((segment) => segment.avgChainDepth >= 1 || segment.avgQualityScore >= 60);

  if (scalableSegment) {
    items.push(
      makeItem({
        id: `referral-contagion-segment-${scalableSegment.segmentLabel}`,
        title: `Loop-ready segment: ${scalableSegment.segmentLabel}`,
        detail: `${scalableSegment.referrers} referrers, ${scalableSegment.invites} invites, ${scalableSegment.avgChainDepth} average chain depth, ${scalableSegment.avgQualityScore} average quality.`,
        tone:
          scalableSegment.flaggedReferrers > 0
            ? "watch"
            : scalableSegment.avgChainDepth >= 1.5
              ? "good"
              : "watch",
        confidence: confidenceFromCount(scalableSegment.invites),
        capabilities: ["referral contagion model", "segment loop analysis", "growth targeting"],
        recommendation:
          scalableSegment.flaggedReferrers > 0
            ? "This segment propagates, but it needs risk controls before heavier scaling."
            : "Treat this segment as the strongest current candidate for referral-led growth experiments.",
        href: referralHref,
        evidence: [
          makeEvidence("Referrers", String(scalableSegment.referrers), referralHref),
          makeEvidence("Avg chain depth", String(scalableSegment.avgChainDepth), referralHref),
          makeEvidence("Quality", String(scalableSegment.avgQualityScore), referralHref),
          makeEvidence("Flagged", String(scalableSegment.flaggedReferrers), referralHref),
        ],
        draft: makeDraft(
          "hypothesis",
          `Scale referral loop in ${scalableSegment.segmentLabel}`,
          `The ${scalableSegment.segmentLabel} segment may support stronger self-propagating referral behavior than the current baseline.`,
          referralHref
        ),
      })
    );
  }

  if (referral.summary.totalInvites >= 15 && referral.summary.avgChainDepth < 1) {
    items.push(
      makeItem({
        id: "referral-contagion-shallow-loop",
        title: "Referral contagion remains shallow",
        detail: `${referral.summary.totalInvites} invites generated only ${referral.summary.avgChainDepth} average chain depth and viral coefficient ${referral.summary.viralCoefficient}.`,
        tone: referral.summary.viralCoefficient < 0.2 ? "risk" : "watch",
        confidence: confidenceFromCount(referral.summary.totalInvites),
        capabilities: ["referral contagion model", "network-effect readiness", "growth risk"],
        recommendation:
          "The invite loop still behaves like a one-hop channel. Fix downstream conversion and second-order referral prompts before calling it compounding growth.",
        caveat:
          referral.summary.blindspotInvites > 0
            ? `${referral.summary.blindspotInvites} invites still miss recipient capture, so true loop depth may be understated.`
            : referral.trust.warning,
        href: referralHref,
        evidence: [
          makeEvidence("Invites", String(referral.summary.totalInvites), referralHref),
          makeEvidence("Avg chain depth", String(referral.summary.avgChainDepth), referralHref),
          makeEvidence(
            "Viral coefficient",
            String(referral.summary.viralCoefficient),
            referralHref
          ),
        ],
        draft: makeDraft(
          "investigation",
          "Diagnose shallow referral loop",
          "Review why invite recipients are not becoming second-order referrers despite current invite volume.",
          referralHref
        ),
      })
    );
  }

  return items.slice(0, 3);
}

function buildTrustImpactItems(input: {
  health: Awaited<ReturnType<typeof buildHealthStatusSnapshot>>;
  lineage: Awaited<ReturnType<typeof buildMetricLineageSnapshot>>;
}): AdminIntelligenceItem[] {
  const benchmarksHref = "/admin/benchmarks";
  const healthHref = "/admin/health";
  const trustWarnings = input.health.performanceHotspots.filter(
    (hotspot) => hotspot.category === "trust"
  );
  const dashboardCandidates = input.lineage.dashboardTrust
    .filter((group) => group.score < 75 || group.overdueMetrics > 0 || group.unownedMetrics > 0)
    .slice(0, 3)
    .map((group) =>
      makeItem({
        id: `trust-impact-dashboard-${group.href}`,
        title: `Trust breach exposure: ${group.label}`,
        detail: `Trust score ${group.score} with ${group.overdueMetrics} overdue metrics, ${group.unownedMetrics} unowned metrics, and weakest metrics ${group.weakestMetricLabels.join(", ") || "none"}.`,
        tone: group.score < 55 || group.unownedMetrics > 0 ? "risk" : "watch",
        confidence: confidenceFromCount(group.metrics),
        capabilities: ["trust-breach impact estimator", "metric governance", "decision safety"],
        recommendation:
          "Treat decisions on this surface as provisional until the weakest metrics are reviewed, owned, and refreshed.",
        caveat:
          trustWarnings[0]?.detail ??
          input.health.trustLayers.find((layer) => layer.warning)?.warning ??
          null,
        href: group.href || benchmarksHref,
        evidence: [
          makeEvidence("Trust score", String(group.score), group.href || benchmarksHref),
          makeEvidence(
            "Overdue metrics",
            String(group.overdueMetrics),
            group.href || benchmarksHref
          ),
          makeEvidence(
            "Unowned metrics",
            String(group.unownedMetrics),
            group.href || benchmarksHref
          ),
        ],
        draft: makeDraft(
          "investigation",
          `Stabilize trust on ${group.label}`,
          `Review the weakest metrics on ${group.label} before using it as a decision source.`,
          group.href || benchmarksHref
        ),
      })
    );

  const systemicHotspot = trustWarnings[0];
  if (systemicHotspot) {
    const impactedDashboards = input.lineage.dashboardTrust.filter(
      (group) => group.score < 70
    ).length;
    dashboardCandidates.unshift(
      makeItem({
        id: "trust-impact-systemic",
        title: `Systemic trust pressure: ${systemicHotspot.title}`,
        detail: `${systemicHotspot.detail} ${impactedDashboards} dashboard${impactedDashboards === 1 ? "" : "s"} already sit below 70 trust.`,
        tone: systemicHotspot.severity === "risk" ? "risk" : "watch",
        confidence: "high",
        capabilities: [
          "trust-breach impact estimator",
          "business impact mapping",
          "tech governance",
        ],
        recommendation:
          "Prioritize this trust break before leadership relies on affected dashboards for roadmap, growth, or release decisions.",
        href: healthHref,
        evidence: [
          makeEvidence("Hotspot", systemicHotspot.value, healthHref),
          makeEvidence("Impacted dashboards", String(impactedDashboards), benchmarksHref),
          makeEvidence(
            "Average trust",
            String(input.lineage.summary.averageTrustScore),
            benchmarksHref
          ),
        ],
        draft: makeDraft(
          "action",
          `Escalate trust breach: ${systemicHotspot.title}`,
          systemicHotspot.detail,
          healthHref
        ),
      })
    );
  }

  return dashboardCandidates.slice(0, 4);
}

function buildPermissionAnomalyItems(input: {
  candidates: PermissionAnomalyCandidate[];
  sharedHotspot: {
    resourceType: string;
    count: number;
    uniqueAdmins: number;
    lastTouched: string;
  } | null;
}): AdminIntelligenceItem[] {
  const accessHref = "/admin/tools";
  const items: AdminIntelligenceItem[] = [];
  const leadingCandidate = input.candidates.find((candidate) => candidate.anomalyScore >= 18);

  if (leadingCandidate) {
    items.push(
      makeItem({
        id: `permission-anomaly-${leadingCandidate.email}`,
        title: `Permission anomaly: ${leadingCandidate.email}`,
        detail: `${leadingCandidate.role} account with anomaly score ${leadingCandidate.anomalyScore}, ${leadingCandidate.highRiskCount} high-risk changes, ${leadingCandidate.uniqueIps} IPs, ${leadingCandidate.resourceSpread} resource types.`,
        tone:
          leadingCandidate.criticalCount > 0 || leadingCandidate.uniqueIps >= 3 ? "risk" : "watch",
        confidence: confidenceFromCount(leadingCandidate.actionCount),
        capabilities: ["permission anomaly detection", "access risk", "governance review"],
        recommendation:
          "Review whether this access pattern is expected. If it is legitimate, document it; if not, tighten privileges or review controls immediately.",
        caveat: leadingCandidate.reasons.length > 0 ? leadingCandidate.reasons.join("; ") : null,
        href: accessHref,
        evidence: [
          makeEvidence("High-risk changes", String(leadingCandidate.highRiskCount), accessHref),
          makeEvidence("Critical changes", String(leadingCandidate.criticalCount), accessHref),
          makeEvidence("Unique IPs", String(leadingCandidate.uniqueIps), accessHref),
          makeEvidence("Last active", leadingCandidate.lastActive ?? "never", accessHref),
        ],
        draft: makeDraft(
          "investigation",
          `Review admin access pattern: ${leadingCandidate.email}`,
          leadingCandidate.reasons.join(" | ") || "Unexpected admin access pattern detected.",
          accessHref
        ),
      })
    );
  }

  const staleElevated = input.candidates.find(
    (candidate) => candidate.stale && candidate.role !== "viewer"
  );
  if (staleElevated) {
    items.push(
      makeItem({
        id: `permission-anomaly-stale-${staleElevated.email}`,
        title: `Stale elevated access: ${staleElevated.email}`,
        detail: `${staleElevated.role} access is still assigned, but the account has not been active inside the last 30 days.`,
        tone: staleElevated.role === "admin" ? "risk" : "watch",
        confidence: "high",
        capabilities: ["permission anomaly detection", "least privilege", "admin hygiene"],
        recommendation:
          "Review whether this elevated role is still needed. Stale privileged accounts increase governance risk without adding operating value.",
        href: accessHref,
        evidence: [
          makeEvidence("Role", staleElevated.role, accessHref),
          makeEvidence("Last active", staleElevated.lastActive ?? "never", accessHref),
          makeEvidence("Action count", String(staleElevated.actionCount), accessHref),
        ],
        draft: makeDraft(
          "action",
          `Review stale privileged account: ${staleElevated.email}`,
          "Confirm whether this elevated account still needs editor/admin access.",
          accessHref
        ),
      })
    );
  }

  if (input.sharedHotspot) {
    items.push(
      makeItem({
        id: `permission-anomaly-hotspot-${input.sharedHotspot.resourceType}`,
        title: `Shared control-plane hotspot: ${input.sharedHotspot.resourceType}`,
        detail: `${input.sharedHotspot.uniqueAdmins} admins changed this surface ${input.sharedHotspot.count} times in the current window.`,
        tone: input.sharedHotspot.uniqueAdmins >= 4 ? "risk" : "watch",
        confidence: confidenceFromCount(input.sharedHotspot.count),
        capabilities: ["permission anomaly detection", "change concentration", "governance drift"],
        recommendation:
          "This surface has become a shared control plane. Add tighter review discipline or clearer ownership before it turns into a silent source of drift.",
        href: accessHref,
        evidence: [
          makeEvidence("Admins", String(input.sharedHotspot.uniqueAdmins), accessHref),
          makeEvidence("Changes", String(input.sharedHotspot.count), accessHref),
          makeEvidence("Last touched", input.sharedHotspot.lastTouched, accessHref),
        ],
        draft: makeDraft(
          "investigation",
          `Audit shared changes on ${input.sharedHotspot.resourceType}`,
          "Review why multiple admins are repeatedly changing the same sensitive surface.",
          accessHref
        ),
      })
    );
  }

  if (items.length === 0) {
    items.push(
      makeItem({
        id: "permission-anomaly-stable",
        title: "Admin access patterns look stable",
        detail:
          "No elevated anomaly score, stale privileged account, or shared high-risk hotspot crossed the current thresholds.",
        tone: "good",
        confidence: "medium",
        capabilities: ["permission anomaly detection", "access hygiene"],
        recommendation:
          "Keep logging and review coverage in place so future permission anomalies stay visible before they become incidents.",
        href: accessHref,
        evidence: [makeEvidence("Admins reviewed", String(input.candidates.length), accessHref)],
        draft: null,
      })
    );
  }

  return items.slice(0, 3);
}

export async function buildResilienceIntelligenceSnapshot(
  inputSurface: string | null,
  inputDays: number,
  adminEmail: string
): Promise<AdminIntelligenceSnapshot> {
  const surface = parseResilienceSurface(inputSurface);
  const days = ensureDays(inputDays);

  if (surface === "growth") {
    const [creative, referral] = await Promise.all([
      buildCreativeIntelligenceSnapshot(days),
      buildReferralIntelligenceSnapshot(days, adminEmail),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      days,
      surface,
      title: "Growth Resilience Intelligence",
      headline:
        "Detect fatigue in paid messaging and check whether referrals are compounding or just creating shallow invite volume.",
      summary:
        "This layer reuses creative quality, theme concentration, invite depth, and referral quality signals to show where growth is becoming fragile instead of compounding.",
      prompts: [
        { label: "Fatigued creative", query: "Which creative is showing fatigue first?" },
        {
          label: "Referral loop",
          query: "Is referral behaving like contagion or just a one-hop channel?",
        },
        { label: "Growth resilience", query: "Where is growth durable versus fragile right now?" },
      ],
      sections: filterSections([
        makeSection(
          "creative-fatigue",
          "Creative Fatigue",
          "High-volume messages that are losing downstream quality or wearing out a theme.",
          buildCreativeFatigueItems(creative)
        ),
        makeSection(
          "referral-contagion",
          "Referral Contagion",
          "Whether invite behavior is creating second-order propagation or staying shallow.",
          buildReferralContagionItems(referral)
        ),
      ]),
    };
  }

  const [health, lineage, permissionSignals] = await Promise.all([
    buildHealthStatusSnapshot(),
    buildMetricLineageSnapshot(),
    fetchPermissionCandidates(days),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    days,
    surface,
    title: "Health Resilience Intelligence",
    headline:
      "Estimate which business decisions are exposed to weak trust signals and flag unusual admin access patterns before they become incidents.",
    summary:
      "This layer combines trust hotspots, weak dashboard lineage, and admin control-plane activity so Tech and leadership can see where the operating system is most brittle.",
    prompts: [
      { label: "Trust exposure", query: "Which dashboards are most exposed to trust debt?" },
      { label: "Access anomalies", query: "Which admin access patterns look unusual?" },
      {
        label: "Health resilience",
        query: "What governance issue could become a business issue next?",
      },
    ],
    sections: filterSections([
      makeSection(
        "trust-impact",
        "Trust-Breach Impact",
        "Weak trust layers translated into dashboard and decision exposure.",
        buildTrustImpactItems({ health, lineage })
      ),
      makeSection(
        "permission-anomalies",
        "Permission Anomalies",
        "Unusual privileged activity and shared high-risk control surfaces.",
        buildPermissionAnomalyItems(permissionSignals)
      ),
    ]),
  };
}
