"use client";

import TimeRangeSelector from "@features/admin/ui/TimeRangeSelector";

const ARCHETYPES = [
  "Spark Seeker",
  "Sensual Connector",
  "Radiant Performer",
  "Explorer of Edges",
  "Curious Apprentice",
  "Quiet Withdrawer",
  "Romantic Idealist",
  "Authority Conductor",
  "Fluid Adventurer",
  "Mindful Balancer",
  "Healing Journeyer",
  "Intimate Technician",
  "Nurturing Caregiver",
  "Erotic Intellectual",
];

interface AnswerFilterBarProps {
  days: number;
  archetype: string;
  utm: string;
  onDaysChange: (d: number) => void;
  onArchetypeChange: (a: string) => void;
  onUtmChange: (u: string) => void;
}

export default function AnswerFilterBar({
  days,
  archetype,
  utm,
  onDaysChange,
  onArchetypeChange,
  onUtmChange,
}: AnswerFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <TimeRangeSelector value={days} onChange={onDaysChange} />

      <select
        value={archetype}
        onChange={(e) => onArchetypeChange(e.target.value)}
        aria-label="Filter by archetype"
        className="rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary outline-none transition hover:border-white/20 focus:border-accent-purple"
      >
        <option value="">All archetypes</option>
        {ARCHETYPES.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>

      <input
        type="text"
        value={utm}
        onChange={(e) => onUtmChange(e.target.value)}
        placeholder="UTM source..."
        aria-label="Filter by UTM source"
        className="rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none transition hover:border-white/20 focus:border-accent-purple"
      />
    </div>
  );
}
