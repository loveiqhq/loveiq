"use client";

import AdminReviewRequestButton from "@/components/admin/AdminReviewRequestButton";
import type { ResearchRepositoryDraftInput } from "@/components/admin/ResearchRepositoryPanel";

type Priority = "high" | "medium" | "low";

interface SynthesisPackage {
  id: string;
  title: string;
  theme: string;
  priority: Priority;
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
}

function priorityTone(priority: Priority) {
  if (priority === "high") return "bg-red-500/10 text-red-300";
  if (priority === "medium") return "bg-amber-500/10 text-amber-200";
  return "bg-white/10 text-text-muted";
}

function reviewDate(priority: Priority) {
  const days = priority === "high" ? 7 : priority === "medium" ? 14 : 21;
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export default function ResearchSynthesisWorkspace({
  items,
  onPromote,
}: {
  items: SynthesisPackage[];
  onPromote: (draft: ResearchRepositoryDraftInput) => void;
}) {
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg font-semibold text-text-primary">
            Synthesis Workspace
          </h3>
          <p className="mt-1 text-sm text-text-muted">
            Bundled research packages by theme, problem, and persona so signals become decisions
            instead of isolated charts.
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-text-muted">
          {items.length} packages
        </span>
      </div>

      <div className="mt-3 grid gap-4">
        {items.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-surface p-5 text-sm text-text-muted">
            No synthesis packages were generated for this window.
          </div>
        )}

        {items.map((item) => (
          <div key={item.id} className="rounded-2xl border border-white/10 bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${priorityTone(item.priority)}`}
                  >
                    {item.priority}
                  </span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                    {item.signalCount} signals
                  </span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                    {item.theme}
                  </span>
                </div>
                <p className="mt-3 text-lg font-semibold text-text-primary">{item.title}</p>
                <p className="mt-2 text-sm text-text-muted">{item.summary}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() =>
                    onPromote({
                      title: item.title,
                      summary: item.summary,
                      entry_type: "theme",
                      priority: item.priority,
                      theme: item.theme,
                      source_key: item.id,
                      source_href: item.href,
                      evidence: item.evidence,
                      recommendation: item.nextMove,
                      review_date: reviewDate(item.priority),
                    })
                  }
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium uppercase tracking-wide text-text-primary transition hover:bg-white/10"
                >
                  Promote package
                </button>
                <AdminReviewRequestButton
                  title={`Review synthesis package: ${item.title}`}
                  description={item.summary}
                  resourceType="general"
                  impactLevel={
                    item.priority === "high"
                      ? "high"
                      : item.priority === "medium"
                        ? "medium"
                        : "low"
                  }
                  sourceHref="/admin/research"
                  dueDate={reviewDate(item.priority)}
                  payloadSnapshot={{
                    packageId: item.id,
                    theme: item.theme,
                    priority: item.priority,
                    signalCount: item.signalCount,
                    leadingArchetype: item.leadingArchetype,
                    nextMove: item.nextMove,
                  }}
                  label="Request review"
                  busyLabel="Requesting..."
                  successLabel="Queued"
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium uppercase tracking-wide text-text-primary transition hover:bg-white/10 disabled:opacity-40"
                />
                <a
                  href={item.href}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium uppercase tracking-wide text-text-primary transition hover:bg-white/10"
                >
                  Open source
                </a>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetaBlock label="Questions" values={item.questionLabels} />
              <MetaBlock
                label="Pain"
                values={item.relatedPainQuestions}
                emptyLabel="No linked pain hotspots"
              />
              <MetaBlock
                label="Wording"
                values={item.relatedWordingQuestions}
                emptyLabel="No linked wording alerts"
              />
              <MetaBlock
                label="Answer quality"
                values={item.relatedAnswerQualityQuestions}
                emptyLabel="No linked answer-quality issues"
              />
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr,1fr]">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">Unknown Unknowns</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.relatedUnknownUnknowns.length === 0 ? (
                    <span className="text-sm text-text-muted">No novel language attached yet.</span>
                  ) : (
                    item.relatedUnknownUnknowns.map((term) => (
                      <span
                        key={`${item.id}-${term}`}
                        className="rounded-full border border-white/10 bg-black/10 px-3 py-1 text-xs text-text-primary"
                      >
                        {term}
                      </span>
                    ))
                  )}
                </div>
                {item.leadingArchetype && (
                  <p className="mt-3 text-sm text-text-muted">
                    Leading persona:{" "}
                    <span className="text-text-primary">{item.leadingArchetype}</span>
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">Next Move</p>
                <p className="mt-2 text-sm text-text-primary">{item.nextMove}</p>
              </div>
            </div>

            {item.evidence.length > 0 && (
              <div className="mt-4 space-y-2">
                {item.evidence.map((evidence, index) => (
                  <div
                    key={`${item.id}-${index}`}
                    className="rounded-lg border border-white/10 bg-black/10 px-3 py-3 text-sm text-text-muted"
                  >
                    {evidence}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function MetaBlock({
  label,
  values,
  emptyLabel = "No linked signals",
}: {
  label: string;
  values: string[];
  emptyLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <div className="mt-2 space-y-2">
        {values.length === 0 ? (
          <p className="text-sm text-text-muted">{emptyLabel}</p>
        ) : (
          values.map((value) => (
            <div key={`${label}-${value}`} className="text-sm text-text-primary">
              {value}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
