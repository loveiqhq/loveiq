"use client";

import { useState, useEffect } from "react";

const ARCHETYPES = [
  "Spark Seeker",
  "Sensual Connector",
  "Exhibitionist Performer",
  "Explorer of Edges",
  "Curious Apprentice",
  "Quiet Withdrawer",
  "Romantic Idealist",
  "Power Orchestrator",
  "Fluid Adventurer",
  "Mindful Balancer",
  "Healing Journeyer",
  "Intimate Technician",
  "Nurturing Caregiver",
  "Erotic Intellectual",
] as const;

interface Filters {
  status: string;
  email: string;
  archetype: string;
  dateFrom: string;
  dateTo: string;
  testOnly: boolean;
}

interface FilterBarProps {
  onFilterChange: (filters: Filters) => void;
  initialFilters?: Filters;
}

export default function FilterBar({ onFilterChange, initialFilters }: FilterBarProps) {
  const [status, setStatus] = useState(initialFilters?.status || "");
  const [email, setEmail] = useState(initialFilters?.email || "");
  const [archetype, setArchetype] = useState(initialFilters?.archetype || "");
  const [dateFrom, setDateFrom] = useState(initialFilters?.dateFrom || "");
  const [dateTo, setDateTo] = useState(initialFilters?.dateTo || "");
  const [testOnly, setTestOnly] = useState(initialFilters?.testOnly ?? false);

  // Debounce text-search; non-text filters propagate immediately on change
  // anyway because they share this effect (cheap to debounce all of them).
  useEffect(() => {
    const timer = setTimeout(() => {
      onFilterChange({ status, email, archetype, dateFrom, dateTo, testOnly });
    }, 300);
    return () => clearTimeout(timer);
  }, [status, email, archetype, dateFrom, dateTo, testOnly, onFilterChange]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
        aria-label="Filter by status"
      >
        <option value="" className="bg-[#1a1025] text-gray-200">
          All statuses
        </option>
        <option value="completed" className="bg-[#1a1025] text-gray-200">
          Completed
        </option>
        <option value="pending_completion" className="bg-[#1a1025] text-gray-200">
          Pending Completion
        </option>
        <option value="partial" className="bg-[#1a1025] text-gray-200">
          Partial
        </option>
        <option value="flagged" className="bg-[#1a1025] text-gray-200">
          Flagged
        </option>
        <option value="archived" className="bg-[#1a1025] text-gray-200">
          Archived
        </option>
      </select>

      <select
        value={archetype}
        onChange={(e) => setArchetype(e.target.value)}
        className="rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-sm text-text-primary outline-none"
        aria-label="Filter by archetype"
      >
        <option value="" className="bg-[#1a1025] text-gray-200">
          All archetypes
        </option>
        {ARCHETYPES.map((a) => (
          <option key={a} value={a} className="bg-[#1a1025] text-gray-200">
            {a}
          </option>
        ))}
      </select>

      <input
        type="text"
        placeholder="Search email, name, or ID…"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="min-w-[260px] rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none"
        aria-label="Search by email, name, or submission ID"
      />

      <input
        type="date"
        value={dateFrom}
        onChange={(e) => setDateFrom(e.target.value)}
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary outline-none"
        aria-label="From date"
      />

      <input
        type="date"
        value={dateTo}
        onChange={(e) => setDateTo(e.target.value)}
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary outline-none"
        aria-label="To date"
      />

      <label
        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition ${
          testOnly
            ? "border-red-500/40 bg-red-500/10 text-red-300"
            : "border-white/10 bg-white/5 text-text-muted hover:bg-white/10"
        }`}
      >
        <input
          type="checkbox"
          checked={testOnly}
          onChange={(e) => setTestOnly(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-white/20 bg-transparent accent-red-500"
        />
        Test only
      </label>
    </div>
  );
}
