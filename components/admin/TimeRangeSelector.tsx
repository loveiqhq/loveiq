"use client";

export interface TimeRangeOption {
  days: number;
  label: string;
  ariaLabel: string;
}

interface TimeRangeSelectorProps {
  value: number;
  onChange: (days: number) => void;
  options?: readonly TimeRangeOption[];
}

const defaultOptions: TimeRangeOption[] = [
  { days: 1, label: "1d", ariaLabel: "Last 1 day" },
  { days: 7, label: "7d", ariaLabel: "Last 7 days" },
  { days: 30, label: "30d", ariaLabel: "Last 30 days" },
  { days: 90, label: "90d", ariaLabel: "Last 90 days" },
  { days: 365, label: "1y", ariaLabel: "Last 1 year" },
  { days: 0, label: "All", ariaLabel: "All time" },
];

export default function TimeRangeSelector({
  value,
  onChange,
  options = defaultOptions,
}: TimeRangeSelectorProps) {
  return (
    <div className="flex gap-1 rounded-lg bg-white/5 p-1">
      {options.map((option) => (
        <button
          key={`${option.days}-${option.label}`}
          type="button"
          onClick={() => onChange(option.days)}
          aria-label={option.ariaLabel}
          aria-pressed={value === option.days}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
            value === option.days
              ? "bg-white/10 text-text-primary"
              : "text-text-muted hover:text-text-primary"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
