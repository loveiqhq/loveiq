import { surveyQuestions } from "@/data/survey-data";
import {
  buildExperimentRegistrySnapshot,
  type ExperimentSnapshot,
} from "@/lib/admin/experiment-registry";
import { buildResearchIntelligenceSnapshot } from "@/lib/admin/research-intelligence";
import { supabaseFetch } from "@/lib/admin/supabase";
import { WORKFLOW_TAGS } from "@/lib/admin/workflow-tags";
import { getScoringConfig } from "@features/scoring/logic/config";
import logger from "@/lib/logger";

export type DriftCategoryKey =
  | "taxonomy"
  | "event-naming"
  | "config"
  | "answer-mapping"
  | "experiment-setup";

export type DriftSeverity = "risk" | "watch";
export type DriftCategoryStatus = "stable" | "watch" | "risk";

export interface DriftFinding {
  id: string;
  category: DriftCategoryKey;
  categoryLabel: string;
  severity: DriftSeverity;
  title: string;
  detail: string;
  recommendation: string;
  href: string;
  signals: string[];
  affectedCount: number;
}

export interface DriftCategorySummary {
  key: DriftCategoryKey;
  label: string;
  status: DriftCategoryStatus;
  riskScore: number;
  findingCount: number;
  coverageLabel: string;
  note: string;
}

export interface DriftDetectorSnapshot {
  generatedAt: string;
  days: number;
  summary: {
    totalFindings: number;
    riskFindings: number;
    watchFindings: number;
    categoriesAtRisk: number;
    impactedQuestions: number;
    impactedExperiments: number;
    uncoveredTerms: number;
    unexpectedEventTypes: number;
  };
  categorySummaries: DriftCategorySummary[];
  findings: DriftFinding[];
}

interface LiveQuestionRow {
  id: number;
  frontend_qid: string | null;
  type: string | null;
  question: string | null;
  status: string | null;
  required: boolean | null;
  display_order: number | null;
}

interface LiveAnswerOptionRow {
  survey_question_id: number;
  option_text: string | null;
  option_value: string | null;
  display_order: number | null;
}

interface SubmissionTagRow {
  name: string;
}

interface TagRuleRow {
  id: number;
  field: string;
  operator: string;
  value: string;
  is_active: boolean;
}

interface ResearchRepositoryRow {
  theme: string | null;
  title: string | null;
  entry_type: string | null;
}

interface AnalyticsEventRow {
  event_type: string | null;
  event_time: string | null;
}

interface BehaviorDirectionRow {
  direction: string | null;
}

interface CategoryEvaluation {
  key: DriftCategoryKey;
  label: string;
  coverageLabel: string;
  note: string;
  findings: DriftFinding[];
  questionIds: string[];
  experimentIds: number[];
  uncoveredTerms: number;
  unexpectedEventTypes: number;
}

const EXPECTED_ANALYTICS_EVENT_TYPES = new Set([
  "cta_click",
  "waitlist_signup",
  "survey_start",
  "survey_started",
  "survey_answer",
  "survey_complete",
  "survey_completed",
  "survey_pause",
  "survey_invite",
  "report_purchase",
]);

const EXPECTED_SURVEY_DIRECTIONS = new Set(["forward", "back", "abandon", "complete"]);

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function uniqueValues(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function tokenMatch(needle: string, haystack: string) {
  const left = normalizeText(needle);
  const right = normalizeText(haystack);
  if (!left || !right) return false;
  if (left === right) return true;
  if (right.split(" ").includes(left)) return true;
  if (left.split(" ").includes(right)) return true;
  return right.includes(left);
}

function listLabel(values: string[], limit = 3) {
  const trimmed = values.filter(Boolean).slice(0, limit);
  if (trimmed.length === 0) return "none";
  return trimmed.join(", ");
}

function categoryStatus(findings: DriftFinding[]): DriftCategoryStatus {
  if (findings.some((finding) => finding.severity === "risk")) return "risk";
  if (findings.length > 0) return "watch";
  return "stable";
}

function categoryRiskScore(findings: DriftFinding[]) {
  return Math.min(
    100,
    findings.reduce((total, finding) => total + (finding.severity === "risk" ? 38 : 18), 0)
  );
}

function makeFinding(input: Omit<DriftFinding, "id">) {
  return {
    ...input,
    id: `${input.category}-${normalizeText(input.title).replace(/\s+/g, "-")}`,
  } satisfies DriftFinding;
}

async function fetchLiveSurvey() {
  const [questionsRes, optionsRes] = await Promise.all([
    supabaseFetch(
      "/rest/v1/survey_question?select=id,frontend_qid,type,question,status,required,display_order&status=eq.active&order=display_order.asc",
      {
        headers: { Range: "0-199" },
      }
    ),
    supabaseFetch(
      "/rest/v1/answer_option?select=survey_question_id,option_text,option_value,display_order&order=survey_question_id.asc,display_order.asc",
      {
        headers: { Range: "0-999" },
      }
    ),
  ]);

  if (!questionsRes.ok || !optionsRes.ok) {
    logger.error(
      { statuses: [questionsRes.status, optionsRes.status] },
      "Drift detector survey query failed"
    );
    throw new Error("drift_detector_survey_query_failed");
  }

  return {
    questions: (await questionsRes.json()) as LiveQuestionRow[],
    options: (await optionsRes.json()) as LiveAnswerOptionRow[],
  };
}

async function fetchTaxonomyInputs() {
  const [tagsRes, rulesRes, repositoryRes] = await Promise.all([
    supabaseFetch("/rest/v1/submission_tag?select=name&order=name.asc", {
      headers: { Range: "0-199" },
    }),
    supabaseFetch(
      "/rest/v1/admin_tag_rules?select=id,field,operator,value,is_active&order=created_at.desc",
      {
        headers: { Range: "0-199" },
      }
    ),
    supabaseFetch(
      "/rest/v1/admin_research_repository_entry?select=theme,title,entry_type&order=updated_at.desc",
      {
        headers: { Range: "0-499" },
      }
    ),
  ]);

  if (!tagsRes.ok || !rulesRes.ok || !repositoryRes.ok) {
    logger.warn(
      { statuses: [tagsRes.status, rulesRes.status, repositoryRes.status] },
      "Drift detector taxonomy inputs unavailable"
    );
    return {
      tags: [] as SubmissionTagRow[],
      rules: [] as TagRuleRow[],
      repository: [] as ResearchRepositoryRow[],
    };
  }

  return {
    tags: (await tagsRes.json()) as SubmissionTagRow[],
    rules: (await rulesRes.json()) as TagRuleRow[],
    repository: (await repositoryRes.json()) as ResearchRepositoryRow[],
  };
}

async function fetchEventInputs(days: number) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [analyticsRes, behaviorRes] = await Promise.all([
    supabaseFetch(
      `/rest/v1/analytics_event?select=event_type,event_time&event_time=gte.${since}&order=event_time.desc`,
      { headers: { Range: "0-4999" } }
    ),
    supabaseFetch(
      `/rest/v1/survey_behavior_event?select=direction&event_time=gte.${since}&order=event_time.desc`,
      { headers: { Range: "0-4999" } }
    ),
  ]);

  if (!analyticsRes.ok || !behaviorRes.ok) {
    logger.warn(
      { statuses: [analyticsRes.status, behaviorRes.status] },
      "Drift detector event inputs unavailable"
    );
    return {
      analytics: [] as AnalyticsEventRow[],
      behavior: [] as BehaviorDirectionRow[],
    };
  }

  return {
    analytics: (await analyticsRes.json()) as AnalyticsEventRow[],
    behavior: (await behaviorRes.json()) as BehaviorDirectionRow[],
  };
}

function evaluateTaxonomyDrift(input: {
  research: Awaited<ReturnType<typeof buildResearchIntelligenceSnapshot>>;
  tags: SubmissionTagRow[];
  rules: TagRuleRow[];
  repository: ResearchRepositoryRow[];
}): CategoryEvaluation {
  const label = "Taxonomy Drift";
  const findings: DriftFinding[] = [];
  const questionIds: string[] = [];
  const activeRules = input.rules.filter((rule) => rule.is_active);
  const repositoryThemes = uniqueValues(input.repository.map((entry) => entry.theme));
  const themeNames = uniqueValues(input.research.themes.map((theme) => theme.theme));
  const taxonomyVocabulary = uniqueValues([
    ...repositoryThemes,
    ...themeNames,
    ...input.tags.map((tag) => tag.name),
    ...WORKFLOW_TAGS.map((tag) => tag.name),
    ...WORKFLOW_TAGS.map((tag) => tag.label),
  ]);

  const uncoveredEmergingTerms = input.research.emergingTerms.filter((term) => {
    if (term.currentCount < 4 || term.delta <= 0) return false;
    return !taxonomyVocabulary.some((entry) => tokenMatch(term.term, entry));
  });

  if (
    input.research.summary.responses > 0 &&
    repositoryThemes.length === 0 &&
    input.tags.length === 0 &&
    activeRules.length === 0
  ) {
    findings.push(
      makeFinding({
        category: "taxonomy",
        categoryLabel: label,
        severity: "risk",
        title: "Curated taxonomy coverage is empty",
        detail:
          "Research signals are live, but there are no persisted repository themes, no submission tags, and no active auto-tag rules to stabilize vocabulary.",
        recommendation:
          "Seed the taxonomy surfaces from current research themes and add the first active tag rules so emerging language does not stay unstructured.",
        href: "/admin/research",
        signals: [
          `${input.research.summary.themes} theme clusters`,
          `${input.research.summary.emergingTerms} emerging terms`,
          "0 repository themes",
          "0 active tag rules",
        ],
        affectedCount: input.research.summary.themes + input.research.summary.emergingTerms,
      })
    );
  }

  if (uncoveredEmergingTerms.length > 0) {
    findings.push(
      makeFinding({
        category: "taxonomy",
        categoryLabel: label,
        severity: uncoveredEmergingTerms.length >= 4 ? "risk" : "watch",
        title: "Emerging language is outpacing taxonomy curation",
        detail:
          "High-growth research terms are appearing without a matching curated theme, tag, or workflow label, so the taxonomy will fragment as volume grows.",
        recommendation:
          "Promote the top uncovered terms into curated research themes or operational tags before they spread across multiple surfaces with inconsistent names.",
        href: "/admin/research",
        signals: uncoveredEmergingTerms
          .slice(0, 4)
          .map((term) => `${term.term} (+${term.delta}, ${term.currentCount} now)`),
        affectedCount: uncoveredEmergingTerms.length,
      })
    );
  }

  if (repositoryThemes.length > 0) {
    const uncuratedThemeClusters = input.research.themes.filter(
      (theme) => !repositoryThemes.some((entry) => tokenMatch(theme.theme, entry))
    );
    if (uncuratedThemeClusters.length >= 3) {
      findings.push(
        makeFinding({
          category: "taxonomy",
          categoryLabel: label,
          severity: "watch",
          title: "Theme clusters are not being promoted into the repository fast enough",
          detail:
            "The live research surface is seeing stable theme clusters that still do not exist in the curated repository, which weakens repeatability across reviews and actions.",
          recommendation:
            "Promote the recurring theme clusters into repository entries with linked metrics and owners so research vocabulary stays stable across cycles.",
          href: "/admin/research",
          signals: uncuratedThemeClusters.slice(0, 4).map((theme) => theme.theme),
          affectedCount: uncuratedThemeClusters.length,
        })
      );
    }
  }

  return {
    key: "taxonomy",
    label,
    coverageLabel: `${repositoryThemes.length} repo themes, ${input.tags.length} tags, ${activeRules.length} active rules`,
    note:
      findings.length > 0
        ? "Vocabulary governance needs tighter curation and promotion loops."
        : "Curated research vocabulary is keeping up with current signal volume.",
    findings,
    questionIds,
    experimentIds: [],
    uncoveredTerms: uncoveredEmergingTerms.length,
    unexpectedEventTypes: 0,
  };
}

function evaluateEventNamingDrift(input: {
  analytics: AnalyticsEventRow[];
  behavior: BehaviorDirectionRow[];
}): CategoryEvaluation {
  const label = "Event Naming Drift";
  const findings: DriftFinding[] = [];
  const analyticsCounts = new Map<string, number>();

  for (const row of input.analytics) {
    const eventType = row.event_type?.trim();
    if (!eventType) continue;
    analyticsCounts.set(eventType, (analyticsCounts.get(eventType) ?? 0) + 1);
  }

  const behaviorDirections = uniqueValues(input.behavior.map((row) => row.direction));
  const unexpectedEventTypes = [...analyticsCounts.keys()].filter(
    (eventType) => !EXPECTED_ANALYTICS_EVENT_TYPES.has(eventType) || !/^[a-z0-9_]+$/.test(eventType)
  );
  const unexpectedDirections = behaviorDirections.filter(
    (direction) => !EXPECTED_SURVEY_DIRECTIONS.has(direction)
  );
  const legacyPairs: string[] = [];

  if (analyticsCounts.has("survey_start") && analyticsCounts.has("survey_started")) {
    legacyPairs.push("survey_start + survey_started");
  }
  if (analyticsCounts.has("survey_complete") && analyticsCounts.has("survey_completed")) {
    legacyPairs.push("survey_complete + survey_completed");
  }

  if (input.analytics.length === 0) {
    findings.push(
      makeFinding({
        category: "event-naming",
        categoryLabel: label,
        severity: "risk",
        title: "Analytics event naming cannot be reconciled because analytics_event is empty",
        detail:
          "Survey navigation data exists, but analytics_event has no rows in the selected window, so naming drift and instrumentation breaks cannot be validated against the client event stream.",
        recommendation:
          "Restore analytics_event ingestion first, then retire duplicate legacy event names once the modern stream is confirmed live.",
        href: "/admin/health",
        signals: [
          `${input.analytics.length} analytics events`,
          `${input.behavior.length} survey behavior events`,
          `${behaviorDirections.length} distinct survey directions`,
        ],
        affectedCount: input.behavior.length,
      })
    );
  }

  if (
    legacyPairs.length > 0 ||
    unexpectedEventTypes.length > 0 ||
    unexpectedDirections.length > 0
  ) {
    findings.push(
      makeFinding({
        category: "event-naming",
        categoryLabel: label,
        severity:
          unexpectedEventTypes.length > 0 || unexpectedDirections.length > 0 ? "risk" : "watch",
        title: "Event naming conventions are diverging across telemetry surfaces",
        detail:
          "Telemetry is carrying overlapping or off-convention names, which makes attribution and alerting harder once the stream volume increases again.",
        recommendation:
          "Normalize telemetry to a single snake_case vocabulary, remove legacy duplicates on schedule, and keep survey navigation directions restricted to the expected enum set.",
        href: "/admin/health",
        signals: [
          ...legacyPairs,
          ...unexpectedEventTypes.slice(0, 3),
          ...unexpectedDirections.slice(0, 3).map((direction) => `direction:${direction}`),
        ],
        affectedCount:
          legacyPairs.length + unexpectedEventTypes.length + unexpectedDirections.length,
      })
    );
  }

  return {
    key: "event-naming",
    label,
    coverageLabel: `${input.analytics.length} analytics rows, ${behaviorDirections.length} survey directions`,
    note:
      findings.length > 0
        ? "Telemetry naming or ingestion gaps are weakening attribution confidence."
        : "Telemetry naming is consistent across tracked event surfaces.",
    findings,
    questionIds: [],
    experimentIds: [],
    uncoveredTerms: 0,
    unexpectedEventTypes: unexpectedEventTypes.length,
  };
}

function evaluateConfigDrift(input: { liveQuestions: LiveQuestionRow[] }): CategoryEvaluation {
  const label = "Config Drift";
  const findings: DriftFinding[] = [];
  const sourceQuestions = surveyQuestions.filter((question) => !question.qId.startsWith("00"));
  const liveQuestions = input.liveQuestions.filter(
    (question) => question.frontend_qid && !question.frontend_qid.startsWith("00")
  );
  const sourceByQid = new Map(sourceQuestions.map((question) => [question.qId, question]));
  const liveByQid = new Map(
    liveQuestions.map((question) => [question.frontend_qid as string, question])
  );
  const scoringConfig = getScoringConfig();

  const sourceOnly = [...sourceByQid.keys()].filter((qid) => !liveByQid.has(qid));
  const liveOnly = [...liveByQid.keys()].filter((qid) => !sourceByQid.has(qid));
  const textMismatches = [...sourceByQid.keys()].filter((qid) => {
    const live = liveByQid.get(qid);
    const source = sourceByQid.get(qid);
    if (!live || !source) return false;
    return normalizeText(live.question) !== normalizeText(source.question);
  });
  const orphanedScoringQids = [...scoringConfig.knownQids].filter(
    (qid) => !sourceByQid.has(qid) || !liveByQid.has(qid)
  );

  if (sourceOnly.length > 0 || liveOnly.length > 0 || textMismatches.length > 0) {
    findings.push(
      makeFinding({
        category: "config",
        categoryLabel: label,
        severity: sourceOnly.length > 0 || liveOnly.length > 0 ? "risk" : "watch",
        title: "Live survey definition has drifted from the app source of truth",
        detail:
          "The active survey_question records no longer line up cleanly with the generated survey-data source, which creates release risk for copy, branching, and analytics assumptions.",
        recommendation:
          "Reconcile the live survey_question rows against data/survey-data.ts so question text and active question IDs are identical before further survey edits.",
        href: "/admin/health",
        signals: [
          sourceOnly.length > 0
            ? `${sourceOnly.length} source-only qids: ${listLabel(sourceOnly)}`
            : "",
          liveOnly.length > 0 ? `${liveOnly.length} live-only qids: ${listLabel(liveOnly)}` : "",
          textMismatches.length > 0
            ? `${textMismatches.length} text mismatches: ${listLabel(textMismatches)}`
            : "",
        ].filter(Boolean),
        affectedCount: sourceOnly.length + liveOnly.length + textMismatches.length,
      })
    );
  }

  if (orphanedScoringQids.length > 0) {
    findings.push(
      makeFinding({
        category: "config",
        categoryLabel: label,
        severity: "risk",
        title:
          "Scoring config references questions that are no longer fully grounded in the live survey",
        detail:
          "The compiled scoring configuration still points at question IDs that are missing from either the live survey table or the generated survey source, so model assumptions can drift from the actual instrument.",
        recommendation:
          "Regenerate or reconcile scoring-config question references so every scoring qid is anchored to both survey-data.ts and survey_question.",
        href: "/admin/scoring",
        signals: orphanedScoringQids.slice(0, 5),
        affectedCount: orphanedScoringQids.length,
      })
    );
  }

  return {
    key: "config",
    label,
    coverageLabel: `${liveQuestions.length} live qids, ${sourceQuestions.length} source qids, ${scoringConfig.knownQids.size} scoring qids`,
    note:
      findings.length > 0
        ? "Survey structure and scoring assumptions need tighter synchronization."
        : "Live survey structure matches the generated app source and scoring anchors.",
    findings,
    questionIds: [...sourceOnly, ...liveOnly, ...textMismatches, ...orphanedScoringQids],
    experimentIds: [],
    uncoveredTerms: 0,
    unexpectedEventTypes: 0,
  };
}

function evaluateAnswerMappingDrift(input: {
  liveQuestions: LiveQuestionRow[];
  liveOptions: LiveAnswerOptionRow[];
}): CategoryEvaluation {
  const label = "Answer Mapping Drift";
  const findings: DriftFinding[] = [];
  const sourceOptionQuestions = surveyQuestions.filter(
    (question) => question.answerType === "single" || question.answerType === "multiple"
  );
  const questionIdByDbId = new Map(
    input.liveQuestions
      .filter((question) => question.frontend_qid)
      .map((question) => [question.id, question.frontend_qid as string])
  );
  const liveOptionsByQid = new Map<string, string[]>();

  for (const row of input.liveOptions) {
    const qid = questionIdByDbId.get(row.survey_question_id);
    const option = row.option_text?.trim();
    if (!qid || !option) continue;
    const current = liveOptionsByQid.get(qid) ?? [];
    current.push(option);
    liveOptionsByQid.set(qid, current);
  }

  const scoringConfig = getScoringConfig();
  const optionMismatchQuestions: Array<{
    qid: string;
    missingLive: string[];
    extraLive: string[];
  }> = [];
  const mappingGapQuestions: Array<{
    qid: string;
    uncoveredLive: string[];
    staleConfigLabels: string[];
  }> = [];

  for (const question of sourceOptionQuestions) {
    const liveOptions = uniqueValues(liveOptionsByQid.get(question.qId) ?? []);
    const sourceOptions = uniqueValues(question.options);
    const normalizedLive = new Set(liveOptions.map((option) => normalizeText(option)));
    const normalizedSource = new Set(sourceOptions.map((option) => normalizeText(option)));
    const missingLive = sourceOptions.filter(
      (option) => !normalizedLive.has(normalizeText(option))
    );
    const extraLive = liveOptions.filter((option) => !normalizedSource.has(normalizeText(option)));

    if (missingLive.length > 0 || extraLive.length > 0) {
      optionMismatchQuestions.push({
        qid: question.qId,
        missingLive,
        extraLive,
      });
    }

    const labelMap = scoringConfig.labelToCode[question.qId];
    if (!labelMap) continue;

    const configLabels = uniqueValues(Object.keys(labelMap));
    const normalizedConfigLabels = new Set(
      configLabels.map((labelValue) => normalizeText(labelValue))
    );
    const uncoveredLive = liveOptions.filter(
      (option) => !normalizedConfigLabels.has(normalizeText(option))
    );
    const staleConfigLabels = configLabels.filter(
      (labelValue) => !normalizedLive.has(normalizeText(labelValue))
    );

    if (uncoveredLive.length > 0 || staleConfigLabels.length > 0) {
      mappingGapQuestions.push({
        qid: question.qId,
        uncoveredLive,
        staleConfigLabels,
      });
    }
  }

  if (optionMismatchQuestions.length > 0) {
    findings.push(
      makeFinding({
        category: "answer-mapping",
        categoryLabel: label,
        severity: "risk",
        title: "Live answer options no longer match the generated survey definition",
        detail:
          "Single and multiple-choice options have drifted between survey-data.ts and the live answer_option table, which can break exports, analytics, and scoring assumptions.",
        recommendation:
          "Reconcile the live answer_option rows against survey-data.ts before shipping more survey copy or logic changes.",
        href: "/admin/health",
        signals: optionMismatchQuestions.slice(0, 4).map((item) => {
          const signals = [
            item.missingLive.length > 0 ? `missing ${listLabel(item.missingLive, 2)}` : "",
            item.extraLive.length > 0 ? `extra ${listLabel(item.extraLive, 2)}` : "",
          ]
            .filter(Boolean)
            .join(" / ");
          return `${item.qid}: ${signals}`;
        }),
        affectedCount: optionMismatchQuestions.length,
      })
    );
  }

  if (mappingGapQuestions.length > 0) {
    findings.push(
      makeFinding({
        category: "answer-mapping",
        categoryLabel: label,
        severity: "risk",
        title: "Scoring label-to-code mappings are stale against live answer labels",
        detail:
          "The compiled labelToCode map is no longer a clean match for the live option labels on mapped questions, so answer normalization can silently degrade.",
        recommendation:
          "Regenerate scoring-config label mappings or align the live option labels so every mapped option has a single canonical code path.",
        href: "/admin/scoring",
        signals: mappingGapQuestions.slice(0, 4).map((item) => {
          const pieces = [
            item.uncoveredLive.length > 0 ? `live ${listLabel(item.uncoveredLive, 2)}` : "",
            item.staleConfigLabels.length > 0
              ? `config ${listLabel(item.staleConfigLabels, 2)}`
              : "",
          ]
            .filter(Boolean)
            .join(" / ");
          return `${item.qid}: ${pieces}`;
        }),
        affectedCount: mappingGapQuestions.length,
      })
    );
  }

  return {
    key: "answer-mapping",
    label,
    coverageLabel: `${sourceOptionQuestions.length} option questions, ${Object.keys(scoringConfig.labelToCode).length} mapped qids`,
    note:
      findings.length > 0
        ? "Live option labels and compiled mapping code paths are no longer aligned."
        : "Answer options and scoring label maps are aligned with the current survey source.",
    findings,
    questionIds: [
      ...optionMismatchQuestions.map((item) => item.qid),
      ...mappingGapQuestions.map((item) => item.qid),
    ],
    experimentIds: [],
    uncoveredTerms: 0,
    unexpectedEventTypes: 0,
  };
}

function evaluateExperimentSetupDrift(input: {
  experiments: ExperimentSnapshot[];
}): CategoryEvaluation {
  const label = "Experiment Setup Drift";
  const findings: DriftFinding[] = [];
  const experiments = input.experiments;
  const setupGaps = experiments.filter(
    (experiment) =>
      !experiment.owner_email ||
      !experiment.decision_date ||
      !experiment.expected_impact ||
      experiment.primary_metric_key.trim().length === 0
  );
  const instrumentationGaps = experiments.filter(
    (experiment) =>
      experiment.guardrail_metric_keys.length === 0 ||
      experiment.blindspotCount > 0 ||
      (experiment.status === "completed" && !experiment.readout.isReady)
  );

  if (setupGaps.length > 0) {
    findings.push(
      makeFinding({
        category: "experiment-setup",
        categoryLabel: label,
        severity: "risk",
        title: "Experiment decision hygiene is incomplete",
        detail:
          "Some experiments are missing an owner, decision date, expected impact, or canonical primary metric, which weakens the decision loop before the readout phase even starts.",
        recommendation:
          "Require owner, impact, metric, and decision date coverage on every active or completed experiment before it is considered review-ready.",
        href: "/admin/experiments",
        signals: setupGaps.slice(0, 4).map((experiment) => experiment.name),
        affectedCount: setupGaps.length,
      })
    );
  }

  if (instrumentationGaps.length > 0) {
    findings.push(
      makeFinding({
        category: "experiment-setup",
        categoryLabel: label,
        severity: instrumentationGaps.some((experiment) => experiment.status === "completed")
          ? "risk"
          : "watch",
        title: "Experiment guardrail or readout coverage is drifting",
        detail:
          "Experiment records exist without enough guardrail instrumentation, metric trust coverage, or completed readouts, so winner calls can drift away from defensible evidence.",
        recommendation:
          "Fill guardrail metrics, close blindspots, and complete formal readouts before treating experiments as concluded or decision-ready.",
        href: "/admin/experiments",
        signals: instrumentationGaps.slice(0, 4).map((experiment) => experiment.name),
        affectedCount: instrumentationGaps.length,
      })
    );
  }

  return {
    key: "experiment-setup",
    label,
    coverageLabel: `${experiments.length} experiments, ${experiments.filter((item) => item.blindspotCount > 0).length} blindspots`,
    note:
      findings.length > 0
        ? "Experiment records need tighter setup discipline and instrumentation coverage."
        : experiments.length > 0
          ? "Experiment setup and readout hygiene are consistent across the registry."
          : "No experiments are in the registry, so setup drift is currently not active.",
    findings,
    questionIds: [],
    experimentIds: [
      ...setupGaps.map((item) => item.id),
      ...instrumentationGaps.map((item) => item.id),
    ],
    uncoveredTerms: 0,
    unexpectedEventTypes: 0,
  };
}

export async function buildDriftDetectorSnapshot(
  inputDays: number,
  adminEmail: string
): Promise<DriftDetectorSnapshot> {
  const days = Math.min(Math.max(Number.isNaN(inputDays) ? 30 : inputDays, 7), 90);
  const [{ questions, options }, taxonomyInputs, eventInputs, research, experiments] =
    await Promise.all([
      fetchLiveSurvey(),
      fetchTaxonomyInputs(),
      fetchEventInputs(days),
      buildResearchIntelligenceSnapshot(days),
      buildExperimentRegistrySnapshot(adminEmail),
    ]);

  const evaluations = [
    evaluateTaxonomyDrift({
      research,
      tags: taxonomyInputs.tags,
      rules: taxonomyInputs.rules,
      repository: taxonomyInputs.repository,
    }),
    evaluateEventNamingDrift(eventInputs),
    evaluateConfigDrift({ liveQuestions: questions }),
    evaluateAnswerMappingDrift({ liveQuestions: questions, liveOptions: options }),
    evaluateExperimentSetupDrift({ experiments: experiments.experiments }),
  ];

  const findings = evaluations
    .flatMap((evaluation) => evaluation.findings)
    .sort((left, right) => {
      const severityWeight =
        left.severity === right.severity ? 0 : left.severity === "risk" ? -1 : 1;
      if (severityWeight !== 0) return severityWeight;
      if (left.affectedCount !== right.affectedCount)
        return right.affectedCount - left.affectedCount;
      return left.title.localeCompare(right.title);
    });

  const questionIds = new Set(evaluations.flatMap((evaluation) => evaluation.questionIds));
  const experimentIds = new Set(evaluations.flatMap((evaluation) => evaluation.experimentIds));
  const uncoveredTerms = evaluations.reduce(
    (total, evaluation) => total + evaluation.uncoveredTerms,
    0
  );
  const unexpectedEventTypes = evaluations.reduce(
    (total, evaluation) => total + evaluation.unexpectedEventTypes,
    0
  );

  return {
    generatedAt: new Date().toISOString(),
    days,
    summary: {
      totalFindings: findings.length,
      riskFindings: findings.filter((finding) => finding.severity === "risk").length,
      watchFindings: findings.filter((finding) => finding.severity === "watch").length,
      categoriesAtRisk: evaluations.filter(
        (evaluation) => categoryStatus(evaluation.findings) !== "stable"
      ).length,
      impactedQuestions: questionIds.size,
      impactedExperiments: experimentIds.size,
      uncoveredTerms,
      unexpectedEventTypes,
    },
    categorySummaries: evaluations.map((evaluation) => ({
      key: evaluation.key,
      label: evaluation.label,
      status: categoryStatus(evaluation.findings),
      riskScore: categoryRiskScore(evaluation.findings),
      findingCount: evaluation.findings.length,
      coverageLabel: evaluation.coverageLabel,
      note: evaluation.note,
    })),
    findings,
  };
}
