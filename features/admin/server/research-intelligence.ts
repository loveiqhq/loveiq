import { surveyQuestions } from "@/data/survey-data";
import { makeSince, tokenizeSemantic } from "@features/admin/server/next-level";
import {
  buildQuestionEffectivenessSnapshot,
  type QuestionEffectivenessSnapshot,
  type QuestionEffectivenessQuestion,
} from "@features/admin/server/question-effectiveness";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@/lib/logger";

const NEGATIVE_TERMS = [
  "pain",
  "hurt",
  "confused",
  "uncertain",
  "unsure",
  "awkward",
  "stress",
  "anxiety",
  "afraid",
  "difficult",
  "hard",
  "shame",
  "pressure",
  "frustrated",
  "stuck",
];

const THEME_LEXICON: Record<string, string[]> = {
  trust: ["trust", "safe", "unsafe", "secure", "betrayal", "loyal", "honest"],
  communication: ["talk", "communicate", "listen", "conversation", "silent", "express"],
  intimacy: ["intimacy", "close", "connected", "distance", "touch", "affection"],
  desire: ["desire", "libido", "want", "attraction", "sex", "spark"],
  conflict: ["fight", "argue", "conflict", "tension", "resent", "anger"],
  uncertainty: ["uncertain", "unsure", "confused", "unclear", "depends", "mixed"],
  healing: ["heal", "repair", "recover", "rebuild", "forgive", "growth"],
  future: ["future", "marriage", "commitment", "family", "next step", "long term"],
  timing: ["time", "busy", "schedule", "energy", "space", "delay"],
  selfworth: ["confidence", "worthy", "insecure", "self-esteem", "body", "judged"],
};

const KNOWN_TAXONOMY_TERMS = new Set(
  [...Object.keys(THEME_LEXICON), ...Object.values(THEME_LEXICON).flat()].map((term) =>
    term.toLowerCase()
  )
);

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "is",
  "it",
  "this",
  "that",
  "was",
  "are",
  "be",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "can",
  "not",
  "no",
  "so",
  "if",
  "then",
  "than",
  "very",
  "just",
  "about",
  "up",
  "out",
  "my",
  "me",
  "i",
  "you",
  "he",
  "she",
  "we",
  "they",
  "them",
  "his",
  "her",
  "its",
  "our",
  "your",
  "their",
  "what",
  "which",
  "who",
  "when",
  "where",
  "how",
  "all",
  "each",
  "every",
  "both",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "only",
  "own",
  "same",
  "also",
  "as",
  "like",
  "because",
  "really",
  "much",
  "been",
]);

type Severity = "critical" | "warning" | "positive" | "info" | "neutral";

interface PeriodComparison {
  current_submissions: number;
  previous_submissions: number;
  current_completion_rate: number | null;
  previous_completion_rate: number | null;
  current_avg_duration_min: number | null;
  previous_avg_duration_min: number | null;
  current_waitlist: number;
  previous_waitlist: number;
}

interface RpcResult {
  period_comparison: PeriodComparison | null;
  high_friction_questions: Array<{
    q_id: string;
    avg_time_sec: number;
    backtrack_count: number;
  }> | null;
  top_drop_off_questions: Array<{
    q_id: string;
    abandon_count: number;
  }> | null;
  fastest_growing_archetype: {
    archetype: string;
    current: number;
    previous: number;
  } | null;
}

interface AnswerRow {
  id: number;
  answer_text: string;
  survey_question: { id: number; frontend_qid: string; question_text: string } | null;
  survey_submission: {
    created_date_time: string;
    scoring_result: { primary_archetype: string | null } | null;
  } | null;
}

interface ArchetypeRow {
  primary_archetype: string | null;
}

interface DiagnosticAnswerRow {
  survey_submission_id: number;
  answer_text: string | null;
  normalized_value: number | null;
  survey_question: { frontend_qid: string; question_text: string } | null;
  answer_option: { option_text: string | null } | null;
  survey_submission_answer_options: Array<{
    answer_option: { option_text: string | null } | null;
  }> | null;
}

interface NormalizedSubmissionAnswer {
  values: string[];
  numeric: number | null;
}

interface ContradictionSignal {
  key: string;
  title: string;
  detail: string;
  severity: Severity;
  affectedSubmissions: number;
  coverage: number;
  evidence: string[];
  recommendation: string;
  href: string;
}

interface WordingDiagnostic {
  questionId: string;
  questionLabel: string;
  answerType: string;
  issueCount: number;
  staticComplexity: number;
  behaviorRisk: number;
  effectivenessScore: number | null;
  watchStatus: "regressed" | "stable" | "improved" | "unknown";
  issues: string[];
  recommendation: string;
  href: string;
}

interface AnswerQualityQuestion {
  questionId: string;
  questionLabel: string;
  responses: number;
  qualityScore: number;
  lowInfoRate: number;
  fillerRate: number;
  duplicateRate: number;
  avgWords: number;
  sampleWeakResponses: string[];
  recommendation: string;
  href: string;
}

interface AnswerQualitySummary {
  lowInfoResponses: number;
  fillerResponses: number;
  duplicatedResponses: number;
  strongResponses: number;
}

interface ResearchSynthesisPackage {
  id: string;
  title: string;
  theme: string;
  priority: "high" | "medium" | "low";
  summary: string;
  signalCount: number;
  questionIds: string[];
  questionLabels: string[];
  leadingArchetype: string | null;
  relatedPainQuestions: string[];
  relatedWordingQuestions: string[];
  relatedAnswerQualityQuestions: string[];
  relatedUnknownUnknowns: string[];
  nextMove: string;
  evidence: string[];
  href: string;
}

interface UnknownUnknownSignal {
  term: string;
  currentCount: number;
  previousCount: number;
  delta: number;
  questionIds: string[];
  questionLabels: string[];
  leadingArchetype: string | null;
  sampleExcerpts: string[];
  whyItMatters: string;
  href: string;
}

export interface ResearchIntelligenceSnapshot {
  generatedAt: string;
  days: number;
  summary: {
    signals: number;
    themes: number;
    painQuestions: number;
    emergingTerms: number;
    archetypeShifts: number;
    responses: number;
    contradictions: number;
    wordingAlerts: number;
    lowQualityQuestions: number;
    synthesisPackages: number;
    unknownUnknowns: number;
  };
  signals: Array<{
    title: string;
    detail: string;
    severity: Severity;
    href: string;
  }>;
  themes: Array<{
    theme: string;
    responses: number;
    questions: number;
    questionIds: string[];
    leadingArchetype: string | null;
    sampleExcerpts: string[];
  }>;
  painQuestions: Array<{
    questionId: string;
    questionLabel: string;
    responseCount: number;
    painMentions: number;
    severityScore: number;
    sampleExcerpt: string | null;
  }>;
  emergingTerms: Array<{
    term: string;
    currentCount: number;
    previousCount: number;
    delta: number;
  }>;
  archetypeDrift: Array<{
    archetype: string;
    current: number;
    previous: number;
    delta: number;
  }>;
  contradictions: ContradictionSignal[];
  wordingDiagnostics: WordingDiagnostic[];
  answerQuality: {
    summary: AnswerQualitySummary;
    questions: AnswerQualityQuestion[];
  };
  synthesisPackages: ResearchSynthesisPackage[];
  unknownUnknowns: UnknownUnknownSignal[];
}

const questionMetaMap = new Map(
  surveyQuestions
    .filter((question) => !question.qId.startsWith("00"))
    .map((question) => [question.qId, question])
);

const questionTextMap = new Map(
  [...questionMetaMap.values()].map((question) => [question.qId, question.question])
);

const LOW_INFO_PATTERNS = new Set([
  "idk",
  "i dont know",
  "dont know",
  "do not know",
  "not sure",
  "unsure",
  "n a",
  "na",
  "none",
  "nothing",
  "no idea",
  "skip",
  "prefer not to say",
]);

const ABSTRACT_WORDING_HINTS = [
  "overall",
  "usually",
  "often",
  "important",
  "meaningful",
  "best describes",
  "right now",
  "relationship with",
  "what do you usually do first",
];

function formatQuestionLabel(qId: string): string {
  const question = questionTextMap.get(qId);
  return question ? `${qId} · ${question}` : qId;
}

function excerpt(text: string, max = 140): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1)}…`;
}

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

async function fetchAnswers(since: string | null, until?: string | null): Promise<AnswerRow[]> {
  const dateFilters = [
    since ? `&survey_submission.created_date_time=gte.${since}` : "",
    until ? `&survey_submission.created_date_time=lt.${until}` : "",
  ].join("");

  const query =
    "/rest/v1/survey_submission_answer?select=id,answer_text,survey_question(id,frontend_qid,question_text),survey_submission!inner(created_date_time,scoring_result(primary_archetype))" +
    "&answer_text=not.is.null&answer_text=neq." +
    dateFilters +
    "&order=id.desc";

  const res = await supabaseFetch(query, { headers: { Range: "0-4999" } });
  if (!res.ok) return [];
  return (await res.json()) as AnswerRow[];
}

async function fetchArchetypes(
  since: string | null,
  until?: string | null
): Promise<ArchetypeRow[]> {
  const dateFilters = [
    since ? `&survey_submission.created_date_time=gte.${since}` : "",
    until ? `&survey_submission.created_date_time=lt.${until}` : "",
  ].join("");
  const query =
    "/rest/v1/scoring_result?select=primary_archetype,survey_submission!inner(created_date_time)" +
    dateFilters;
  const res = await supabaseFetch(query, { headers: { Range: "0-4999" } });
  if (!res.ok) return [];
  return (await res.json()) as ArchetypeRow[];
}

async function fetchContradictionAnswers(since: string): Promise<DiagnosticAnswerRow[]> {
  const qIds = ["01002", "01003", "01006", "02001", "02002", "16013", "16014"];
  const query =
    "/rest/v1/survey_submission_answer?select=" +
    "survey_submission_id,answer_text,normalized_value," +
    "survey_question!inner(frontend_qid,question_text)," +
    "answer_option!fk_ssa_answer_option(option_text)," +
    "survey_submission_answer_options(answer_option!fk_ssao_answer_option(option_text))," +
    "survey_submission!inner(created_date_time)" +
    `&survey_submission.created_date_time=gte.${since}` +
    `&survey_question.frontend_qid=in.(${qIds.join(",")})` +
    "&order=survey_submission_id.desc";

  const res = await supabaseFetch(query, { headers: { Range: "0-9999" } });
  if (!res.ok) return [];
  return (await res.json()) as DiagnosticAnswerRow[];
}

function normalizeDiagnosticValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractAnswerValues(row: DiagnosticAnswerRow): string[] {
  const qId = row.survey_question?.frontend_qid;
  const answerType = qId ? questionMetaMap.get(qId)?.answerType : null;

  if (answerType === "multiple") {
    const values = (row.survey_submission_answer_options ?? [])
      .map((entry) => entry.answer_option?.option_text?.trim() ?? "")
      .filter(Boolean);
    if (row.answer_text?.trim()) values.push(row.answer_text.trim());
    return [...new Set(values)];
  }

  if (row.answer_option?.option_text?.trim()) {
    return [row.answer_option.option_text.trim()];
  }

  if (row.answer_text?.trim()) {
    return [row.answer_text.trim()];
  }

  if (row.normalized_value != null) {
    return [String(row.normalized_value)];
  }

  return [];
}

function extractNumericValue(row: DiagnosticAnswerRow, values: string[]): number | null {
  if (row.normalized_value != null && Number.isFinite(row.normalized_value)) {
    return Number(row.normalized_value);
  }

  for (const value of values) {
    const token = value
      .replace(/[^\d.-]/g, " ")
      .split(/\s+/)
      .find((part) => part.length > 0 && Number.isFinite(Number(part)));
    if (token) return Number.parseFloat(token);
  }

  return null;
}

function getSubmissionAnswers(rows: DiagnosticAnswerRow[]) {
  const submissions = new Map<number, Map<string, NormalizedSubmissionAnswer>>();

  for (const row of rows) {
    const qId = row.survey_question?.frontend_qid;
    if (!qId) continue;

    const answers = submissions.get(row.survey_submission_id) ?? new Map();
    const current = answers.get(qId) ?? { values: [], numeric: null };
    const values = extractAnswerValues(row);
    const valueSet = new Set(current.values);

    for (const value of values) {
      valueSet.add(value);
    }

    current.values = [...valueSet];
    current.numeric ??= extractNumericValue(row, values);

    answers.set(qId, current);
    submissions.set(row.survey_submission_id, answers);
  }

  return submissions;
}

function hasValue(entry: NormalizedSubmissionAnswer | undefined, pattern: string): boolean {
  if (!entry) return false;
  const normalizedPattern = normalizeDiagnosticValue(pattern);
  return entry.values.some((value) => normalizeDiagnosticValue(value).includes(normalizedPattern));
}

function contradictionEvidence(
  labelA: string,
  entryA: NormalizedSubmissionAnswer,
  labelB: string,
  entryB: NormalizedSubmissionAnswer
): string {
  return `${labelA}: ${entryA.values.join(" / ")} | ${labelB}: ${entryB.values.join(" / ")}`;
}

function buildContradictionSignals(rows: DiagnosticAnswerRow[]): ContradictionSignal[] {
  const submissions = getSubmissionAnswers(rows);
  const signals: ContradictionSignal[] = [];

  const pushSignal = (input: {
    key: string;
    title: string;
    detail: string;
    severity: Severity;
    href: string;
    recommendation: string;
    requiredQids: string[];
    match: (answers: Map<string, NormalizedSubmissionAnswer>) => string | null;
  }) => {
    let eligible = 0;
    const evidence: string[] = [];

    for (const answers of submissions.values()) {
      if (!input.requiredQids.every((qId) => answers.has(qId))) continue;
      eligible += 1;
      const hit = input.match(answers);
      if (hit) evidence.push(hit);
    }

    if (evidence.length === 0 || eligible === 0) return;

    signals.push({
      key: input.key,
      title: input.title,
      detail: input.detail,
      severity: input.severity,
      affectedSubmissions: evidence.length,
      coverage: Math.round((evidence.length / eligible) * 100),
      evidence: [...new Set(evidence)].slice(0, 3),
      recommendation: input.recommendation,
      href: input.href,
    });
  };

  pushSignal({
    key: "desire-style-mismatch",
    title: "Desire-style self-classification conflicts with cue-driven behavior",
    detail:
      "Respondents identify one desire style while strongly endorsing the opposite activation pattern.",
    severity: "critical",
    href: "/admin/research",
    recommendation:
      "Review desire-style wording and supporting guidance to reduce category confusion between self-starting and responsive desire.",
    requiredQids: ["02001", "02002"],
    match: (answers) => {
      const style = answers.get("02001");
      const cueDriven = answers.get("02002");
      if (!style || !cueDriven || cueDriven.numeric == null) return null;
      if (hasValue(style, "spontaneous") && cueDriven.numeric >= 6) {
        return contradictionEvidence("02001", style, "02002", cueDriven);
      }
      if (hasValue(style, "responsive") && cueDriven.numeric <= 2) {
        return contradictionEvidence("02001", style, "02002", cueDriven);
      }
      return null;
    },
  });

  pushSignal({
    key: "satisfaction-description-mismatch",
    title: "Overall satisfaction clashes with current-state description",
    detail:
      "High or very low satisfaction scores are being paired with an opposite self-description of current sexuality.",
    severity: "critical",
    href: "/admin/research",
    recommendation:
      "Tighten the framing between the satisfaction scale and the current-state label question so they measure distinct concepts.",
    requiredQids: ["01002", "01003"],
    match: (answers) => {
      const satisfaction = answers.get("01002");
      const state = answers.get("01003");
      if (!satisfaction || !state || satisfaction.numeric == null) return null;
      if (satisfaction.numeric >= 6 && hasValue(state, "frustrated or unfulfilled")) {
        return contradictionEvidence("01002", satisfaction, "01003", state);
      }
      if (satisfaction.numeric <= 2 && hasValue(state, "satisfied actively engaged")) {
        return contradictionEvidence("01002", satisfaction, "01003", state);
      }
      return null;
    },
  });

  pushSignal({
    key: "priority-focus-mismatch",
    title: "Low stated focus conflicts with high stated importance",
    detail:
      "Some respondents say sexuality is not a current focus while rating understanding it as highly important.",
    severity: "warning",
    href: "/admin/research",
    recommendation:
      "Clarify whether the question is asking about current attention, personal priority, or available bandwidth.",
    requiredQids: ["01003", "16013"],
    match: (answers) => {
      const state = answers.get("01003");
      const importance = answers.get("16013");
      if (!state || !importance || importance.numeric == null) return null;
      if (hasValue(state, "currently not a focus") && importance.numeric >= 6) {
        return contradictionEvidence("01003", state, "16013", importance);
      }
      return null;
    },
  });

  pushSignal({
    key: "no-blockers-major-distress",
    title: "No-blocker claim conflicts with visible distress or pain",
    detail:
      "Some respondents report that nothing major is blocking progress while also reporting severe dissatisfaction, pain, or frustration.",
    severity: "warning",
    href: "/admin/research",
    recommendation:
      "Review blocker wording and consider splitting situational blockers from internal or body-based constraints.",
    requiredQids: ["16014", "01002", "01003", "01006"],
    match: (answers) => {
      const blockers = answers.get("16014");
      const satisfaction = answers.get("01002");
      const state = answers.get("01003");
      const pain = answers.get("01006");
      if (!blockers || !satisfaction || !state || !pain) return null;
      if (!hasValue(blockers, "nothing major")) return null;

      const isDistressed =
        (satisfaction.numeric != null && satisfaction.numeric <= 2) ||
        hasValue(state, "frustrated or unfulfilled") ||
        hasValue(state, "complicated or inconsistent") ||
        (pain.numeric != null && pain.numeric >= 5);

      return isDistressed ? contradictionEvidence("16014", blockers, "01003", state) : null;
    },
  });

  return signals.sort(
    (a, b) =>
      b.affectedSubmissions - a.affectedSubmissions ||
      b.coverage - a.coverage ||
      a.title.localeCompare(b.title)
  );
}

function buildWordingRecommendation(issues: string[]): string {
  if (issues.some((issue) => issue.includes("High option load"))) {
    return "Reduce option load or group choices into clearer clusters before asking for a selection.";
  }
  if (
    issues.some((issue) => issue.includes("Long prompt")) ||
    issues.some((issue) => issue.includes("Multi-concept"))
  ) {
    return "Shorten the prompt and split competing ideas into separate questions or supporting labels.";
  }
  if (issues.some((issue) => issue.includes("Abstract"))) {
    return "Add concrete examples or tighter anchors so respondents know what the scale is actually measuring.";
  }
  if (issues.some((issue) => issue.includes("skip rate"))) {
    return "Reframe the question to lower pressure or clarify why the answer matters.";
  }
  if (issues.some((issue) => issue.includes("backtrack rate"))) {
    return "Clarify wording or answer labels because respondents are revisiting this item before moving on.";
  }
  return "Simplify wording and reduce the amount of interpretation required from the respondent.";
}

function buildWordingDiagnostics(questions: QuestionEffectivenessQuestion[]): WordingDiagnostic[] {
  const diagnostics: WordingDiagnostic[] = [];

  for (const question of questions) {
    const meta = questionMetaMap.get(question.qId);
    if (!meta) continue;

    const issues: string[] = [];
    let staticComplexity = 0;
    let behaviorRisk = 0;
    const questionWordCount = meta.question.split(/\s+/).filter(Boolean).length;

    if (questionWordCount >= 16) {
      issues.push(`Long prompt (${questionWordCount} words)`);
      staticComplexity += 22;
    }
    if (questionWordCount >= 12 && /\b(and|or)\b/i.test(meta.question)) {
      issues.push("Multi-concept prompt");
      staticComplexity += 18;
    }
    if (
      (meta.answerType === "single" || meta.answerType === "multiple") &&
      meta.options.length >= 7
    ) {
      issues.push(`High option load (${meta.options.length} options)`);
      staticComplexity += 18;
    }
    if (meta.guide.length >= 520 || meta.supportAndGuidance.length >= 520) {
      issues.push("Needs heavy supporting copy");
      staticComplexity += 14;
    }
    if (ABSTRACT_WORDING_HINTS.some((hint) => meta.question.toLowerCase().includes(hint))) {
      issues.push("Abstract or self-interpreted wording");
      staticComplexity += 12;
    }
    if (meta.answerType === "open" && !meta.placeholder && !meta.formatGuidance) {
      issues.push("Open response without format guidance");
      staticComplexity += 10;
    }

    if (question.watchStatus === "regressed") {
      issues.push("Behavioral regression detected");
      behaviorRisk += 22;
    }
    if (question.skipRate >= 12) {
      issues.push(`High skip rate (${question.skipRate}%)`);
      behaviorRisk += 20;
    }
    if (question.backtrackRate >= 7) {
      issues.push(`High backtrack rate (${question.backtrackRate}%)`);
      behaviorRisk += 16;
    }
    if (question.avgActiveTimeS >= 18) {
      issues.push(`Slow answer time (${question.avgActiveTimeS}s)`);
      behaviorRisk += 16;
    }
    if (question.effectivenessScore < 55) {
      issues.push(`Low effectiveness score (${question.effectivenessScore})`);
      behaviorRisk += 18;
    }

    if (issues.length === 0) continue;

    diagnostics.push({
      questionId: question.qId,
      questionLabel: formatQuestionLabel(question.qId),
      answerType: String(meta.answerType),
      issueCount: issues.length,
      staticComplexity,
      behaviorRisk,
      effectivenessScore: question.effectivenessScore,
      watchStatus: question.watchStatus,
      issues,
      recommendation: buildWordingRecommendation(issues),
      href: "/admin/question-effectiveness",
    });
  }

  return diagnostics
    .sort(
      (a, b) =>
        b.behaviorRisk + b.staticComplexity - (a.behaviorRisk + a.staticComplexity) ||
        b.issueCount - a.issueCount
    )
    .slice(0, 12);
}

function buildAnswerQualityRecommendation(input: {
  lowInfoRate: number;
  fillerRate: number;
  duplicateRate: number;
}): string {
  if (input.fillerRate >= 18) {
    return "Improve prompt specificity and add clearer examples so respondents do not default to placeholder answers.";
  }
  if (input.lowInfoRate >= 35) {
    return "Tighten the prompt and ask for a more concrete example or situation to raise response depth.";
  }
  if (input.duplicateRate >= 20) {
    return "Review whether the question is eliciting repetitive stock answers rather than differentiated signal.";
  }
  return "Question quality is mixed; monitor for weak, vague, or repetitive open-text responses.";
}

function buildAnswerQuality(answers: AnswerRow[]): {
  summary: AnswerQualitySummary;
  questions: AnswerQualityQuestion[];
} {
  const byQuestion = new Map<
    string,
    {
      responses: number;
      totalWords: number;
      lowInfo: number;
      filler: number;
      strong: number;
      sampleWeakResponses: string[];
      normalizedCounts: Map<string, number>;
    }
  >();

  let lowInfoResponses = 0;
  let fillerResponses = 0;
  let duplicatedResponses = 0;
  let strongResponses = 0;

  for (const answer of answers) {
    const qId = answer.survey_question?.frontend_qid;
    const meta = qId ? questionMetaMap.get(qId) : null;
    if (!qId || meta?.answerType !== "open") continue;

    const normalizedText = normalizeDiagnosticValue(answer.answer_text ?? "");
    const words = normalizeWords(answer.answer_text ?? "");
    const uniqueWords = new Set(words).size;
    const isFiller = LOW_INFO_PATTERNS.has(normalizedText);
    const isRepeating = /(.)\1{5,}/.test(normalizedText) || (uniqueWords <= 2 && words.length >= 4);
    const isLowInfo =
      isFiller ||
      isRepeating ||
      normalizedText.length < 12 ||
      words.length <= 2 ||
      (uniqueWords <= 2 && words.length <= 4);
    const isStrong = !isLowInfo && words.length >= 8 && uniqueWords >= 6;

    const current = byQuestion.get(qId) ?? {
      responses: 0,
      totalWords: 0,
      lowInfo: 0,
      filler: 0,
      strong: 0,
      sampleWeakResponses: [],
      normalizedCounts: new Map<string, number>(),
    };

    current.responses += 1;
    current.totalWords += words.length;
    current.normalizedCounts.set(
      normalizedText,
      (current.normalizedCounts.get(normalizedText) ?? 0) + 1
    );

    if (isLowInfo) {
      current.lowInfo += 1;
      lowInfoResponses += 1;
      if (current.sampleWeakResponses.length < 3) {
        current.sampleWeakResponses.push(excerpt(answer.answer_text ?? ""));
      }
    }
    if (isFiller) {
      current.filler += 1;
      fillerResponses += 1;
    }
    if (isStrong) {
      current.strong += 1;
      strongResponses += 1;
    }

    byQuestion.set(qId, current);
  }

  const questions = [...byQuestion.entries()]
    .map(([questionId, value]) => {
      const duplicateCount = [...value.normalizedCounts.values()].reduce(
        (sum, count) => sum + Math.max(0, count - 1),
        0
      );
      duplicatedResponses += duplicateCount;

      const lowInfoRate =
        value.responses > 0 ? Math.round((value.lowInfo / value.responses) * 100) : 0;
      const fillerRate =
        value.responses > 0 ? Math.round((value.filler / value.responses) * 100) : 0;
      const duplicateRate =
        value.responses > 0 ? Math.round((duplicateCount / value.responses) * 100) : 0;
      const strongRate =
        value.responses > 0 ? Math.round((value.strong / value.responses) * 100) : 0;
      const qualityScore = Math.max(
        0,
        Math.min(
          100,
          Math.round(
            100 - lowInfoRate * 0.6 - fillerRate * 0.8 - duplicateRate * 0.45 + strongRate * 0.15
          )
        )
      );

      return {
        questionId,
        questionLabel: formatQuestionLabel(questionId),
        responses: value.responses,
        qualityScore,
        lowInfoRate,
        fillerRate,
        duplicateRate,
        avgWords: value.responses > 0 ? Math.round(value.totalWords / value.responses) : 0,
        sampleWeakResponses: value.sampleWeakResponses,
        recommendation: buildAnswerQualityRecommendation({
          lowInfoRate,
          fillerRate,
          duplicateRate,
        }),
        href: "/admin/text-analysis",
      } satisfies AnswerQualityQuestion;
    })
    .sort(
      (a, b) =>
        a.qualityScore - b.qualityScore ||
        b.lowInfoRate - a.lowInfoRate ||
        b.responses - a.responses
    )
    .slice(0, 12);

  return {
    summary: {
      lowInfoResponses,
      fillerResponses,
      duplicatedResponses,
      strongResponses,
    },
    questions,
  };
}

function synthesisPriority(input: {
  responses: number;
  relatedPainCount: number;
  relatedWordingCount: number;
  relatedAnswerQualityCount: number;
  relatedUnknownCount: number;
}): "high" | "medium" | "low" {
  const score =
    input.responses +
    input.relatedPainCount * 6 +
    input.relatedWordingCount * 5 +
    input.relatedAnswerQualityCount * 4 +
    input.relatedUnknownCount * 3;

  if (score >= 24) return "high";
  if (score >= 12) return "medium";
  return "low";
}

function buildSynthesisNextMove(input: {
  relatedPainCount: number;
  relatedWordingCount: number;
  relatedAnswerQualityCount: number;
  relatedUnknownCount: number;
  leadingArchetype: string | null;
}): string {
  if (input.relatedPainCount > 0 && input.relatedWordingCount > 0) {
    return "Pair a wording review with a pain-focused follow-up so the next iteration reduces confusion and friction together.";
  }
  if (input.relatedAnswerQualityCount > 0) {
    return "Tighten the prompt and response framing before scaling more analysis on top of weak answer quality.";
  }
  if (input.relatedUnknownCount > 0) {
    return "Promote the novel language into the repository and validate whether it deserves a new taxonomy label or route-level action.";
  }
  if (input.leadingArchetype) {
    return `Review this package against ${input.leadingArchetype} persona movement and decide whether it belongs in the next operating review.`;
  }
  return "Bundle this package into a tracked research entry with a clear owner and review date.";
}

function buildUnknownUnknownWhyItMatters(input: {
  term: string;
  delta: number;
  questionCount: number;
  leadingArchetype: string | null;
}): string {
  if (input.questionCount >= 3 && input.leadingArchetype) {
    return `${input.term} is spreading across multiple questions and is strongest in ${input.leadingArchetype}, which suggests a new motif that the current taxonomy does not yet name.`;
  }
  if (input.questionCount >= 3) {
    return `${input.term} is spreading across multiple questions, which makes it more than a one-off wording quirk or isolated answer.`;
  }
  if (input.delta >= 4) {
    return `${input.term} is accelerating faster than the recent baseline, which makes it a good candidate for structured follow-up before it gets normalized away.`;
  }
  return `${input.term} is novel relative to the current taxonomy and needs human review to decide whether it is noise or a new research signal.`;
}

// Phase 1: fetch the 7 input streams + the optional precomputed effectiveness
// snapshot. Pure data layer; no business logic.
async function fetchResearchData(
  days: number,
  since: string | null,
  previousSince: string | null,
  precomputedEffectiveness?: QuestionEffectivenessSnapshot
) {
  const [
    insightsRes,
    currentAnswers,
    previousAnswers,
    currentArchetypes,
    previousArchetypes,
    contradictionAnswers,
    effectiveness,
  ] = await Promise.all([
    supabaseFetch("/rest/v1/rpc/get_automated_insights", {
      method: "POST",
      body: JSON.stringify({ p_days: days }),
    }),
    fetchAnswers(since),
    fetchAnswers(previousSince, since),
    fetchArchetypes(since),
    fetchArchetypes(previousSince, since),
    fetchContradictionAnswers(since ?? new Date().toISOString()),
    precomputedEffectiveness
      ? Promise.resolve(precomputedEffectiveness)
      : buildQuestionEffectivenessSnapshot(days),
  ]);

  const rpc = insightsRes.ok ? ((await insightsRes.json()) as RpcResult) : null;

  return {
    rpc,
    currentAnswers,
    previousAnswers,
    currentArchetypes,
    previousArchetypes,
    contradictionAnswers,
    effectiveness,
  };
}

// Phase 2: derive top-level research signals from the get_automated_insights
// RPC payload. Pure transform — no I/O.
function buildSignalsFromRpc(rpc: RpcResult | null): ResearchIntelligenceSnapshot["signals"] {
  const signals: ResearchIntelligenceSnapshot["signals"] = [];
  if (rpc?.period_comparison) {
    const period = rpc.period_comparison;
    if (
      period.current_completion_rate != null &&
      period.previous_completion_rate != null &&
      period.current_completion_rate < period.previous_completion_rate
    ) {
      signals.push({
        title: "Completion quality regressed",
        detail: `${period.current_completion_rate}% now vs ${period.previous_completion_rate}% previously.`,
        severity: "critical",
        href: "/admin/funnels",
      });
    }
    if (
      period.current_avg_duration_min != null &&
      period.previous_avg_duration_min != null &&
      period.current_avg_duration_min > period.previous_avg_duration_min
    ) {
      signals.push({
        title: "Survey effort increased",
        detail: `${period.current_avg_duration_min}m average now vs ${period.previous_avg_duration_min}m previously.`,
        severity: "warning",
        href: "/admin/question-effectiveness",
      });
    }
  }
  if (rpc?.high_friction_questions?.[0]) {
    const question = rpc.high_friction_questions[0];
    signals.push({
      title: "High-friction text behavior detected",
      detail: `${formatQuestionLabel(question.q_id)} is taking ${question.avg_time_sec}s on average.`,
      severity: "warning",
      href: "/admin/question-effectiveness",
    });
  }
  if (rpc?.top_drop_off_questions?.[0]) {
    const question = rpc.top_drop_off_questions[0];
    signals.push({
      title: "Largest drop-off point is still open",
      detail: `${formatQuestionLabel(question.q_id)} caused ${question.abandon_count} exits.`,
      severity: "critical",
      href: "/admin/abandonment",
    });
  }
  if (rpc?.fastest_growing_archetype) {
    signals.push({
      title: `${rpc.fastest_growing_archetype.archetype} is gaining share`,
      detail: `${rpc.fastest_growing_archetype.current} current vs ${rpc.fastest_growing_archetype.previous} previous results.`,
      severity: "info",
      href: "/admin/archetypes",
    });
  }
  return signals;
}

export async function buildResearchIntelligenceSnapshot(
  inputDays: number,
  precomputedEffectiveness?: QuestionEffectivenessSnapshot
): Promise<ResearchIntelligenceSnapshot> {
  const days = Math.min(Math.max(Number.isNaN(inputDays) ? 30 : inputDays, 7), 90);
  const since = makeSince(days);
  const previousSince = makeSince(days * 2);

  try {
    const {
      rpc,
      currentAnswers,
      previousAnswers,
      currentArchetypes,
      previousArchetypes,
      contradictionAnswers,
      effectiveness,
    } = await fetchResearchData(days, since, previousSince, precomputedEffectiveness);

    const signals = buildSignalsFromRpc(rpc);

    const themeMap = new Map<
      string,
      {
        responses: number;
        questionIds: Set<string>;
        archetypes: Map<string, number>;
        samples: string[];
      }
    >();

    const painByQuestion = new Map<
      string,
      {
        questionLabel: string;
        responseCount: number;
        painMentions: number;
        sampleExcerpt: string | null;
      }
    >();
    const novelTermMap = new Map<
      string,
      {
        currentCount: number;
        questionIds: Set<string>;
        archetypes: Map<string, number>;
        samples: string[];
      }
    >();

    const currentWordCounts = new Map<string, number>();
    const previousWordCounts = new Map<string, number>();

    for (const answer of currentAnswers) {
      const text = answer.answer_text ?? "";
      const words = normalizeWords(text);
      const tokens = new Set(tokenizeSemantic(text));
      const archetype = answer.survey_submission?.scoring_result?.primary_archetype ?? "Unknown";
      const frontendQid = answer.survey_question?.frontend_qid ?? "unknown";

      for (const word of words) {
        currentWordCounts.set(word, (currentWordCounts.get(word) ?? 0) + 1);
      }

      const uniqueNovelWords = new Set(
        words.filter((word) => word.length >= 4 && !KNOWN_TAXONOMY_TERMS.has(word))
      );
      for (const word of uniqueNovelWords) {
        const current = novelTermMap.get(word) ?? {
          currentCount: 0,
          questionIds: new Set<string>(),
          archetypes: new Map<string, number>(),
          samples: [],
        };
        current.currentCount += 1;
        current.questionIds.add(frontendQid);
        current.archetypes.set(archetype, (current.archetypes.get(archetype) ?? 0) + 1);
        if (current.samples.length < 3) current.samples.push(excerpt(text));
        novelTermMap.set(word, current);
      }

      for (const [theme, hints] of Object.entries(THEME_LEXICON)) {
        if (!hints.some((hint) => tokens.has(hint) || text.toLowerCase().includes(hint))) continue;
        const current = themeMap.get(theme) ?? {
          responses: 0,
          questionIds: new Set<string>(),
          archetypes: new Map<string, number>(),
          samples: [],
        };
        current.responses += 1;
        current.questionIds.add(frontendQid);
        current.archetypes.set(archetype, (current.archetypes.get(archetype) ?? 0) + 1);
        if (current.samples.length < 3) current.samples.push(excerpt(text));
        themeMap.set(theme, current);
      }

      const negativeHits = NEGATIVE_TERMS.filter(
        (term) => tokens.has(term) || text.toLowerCase().includes(term)
      ).length;
      const painCurrent = painByQuestion.get(frontendQid) ?? {
        questionLabel: formatQuestionLabel(frontendQid),
        responseCount: 0,
        painMentions: 0,
        sampleExcerpt: null,
      };
      painCurrent.responseCount += 1;
      painCurrent.painMentions += negativeHits > 0 ? 1 : 0;
      if (!painCurrent.sampleExcerpt && negativeHits > 0) {
        painCurrent.sampleExcerpt = excerpt(text);
      }
      painByQuestion.set(frontendQid, painCurrent);
    }

    for (const answer of previousAnswers) {
      for (const word of normalizeWords(answer.answer_text ?? "")) {
        previousWordCounts.set(word, (previousWordCounts.get(word) ?? 0) + 1);
      }
    }

    const themes = [...themeMap.entries()]
      .map(([theme, value]) => ({
        theme,
        responses: value.responses,
        questions: value.questionIds.size,
        questionIds: [...value.questionIds].sort(),
        leadingArchetype:
          [...value.archetypes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
        sampleExcerpts: value.samples,
      }))
      .sort((a, b) => b.responses - a.responses)
      .slice(0, 8);

    const painQuestions = [...painByQuestion.entries()]
      .map(([questionId, value]) => ({
        questionId,
        questionLabel: value.questionLabel,
        responseCount: value.responseCount,
        painMentions: value.painMentions,
        severityScore: Math.round(
          value.painMentions * 4 + value.responseCount * 0.25 + (value.sampleExcerpt ? 5 : 0)
        ),
        sampleExcerpt: value.sampleExcerpt,
      }))
      .sort((a, b) => b.severityScore - a.severityScore || b.responseCount - a.responseCount)
      .slice(0, 10);

    const emergingTerms = [...currentWordCounts.entries()]
      .map(([term, currentCount]) => {
        const previousCount = previousWordCounts.get(term) ?? 0;
        return {
          term,
          currentCount,
          previousCount,
          delta: currentCount - previousCount,
        };
      })
      .filter((term) => term.currentCount >= 4 && term.delta > 0)
      .sort((a, b) => b.delta - a.delta || b.currentCount - a.currentCount)
      .slice(0, 16);

    const unknownUnknowns = [...novelTermMap.entries()]
      .map(([term, value]) => {
        const previousCount = previousWordCounts.get(term) ?? 0;
        const delta = value.currentCount - previousCount;
        const leadingArchetype =
          [...value.archetypes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        const questionIds = [...value.questionIds].sort();
        return {
          term,
          currentCount: value.currentCount,
          previousCount,
          delta,
          questionIds,
          questionLabels: questionIds
            .map((questionId) => formatQuestionLabel(questionId))
            .slice(0, 4),
          leadingArchetype,
          sampleExcerpts: value.samples,
          whyItMatters: buildUnknownUnknownWhyItMatters({
            term,
            delta,
            questionCount: questionIds.length,
            leadingArchetype,
          }),
          href: "/admin/research",
        } satisfies UnknownUnknownSignal;
      })
      .filter((item) => item.currentCount >= 3 && item.questionIds.length >= 2 && item.delta > 0)
      .sort(
        (a, b) =>
          b.delta - a.delta ||
          b.questionIds.length - a.questionIds.length ||
          b.currentCount - a.currentCount
      )
      .slice(0, 10);

    const currentArchetypeCounts = currentArchetypes.reduce<Map<string, number>>((acc, row) => {
      const key = row.primary_archetype ?? "Unknown";
      acc.set(key, (acc.get(key) ?? 0) + 1);
      return acc;
    }, new Map());
    const previousArchetypeCounts = previousArchetypes.reduce<Map<string, number>>((acc, row) => {
      const key = row.primary_archetype ?? "Unknown";
      acc.set(key, (acc.get(key) ?? 0) + 1);
      return acc;
    }, new Map());

    const archetypeDrift = [
      ...new Set([...currentArchetypeCounts.keys(), ...previousArchetypeCounts.keys()]),
    ]
      .map((archetype) => ({
        archetype,
        current: currentArchetypeCounts.get(archetype) ?? 0,
        previous: previousArchetypeCounts.get(archetype) ?? 0,
        delta:
          (currentArchetypeCounts.get(archetype) ?? 0) -
          (previousArchetypeCounts.get(archetype) ?? 0),
      }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 8);

    const contradictions = buildContradictionSignals(contradictionAnswers).slice(0, 8);
    const wordingDiagnostics = buildWordingDiagnostics(effectiveness.questions);
    const answerQuality = buildAnswerQuality(currentAnswers);
    const lowQualityQuestions = answerQuality.questions.filter(
      (question) => question.qualityScore < 65 || question.lowInfoRate >= 30
    ).length;
    const synthesisPackages = themes
      .map((theme) => {
        const relatedPain = painQuestions.filter((question) =>
          theme.questionIds.includes(question.questionId)
        );
        const relatedWording = wordingDiagnostics.filter((question) =>
          theme.questionIds.includes(question.questionId)
        );
        const relatedAnswerQuality = answerQuality.questions.filter((question) =>
          theme.questionIds.includes(question.questionId)
        );
        const relatedUnknownUnknowns = unknownUnknowns.filter((item) =>
          item.questionIds.some((questionId) => theme.questionIds.includes(questionId))
        );
        const signalCount =
          1 +
          relatedPain.length +
          relatedWording.length +
          relatedAnswerQuality.length +
          relatedUnknownUnknowns.length;
        const priority = synthesisPriority({
          responses: theme.responses,
          relatedPainCount: relatedPain.length,
          relatedWordingCount: relatedWording.length,
          relatedAnswerQualityCount: relatedAnswerQuality.length,
          relatedUnknownCount: relatedUnknownUnknowns.length,
        });
        const evidence = [
          `${theme.responses} responses across ${theme.questions} questions`,
          ...relatedPain.slice(0, 2).map((item) => `Pain hotspot: ${item.questionLabel}`),
          ...relatedWording.slice(0, 2).map((item) => `Wording alert: ${item.questionLabel}`),
          ...relatedAnswerQuality
            .slice(0, 2)
            .map((item) => `Answer quality risk: ${item.questionLabel}`),
          ...theme.sampleExcerpts.slice(0, 2),
        ].slice(0, 6);

        return {
          id: `synthesis-${theme.theme}`,
          title: `${theme.theme[0]?.toUpperCase() ?? ""}${theme.theme.slice(1)} synthesis package`,
          theme: theme.theme,
          priority,
          summary:
            relatedPain[0] != null
              ? `${theme.theme} is clustering around ${relatedPain[0].questionLabel} with ${theme.responses} recent responses.`
              : `${theme.theme} is a recurring research cluster across ${theme.questions} questions and ${theme.responses} responses.`,
          signalCount,
          questionIds: theme.questionIds,
          questionLabels: theme.questionIds
            .map((questionId) => formatQuestionLabel(questionId))
            .slice(0, 4),
          leadingArchetype: theme.leadingArchetype,
          relatedPainQuestions: relatedPain.slice(0, 3).map((item) => item.questionLabel),
          relatedWordingQuestions: relatedWording.slice(0, 3).map((item) => item.questionLabel),
          relatedAnswerQualityQuestions: relatedAnswerQuality
            .slice(0, 3)
            .map((item) => item.questionLabel),
          relatedUnknownUnknowns: relatedUnknownUnknowns.slice(0, 3).map((item) => item.term),
          nextMove: buildSynthesisNextMove({
            relatedPainCount: relatedPain.length,
            relatedWordingCount: relatedWording.length,
            relatedAnswerQualityCount: relatedAnswerQuality.length,
            relatedUnknownCount: relatedUnknownUnknowns.length,
            leadingArchetype: theme.leadingArchetype,
          }),
          evidence,
          href: "/admin/research",
        } satisfies ResearchSynthesisPackage;
      })
      .sort((a, b) => {
        const priorityWeight =
          a.priority === b.priority
            ? 0
            : a.priority === "high"
              ? -1
              : b.priority === "high"
                ? 1
                : a.priority === "medium"
                  ? -1
                  : 1;
        if (priorityWeight !== 0) return priorityWeight;
        if (a.signalCount !== b.signalCount) return b.signalCount - a.signalCount;
        return a.title.localeCompare(b.title);
      })
      .slice(0, 8);

    return {
      generatedAt: new Date().toISOString(),
      days,
      summary: {
        signals: signals.length,
        themes: themes.length,
        painQuestions: painQuestions.length,
        emergingTerms: emergingTerms.length,
        archetypeShifts: archetypeDrift.length,
        responses: currentAnswers.length,
        contradictions: contradictions.length,
        wordingAlerts: wordingDiagnostics.length,
        lowQualityQuestions,
        synthesisPackages: synthesisPackages.length,
        unknownUnknowns: unknownUnknowns.length,
      },
      signals,
      themes,
      painQuestions,
      emergingTerms,
      archetypeDrift,
      contradictions,
      wordingDiagnostics,
      answerQuality,
      synthesisPackages,
      unknownUnknowns,
    };
  } catch (err) {
    logger.error({ err }, "Research intelligence build error");
    throw err;
  }
}
