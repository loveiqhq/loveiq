"use client";

import { useEffect, useState } from "react";
import type { ArchMatchValue } from "@features/admin/ui/explorer/dimensions";

export type { ArchMatchValue };

const MAX_CLAUSES = 3;

/**
 * One archetype-match row. The slider tracks a LOCAL draft and only commits to
 * the parent (URL → refetch) on release — dragging it must not fire a request
 * per tick (the admin explorer is rate-limited).
 */
function ClauseRow({
  clause,
  onCommit,
  onRemove,
}: {
  clause: ArchMatchValue;
  onCommit: (min: number) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(clause.min);
  // Keep the draft in sync if the committed value changes externally (reset, URL nav).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync local slider draft to the committed prop
    setDraft(clause.min);
  }, [clause.min]);

  const commit = () => {
    if (draft !== clause.min) onCommit(draft);
  };

  return (
    <div className="flex items-center gap-3">
      <span className="flex-1 truncate text-sm text-text-primary" title={clause.archetype}>
        {clause.archetype}
      </span>
      <div className="flex w-56 shrink-0 items-center gap-2">
        <span className="text-xs text-text-muted">≥</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={draft}
          onChange={(e) => setDraft(Number(e.target.value))}
          onMouseUp={commit}
          onTouchEnd={commit}
          onKeyUp={commit}
          className="flex-1 accent-accent-purple"
          aria-label={`Minimum match for ${clause.archetype}`}
        />
        <span className="w-10 text-right text-xs tabular-nums text-text-primary">{draft}%</span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${clause.archetype} match filter`}
        className="rounded-lg border border-white/10 px-2 py-1 text-xs text-text-muted hover:text-red-400"
      >
        ✕
      </button>
    </div>
  );
}

interface Props {
  value: ArchMatchValue[];
  /** Archetype names to choose from (from the response's archetype distribution). */
  options: string[];
  onChange: (next: ArchMatchValue[]) => void;
}

/**
 * Filter the cohort to people who strongly match a given archetype — even when
 * it isn't their primary. Each row is "matches <archetype> at ≥ <min>%". AND
 * semantics across rows. Mirrors the AnswerFilter pattern.
 */
export default function ArchetypeMatchFilter({ value, options, onChange }: Props) {
  const used = new Set(value.map((c) => c.archetype));
  const available = options.filter((o) => !used.has(o));

  const add = (archetype: string) => {
    if (!archetype || used.has(archetype) || value.length >= MAX_CLAUSES) return;
    onChange([...value, { archetype, min: 50 }]);
  };
  const setMin = (archetype: string, min: number) =>
    onChange(value.map((c) => (c.archetype === archetype ? { ...c, min } : c)));
  const remove = (archetype: string) => onChange(value.filter((c) => c.archetype !== archetype));

  // Nothing to offer yet (no scored data) and nothing selected — hide entirely.
  if (options.length === 0 && value.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-surface p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        Filter by archetype match
      </p>
      <div className="space-y-2">
        {value.map((c) => (
          <ClauseRow
            key={c.archetype}
            clause={c}
            onCommit={(min) => setMin(c.archetype, min)}
            onRemove={() => remove(c.archetype)}
          />
        ))}
      </div>
      {available.length > 0 && value.length < MAX_CLAUSES && (
        <select
          value=""
          onChange={(e) => add(e.target.value)}
          className="mt-2 w-full rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-muted outline-none"
        >
          <option value="">+ Add an archetype-match filter…</option>
          {available.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
