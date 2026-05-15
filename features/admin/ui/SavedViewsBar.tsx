"use client";

import { useState } from "react";
import { useAdminFetch } from "./hooks/useAdminFetch";
import { getCsrfToken } from "@shared/http/csrf-client";

interface Filters {
  status: string;
  email: string;
  archetype: string;
  dateFrom: string;
  dateTo: string;
}

interface SavedView {
  id: number;
  name: string;
  filters: Filters;
  admin_email: string;
  is_shared: boolean;
}

interface ViewsData {
  views: SavedView[];
}

interface SavedViewsBarProps {
  filters: Filters;
  onApplyView: (filters: Filters) => void;
}

export default function SavedViewsBar({ filters, onApplyView }: SavedViewsBarProps) {
  const { data, refetch } = useAdminFetch<ViewsData>("/api/admin/views");
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeViewId, setActiveViewId] = useState<number | null>(null);

  async function handleSave() {
    if (!saveName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/views", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({ name: saveName.trim(), filters }),
      });
      if (res.ok) {
        setSaveName("");
        setShowSave(false);
        refetch();
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(viewId: number) {
    try {
      await fetch(`/api/admin/views/${viewId}`, {
        method: "DELETE",
        headers: { "x-csrf-token": getCsrfToken() },
      });
      if (activeViewId === viewId) setActiveViewId(null);
      refetch();
    } catch {
      // silent
    }
  }

  function applyView(view: SavedView) {
    setActiveViewId(view.id);
    onApplyView(view.filters);
  }

  const views = data?.views || [];
  if (views.length === 0 && !showSave) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowSave(true)}
          className="rounded-lg border border-dashed border-white/10 px-3 py-1.5 text-xs text-text-muted transition hover:border-white/20 hover:text-text-primary"
        >
          + Save current filters
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {views.map((view) => (
        <div
          key={view.id}
          className={`group flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
            activeViewId === view.id
              ? "border-accent-purple/40 bg-accent-purple/10 text-accent-purple"
              : "border-white/10 text-text-muted hover:border-white/20 hover:text-text-primary"
          }`}
        >
          <button onClick={() => applyView(view)} className="outline-none">
            {view.name}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(view.id);
            }}
            className="ml-1 hidden text-text-muted transition hover:text-red-400 group-hover:inline"
            aria-label={`Delete view ${view.name}`}
          >
            x
          </button>
        </div>
      ))}

      {showSave ? (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="View name..."
            className="w-32 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-text-primary placeholder:text-text-muted outline-none"
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            autoFocus
          />
          <button
            onClick={handleSave}
            disabled={saving || !saveName.trim()}
            className="rounded px-2 py-1 text-xs text-accent-purple transition hover:bg-accent-purple/10 disabled:opacity-40"
          >
            Save
          </button>
          <button
            onClick={() => {
              setShowSave(false);
              setSaveName("");
            }}
            className="rounded px-2 py-1 text-xs text-text-muted transition hover:bg-white/5"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowSave(true)}
          className="rounded-full border border-dashed border-white/10 px-3 py-1 text-xs text-text-muted transition hover:border-white/20 hover:text-text-primary"
        >
          + Save
        </button>
      )}
    </div>
  );
}
