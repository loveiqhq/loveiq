"use client";

import { useState, useEffect } from "react";

interface FilterBarProps {
  onFilterChange: (filters: {
    status: string;
    email: string;
    dateFrom: string;
    dateTo: string;
  }) => void;
}

export default function FilterBar({ onFilterChange }: FilterBarProps) {
  const [status, setStatus] = useState("");
  const [email, setEmail] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Debounce email search
  useEffect(() => {
    const timer = setTimeout(() => {
      onFilterChange({ status, email, dateFrom, dateTo });
    }, 300);
    return () => clearTimeout(timer);
  }, [status, email, dateFrom, dateTo, onFilterChange]);

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
