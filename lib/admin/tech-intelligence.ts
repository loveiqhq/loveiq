import { buildHealthStatusSnapshot } from "@/lib/admin/health";
import { buildIncidentCorrelationSnapshot } from "@/lib/admin/incident-correlation";
import { buildDriftDetectorSnapshot } from "@/lib/admin/drift-detector";
import { buildMetricLineageSnapshot } from "@/lib/admin/metric-lineage";
import { buildWhatChangedSnapshot } from "@/lib/admin/release-impact";
import type {
  AdminIntelligenceDraft,
  AdminIntelligenceEvidence,
  AdminIntelligenceItem,
  AdminIntelligenceSection,
  AdminIntelligenceSnapshot,
  AdminIntelligenceSurface,
  AdminIntelligenceTone,
} from "@/lib/admin/intelligence-types";
import { clampDays } from "@/lib/admin/next-level";

type TechIntelligenceSurface = Extract<AdminIntelligenceSurface, "health">;

function ensureSurface(): TechIntelligenceSurface {
  return "health";
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
  href: string,
  metricKey: string | null = null,
  expectedImpact: string | null = null
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
            metricKey,
            expectedImpact,
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

function buildHealthTabHref(tab: string): string {
  return `/admin/health?${new URLSearchParams({ tab }).toString()}`;
}

function confidenceFromCount(value: number): "high" | "medium" | "low" {
  if (value >= 20) return "high";
  if (value >= 8) return "medium";
  return "low";
}

function confidenceFromSeverity(value: "high" | "medium" | "low"): "high" | "medium" | "low" {
  return value;
}

function toneFromStatus(status: "healthy" | "degraded" | "down"): AdminIntelligenceTone {
  if (status === "down") return "risk";
  if (status === "degraded") return "watch";
  return "good";
}

function businessLabelForMetric(metricKey: string | null): string {
  if (!metricKey) return "operating trust";
  const normalized = metricKey.toLowerCase();
  if (normalized.includes("completion")) return "completion and funnel conversion";
  if (normalized.includes("revenue") || normalized.includes("payment")) return "revenue capture";
  if (normalized.includes("report")) return "report engagement";
  if (normalized.includes("waitlist") || normalized.includes("submission"))
    return "top-of-funnel volume";
  if (normalized.includes("scoring")) return "scoring trust";
  return "business decision quality";
}

function businessImpactForHotspot(
  hotspot: Awaited<ReturnType<typeof buildHealthStatusSnapshot>>["performanceHotspots"][number]
): string {
  if (hotspot.category === "tracking") return "top-of-funnel and attribution decisions";
  if (hotspot.category === "guardrail") return "product and monetization metrics";
  if (hotspot.category === "service" || hotspot.category === "webhook")
    return "user-facing reliability and downstream monetization";
  if (hotspot.category === "trust") return "dashboard and KPI trust";
  if (hotspot.category === "rate-limit") return "admin reliability and event capture";
  return "business metrics";
}

function recentChangeLabel(
  changes: Awaited<ReturnType<typeof buildWhatChangedSnapshot>>["items"],
  kinds: Array<"release" | "decision" | "experiment" | "annotation">
): string | null {
  const match = changes.find((item) => kinds.includes(item.kind));
  return match ? `${match.kind}: ${match.title}` : null;
}

function buildDataRootCauseItems(input: {
  health: Awaited<ReturnType<typeof buildHealthStatusSnapshot>>;
  drift: Awaited<ReturnType<typeof buildDriftDetectorSnapshot>>;
  lineage: Awaited<ReturnType<typeof buildMetricLineageSnapshot>>;
  changes: Awaited<ReturnType<typeof buildWhatChangedSnapshot>>;
}): AdminIntelligenceItem[] {
  const items: AdminIntelligenceItem[] = [];
  const weakestMetric = input.lineage.metrics[0] ?? null;
  const worstTracking = input.health.trackingCoverage
    .filter((item) => item.status !== "healthy")
    .sort((left, right) => left.actual - right.actual)[0];
  const topDrift = input.drift.findings.find(
    (finding) =>
      finding.category === "event-naming" ||
      finding.category === "answer-mapping" ||
      finding.category === "taxonomy"
  );

  if (worstTracking) {
    const relatedChange = recentChangeLabel(input.changes.items, [
      "release",
      "decision",
      "experiment",
    ]);
    items.push(
      makeItem({
        id: `tech-intelligence-data-tracking-${worstTracking.event}`,
        title: `Data root cause: ${worstTracking.event} tracking gap`,
        detail: `${worstTracking.actual}/${worstTracking.expected} coverage with status ${worstTracking.status}. ${worstTracking.detail}`,
        tone: toneFromStatus(worstTracking.status),
        confidence: confidenceFromCount(worstTracking.expected),
        capabilities: ["data-quality root-cause assistant", "tracking diagnosis", "trust repair"],
        recommendation:
          "Start at the tracking layer before touching business logic. This gap can distort funnel, growth, and product decisions simultaneously.",
        caveat: relatedChange ? `Most recent nearby change: ${relatedChange}.` : null,
        href: buildHealthTabHref("Trust & Tracking"),
        evidence: [
          makeEvidence(
            "Actual",
            String(worstTracking.actual),
            buildHealthTabHref("Trust & Tracking")
          ),
          makeEvidence(
            "Expected",
            String(worstTracking.expected),
            buildHealthTabHref("Trust & Tracking")
          ),
          makeEvidence("Status", worstTracking.status, buildHealthTabHref("Trust & Tracking")),
        ],
        draft: makeDraft(
          "investigation",
          `Repair ${worstTracking.event} tracking coverage`,
          "Validate instrumentation and event naming before trusting downstream KPI movement.",
          buildHealthTabHref("Trust & Tracking")
        ),
      })
    );
  }

  if (weakestMetric) {
    items.push(
      makeItem({
        id: `tech-intelligence-data-lineage-${weakestMetric.metricKey}`,
        title: `Data root cause: weak metric trust on ${weakestMetric.label}`,
        detail: `Trust score ${weakestMetric.trustScore}. Source ${weakestMetric.sourceOfTruth ?? "unknown"}, review ${weakestMetric.reviewStatus}, trust mode ${weakestMetric.trustMode}.`,
        tone: weakestMetric.trustScore < 45 ? "risk" : "watch",
        confidence:
          weakestMetric.reviewStatus === "overdue" || weakestMetric.reviewStatus === "never"
            ? "high"
            : "medium",
        capabilities: ["data-quality root-cause assistant", "metric lineage", "trust diagnosis"],
        recommendation:
          "Treat this metric as a root-cause candidate before making leadership decisions off it. The fix is likely lineage, ownership, or formula hygiene.",
        caveat:
          weakestMetric.trustNote ??
          weakestMetric.caveats ??
          (!weakestMetric.ownerEmail ? "Metric is currently unowned." : null),
        href: weakestMetric.linkedHref,
        evidence: [
          makeEvidence("Trust score", String(weakestMetric.trustScore), weakestMetric.linkedHref),
          makeEvidence("Review", weakestMetric.reviewStatus, weakestMetric.linkedHref),
          makeEvidence("Owner", weakestMetric.ownerEmail ?? "none", weakestMetric.linkedHref),
        ],
        draft: makeDraft(
          "investigation",
          `Repair trust on ${weakestMetric.label.toLowerCase()}`,
          "Review formula, source of truth, and owner coverage before using this metric as a decision anchor.",
          weakestMetric.linkedHref,
          weakestMetric.metricKey
        ),
      })
    );
  }

  if (topDrift) {
    items.push(
      makeItem({
        id: `tech-intelligence-data-drift-${topDrift.id}`,
        title: `Data root cause: ${topDrift.title}`,
        detail: topDrift.detail,
        tone: topDrift.severity === "risk" ? "risk" : "watch",
        confidence: confidenceFromCount(topDrift.affectedCount),
        capabilities: ["data-quality root-cause assistant", "drift diagnosis", "taxonomy hygiene"],
        recommendation:
          "Fix the drift at the source surface before compensating for it in dashboards or manual analysis.",
        caveat: topDrift.signals.length > 0 ? topDrift.signals.slice(0, 2).join(" | ") : null,
        href: topDrift.href,
        evidence: [
          makeEvidence("Category", topDrift.categoryLabel, topDrift.href),
          makeEvidence("Affected", String(topDrift.affectedCount), topDrift.href),
          makeEvidence("Signals", String(topDrift.signals.length), topDrift.href),
        ],
        draft: makeDraft(
          "action",
          `Repair ${topDrift.categoryLabel.toLowerCase()}`,
          topDrift.recommendation,
          topDrift.href
        ),
      })
    );
  }

  return items.slice(0, 3);
}

function buildConfigRiskItems(input: {
  drift: Awaited<ReturnType<typeof buildDriftDetectorSnapshot>>;
  changes: Awaited<ReturnType<typeof buildWhatChangedSnapshot>>;
  incidents: Awaited<ReturnType<typeof buildIncidentCorrelationSnapshot>>;
}): AdminIntelligenceItem[] {
  const configFinding = input.drift.findings.find((finding) => finding.category === "config");
  const configLinkedIncident = input.incidents.entries.find((entry) =>
    entry.suspectedDrivers.some((driver) => driver.kind === "decision" || driver.kind === "release")
  );
  const recentConfigChange =
    input.changes.items.find(
      (item) =>
        item.kind === "decision" &&
        (item.category === "scoring-change" || item.detail.toLowerCase().includes("expected"))
    ) ??
    input.changes.items.find((item) => item.kind === "release" || item.kind === "experiment") ??
    null;

  const items: AdminIntelligenceItem[] = [];

  if (configFinding) {
    items.push(
      makeItem({
        id: `tech-intelligence-config-drift-${configFinding.id}`,
        title: `Config risk diff: ${configFinding.title}`,
        detail: configFinding.detail,
        tone: configFinding.severity === "risk" ? "risk" : "watch",
        confidence: confidenceFromCount(configFinding.affectedCount),
        capabilities: ["config-change risk diff", "configuration drift", "change review"],
        recommendation:
          "Treat this drift as a risky config diff and review it against the latest release, decision, or scoring change before adjusting live thresholds again.",
        caveat: recentConfigChange ? `Nearest recent change: ${recentConfigChange.title}.` : null,
        href: configFinding.href,
        evidence: [
          makeEvidence("Affected", String(configFinding.affectedCount), configFinding.href),
          makeEvidence("Signals", String(configFinding.signals.length), configFinding.href),
          makeEvidence("Severity", configFinding.severity, configFinding.href),
        ],
        draft: makeDraft(
          "investigation",
          `Review risky config drift: ${configFinding.title.toLowerCase()}`,
          configFinding.recommendation,
          configFinding.href
        ),
      })
    );
  }

  if (configLinkedIncident) {
    const topDriver = configLinkedIncident.suspectedDrivers[0];
    items.push(
      makeItem({
        id: `tech-intelligence-config-incident-${configLinkedIncident.id}`,
        title: `Config risk diff: ${configLinkedIncident.title}`,
        detail: `${configLinkedIncident.currentSignal} Top suspected driver: ${topDriver?.title ?? "none"}.`,
        tone: configLinkedIncident.severity === "risk" ? "risk" : "watch",
        confidence: confidenceFromSeverity(configLinkedIncident.confidence),
        capabilities: ["config-change risk diff", "incident linkage", "change attribution"],
        recommendation:
          "Review the linked change first and decide whether this is a config regression before opening broader debugging.",
        caveat: configLinkedIncident.ownerEmail
          ? `Owner hint: ${configLinkedIncident.ownerEmail}.`
          : null,
        href: topDriver?.href ?? buildHealthTabHref("Incident Correlation"),
        evidence: [
          makeEvidence(
            "Confidence",
            configLinkedIncident.confidence,
            topDriver?.href ?? buildHealthTabHref("Incident Correlation")
          ),
          makeEvidence(
            "Driver count",
            String(configLinkedIncident.suspectedDrivers.length),
            topDriver?.href ?? buildHealthTabHref("Incident Correlation")
          ),
          makeEvidence(
            "Metric impact",
            businessLabelForMetric(configLinkedIncident.metricKey),
            topDriver?.href ?? buildHealthTabHref("Incident Correlation")
          ),
        ],
        draft: makeDraft(
          "investigation",
          `Check change risk for ${configLinkedIncident.title.toLowerCase()}`,
          "Validate the nearest release, decision, or experiment change before treating this as a general infrastructure issue.",
          topDriver?.href ?? buildHealthTabHref("Incident Correlation"),
          configLinkedIncident.metricKey
        ),
      })
    );
  }

  return items.slice(0, 3);
}

function buildIncidentTriageItems(input: {
  incidents: Awaited<ReturnType<typeof buildIncidentCorrelationSnapshot>>;
}): AdminIntelligenceItem[] {
  const ownerFor = (category: string) => {
    if (category === "service" || category === "trust") return "tech";
    if (category === "guardrail") return "product";
    return "tech";
  };

  return input.incidents.entries.slice(0, 3).map((entry) => {
    const primaryDriver = entry.suspectedDrivers[0];
    const triageOwner = entry.ownerEmail ?? ownerFor(entry.category);

    return makeItem({
      id: `tech-intelligence-triage-${entry.id}`,
      title: `Incident triage: ${entry.title}`,
      detail: `${entry.currentSignal} ${primaryDriver ? `Likely first stop: ${primaryDriver.kind} "${primaryDriver.title}".` : "No strong linked driver yet."}`,
      tone: entry.severity === "risk" ? "risk" : "watch",
      confidence: confidenceFromSeverity(entry.confidence),
      capabilities: ["incident triage copilot", "incident correlation", "owner routing"],
      recommendation: entry.recommendation + ` Route first review to ${triageOwner}.`,
      caveat: entry.metricKey
        ? `Business surface at risk: ${businessLabelForMetric(entry.metricKey)}.`
        : null,
      href: primaryDriver?.href ?? buildHealthTabHref("Incident Correlation"),
      evidence: [
        makeEvidence(
          "Confidence",
          entry.confidence,
          primaryDriver?.href ?? buildHealthTabHref("Incident Correlation")
        ),
        makeEvidence(
          "Drivers",
          String(entry.suspectedDrivers.length),
          primaryDriver?.href ?? buildHealthTabHref("Incident Correlation")
        ),
        makeEvidence(
          "Owner",
          triageOwner,
          primaryDriver?.href ?? buildHealthTabHref("Incident Correlation")
        ),
      ],
      draft: makeDraft(
        "investigation",
        `Triage ${entry.title.toLowerCase()}`,
        `Start with ${primaryDriver?.kind ?? "the linked change history"} and assign first response to ${triageOwner}.`,
        primaryDriver?.href ?? buildHealthTabHref("Incident Correlation"),
        entry.metricKey
      ),
    });
  });
}

function buildImpactMapperItems(input: {
  health: Awaited<ReturnType<typeof buildHealthStatusSnapshot>>;
  incidents: Awaited<ReturnType<typeof buildIncidentCorrelationSnapshot>>;
  lineage: Awaited<ReturnType<typeof buildMetricLineageSnapshot>>;
}): AdminIntelligenceItem[] {
  const hotspotItems = input.health.performanceHotspots.slice(0, 2).map((hotspot) =>
    makeItem({
      id: `tech-intelligence-impact-hotspot-${hotspot.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      title: `Business impact: ${hotspot.title}`,
      detail: `${hotspot.detail} This threatens ${businessImpactForHotspot(hotspot)}.`,
      tone: hotspot.severity === "risk" ? "risk" : "watch",
      confidence: hotspot.severity === "risk" ? "high" : "medium",
      capabilities: [
        "observability-to-business impact mapper",
        "hotspot translation",
        "business risk",
      ],
      recommendation:
        "Translate this operational signal into a business decision checkpoint immediately instead of leaving it as a technical-only alert.",
      caveat: `Owner surface: ${hotspot.owner}.`,
      href: hotspot.href,
      evidence: [
        makeEvidence("Category", hotspot.category, hotspot.href),
        makeEvidence("Severity", hotspot.severity, hotspot.href),
        makeEvidence("Value", hotspot.value, hotspot.href),
      ],
      draft: makeDraft(
        "brief",
        `Map business impact for ${hotspot.title.toLowerCase()}`,
        "Document which KPI and review surfaces should be treated as untrusted or at-risk while this hotspot remains open.",
        hotspot.href
      ),
    })
  );

  const correlatedMetric = input.incidents.entries.find((entry) => entry.metricKey);
  const lineageMetric =
    correlatedMetric &&
    input.lineage.metrics.find((metric) => metric.metricKey === correlatedMetric.metricKey);

  if (correlatedMetric && lineageMetric) {
    hotspotItems.push(
      makeItem({
        id: `tech-intelligence-impact-metric-${lineageMetric.metricKey}`,
        title: `Business impact: ${lineageMetric.label}`,
        detail: `${correlatedMetric.title} is linked to ${lineageMetric.label}, which currently has trust score ${lineageMetric.trustScore}.`,
        tone:
          correlatedMetric.severity === "risk" || lineageMetric.trustScore < 50 ? "risk" : "watch",
        confidence: confidenceFromSeverity(correlatedMetric.confidence),
        capabilities: [
          "observability-to-business impact mapper",
          "metric trust mapping",
          "incident business translation",
        ],
        recommendation:
          "Treat this metric and its dependent dashboards as decision-risk surfaces until the incident and trust gap are closed together.",
        caveat:
          lineageMetric.upstream.length > 0
            ? `Upstream dependency count: ${lineageMetric.upstream.length}.`
            : "Metric has no recorded upstream dependencies.",
        href: lineageMetric.linkedHref,
        evidence: [
          makeEvidence("Metric", lineageMetric.label, lineageMetric.linkedHref),
          makeEvidence("Trust score", String(lineageMetric.trustScore), lineageMetric.linkedHref),
          makeEvidence(
            "Business impact",
            businessLabelForMetric(lineageMetric.metricKey),
            lineageMetric.linkedHref
          ),
        ],
        draft: makeDraft(
          "action",
          `Protect ${lineageMetric.label.toLowerCase()} decisions`,
          "Flag dependent dashboards and reviews until the linked incident and trust gap are resolved.",
          lineageMetric.linkedHref,
          lineageMetric.metricKey
        ),
      })
    );
  }

  return hotspotItems.slice(0, 3);
}

export async function buildTechIntelligenceSnapshot(
  _inputSurface: string | null | undefined,
  inputDays: number,
  adminEmail: string
): Promise<AdminIntelligenceSnapshot> {
  const surface = ensureSurface();
  const days = ensureDays(inputDays);

  const [health, incidents, drift, lineage, changes] = await Promise.all([
    buildHealthStatusSnapshot(),
    buildIncidentCorrelationSnapshot(days),
    buildDriftDetectorSnapshot(days, adminEmail),
    buildMetricLineageSnapshot(),
    buildWhatChangedSnapshot(days),
  ]);

  const rootCauseItems = buildDataRootCauseItems({ health, drift, lineage, changes });
  const configItems = buildConfigRiskItems({ drift, changes, incidents });
  const triageItems = buildIncidentTriageItems({ incidents });
  const impactItems = buildImpactMapperItems({ health, incidents, lineage });

  return {
    generatedAt: new Date().toISOString(),
    days,
    surface,
    title: "Tech Root-Cause Intelligence",
    headline: `${rootCauseItems.length + configItems.length + triageItems.length + impactItems.length} tech and trust findings are ready for the current operating window.`,
    summary:
      "This layer translates technical drift, trust gaps, incidents, and hotspots into explicit business-risk decisions. It is deterministic, grounded on your admin telemetry, and designed to replace vague tech triage with evidence-backed operating guidance.",
    prompts: [
      {
        label: "Root cause",
        query: "What is the most likely root cause of data trust issues right now?",
      },
      { label: "Risky config", query: "Which recent config or change is riskiest right now?" },
      { label: "Triage", query: "What should tech triage first today?" },
      {
        label: "Business impact",
        query: "Which tech issue is distorting business decisions most?",
      },
    ],
    sections: filterSections([
      makeSection(
        "root-cause",
        "Data Root Causes",
        "Likely data-quality root causes across tracking gaps, drift findings, and low-trust metrics.",
        rootCauseItems
      ),
      makeSection(
        "config-risk",
        "Config Risk",
        "Recent config or governance changes that are most likely to be creating or amplifying incidents.",
        configItems
      ),
      makeSection(
        "triage",
        "Incident Triage",
        "The best first-response path for the current incident stack, with likely driver and owner hints.",
        triageItems
      ),
      makeSection(
        "business-impact",
        "Business Impact Mapping",
        "Technical hotspots translated into KPI, dashboard, and decision risk instead of staying infrastructure-only.",
        impactItems
      ),
    ]),
  };
}
