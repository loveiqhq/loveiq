"use client";

export interface MultiSelectOption {
  label: string;
  count?: number;
}

interface MultiSelectProps {
  title: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}

/**
 * Lightweight checkbox-dropdown built on native <details> — no portal /
 * click-outside handling needed (closing is the browser's job). Used by the
 * Data Explorer filter panel; values are the already-normalized facet labels.
 */
export default function MultiSelect({ title, options, selected, onChange }: MultiSelectProps) {
  const toggle = (label: string) => {
    onChange(selected.includes(label) ? selected.filter((s) => s !== label) : [...selected, label]);
  };

  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary [&::-webkit-details-marker]:hidden">
        <span className="truncate">
          {title}
          {selected.length > 0 && (
            <span className="ml-1 rounded-full bg-accent-purple/20 px-1.5 py-0.5 text-[10px] font-semibold text-accent-purple">
              {selected.length}
            </span>
          )}
        </span>
        <svg
          className="h-4 w-4 shrink-0 text-text-muted transition group-open:rotate-180"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      <div className="absolute z-30 mt-1 max-h-64 w-64 overflow-auto rounded-lg border border-white/10 bg-[#1a1025] p-1.5 shadow-xl">
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="mb-1 w-full rounded px-2 py-1 text-left text-xs text-text-muted hover:bg-white/5 hover:text-text-primary"
          >
            Clear selection
          </button>
        )}
        {options.length === 0 && <p className="px-2 py-1.5 text-xs text-text-muted">No values</p>}
        {options.map((opt) => (
          <label
            key={opt.label}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-text-primary hover:bg-white/5"
          >
            <input
              type="checkbox"
              checked={selected.includes(opt.label)}
              onChange={() => toggle(opt.label)}
              className="h-3.5 w-3.5 accent-accent-purple"
            />
            <span className="flex-1 truncate">{opt.label}</span>
            {typeof opt.count === "number" && (
              <span className="text-[10px] text-text-muted">{opt.count}</span>
            )}
          </label>
        ))}
      </div>
    </details>
  );
}
