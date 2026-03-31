"use client";

import AdminReviewRequestButton from "@/components/admin/AdminReviewRequestButton";
import type { ResearchRepositoryDraftInput } from "@/components/admin/ResearchRepositoryPanel";

type Priority = "high" | "medium" | "low";

interface UnknownUnknownItem {
  term: string;
  currentCount: number;
  previousCount: number;
  delta: number;
  questionLabels: string[];
  leadingArchetype: string | null;
  sampleExcerpts: string[];
  whyItMatters: string;
  href: string;
}

function priorityForItem(item: UnknownUnknownItem): Priority {
  if (item.delta >= 4 || item.questionLabels.length >= 3) return "high";
  if (item.delta >= 2) return "medium";
  return "low";
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

export default function UnknownUnknownsExplorer({
  items,
  onPromote,
}: {
  items: UnknownUnknownItem[];
  onPromote: (draft: ResearchRepositoryDraftInput) => void;
}) {
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg font-semibold text-text-primary">
            Unknown Unknowns Explorer
          </h3>
          <p className="mt-1 text-sm text-text-muted">
            Novel language patterns that are growing faster than the current taxonomy can explain.
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-text-muted">
          {items.length} surfaced
        </span>
      </div>

      <div className="mt-3 grid gap-4">
        {items.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-surface p-5 text-sm text-text-muted">
            No unknown-unknown patterns crossed the threshold in this window.
          </div>
        )}

        {items.map((item) => {
          const priority = priorityForItem(item);

          return (
            <div key={item.term} className="rounded-2xl border border-white/10 bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${priorityTone(priority)}`}
                    >
                      {priority}
                    </span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                      +{item.delta}
                    </span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                      {item.currentCount} now / {item.previousCount} before
                    </span>
                  </div>
                  <p className="mt-3 text-lg font-semibold text-text-primary">{item.term}</p>
                  <p className="mt-2 text-sm text-text-muted">{item.whyItMatters}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() =>
                      onPromote({
                        title: `Unknown unknown: ${item.term}`,
                        summary: item.whyItMatters,
                        entry_type: "signal",
                        priority,
                        theme: item.term,
                        source_key: `unknown-${item.term}`,
                        source_href: item.href,
                        evidence: item.sampleExcerpts,
                        recommendation:
                          "Validate whether this term deserves a new taxonomy label, synthesis package, or action owner.",
                        review_date: reviewDate(priority),
                      })
                    }
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium uppercase tracking-wide text-text-primary transition hover:bg-white/10"
                  >
                    Promote term
                  </button>
                  <AdminReviewRequestButton
                    title={`Review unknown unknown: ${item.term}`}
                    description={item.whyItMatters}
                    resourceType="general"
                    impactLevel={
                      priority === "high" ? "high" : priority === "medium" ? "medium" : "low"
                    }
                    sourceHref="/admin/research"
                    dueDate={reviewDate(priority)}
                    payloadSnapshot={{
                      term: item.term,
                      priority,
                      delta: item.delta,
                      currentCount: item.currentCount,
                      previousCount: item.previousCount,
                      questionLabels: item.questionLabels,
                      leadingArchetype: item.leadingArchetype,
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

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <InfoCard label="Questions" values={item.questionLabels} />
                <InfoCard
                  label="Leading Persona"
                  values={item.leadingArchetype ? [item.leadingArchetype] : []}
                  emptyLabel="No dominant persona"
                />
                <InfoCard
                  label="Samples"
                  values={item.sampleExcerpts}
                  emptyLabel="No excerpts captured"
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function InfoCard({
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
