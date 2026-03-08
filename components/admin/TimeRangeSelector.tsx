"use client";

interface TimeRangeSelectorProps {
  value: number;
  onChange: (days: number) => void;
}

const options = [
  { days: 1, label: "1d" },
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
  { days: 365, label: "1y" },
  { days: 0, label: "All" },
];

export default function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  return (
    <div className="flex gap-1 rounded-lg bg-white/5 p-1">
      {options.map((option) => (
        <button
          key={option.days}
          onClick={() => onChange(option.days)}
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
