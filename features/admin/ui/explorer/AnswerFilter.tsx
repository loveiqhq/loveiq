"use client";

import { useEffect, useState } from "react";
import MultiSelect from "@features/admin/ui/MultiSelect";
import {
  ANSWER_QUESTIONS,
  ANSWER_QUESTION_BY_ID,
  type AnswerFilterValue,
} from "@features/admin/ui/explorer/dimensions";

export type { AnswerFilterValue };

const MAX_FILTERS = 5;

interface Props {
  filters: AnswerFilterValue[];
  onChange: (next: AnswerFilterValue[]) => void;
}

export default function AnswerFilter({ filters, onChange }: Props) {
  // A just-added question has no values yet. Empty filters don't survive URL
  // encoding (encodeAnswers drops them), so track them locally until the user
  // picks values — then commit to the parent (URL) via onChange.
  const [pending, setPending] = useState<string[]>([]);

  // When filters are cleared externally (e.g. the global "Reset filters" button
  // or back-nav to an empty URL), drop any uncommitted pending rows so they
  // don't linger as un-resettable zombies.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset of local pending rows when filters clear externally
    if (filters.length === 0) setPending([]);
  }, [filters]);

  const committed = new Set(filters.map((f) => f.qId));
  const pendingRows = pending.filter((qId) => !committed.has(qId));
  const used = new Set<string>([...committed, ...pendingRows]);
  const available = ANSWER_QUESTIONS.filter((q) => !used.has(q.qId));
  const totalRows = filters.length + pendingRows.length;

  const updateCommitted = (qId: string, values: string[]) => {
    if (values.length === 0) onChange(filters.filter((f) => f.qId !== qId));
    else onChange(filters.map((f) => (f.qId === qId ? { ...f, values } : f)));
  };
  const removeCommitted = (qId: string) => onChange(filters.filter((f) => f.qId !== qId));
  const commitPending = (qId: string, values: string[]) => {
    if (values.length === 0) return;
    setPending((p) => p.filter((x) => x !== qId));
    onChange([...filters, { qId, values }]);
  };
  const removePending = (qId: string) => setPending((p) => p.filter((x) => x !== qId));
  const add = (qId: string) => {
    if (!qId || used.has(qId) || totalRows >= MAX_FILTERS) return;
    setPending((p) => [...p, qId]);
  };

  const renderRow = (
    qId: string,
    values: string[],
    onValues: (v: string[]) => void,
    onRemove: () => void
  ) => {
    const q = ANSWER_QUESTION_BY_ID.get(qId);
    if (!q) return null;
    return (
      <div key={qId} className="flex items-center gap-2">
        <span className="flex-1 truncate text-sm text-text-primary" title={q.label}>
          {q.label}
        </span>
        <div className="w-56 shrink-0">
          <MultiSelect
            title="Answers"
            options={q.options.map((o) => ({ label: o }))}
            selected={values}
            onChange={onValues}
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${q.label} filter`}
          className="rounded-lg border border-white/10 px-2 py-1 text-xs text-text-muted hover:text-red-400"
        >
          ✕
        </button>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-white/10 bg-surface p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        Filter by survey answer
      </p>
      <div className="space-y-2">
        {filters.map((f) =>
          renderRow(
            f.qId,
            f.values,
            (v) => updateCommitted(f.qId, v),
            () => removeCommitted(f.qId)
          )
        )}
        {pendingRows.map((qId) =>
          renderRow(
            qId,
            [],
            (v) => commitPending(qId, v),
            () => removePending(qId)
          )
        )}
      </div>
      {available.length > 0 && totalRows < MAX_FILTERS && (
        <select
          value=""
          onChange={(e) => add(e.target.value)}
          className="mt-2 w-full rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-muted outline-none"
        >
          <option value="">+ Add a survey-answer filter…</option>
          {available.map((q) => (
            <option key={q.qId} value={q.qId}>
              {q.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
