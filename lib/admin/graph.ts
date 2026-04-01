import { buildAnomalySnapshot } from "@/lib/admin/alerts";
import { buildIncidentCorrelationSnapshot } from "@/lib/admin/incident-correlation";
import { buildAdminOsSnapshot } from "@/lib/admin/os";
import { buildStrategyPlanningSnapshot } from "@/lib/admin/strategy-planning";
import { buildStrategySnapshot } from "@/lib/admin/strategy";
import { buildDriftDetectorSnapshot } from "@/lib/admin/drift-detector";
import type {
  AdminGraphSurface,
  AdminSignalGraphEdge,
  AdminSignalGraphNode,
  AdminSignalGraphPath,
  AdminSignalGraphSnapshot,
} from "@/lib/admin/graph-types";

const SURFACES: AdminGraphSurface[] = ["command-center", "strategy", "health"];

function ensureSurface(value: string | null | undefined): AdminGraphSurface {
  return SURFACES.includes(value as AdminGraphSurface)
    ? (value as AdminGraphSurface)
    : "command-center";
}

function ensureDays(value: number): number {
  if (!Number.isFinite(value)) return 30;
  return Math.min(Math.max(Math.round(value), 7), 365);
}

function addNode(map: Map<string, AdminSignalGraphNode>, node: AdminSignalGraphNode) {
  if (!map.has(node.id)) {
    map.set(node.id, node);
  }
}

function addEdge(edges: AdminSignalGraphEdge[], edge: AdminSignalGraphEdge) {
  if (!edges.some((existing) => existing.id === edge.id)) {
    edges.push(edge);
  }
}

export function parseAdminGraphSurface(value: string | null | undefined): AdminGraphSurface {
  return ensureSurface(value);
}

export async function buildAdminSignalGraphSnapshot(
  inputSurface: string | null | undefined,
  inputDays: number,
  adminEmail?: string
): Promise<AdminSignalGraphSnapshot> {
  const surface = ensureSurface(inputSurface);
  const days = ensureDays(inputDays);
  const nodes = new Map<string, AdminSignalGraphNode>();
  const edges: AdminSignalGraphEdge[] = [];
  const focusPaths: AdminSignalGraphPath[] = [];

  if (surface === "strategy") {
    const [strategy, planning] = await Promise.all([
      buildStrategySnapshot(days),
      buildStrategyPlanningSnapshot(),
    ]);

    for (const dependency of (planning.dependencies ?? []).slice(0, 4)) {
      const parentId = `metric-${dependency.parentMetricKey}`;
      const childId = `metric-${dependency.childMetricKey}`;
      addNode(nodes, {
        id: parentId,
        label: dependency.parentMetricLabel,
        kind: "metric",
        tone: "watch",
        href: "/admin/strategy?tab=Strategy%20Planning",
      });
      addNode(nodes, {
        id: childId,
        label: dependency.childMetricLabel,
        kind: "metric",
        tone: "watch",
        href: "/admin/strategy?tab=Strategy%20Planning",
      });
      addEdge(edges, {
        id: `edge-${dependency.id}`,
        from: parentId,
        to: childId,
        label: dependency.relationshipStrength,
      });
      focusPaths.push({
        id: `path-dependency-${dependency.id}`,
        title: `${dependency.parentMetricLabel} -> ${dependency.childMetricLabel}`,
        summary:
          dependency.hypothesisNote ||
          dependency.evidenceNote ||
          "Tracked metric dependency in the strategy planning layer.",
        confidence: dependency.evidenceNote ? "high" : "medium",
        href: "/admin/strategy?tab=Strategy%20Planning",
        nodeIds: [parentId, childId],
      });
    }

    for (const opportunity of (strategy.opportunities?.backlog ?? []).slice(0, 2)) {
      const nodeId = `opportunity-${opportunity.title}`;
      addNode(nodes, {
        id: nodeId,
        label: opportunity.title,
        kind: "opportunity",
        tone: opportunity.confidence === "high" ? "good" : "watch",
        href: opportunity.href,
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      surface,
      days,
      headline: `${focusPaths.length} strategy dependency paths reconstructed from live planning and goal data.`,
      nodes: [...nodes.values()],
      edges,
      focusPaths: focusPaths.slice(0, 6),
    };
  }

  if (surface === "health") {
    if (!adminEmail) throw new Error("Admin email is required for health graph.");
    const [anomalies, incidents, drift] = await Promise.all([
      buildAnomalySnapshot(days),
      buildIncidentCorrelationSnapshot(days),
      buildDriftDetectorSnapshot(days, adminEmail),
    ]);

    for (const incident of (incidents.entries ?? []).slice(0, 4)) {
      const incidentId = `incident-${incident.id}`;
      addNode(nodes, {
        id: incidentId,
        label: incident.title,
        kind: "incident",
        tone: incident.severity === "risk" ? "risk" : "watch",
        href: "/admin/health",
      });

      for (const driver of (incident.suspectedDrivers ?? []).slice(0, 3)) {
        const driverId = `driver-${incident.id}-${driver.kind}-${driver.title}`;
        addNode(nodes, {
          id: driverId,
          label: driver.title,
          kind: "driver",
          tone: "watch",
          href: driver.href,
        });
        addEdge(edges, {
          id: `${driverId}->${incidentId}`,
          from: driverId,
          to: incidentId,
          label: driver.kind,
        });
      }

      focusPaths.push({
        id: `path-incident-${incident.id}`,
        title: incident.title,
        summary:
          (incident.suspectedDrivers ?? [])
            .map((driver) => `${driver.kind}: ${driver.title}`)
            .join(" -> ") || "No suspected drivers linked yet.",
        confidence: incident.confidence,
        href: "/admin/health",
        nodeIds: [
          ...(incident.suspectedDrivers ?? [])
            .slice(0, 3)
            .map((driver) => `driver-${incident.id}-${driver.kind}-${driver.title}`),
          incidentId,
        ],
      });
    }

    for (const anomaly of (anomalies.items ?? []).slice(0, 2)) {
      const anomalyId = `anomaly-${anomaly.id}`;
      addNode(nodes, {
        id: anomalyId,
        label: anomaly.title,
        kind: "anomaly",
        tone: anomaly.severity === "risk" ? "risk" : "watch",
        href: anomaly.href,
      });
    }

    for (const finding of (drift.findings ?? []).slice(0, 2)) {
      const driftId = `drift-${finding.id}`;
      addNode(nodes, {
        id: driftId,
        label: finding.title,
        kind: "drift",
        tone: finding.severity === "risk" ? "risk" : "watch",
        href: finding.href,
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      surface,
      days,
      headline: `${focusPaths.length} health driver paths reconstructed from anomalies, incidents, and drift.`,
      nodes: [...nodes.values()],
      edges,
      focusPaths: focusPaths.slice(0, 6),
    };
  }

  const os = await buildAdminOsSnapshot(days);
  for (const indicator of (os.leadingIndicators ?? []).slice(0, 4)) {
    const leadingId = `metric-${indicator.leadingMetricKey}`;
    const laggingId = `metric-${indicator.metricKey}`;
    addNode(nodes, {
      id: leadingId,
      label: indicator.leadingMetricLabel,
      kind: "metric",
      tone:
        indicator.signalState === "positive"
          ? "good"
          : indicator.signalState === "negative"
            ? "risk"
            : "watch",
      href: indicator.href,
    });
    addNode(nodes, {
      id: laggingId,
      label: indicator.metricLabel,
      kind: "metric",
      tone: "watch",
      href: indicator.href,
    });
    addEdge(edges, {
      id: `${leadingId}->${laggingId}`,
      from: leadingId,
      to: laggingId,
      label: "drives",
    });
    focusPaths.push({
      id: `path-leading-${indicator.metricKey}-${indicator.leadingMetricKey}`,
      title: `${indicator.leadingMetricLabel} -> ${indicator.metricLabel}`,
      summary: indicator.detail,
      confidence: "high",
      href: indicator.href,
      nodeIds: [leadingId, laggingId],
    });
  }

  for (const item of (os.actionBoard?.items ?? []).slice(0, 3)) {
    addNode(nodes, {
      id: `action-${item.id}`,
      label: item.title,
      kind: "action",
      tone: item.status === "blocked" ? "risk" : item.status === "done" ? "good" : "watch",
      href: item.linkedHref || "/admin",
    });
  }

  for (const decision of (os.decisionBoard ?? []).slice(0, 3)) {
    addNode(nodes, {
      id: `decision-${decision.id}`,
      label: decision.title,
      kind: "decision",
      tone: decision.measuredOutcome ? "good" : "watch",
      href: decision.href,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    surface,
    days,
    headline: `${focusPaths.length} operating-system driver paths reconstructed from leading indicators and decision records.`,
    nodes: [...nodes.values()],
    edges,
    focusPaths: focusPaths.slice(0, 6),
  };
}
