"use client";

import { useState } from "react";

interface ResponseListProps {
  responses: Array<{ id: number; text: string; archetype: string }>;
}

export default function ResponseList({ responses }: ResponseListProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const filtered = search
    ? responses.filter((r) => r.text.toLowerCase().includes(search.toLowerCase()))
    : responses;

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        placeholder="Search responses..."
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
      />

      <p className="text-xs text-text-muted">{filtered.length} responses</p>

      <div className="space-y-2">
        {paged.map((r) => (
          <div key={r.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-sm">
            <p className="text-text-primary">{r.text}</p>
            {r.archetype && <p className="mt-1 text-xs text-accent-purple">{r.archetype}</p>}
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-text-muted">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-text-muted transition hover:bg-white/5 disabled:opacity-30"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-text-muted transition hover:bg-white/5 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
