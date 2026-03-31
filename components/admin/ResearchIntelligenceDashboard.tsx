"use client";

import { useState } from "react";
import ResearchRepositoryPanel, {
  type ResearchRepositoryDraftInput,
} from "@/components/admin/ResearchRepositoryPanel";
import ResearchSynthesisWorkspace from "@/components/admin/ResearchSynthesisWorkspace";
import ResearchTaxonomyPanel from "@/components/admin/ResearchTaxonomyPanel";
import TimeRangeSelector from "@/components/admin/TimeRangeSelector";
import UnknownUnknownsExplorer from "@/components/admin/UnknownUnknownsExplorer";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";

interface ResearchIntelligenceData {
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
    severity: "critical" | "warning" | "positive" | "info" | "neutral";
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
  contradictions: Array<{
    key: string;
    title: string;
    detail: string;
    severity: "critical" | "warning" | "positive" | "info" | "neutral";
    affectedSubmissions: number;
    coverage: number;
    evidence: string[];
    recommendation: string;
    href: string;
  }>;
  wordingDiagnostics: Array<{
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
  }>;
  answerQuality: {
    summary: {
      lowInfoResponses: number;
      fillerResponses: number;
      duplicatedResponses: number;
      strongResponses: number;
    };
    questions: Array<{
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
    }>;
  };
  synthesisPackages: Array<{
    id: string;
    title: string;
    theme: string;
    priority: "high" | "medium" | "low";
    summary: string;
    signalCount: number;
    questionLabels: string[];
    leadingArchetype: string | null;
    relatedPainQuestions: string[];
    relatedWordingQuestions: string[];
    relatedAnswerQualityQuestions: string[];
    relatedUnknownUnknowns: string[];
    nextMove: string;
    evidence: string[];
    href: string;
  }>;
  unknownUnknowns: Array<{
    term: string;
    currentCount: number;
    previousCount: number;
    delta: number;
    questionLabels: string[];
    leadingArchetype: string | null;
    sampleExcerpts: string[];
    whyItMatters: string;
    href: string;
  }>;
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-2 font-serif text-2xl font-semibold text-text-primary">{value}</p>
    </div>
  );
}

function severityTone(severity: "critical" | "warning" | "positive" | "info" | "neutral"): string {
  if (severity === "critical") return "bg-red-500/10 text-red-300";
  if (severity === "warning") return "bg-amber-500/10 text-amber-200";
  if (severity === "positive") return "bg-emerald-500/10 text-emerald-300";
  if (severity === "info") return "bg-cyan-500/10 text-cyan-300";
  return "bg-white/10 text-text-muted";
}

function watchStatusTone(status: "regressed" | "stable" | "improved" | "unknown"): string {
  if (status === "regressed") return "bg-red-500/10 text-red-300";
  if (status === "improved") return "bg-emerald-500/10 text-emerald-300";
  return "bg-white/10 text-text-muted";
}

function qualityTone(score: number): string {
  if (score >= 80) return "bg-emerald-500/10 text-emerald-300";
  if (score >= 65) return "bg-amber-500/10 text-amber-200";
  return "bg-red-500/10 text-red-300";
}

function PromoteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium uppercase tracking-wide text-text-primary transition hover:bg-white/10"
    >
      {label}
    </button>
  );
}

function researchPriorityFromSeverity(
  severity: "critical" | "warning" | "positive" | "info" | "neutral"
): "high" | "medium" | "low" {
  if (severity === "critical") return "high";
  if (severity === "warning") return "medium";
  return "low";
}

function researchReviewDate(priority: "high" | "medium" | "low") {
  const days = priority === "high" ? 7 : priority === "medium" ? 14 : 21;
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

function promoteButtonLabel(kind: string) {
  return `Promote ${kind}`;
}

export default function ResearchIntelligenceDashboard() {
  const [days, setDays] = useState(30);
  const [repositoryDraft, setRepositoryDraft] = useState<ResearchRepositoryDraftInput | null>(null);
  const { data, loading, error } = useAdminFetch<ResearchIntelligenceData>(
    "/api/admin/research-intelligence",
    { days: String(days) }
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
        {error || "Failed to load research intelligence."}
      </div>
    );
  }

  function promoteDraft(draft: ResearchRepositoryDraftInput) {
    setRepositoryDraft(draft);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-serif text-3xl font-bold text-text-primary">Research Intelligence</h2>
          <p className="mt-2 max-w-3xl text-sm text-text-muted">
            Synthesize free-text responses, question pain, emerging language, and persona drift into
            one research operating surface.
          </p>
        </div>
        <TimeRangeSelector value={days} onChange={setDays} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        <SummaryTile label="Signals" value={String(data.summary.signals)} />
        <SummaryTile label="Themes" value={String(data.summary.themes)} />
        <SummaryTile label="Pain Questions" value={String(data.summary.painQuestions)} />
        <SummaryTile label="Emerging Terms" value={String(data.summary.emergingTerms)} />
        <SummaryTile label="Archetype Shifts" value={String(data.summary.archetypeShifts)} />
        <SummaryTile label="Responses" value={String(data.summary.responses)} />
        <SummaryTile label="Contradictions" value={String(data.summary.contradictions)} />
        <SummaryTile label="Wording Alerts" value={String(data.summary.wordingAlerts)} />
        <SummaryTile
          label="Low-Quality Questions"
          value={String(data.summary.lowQualityQuestions)}
        />
        <SummaryTile label="Synthesis Packages" value={String(data.summary.synthesisPackages)} />
        <SummaryTile label="Unknown Unknowns" value={String(data.summary.unknownUnknowns)} />
      </div>

      <ResearchRepositoryPanel
        draft={repositoryDraft}
        onDraftConsumed={() => setRepositoryDraft(null)}
      />

      <ResearchTaxonomyPanel themes={data.themes} unknownUnknowns={data.unknownUnknowns} />

      <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
        <ResearchSynthesisWorkspace items={data.synthesisPackages} onPromote={promoteDraft} />
        <UnknownUnknownsExplorer items={data.unknownUnknowns} onPromote={promoteDraft} />
      </div>

      <section>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-serif text-lg font-semibold text-text-primary">Signal Board</h3>
            <p className="mt-1 text-sm text-text-muted">
              The most important research-grade signals from the current window.
            </p>
          </div>
          <p className="text-xs text-text-muted">
            Updated {new Date(data.generatedAt).toLocaleString()}
          </p>
        </div>
        <div className="mt-3 grid gap-4 xl:grid-cols-2">
          {data.signals.map((signal) => (
            <a
              key={signal.title}
              href={signal.href}
              className="rounded-2xl border border-white/10 bg-surface p-5 transition hover:border-white/20"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${severityTone(signal.severity)}`}
                >
                  {signal.severity}
                </span>
              </div>
              <p className="mt-3 text-lg font-semibold text-text-primary">{signal.title}</p>
              <p className="mt-2 text-sm text-text-muted">{signal.detail}</p>
              <div className="mt-4">
                <PromoteButton
                  label={promoteButtonLabel("signal")}
                  onClick={() =>
                    promoteDraft({
                      title: signal.title,
                      summary: signal.detail,
                      entry_type: "signal",
                      priority: researchPriorityFromSeverity(signal.severity),
                      source_key: signal.title.toLowerCase().replace(/\s+/g, "-"),
                      source_href: signal.href,
                      evidence: [signal.detail],
                      recommendation:
                        "Validate the signal and convert it into a tracked action or review if it persists.",
                      review_date: researchReviewDate(
                        researchPriorityFromSeverity(signal.severity)
                      ),
                    })
                  }
                />
              </div>
            </a>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-serif text-lg font-semibold text-text-primary">
              Contradiction and Tension Detector
            </h3>
            <p className="mt-1 text-sm text-text-muted">
              Rules-based conflicts between related survey answers that likely signal wording
              confusion or mixed interpretation.
            </p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-text-muted">
            {data.contradictions.length} active patterns
          </span>
        </div>
        <div className="mt-3 grid gap-4 xl:grid-cols-2">
          {data.contradictions.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-surface p-5 text-sm text-text-muted">
              No contradiction patterns crossed the current threshold in this window.
            </div>
          )}
          {data.contradictions.map((item) => (
            <a
              key={item.key}
              href={item.href}
              className="rounded-2xl border border-white/10 bg-surface p-5 transition hover:border-white/20"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${severityTone(item.severity)}`}
                >
                  {item.severity}
                </span>
                <span className="text-xs text-text-muted">
                  {item.affectedSubmissions} submissions / {item.coverage}% coverage
                </span>
              </div>
              <p className="mt-3 text-lg font-semibold text-text-primary">{item.title}</p>
              <p className="mt-2 text-sm text-text-muted">{item.detail}</p>
              <div className="mt-4 space-y-2">
                {item.evidence.map((evidence, index) => (
                  <div
                    key={`${item.key}-${index}`}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-text-muted"
                  >
                    {evidence}
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-text-primary">{item.recommendation}</p>
              <div className="mt-4">
                <PromoteButton
                  label={promoteButtonLabel("contradiction")}
                  onClick={() =>
                    promoteDraft({
                      title: item.title,
                      summary: item.detail,
                      entry_type: "contradiction",
                      priority: researchPriorityFromSeverity(item.severity),
                      source_key: item.key,
                      source_href: item.href,
                      evidence: item.evidence,
                      recommendation: item.recommendation,
                      review_date: researchReviewDate(researchPriorityFromSeverity(item.severity)),
                    })
                  }
                />
              </div>
            </a>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <section>
          <h3 className="font-serif text-lg font-semibold text-text-primary">Theme Clusters</h3>
          <div className="mt-3 grid gap-4">
            {data.themes.map((theme) => (
              <div key={theme.theme} className="rounded-2xl border border-white/10 bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold capitalize text-text-primary">
                      {theme.theme}
                    </p>
                    <p className="mt-1 text-sm text-text-muted">
                      {theme.responses} responses across {theme.questions} questions
                      {theme.leadingArchetype ? ` · strongest in ${theme.leadingArchetype}` : ""}
                    </p>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {theme.sampleExcerpts.map((sample, index) => (
                    <div
                      key={`${theme.theme}-${index}`}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-text-muted"
                    >
                      {sample}
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <PromoteButton
                    label={promoteButtonLabel("theme")}
                    onClick={() =>
                      promoteDraft({
                        title: `Theme cluster: ${theme.theme}`,
                        summary: `${theme.responses} responses across ${theme.questions} questions${theme.leadingArchetype ? `, strongest in ${theme.leadingArchetype}` : ""}.`,
                        entry_type: "theme",
                        priority:
                          theme.responses >= 20 ? "high" : theme.responses >= 10 ? "medium" : "low",
                        theme: theme.theme,
                        source_key: `theme-${theme.theme}`,
                        source_href: "/admin/research",
                        evidence: theme.sampleExcerpts,
                        recommendation:
                          "Validate whether this theme deserves a tracked initiative, review, or messaging change.",
                        review_date: researchReviewDate(
                          theme.responses >= 20 ? "high" : theme.responses >= 10 ? "medium" : "low"
                        ),
                      })
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="font-serif text-lg font-semibold text-text-primary">Emerging Terms</h3>
          <div className="mt-3 rounded-2xl border border-white/10 bg-surface p-5">
            <div className="flex flex-wrap gap-2">
              {data.emergingTerms.map((term) => (
                <div
                  key={term.term}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-text-primary"
                >
                  <span className="font-semibold">{term.term}</span>
                  <span className="ml-2 text-text-muted">
                    +{term.delta} now {term.currentCount}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <h3 className="mt-6 font-serif text-lg font-semibold text-text-primary">Persona Drift</h3>
          <div className="mt-3 space-y-3">
            {data.archetypeDrift.map((item) => (
              <div
                key={item.archetype}
                className="rounded-2xl border border-white/10 bg-surface p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-text-primary">{item.archetype}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${item.delta >= 0 ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}
                  >
                    {item.delta >= 0 ? `+${item.delta}` : item.delta}
                  </span>
                </div>
                <p className="mt-2 text-sm text-text-muted">
                  {item.current} current vs {item.previous} previous results
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section>
        <h3 className="font-serif text-lg font-semibold text-text-primary">
          Pain Severity Ranking
        </h3>
        <div className="mt-3 grid gap-4">
          {data.painQuestions.map((question) => (
            <div
              key={question.questionId}
              className="rounded-2xl border border-white/10 bg-surface p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-text-primary">
                    {question.questionLabel}
                  </p>
                  <p className="mt-1 text-sm text-text-muted">
                    {question.responseCount} responses · {question.painMentions} pain-coded mentions
                  </p>
                </div>
                <span className="rounded-full bg-amber-500/10 px-3 py-1 text-sm font-semibold text-amber-200">
                  {question.severityScore}
                </span>
              </div>
              {question.sampleExcerpt && (
                <div className="mt-4 rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-text-muted">
                  {question.sampleExcerpt}
                </div>
              )}
              <div className="mt-4">
                <PromoteButton
                  label={promoteButtonLabel("pain point")}
                  onClick={() =>
                    promoteDraft({
                      title: `Pain point: ${question.questionLabel}`,
                      summary: `${question.painMentions} pain-coded mentions across ${question.responseCount} responses.`,
                      entry_type: "pain-point",
                      priority:
                        question.severityScore >= 50
                          ? "high"
                          : question.severityScore >= 30
                            ? "medium"
                            : "low",
                      question_id: question.questionId,
                      source_key: `pain-${question.questionId}`,
                      source_href: "/admin/research",
                      evidence: question.sampleExcerpt ? [question.sampleExcerpt] : [],
                      recommendation:
                        "Review whether this question or flow is surfacing a recurring pain pattern that needs product or research follow-up.",
                      review_date: researchReviewDate(
                        question.severityScore >= 50
                          ? "high"
                          : question.severityScore >= 30
                            ? "medium"
                            : "low"
                      ),
                    })
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <section>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-serif text-lg font-semibold text-text-primary">
                Wording Diagnostics
              </h3>
              <p className="mt-1 text-sm text-text-muted">
                Static question complexity combined with live behavioral friction.
              </p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-text-muted">
              {data.wordingDiagnostics.length} flagged
            </span>
          </div>
          <div className="mt-3 space-y-4">
            {data.wordingDiagnostics.map((item) => (
              <a
                key={item.questionId}
                href={item.href}
                className="block rounded-2xl border border-white/10 bg-surface p-5 transition hover:border-white/20"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                        {item.questionId}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${watchStatusTone(item.watchStatus)}`}
                      >
                        {item.watchStatus}
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                        {item.answerType}
                      </span>
                    </div>
                    <p className="mt-3 text-lg font-semibold text-text-primary">
                      {item.questionLabel}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-right text-xs text-text-muted">
                    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                      <p>Static</p>
                      <p className="mt-1 text-sm font-semibold text-text-primary">
                        {item.staticComplexity}
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                      <p>Behavior</p>
                      <p className="mt-1 text-sm font-semibold text-text-primary">
                        {item.behaviorRisk}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {item.issues.map((issue) => (
                    <span
                      key={`${item.questionId}-${issue}`}
                      className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-text-muted"
                    >
                      {issue}
                    </span>
                  ))}
                </div>
                <p className="mt-4 text-sm text-text-primary">{item.recommendation}</p>
                <div className="mt-4">
                  <PromoteButton
                    label={promoteButtonLabel("wording issue")}
                    onClick={() =>
                      promoteDraft({
                        title: `Wording diagnostic: ${item.questionLabel}`,
                        summary: `${item.issueCount} issues across static complexity ${item.staticComplexity} and behavior risk ${item.behaviorRisk}.`,
                        entry_type: "wording",
                        priority:
                          item.watchStatus === "regressed" || item.behaviorRisk >= 35
                            ? "high"
                            : "medium",
                        question_id: item.questionId,
                        source_key: `wording-${item.questionId}`,
                        source_href: item.href,
                        evidence: item.issues,
                        recommendation: item.recommendation,
                        review_date: researchReviewDate(
                          item.watchStatus === "regressed" || item.behaviorRisk >= 35
                            ? "high"
                            : "medium"
                        ),
                      })
                    }
                  />
                </div>
              </a>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-serif text-lg font-semibold text-text-primary">Answer Quality</h3>
              <p className="mt-1 text-sm text-text-muted">
                Open-text response depth, filler patterns, duplication, and weak-signal questions.
              </p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-text-muted">
              {data.answerQuality.questions.length} tracked questions
            </span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-surface p-4">
              <p className="text-xs uppercase tracking-wide text-text-muted">Low-Info Responses</p>
              <p className="mt-2 text-2xl font-semibold text-text-primary">
                {data.answerQuality.summary.lowInfoResponses}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-surface p-4">
              <p className="text-xs uppercase tracking-wide text-text-muted">Filler Responses</p>
              <p className="mt-2 text-2xl font-semibold text-text-primary">
                {data.answerQuality.summary.fillerResponses}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-surface p-4">
              <p className="text-xs uppercase tracking-wide text-text-muted">
                Duplicated Responses
              </p>
              <p className="mt-2 text-2xl font-semibold text-text-primary">
                {data.answerQuality.summary.duplicatedResponses}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-surface p-4">
              <p className="text-xs uppercase tracking-wide text-text-muted">Strong Responses</p>
              <p className="mt-2 text-2xl font-semibold text-text-primary">
                {data.answerQuality.summary.strongResponses}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {data.answerQuality.questions.map((question) => (
              <a
                key={question.questionId}
                href={question.href}
                className="block rounded-2xl border border-white/10 bg-surface p-5 transition hover:border-white/20"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                        {question.questionId}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${qualityTone(question.qualityScore)}`}
                      >
                        quality {question.qualityScore}
                      </span>
                    </div>
                    <p className="mt-3 text-lg font-semibold text-text-primary">
                      {question.questionLabel}
                    </p>
                  </div>
                  <div className="text-right text-xs text-text-muted">
                    <p>{question.responses} responses</p>
                    <p className="mt-1">{question.avgWords} avg words</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                    <p className="text-xs text-text-muted">Low info</p>
                    <p className="mt-1 text-sm font-semibold text-text-primary">
                      {question.lowInfoRate}%
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                    <p className="text-xs text-text-muted">Filler</p>
                    <p className="mt-1 text-sm font-semibold text-text-primary">
                      {question.fillerRate}%
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                    <p className="text-xs text-text-muted">Duplicate</p>
                    <p className="mt-1 text-sm font-semibold text-text-primary">
                      {question.duplicateRate}%
                    </p>
                  </div>
                </div>

                {question.sampleWeakResponses.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {question.sampleWeakResponses.map((sample, index) => (
                      <div
                        key={`${question.questionId}-sample-${index}`}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-text-muted"
                      >
                        {sample}
                      </div>
                    ))}
                  </div>
                )}

                <p className="mt-4 text-sm text-text-primary">{question.recommendation}</p>
                <div className="mt-4">
                  <PromoteButton
                    label={promoteButtonLabel("answer quality issue")}
                    onClick={() =>
                      promoteDraft({
                        title: `Answer quality: ${question.questionLabel}`,
                        summary: `${question.lowInfoRate}% low-info, ${question.fillerRate}% filler, ${question.duplicateRate}% duplicate.`,
                        entry_type: "answer-quality",
                        priority:
                          question.qualityScore < 55
                            ? "high"
                            : question.qualityScore < 70
                              ? "medium"
                              : "low",
                        question_id: question.questionId,
                        source_key: `answer-quality-${question.questionId}`,
                        source_href: question.href,
                        evidence: question.sampleWeakResponses,
                        recommendation: question.recommendation,
                        review_date: researchReviewDate(
                          question.qualityScore < 55
                            ? "high"
                            : question.qualityScore < 70
                              ? "medium"
                              : "low"
                        ),
                      })
                    }
                  />
                </div>
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
