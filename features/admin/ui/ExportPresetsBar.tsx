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

interface ExportPreset {
  id: number;
  name: string;
  config: { filters: Filters };
  admin_email: string;
}

interface PresetsData {
  presets: ExportPreset[];
}

interface ExportPresetsBarProps {
  filters: Filters;
  onApplyPreset: (filters: Filters) => void;
}

export default function ExportPresetsBar({ filters, onApplyPreset }: ExportPresetsBarProps) {
  const { data, refetch } = useAdminFetch<PresetsData>("/api/admin/export-presets");
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);

  async function handleSave() {
    if (!saveName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/export-presets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({ name: saveName.trim(), config: { filters } }),
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

  async function handleDelete(presetId: number) {
    try {
      await fetch(`/api/admin/export-presets/${presetId}`, {
        method: "DELETE",
        headers: { "x-csrf-token": getCsrfToken() },
      });
      if (activeId === presetId) setActiveId(null);
      refetch();
    } catch {
      // silent
    }
  }

  const presets = data?.presets || [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-text-muted">Export presets:</span>
      {presets.map((preset) => (
        <div
          key={preset.id}
          className={`group flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
            activeId === preset.id
              ? "border-accent-orange/40 bg-accent-orange/10 text-accent-orange"
              : "border-white/10 text-text-muted hover:border-white/20 hover:text-text-primary"
          }`}
        >
          <button
            onClick={() => {
              setActiveId(preset.id);
              onApplyPreset(preset.config.filters);
            }}
            className="outline-none"
          >
            {preset.name}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(preset.id);
            }}
            className="ml-1 hidden text-text-muted transition hover:text-red-400 group-hover:inline"
            aria-label={`Delete preset ${preset.name}`}
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
            placeholder="Preset name..."
            className="w-32 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-text-primary placeholder:text-text-muted outline-none"
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            autoFocus
          />
          <button
            onClick={handleSave}
            disabled={saving || !saveName.trim()}
            className="rounded px-2 py-1 text-xs text-accent-orange transition hover:bg-accent-orange/10 disabled:opacity-40"
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
          + Save preset
        </button>
      )}
    </div>
  );
}
