import { clampDays } from "@features/admin/server/next-level";
import { buildAnomalySnapshot } from "@features/admin/server/alerts";
import {
  buildReleaseImpactSnapshot,
  buildWhatChangedSnapshot,
} from "@features/admin/server/release-impact";
import type {
  IncidentCorrelationDriver,
  IncidentCorrelationEntry,
  IncidentCorrelationSnapshot,
} from "@features/admin/server/incident-correlation-types";

function inferMetricKey(input: { targetKey: string; title: string; href: string }) {
  const haystack = `${input.targetKey} ${input.title} ${input.href}`.toLowerCase();
  if (haystack.includes("completion")) return "completion_rate";
  if (haystack.includes("report")) return "report_view_rate";
  if (haystack.includes("revenue") || haystack.includes("payment")) return "revenue_total";
  if (haystack.includes("scoring")) return "scoring_agreement";
  if (haystack.includes("waitlist")) return "waitlist_to_start_rate";
  if (haystack.includes("submission") || haystack.includes("pipeline")) return "total_submissions";
  return null;
}

function confidenceFromDrivers(
  metricMatched: number,
  anyDrivers: number
): IncidentCorrelationEntry["confidence"] {
  if (metricMatched >= 2) return "high";
  if (metricMatched >= 1 || anyDrivers >= 2) return "medium";
  return "low";
}

function recommendationFor(category: string, confidence: IncidentCorrelationEntry["confidence"]) {
  if (category === "service" || category === "trust") {
    return confidence === "low"
      ? "Check infrastructure and tracking first; no strong business-change driver is obvious."
      : "Validate whether the linked change introduced a service, webhook, or tracking regression.";
  }
  if (category === "guardrail") {
    return confidence === "high"
      ? "Start with the linked release or experiment before changing thresholds or rolling back unrelated work."
      : "Compare the affected metric against the most recent releases and experiments before changing the product flow.";
  }
  return "Use the correlated changes as the first review queue before opening a wider investigation.";
}

export async function buildIncidentCorrelationSnapshot(
  inputDays: number
): Promise<IncidentCorrelationSnapshot> {
  const days = clampDays(inputDays || 30, 7, 90);
  const [anomalies, releaseImpact, changeLog] = await Promise.all([
    buildAnomalySnapshot(days),
    buildReleaseImpactSnapshot(days),
    buildWhatChangedSnapshot(days),
  ]);

  const entries: IncidentCorrelationEntry[] = anomalies.items
    .filter((item) => item.severity === "risk" || item.severity === "watch")
    .map((item) => {
      const severity: IncidentCorrelationEntry["severity"] =
        item.severity === "risk" ? "risk" : "watch";
      const metricKey = inferMetricKey({
        targetKey: item.targetKey,
        title: item.title,
        href: item.href,
      });

      const releaseDrivers: IncidentCorrelationDriver[] = releaseImpact.releases
        .filter(
          (entry) =>
            entry.attention === "regression" &&
            (!metricKey || entry.primaryMetricKey === metricKey || entry.href === item.href)
        )
        .slice(0, 2)
        .map((entry) => ({
          kind: "release",
          title: entry.title,
          detail: `${entry.category} | ${entry.deltaCompletionRate >= 0 ? "+" : ""}${entry.deltaCompletionRate}pp completion`,
          date: entry.eventDate,
          href: entry.href,
        }));

      const changeDrivers: IncidentCorrelationDriver[] = changeLog.items
        .filter(
          (entry) =>
            entry.kind !== "annotation" &&
            (!metricKey || entry.metricKey === metricKey || entry.href === item.href)
        )
        .slice(0, 3)
        .map((entry) => ({
          kind: entry.kind,
          title: entry.title,
          detail: entry.detail,
          date: entry.date,
          href: entry.href,
        }));

      const suspectedDrivers = [...releaseDrivers, ...changeDrivers]
        .sort((left, right) => right.date.localeCompare(left.date))
        .slice(0, 4);

      const metricMatched = suspectedDrivers.filter((driver) =>
        changeLog.items.some(
          (entry) =>
            entry.title === driver.title &&
            metricKey != null &&
            entry.metricKey != null &&
            entry.metricKey === metricKey
        )
      ).length;
      const confidence = confidenceFromDrivers(metricMatched, suspectedDrivers.length);

      return {
        id: item.id,
        severity,
        category: item.category,
        title: item.title,
        currentSignal: item.detail,
        confidence,
        ownerEmail: item.ownerEmail,
        metricKey,
        suspectedDrivers,
        recommendation: recommendationFor(item.category, confidence),
      };
    });

  const sortedEntries = entries.sort((left, right) => {
    const severityWeight = (value: IncidentCorrelationEntry["severity"]) =>
      value === "risk" ? 0 : 1;
    const confidenceWeight = (value: IncidentCorrelationEntry["confidence"]) =>
      value === "high" ? 0 : value === "medium" ? 1 : 2;
    return (
      severityWeight(left.severity) - severityWeight(right.severity) ||
      confidenceWeight(left.confidence) - confidenceWeight(right.confidence) ||
      left.title.localeCompare(right.title)
    );
  });

  return {
    generatedAt: new Date().toISOString(),
    days,
    summary: {
      incidents: sortedEntries.length,
      highConfidence: sortedEntries.filter((entry) => entry.confidence === "high").length,
      releaseLinked: sortedEntries.filter((entry) =>
        entry.suspectedDrivers.some((driver) => driver.kind === "release")
      ).length,
      trackingOrService: sortedEntries.filter(
        (entry) => entry.category === "service" || entry.category === "trust"
      ).length,
    },
    entries: sortedEntries,
  };
}
