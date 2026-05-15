"use client";

import { startTransition, useMemo, useState } from "react";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import KpiDataTable, { type Column } from "@features/admin/ui/kpi-tabs/KpiDataTable";
import TimeRangeSelector from "@features/admin/ui/TimeRangeSelector";

type LifecycleAction = "keep" | "revise" | "replace" | "retire";

interface LifecycleItem {
  qId: string;
  chapterId: string;
  questionText: string;
  reachN: number;
  completionRate: number;
  skipRate: number;
  backtrackRate: number;
  effectivenessScore: number;
  discriminationIndex: number;
  lifecycleAction: LifecycleAction;
  lifecyclePriority: number;
  lifecycleReasons: string[];
  drilldowns: Array<{ label: string; href: string; value: string }>;
}

interface LifecycleData {
  days: number;
  summary: {
    keep: number;
    revise: number;
    replace: number;
    retire: number;
    urgent: number;
  };
  chapters: Array<{
    chapterId: string;
    questions: number;
    revise: number;
    replace: number;
    retire: number;
  }>;
  topCandidates: LifecycleItem[];
  questions: LifecycleItem[];
}

const actionClasses: Record<LifecycleAction, string> = {
  keep: "bg-emerald-500/10 text-emerald-300",
  revise: "bg-amber-500/10 text-amber-200",
  replace: "bg-orange-500/10 text-orange-300",
  retire: "bg-red-500/10 text-red-300",
};

const columns: Column<LifecycleItem>[] = [
  { key: "qId", label: "Q ID" },
  { key: "chapterId", label: "Chapter" },
  { key: "lifecycleAction", label: "Action" },
  { key: "lifecyclePriority", label: "Priority", align: "right" },
  { key: "effectivenessScore", label: "Score", align: "right" },
  {
    key: "completionRate",
    label: "Completion",
    align: "right",
    format: (value) => `${value}%`,
  },
  {
    key: "skipRate",
    label: "Skip",
    align: "right",
    format: (value) => `${value}%`,
  },
  {
    key: "discriminationIndex",
    label: "Predictive",
    align: "right",
  },
];
const questionRangeOptions = [
  { days: 7, label: "7d", ariaLabel: "Last 7 days" },
  { days: 30, label: "30d", ariaLabel: "Last 30 days" },
  { days: 90, label: "90d", ariaLabel: "Last 90 days" },
] as const;

export default function QuestionLifecyclePanel() {
  const [days, setDays] = useState(30);
  const [actionFilter, setActionFilter] = useState<LifecycleAction | "all">("all");
  const [search, setSearch] = useState("");
  const params = useMemo(() => ({ days: String(days) }), [days]);
  const { data, loading, error } = useAdminFetch<LifecycleData>(
    "/api/admin/question-lifecycle",
    params
  );

  const filteredQuestions = useMemo(() => {
    const all = data?.questions ?? [];
    const needle = search.trim().toLowerCase();
    return all.filter((question) => {
      if (actionFilter !== "all" && question.lifecycleAction !== actionFilter) return false;
      if (!needle) return true;
      return (
        question.qId.toLowerCase().includes(needle) ||
        question.questionText.toLowerCase().includes(needle) ||
        question.chapterId.toLowerCase().includes(needle)
      );
    });
  }, [actionFilter, data, search]);

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
        {error || "Failed to load question lifecycle data."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-bold text-text-primary">Question Lifecycle</h2>
          <p className="mt-1 text-sm text-text-muted">
            Decide which questions to keep, revise, replace, or retire based on friction,
            regression, and predictive value.
          </p>
        </div>
        <TimeRangeSelector
          value={days}
          onChange={(value) => startTransition(() => setDays(value))}
          options={questionRangeOptions}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Keep" value={data.summary.keep} tone="emerald" />
        <SummaryCard label="Revise" value={data.summary.revise} tone="amber" />
        <SummaryCard label="Replace" value={data.summary.replace} tone="orange" />
        <SummaryCard label="Retire" value={data.summary.retire} tone="red" />
        <SummaryCard label="Urgent" value={data.summary.urgent} tone="slate" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-text-primary">Top Candidates</h3>
            <a
              href="/admin/question-effectiveness"
              className="text-xs text-text-muted transition hover:text-text-primary"
            >
              Open effectiveness
            </a>
          </div>
          <div className="mt-4 space-y-3">
            {data.topCandidates.map((question) => (
              <div key={question.qId} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${actionClasses[question.lifecycleAction]}`}
                      >
                        {question.lifecycleAction}
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                        {question.qId}
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                        chapter {question.chapterId}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-text-primary">
                      {question.questionText}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide text-text-muted">Priority</p>
                    <p className="mt-1 text-2xl font-bold text-text-primary">
                      {question.lifecyclePriority}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricPill label="Score" value={String(question.effectivenessScore)} />
                  <MetricPill label="Completion" value={`${question.completionRate}%`} />
                  <MetricPill label="Skip Rate" value={`${question.skipRate}%`} />
                  <MetricPill label="Predictive" value={String(question.discriminationIndex)} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {question.lifecycleReasons.map((reason) => (
                    <span
                      key={reason}
                      className="rounded-full border border-white/10 bg-surface px-3 py-1 text-xs text-text-muted"
                    >
                      {reason}
                    </span>
                  ))}
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {question.drilldowns.map((item) => (
                    <a
                      key={item.label}
                      href={item.href}
                      className="rounded-lg border border-white/10 bg-surface px-3 py-3 transition hover:border-white/20 hover:bg-white/5"
                    >
                      <p className="text-[11px] uppercase tracking-wide text-text-muted">
                        {item.label}
                      </p>
                      <p className="mt-1 text-sm text-text-primary">{item.value}</p>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-white/10 bg-surface p-5">
            <h3 className="text-sm font-semibold text-text-primary">Chapter Pressure</h3>
            <div className="mt-4 space-y-3">
              {data.chapters.map((chapter) => (
                <div
                  key={chapter.chapterId}
                  className="rounded-xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">
                        Chapter {chapter.chapterId}
                      </p>
                      <p className="text-xs text-text-muted">
                        {chapter.questions} tracked questions
                      </p>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-200">
                        revise {chapter.revise}
                      </span>
                      <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-orange-300">
                        replace {chapter.replace}
                      </span>
                      <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-red-300">
                        retire {chapter.retire}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-text-primary">Lifecycle Table</h3>
              <div className="flex flex-wrap gap-2">
                <select
                  value={actionFilter}
                  onChange={(event) =>
                    startTransition(() =>
                      setActionFilter(event.target.value as LifecycleAction | "all")
                    )
                  }
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
                >
                  <option value="all">All actions</option>
                  <option value="keep">Keep</option>
                  <option value="revise">Revise</option>
                  <option value="replace">Replace</option>
                  <option value="retire">Retire</option>
                </select>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search question..."
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-white/20 focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-4">
              <KpiDataTable
                data={filteredQuestions}
                columns={columns}
                defaultSortKey="lifecyclePriority"
                defaultSortDir="desc"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "amber" | "orange" | "red" | "slate";
}) {
  const classes =
    tone === "emerald"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
      : tone === "amber"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-200"
        : tone === "orange"
          ? "border-orange-500/20 bg-orange-500/10 text-orange-300"
          : tone === "red"
            ? "border-red-500/20 bg-red-500/10 text-red-300"
            : "border-white/10 bg-white/5 text-text-primary";
  return (
    <div className={`rounded-xl border p-4 ${classes}`}>
      <p className="text-xs font-medium uppercase tracking-wider">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-surface px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-text-primary">{value}</p>
    </div>
  );
}
