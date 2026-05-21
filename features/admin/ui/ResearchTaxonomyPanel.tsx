"use client";

import { useEffect, useMemo, useState } from "react";
import AdminReviewRequestButton from "@features/admin/ui/AdminReviewRequestButton";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import type {
  ResearchTaxonomySnapshot,
  ResearchTaxonomyStatus,
  ResearchTaxonomyType,
} from "@features/admin/server/research-taxonomy";
import { getCsrfToken } from "@shared/http/csrf-client";

type ThemeInput = {
  theme: string;
  responses: number;
  questions: number;
  questionIds: string[];
  leadingArchetype: string | null;
  sampleExcerpts: string[];
};

type UnknownUnknownInput = {
  term: string;
  currentCount: number;
  previousCount: number;
  delta: number;
  questionLabels: string[];
  leadingArchetype: string | null;
  sampleExcerpts: string[];
  whyItMatters: string;
};

interface Suggestion {
  key: string;
  label: string;
  taxonomyType: ResearchTaxonomyType;
  description: string;
  linkedQuestionIds: string[];
  exampleTerms: string[];
  sourceKeys: string[];
  reviewDate: string;
  evidenceLabel: string;
}

interface FormState {
  label: string;
  taxonomyType: ResearchTaxonomyType;
  status: ResearchTaxonomyStatus;
  description: string;
  ownerEmail: string;
  linkedQuestionIdsText: string;
  exampleTermsText: string;
  sourceKeysText: string;
  reviewDate: string;
}

const TYPE_TONE: Record<ResearchTaxonomyType, string> = {
  intent: "bg-cyan-500/10 text-cyan-300",
  motivation: "bg-amber-500/10 text-amber-200",
  theme: "bg-white/10 text-text-muted",
};

const STATUS_TONE: Record<ResearchTaxonomyStatus, string> = {
  draft: "bg-white/10 text-text-muted",
  active: "bg-emerald-500/10 text-emerald-300",
  deprecated: "bg-red-500/10 text-red-300",
};

function defaultReviewDate(days = 21) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

function reviewStateLabel(value: "fresh" | "due" | "overdue" | "none") {
  if (value === "fresh") return "review fresh";
  if (value === "due") return "review due";
  if (value === "overdue") return "review overdue";
  return "review not set";
}

function reviewStateTone(value: "fresh" | "due" | "overdue" | "none") {
  if (value === "fresh") return "bg-emerald-500/10 text-emerald-300";
  if (value === "due") return "bg-amber-500/10 text-amber-200";
  if (value === "overdue") return "bg-red-500/10 text-red-300";
  return "bg-white/10 text-text-muted";
}

function inferTaxonomyType(text: string): ResearchTaxonomyType {
  const value = text.toLowerCase();
  if (
    ["want", "need", "seek", "looking", "plan", "goal", "future", "marriage", "commitment"].some(
      (term) => value.includes(term)
    )
  ) {
    return "intent";
  }
  if (
    [
      "trust",
      "fear",
      "confidence",
      "repair",
      "growth",
      "healing",
      "insecure",
      "close",
      "distance",
      "spark",
    ].some((term) => value.includes(term))
  ) {
    return "motivation";
  }
  return "theme";
}

function titleize(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function listToText(values: string[]) {
  return values.join(", ");
}

function textToList(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function toFormState(input?: Partial<FormState>): FormState {
  return {
    label: input?.label ?? "",
    taxonomyType: input?.taxonomyType ?? "theme",
    status: input?.status ?? "active",
    description: input?.description ?? "",
    ownerEmail: input?.ownerEmail ?? "",
    linkedQuestionIdsText: input?.linkedQuestionIdsText ?? "",
    exampleTermsText: input?.exampleTermsText ?? "",
    sourceKeysText: input?.sourceKeysText ?? "",
    reviewDate: input?.reviewDate ?? defaultReviewDate(),
  };
}

export default function ResearchTaxonomyPanel({
  themes,
  unknownUnknowns,
}: {
  themes: ThemeInput[];
  unknownUnknowns: UnknownUnknownInput[];
}) {
  const { data, loading, error, refetch } = useAdminFetch<ResearchTaxonomySnapshot>(
    "/api/admin/research-taxonomy"
  );
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(toFormState());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const existingLabels = useMemo(
    () => new Set((data?.terms ?? []).map((term) => term.label.toLowerCase())),
    [data]
  );

  const suggestions = useMemo<Suggestion[]>(() => {
    const themeSuggestions = themes.map((theme) => ({
      key: `theme-${theme.theme}`,
      label: titleize(theme.theme),
      taxonomyType: inferTaxonomyType(theme.theme),
      description: `${theme.responses} responses across ${theme.questions} questions${theme.leadingArchetype ? `, strongest in ${theme.leadingArchetype}` : ""}.`,
      linkedQuestionIds: theme.questionIds,
      exampleTerms: [theme.theme],
      sourceKeys: [`theme-${theme.theme}`],
      reviewDate: defaultReviewDate(theme.responses >= 20 ? 7 : 14),
      evidenceLabel: `${theme.responses} responses`,
    }));

    const unknownSuggestions = unknownUnknowns.map((item) => ({
      key: `unknown-${item.term}`,
      label: titleize(item.term),
      taxonomyType: inferTaxonomyType(`${item.term} ${item.whyItMatters}`),
      description: item.whyItMatters,
      linkedQuestionIds: [],
      exampleTerms: [item.term],
      sourceKeys: [`unknown-${item.term}`],
      reviewDate: defaultReviewDate(item.delta >= 4 ? 7 : 14),
      evidenceLabel: `+${item.delta} growth`,
    }));

    return [...themeSuggestions, ...unknownSuggestions]
      .filter((item) => !existingLabels.has(item.label.toLowerCase()))
      .slice(0, 12);
  }, [existingLabels, themes, unknownUnknowns]);

  useEffect(() => {
    if (!editingId) {
      setForm(toFormState());
    }
  }, [editingId]);

  function beginEdit(term: NonNullable<ResearchTaxonomySnapshot["terms"]>[number]) {
    setEditingId(term.id);
    setForm(
      toFormState({
        label: term.label,
        taxonomyType: term.taxonomyType,
        status: term.status,
        description: term.description ?? "",
        ownerEmail: term.ownerEmail ?? "",
        linkedQuestionIdsText: listToText(term.linkedQuestionIds),
        exampleTermsText: listToText(term.exampleTerms),
        sourceKeysText: listToText(term.sourceKeys),
        reviewDate: term.reviewDate ?? defaultReviewDate(),
      })
    );
    setMessage(null);
  }

  function applySuggestion(suggestion: Suggestion) {
    setEditingId(null);
    setForm(
      toFormState({
        label: suggestion.label,
        taxonomyType: suggestion.taxonomyType,
        status: "active",
        description: suggestion.description,
        linkedQuestionIdsText: listToText(suggestion.linkedQuestionIds),
        exampleTermsText: listToText(suggestion.exampleTerms),
        sourceKeysText: listToText(suggestion.sourceKeys),
        reviewDate: suggestion.reviewDate,
      })
    );
    setMessage(null);
  }

  async function submitForm() {
    if (!form.label.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/research-taxonomy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({
          action: editingId ? "update" : "create",
          ...(editingId ? { id: editingId } : {}),
          label: form.label.trim(),
          taxonomy_type: form.taxonomyType,
          status: form.status,
          description: form.description.trim() || null,
          owner_email: form.ownerEmail.trim() || null,
          linked_question_ids: textToList(form.linkedQuestionIdsText),
          example_terms: textToList(form.exampleTermsText),
          source_keys: textToList(form.sourceKeysText),
          review_date: form.reviewDate || null,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          (body as { error?: string } | null)?.error || "Failed to save taxonomy term."
        );
      }

      setMessage({
        type: "success",
        text: editingId ? `Updated taxonomy term #${editingId}.` : "Created taxonomy term.",
      });
      setEditingId(null);
      setForm(toFormState());
      refetch();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save taxonomy term.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteTerm(id: number) {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/research-taxonomy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({ action: "delete", id }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          (body as { error?: string } | null)?.error || "Failed to delete taxonomy term."
        );
      }

      setMessage({ type: "success", text: `Deleted taxonomy term #${id}.` });
      if (editingId === id) {
        setEditingId(null);
        setForm(toFormState());
      }
      refetch();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to delete taxonomy term.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-3xl border border-white/10 bg-surface/80 p-5">
        <div className="flex items-center justify-center py-12">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="rounded-3xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-400">
        {error || "Failed to load research taxonomy."}
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-surface/80 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="font-serif text-xl font-semibold text-text-primary">
            Intent & Motivation Taxonomy
          </h3>
          <p className="mt-1 max-w-4xl text-sm text-text-muted">
            Curate stable research labels so insights stop living only as transient clusters. This
            is the durable taxonomy layer on top of themes and emerging language.
          </p>
        </div>
        <p className="text-xs text-text-muted">
          Updated {new Date(data.generatedAt).toLocaleString()}
        </p>
      </div>

      {message && (
        <div
          className={`mt-4 rounded-xl border p-4 text-sm ${
            message.type === "success"
              ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300"
              : "border-red-500/20 bg-red-500/5 text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-7">
        <SummaryTile label="Terms" value={String(data.summary.total)} />
        <SummaryTile label="Active" value={String(data.summary.active)} />
        <SummaryTile label="Intent" value={String(data.summary.intent)} />
        <SummaryTile label="Motivation" value={String(data.summary.motivation)} />
        <SummaryTile label="Theme" value={String(data.summary.theme)} />
        <SummaryTile label="Reviews Due" value={String(data.summary.reviewDue)} />
        <SummaryTile
          label="Stabilizers"
          value={`${data.summary.submissionTags} tags / ${data.summary.autoTagRules} rules`}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-text-primary">Suggestion Inbox</h4>
                <p className="mt-1 text-xs text-text-muted">
                  Promote high-signal themes and unknown language into curated taxonomy terms.
                </p>
              </div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-text-muted">
                {suggestions.length} suggestions
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {suggestions.length === 0 && (
                <div className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-text-muted">
                  No new taxonomy suggestions are waiting right now.
                </div>
              )}
              {suggestions.map((suggestion) => (
                <div
                  key={suggestion.key}
                  className="rounded-xl border border-white/10 bg-surface p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${TYPE_TONE[suggestion.taxonomyType]}`}
                        >
                          {suggestion.taxonomyType}
                        </span>
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                          {suggestion.evidenceLabel}
                        </span>
                      </div>
                      <p className="mt-2 text-base font-semibold text-text-primary">
                        {suggestion.label}
                      </p>
                      <p className="mt-2 text-sm text-text-muted">{suggestion.description}</p>
                    </div>
                    <button
                      onClick={() => applySuggestion(suggestion)}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-text-primary transition hover:bg-white/10"
                    >
                      Use suggestion
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-text-primary">Curated Terms</h4>
                <p className="mt-1 text-xs text-text-muted">
                  Stable research outputs with owners, review dates, and linked questions.
                </p>
              </div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-text-muted">
                {data.terms.length} saved
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {data.terms.length === 0 && (
                <div className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-text-muted">
                  No curated taxonomy terms yet. Start with the suggestion inbox.
                </div>
              )}
              {data.terms.map((term) => (
                <div key={term.id} className="rounded-xl border border-white/10 bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${TYPE_TONE[term.taxonomyType]}`}
                        >
                          {term.taxonomyType}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${STATUS_TONE[term.status]}`}
                        >
                          {term.status}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${reviewStateTone(term.reviewState)}`}
                        >
                          {reviewStateLabel(term.reviewState)}
                        </span>
                      </div>
                      <p className="mt-2 text-base font-semibold text-text-primary">{term.label}</p>
                      {term.description && (
                        <p className="mt-2 text-sm text-text-muted">{term.description}</p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-text-muted">
                        <span>{term.linkedQuestionIds.length} linked questions</span>
                        <span>{term.exampleTerms.length} examples</span>
                        <span>{term.ownerEmail ?? "no owner"}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => beginEdit(term)}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-text-primary transition hover:bg-white/10"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => void deleteTerm(term.id)}
                        disabled={saving}
                        className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {term.exampleTerms.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {term.exampleTerms.map((example) => (
                        <span
                          key={`${term.id}-${example}`}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-text-muted"
                        >
                          {example}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-4">
                    <AdminReviewRequestButton
                      title={`Review taxonomy term: ${term.label}`}
                      description={term.description}
                      resourceType="general"
                      impactLevel={term.status === "deprecated" ? "low" : "medium"}
                      reviewerEmail={term.ownerEmail}
                      sourceHref="/admin/research"
                      dueDate={term.reviewDate}
                      payloadSnapshot={{
                        taxonomyTermId: term.id,
                        taxonomyType: term.taxonomyType,
                        status: term.status,
                        sourceKeys: term.sourceKeys,
                      }}
                      label="Request review"
                      busyLabel="Requesting..."
                      successLabel="Queued"
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-text-primary transition hover:bg-white/10 disabled:opacity-40"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-text-primary">
                {editingId ? "Edit taxonomy term" : "Create taxonomy term"}
              </h4>
              <p className="mt-1 text-xs text-text-muted">
                Use this to convert recurring research patterns into owned, reviewable labels.
              </p>
            </div>
            {editingId && (
              <button
                onClick={() => {
                  setEditingId(null);
                  setForm(toFormState());
                }}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-text-primary transition hover:bg-white/10"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="mt-4 grid gap-4">
            <Field label="Label">
              <input
                value={form.label}
                onChange={(event) =>
                  setForm((current) => ({ ...current, label: event.target.value }))
                }
                className={INPUT_CLASS}
                placeholder="High-intent repair seekers"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type">
                <select
                  value={form.taxonomyType}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      taxonomyType: event.target.value as ResearchTaxonomyType,
                    }))
                  }
                  className={INPUT_CLASS}
                >
                  <option value="intent">intent</option>
                  <option value="motivation">motivation</option>
                  <option value="theme">theme</option>
                </select>
              </Field>
              <Field label="Status">
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as ResearchTaxonomyStatus,
                    }))
                  }
                  className={INPUT_CLASS}
                >
                  <option value="draft">draft</option>
                  <option value="active">active</option>
                  <option value="deprecated">deprecated</option>
                </select>
              </Field>
            </div>

            <Field label="Description">
              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                className={`${INPUT_CLASS} min-h-24`}
                placeholder="What stable user intent or motivation does this label represent?"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Owner Email">
                <input
                  type="email"
                  value={form.ownerEmail}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, ownerEmail: event.target.value }))
                  }
                  className={INPUT_CLASS}
                  placeholder="owner@loveiq.com"
                />
              </Field>
              <Field label="Review Date">
                <input
                  type="date"
                  value={form.reviewDate}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, reviewDate: event.target.value }))
                  }
                  className={INPUT_CLASS}
                />
              </Field>
            </div>

            <Field label="Linked Question IDs">
              <input
                value={form.linkedQuestionIdsText}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    linkedQuestionIdsText: event.target.value,
                  }))
                }
                className={INPUT_CLASS}
                placeholder="01002, 02001, 16013"
              />
            </Field>

            <Field label="Example Terms">
              <input
                value={form.exampleTermsText}
                onChange={(event) =>
                  setForm((current) => ({ ...current, exampleTermsText: event.target.value }))
                }
                className={INPUT_CLASS}
                placeholder="repair, reconnect, rebuild trust"
              />
            </Field>

            <Field label="Source Keys">
              <input
                value={form.sourceKeysText}
                onChange={(event) =>
                  setForm((current) => ({ ...current, sourceKeysText: event.target.value }))
                }
                className={INPUT_CLASS}
                placeholder="theme-repair, unknown-soft-quit"
              />
            </Field>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={() => void submitForm()}
              disabled={saving || !form.label.trim()}
              className="rounded-lg bg-accent-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-purple/80 disabled:opacity-40"
            >
              {saving ? "Saving..." : editingId ? "Save term" : "Create term"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

const INPUT_CLASS =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-white/20 focus:outline-none";

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-text-primary">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-text-muted">{label}</label>
      {children}
    </div>
  );
}
