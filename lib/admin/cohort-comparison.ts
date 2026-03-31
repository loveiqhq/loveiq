import { buildExperimentRegistrySnapshot } from "@/lib/admin/experiment-registry";
import { clampDays, round1 } from "@/lib/admin/next-level";
import { buildReleaseImpactSnapshot } from "@/lib/admin/release-impact";
import { supabaseFetch } from "@/lib/admin/supabase";
import type { StatisticalSignificance } from "@/lib/admin/statistics";
import logger from "@/lib/logger";

type ComparisonTone = "good" | "watch" | "risk" | "neutral";

interface SubmissionJoin {
  status: string | null;
  created_date_time: string | null;
  duration_ms: number | null;
}

interface ScoringVersionRow {
  engine_version: string | null;
  primary_archetype: string | null;
  v5_primary_archetype: string | null;
  scored_at: string | null;
  survey_submission: SubmissionJoin | SubmissionJoin[] | null;
}

export interface ReleaseComparisonEntry {
  id: number;
  title: string;
  category: string;
  eventDate: string;
  primaryMetricLabel: string | null;
  attention: "lift" | "watch" | "regression";
  compareWindowLabel: string;
  deltaSubmissions: number;
  deltaCompletionRate: number;
  deltaWaitlist: number;
  completionSignal: StatisticalSignificance;
  completionSummary: string;
  linkedDecisionCount: number;
  linkedExperimentCount: number;
  href: string;
}

export interface VersionComparisonEntry {
  versionKey: string;
  label: string;
  sampleSize: number;
  shareOfScored: number;
  completionRate: number;
  avgDurationMinutes: number | null;
  dominantArchetype: string | null;
  agreementRate: number | null;
  tone: ComparisonTone;
  notes: string[];
  href: string;
}

export interface ExperimentComparisonEntry {
  id: number;
  name: string;
  status: string;
  segmentName: string | null;
  primaryMetricLabel: string;
  confidence: "high" | "medium" | "low";
  confidenceScore: number;
  decisionLabel: string;
  decisionTone: ComparisonTone;
  controlRateLabel: string | null;
  variantRateLabel: string | null;
  deltaLabel: string | null;
  significance: StatisticalSignificance;
  significanceLabel: string;
  summary: string;
  compareWindowLabel: string;
  guardrailRiskCount: number;
  blindspotCount: number;
  href: string;
}

export interface CohortComparisonSnapshot {
  generatedAt: string;
  days: number;
  summary: {
    releaseComparisons: number;
    versionComparisons: number;
    experimentComparisons: number;
    strongestRelease: string | null;
    strongestVersion: string | null;
    strongestExperiment: string | null;
  };
  trust: {
    warning: string | null;
    notes: string[];
  };
  releaseComparisons: ReleaseComparisonEntry[];
  versionComparisons: VersionComparisonEntry[];
  experimentComparisons: ExperimentComparisonEntry[];
}

function normalizeSubmissionJoin(
  input: SubmissionJoin | SubmissionJoin[] | null
): SubmissionJoin | null {
  if (!input) return null;
  return Array.isArray(input) ? (input[0] ?? null) : input;
}

function dateToComparable(value: string | null): string | null {
  if (!value) return null;
  return value.length === 10 ? `${value}T00:00:00.000Z` : value;
}

function labelEngineVersion(value: string | null): string {
  if (!value) return "Unknown";
  if (value === "v4+v5") return "V4 + V5";
  return value.toUpperCase();
}

function versionTone(sampleSize: number, completionRate: number): ComparisonTone {
  if (sampleSize < 10) return "neutral";
  if (completionRate >= 75) return "good";
  if (completionRate >= 55) return "watch";
  return "risk";
}

async function fetchVersionComparisons(days: number): Promise<VersionComparisonEntry[]> {
  const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();
  const response = await supabaseFetch(
    `/rest/v1/scoring_result?select=engine_version,primary_archetype,v5_primary_archetype,scored_at,survey_submission(status,created_date_time,duration_ms)&scored_at=gte.${sinceIso}&order=scored_at.desc`,
    { headers: { Range: "0-49999" } }
  );

  if (!response.ok) {
    throw new Error("Unable to load scoring version comparisons.");
  }

  const rows = (await response.json()) as ScoringVersionRow[];
  const groups = new Map<
    string,
    {
      sampleSize: number;
      completed: number;
      durationMinutes: number[];
      comparable: number;
      agreements: number;
      archetypes: Map<string, number>;
    }
  >();

  for (const row of rows) {
    const versionKey = row.engine_version ?? "unknown";
    const group = groups.get(versionKey) ?? {
      sampleSize: 0,
      completed: 0,
      durationMinutes: [],
      comparable: 0,
      agreements: 0,
      archetypes: new Map<string, number>(),
    };
    const submission = normalizeSubmissionJoin(row.survey_submission);

    group.sampleSize += 1;
    if (submission?.status === "completed") {
      group.completed += 1;
    }
    if (submission?.duration_ms != null && submission.duration_ms > 0) {
      group.durationMinutes.push(submission.duration_ms / 60_000);
    }
    if (row.primary_archetype) {
      group.archetypes.set(
        row.primary_archetype,
        (group.archetypes.get(row.primary_archetype) ?? 0) + 1
      );
    }
    if (row.primary_archetype && row.v5_primary_archetype) {
      group.comparable += 1;
      if (row.primary_archetype === row.v5_primary_archetype) {
        group.agreements += 1;
      }
    }

    groups.set(versionKey, group);
  }

  const totalScored = rows.length;

  return [...groups.entries()]
    .map(([versionKey, group]) => {
      const dominantArchetype =
        [...group.archetypes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const completionRate =
        group.sampleSize > 0 ? round1((group.completed / group.sampleSize) * 100) : 0;
      const avgDurationMinutes =
        group.durationMinutes.length > 0
          ? round1(
              group.durationMinutes.reduce((sum, value) => sum + value, 0) /
                group.durationMinutes.length
            )
          : null;
      const agreementRate =
        group.comparable > 0 ? round1((group.agreements / group.comparable) * 100) : null;
      const notes = [
        `${group.sampleSize.toLocaleString()} scored submission${group.sampleSize === 1 ? "" : "s"} in the selected window.`,
        agreementRate != null
          ? `${agreementRate}% agreement on rows with dual V4/V5 outputs.`
          : "No dual-output rows available for agreement comparison.",
      ];

      return {
        versionKey,
        label: labelEngineVersion(versionKey),
        sampleSize: group.sampleSize,
        shareOfScored: totalScored > 0 ? round1((group.sampleSize / totalScored) * 100) : 0,
        completionRate,
        avgDurationMinutes,
        dominantArchetype,
        agreementRate,
        tone: versionTone(group.sampleSize, completionRate),
        notes,
        href: "/admin/scoring",
      } satisfies VersionComparisonEntry;
    })
    .sort((a, b) => b.sampleSize - a.sampleSize || b.completionRate - a.completionRate);
}

export async function buildCohortComparisonSnapshot(
  inputDays: number,
  adminEmail: string
): Promise<CohortComparisonSnapshot> {
  const days = clampDays(inputDays || 30, 7, 90);

  try {
    const [releaseSnapshot, experimentSnapshot, versionComparisons] = await Promise.all([
      buildReleaseImpactSnapshot(days),
      buildExperimentRegistrySnapshot(adminEmail),
      fetchVersionComparisons(days),
    ]);

    const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();
    const releaseComparisons = releaseSnapshot.releases.map((entry) => ({
      id: entry.id,
      title: entry.title,
      category: entry.category,
      eventDate: entry.eventDate,
      primaryMetricLabel: entry.primaryMetricLabel,
      attention: entry.attention,
      compareWindowLabel: "7d before vs 7d after",
      deltaSubmissions: entry.deltaSubmissions,
      deltaCompletionRate: entry.deltaCompletionRate,
      deltaWaitlist: entry.deltaWaitlist,
      completionSignal: entry.completionSignal.significance,
      completionSummary: entry.completionSignal.summary,
      linkedDecisionCount: entry.linkedDecisionCount,
      linkedExperimentCount: entry.linkedExperimentCount,
      href: entry.href,
    }));

    const experimentComparisons = experimentSnapshot.experiments
      .filter((experiment) =>
        [experiment.updated_at, experiment.start_date, experiment.decision_date]
          .map((value) => dateToComparable(value))
          .some((value) => value != null && value >= sinceIso)
      )
      .map((experiment) => ({
        id: experiment.id,
        name: experiment.name,
        status: experiment.status,
        segmentName: experiment.segment_name,
        primaryMetricLabel: experiment.primary_metric_label,
        confidence: experiment.confidence,
        confidenceScore: experiment.confidenceScore,
        decisionLabel: experiment.decisionLabel,
        decisionTone: experiment.decisionTone,
        controlRateLabel: experiment.readout.controlRateLabel,
        variantRateLabel: experiment.readout.variantRateLabel,
        deltaLabel: experiment.readout.deltaLabel,
        significance: experiment.readout.significance,
        significanceLabel: experiment.readout.significanceLabel,
        summary: experiment.readout.summary,
        compareWindowLabel: "control vs variant",
        guardrailRiskCount: experiment.guardrailRiskCount,
        blindspotCount: experiment.blindspotCount,
        href: "/admin/experiments",
      }))
      .sort((a, b) => {
        const significanceWeight = (value: StatisticalSignificance) =>
          value === "significant-lift"
            ? 0
            : value === "significant-regression"
              ? 1
              : value === "inconclusive"
                ? 2
                : 3;
        return (
          significanceWeight(a.significance) - significanceWeight(b.significance) ||
          b.confidenceScore - a.confidenceScore
        );
      });

    const strongestRelease =
      releaseComparisons.find((entry) => entry.attention === "lift")?.title ??
      releaseComparisons[0]?.title ??
      null;
    const strongestVersion =
      [...versionComparisons].sort((a, b) => b.completionRate - a.completionRate)[0]?.label ?? null;
    const strongestExperiment =
      experimentComparisons.find((entry) => entry.significance === "significant-lift")?.name ??
      experimentComparisons[0]?.name ??
      null;

    const trustNotes = [
      "Release comparison uses the existing 7-day pre/post release windows from the changelog impact model.",
      "Version comparison is based on scored submissions only and uses stored scoring engine versions.",
      "Experiment comparison uses persisted control/variant readouts and decision rigor because per-submission bucket assignment is not tracked in the current schema.",
    ];

    return {
      generatedAt: new Date().toISOString(),
      days,
      summary: {
        releaseComparisons: releaseComparisons.length,
        versionComparisons: versionComparisons.length,
        experimentComparisons: experimentComparisons.length,
        strongestRelease,
        strongestVersion,
        strongestExperiment,
      },
      trust: {
        warning:
          versionComparisons.reduce((sum, entry) => sum + entry.sampleSize, 0) < 20
            ? "Impact comparison is directional only because the scored sample is small in the selected window."
            : null,
        notes: trustNotes,
      },
      releaseComparisons,
      versionComparisons,
      experimentComparisons,
    };
  } catch (err) {
    logger.error({ err }, "Cohort comparison snapshot error");
    throw err;
  }
}
