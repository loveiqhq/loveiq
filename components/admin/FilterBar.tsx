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

interface FilterBarProps {
  onFilterChange: (filters: {
    status: string;
    email: string;
    archetype: string;
    dateFrom: string;
    dateTo: string;
  }) => void;
}

export default function FilterBar({ onFilterChange }: FilterBarProps) {
  const [status, setStatus] = useState("");
  const [email, setEmail] = useState("");
  const [archetype, setArchetype] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Debounce email search
  useEffect(() => {
    const timer = setTimeout(() => {
      onFilterChange({ status, email, archetype, dateFrom, dateTo });
    }, 300);
    return () => clearTimeout(timer);
  }, [status, email, archetype, dateFrom, dateTo, onFilterChange]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary outline-none"
        aria-label="Filter by status"
      >
        <option value="">All statuses</option>
        <option value="completed">Completed</option>
        <option value="flagged">Flagged</option>
        <option value="archived">Archived</option>
      </select>

      <select
        value={archetype}
        onChange={(e) => setArchetype(e.target.value)}
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary outline-none"
        aria-label="Filter by archetype"
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
        placeholder="Search email..."
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none"
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
    </div>
  );
}
