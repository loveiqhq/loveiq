"use client";

interface TimeRangeSelectorProps {
  value: number;
  onChange: (days: number) => void;
}

const options = [7, 30];

export default function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  return (
    <div className="flex gap-1 rounded-lg bg-white/5 p-1">
      {options.map((days) => (
        <button
          key={days}
          onClick={() => onChange(days)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
            value === days
              ? "bg-white/10 text-text-primary"
              : "text-text-muted hover:text-text-primary"
          }`}
        >
          {days}d
        </button>
      ))}
    </div>
  );
}
