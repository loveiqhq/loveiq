"use client";

import { useState } from "react";
import { getCsrfToken } from "@/lib/csrf-client";

interface BulkActionBarProps {
  selectedIds: Set<number>;
  onClear: () => void;
  onComplete: () => void;
}

export default function BulkActionBar({ selectedIds, onClear, onComplete }: BulkActionBarProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAction(action: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/submissions/bulk", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({ ids: Array.from(selectedIds), action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError((body as { error?: string } | null)?.error || "Action failed.");
        return;
      }
      onComplete();
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="sticky bottom-4 z-30 mx-auto w-fit rounded-xl border border-white/10 bg-surface px-5 py-3 shadow-lg shadow-black/40 backdrop-blur-sm">
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-text-primary">{selectedIds.size} selected</span>
        <div className="h-4 w-px bg-white/10" />
        <button
          onClick={() => handleAction("flagged")}
          disabled={loading}
          className="rounded-lg border border-yellow-500/20 px-3 py-1.5 text-xs font-medium text-yellow-400 transition hover:bg-yellow-500/10 disabled:opacity-40"
        >
          Flag
        </button>
        <button
          onClick={() => handleAction("archived")}
          disabled={loading}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-text-muted transition hover:bg-white/5 disabled:opacity-40"
        >
          Archive
        </button>
        <button
          onClick={() => handleAction("completed")}
          disabled={loading}
          className="rounded-lg border border-green-500/20 px-3 py-1.5 text-xs font-medium text-green-400 transition hover:bg-green-500/10 disabled:opacity-40"
        >
          Restore
        </button>
        {selectedIds.size === 2 && (
          <>
            <div className="h-4 w-px bg-white/10" />
            <a
              href={`/admin/submissions/compare?a=${Array.from(selectedIds)[0]}&b=${Array.from(selectedIds)[1]}`}
              className="rounded-lg border border-accent-purple/20 px-3 py-1.5 text-xs font-medium text-accent-purple transition hover:bg-accent-purple/10"
            >
              Compare
            </a>
          </>
        )}
        <div className="h-4 w-px bg-white/10" />
        <button
          onClick={onClear}
          disabled={loading}
          className="text-xs text-text-muted transition hover:text-text-primary disabled:opacity-40"
        >
          Deselect all
        </button>
        {loading && (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
