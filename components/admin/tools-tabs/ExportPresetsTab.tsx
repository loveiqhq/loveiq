"use client";

import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import { getCsrfToken } from "@/lib/csrf-client";
import { maskEmail } from "@/lib/admin/format";

interface ExportPreset {
  id: number;
  name: string;
  config: { filters: Record<string, string> };
  admin_email: string;
  is_shared: boolean;
  created_at: string;
}

interface PresetsData {
  presets: ExportPreset[];
}

export default function ExportPresetsTab() {
  const { data, loading, error, refetch } = useAdminFetch<PresetsData>("/api/admin/export-presets");

  async function handleDelete(presetId: number) {
    try {
      await fetch(`/api/admin/export-presets/${presetId}`, {
        method: "DELETE",
        headers: { "x-csrf-token": getCsrfToken() },
      });
      refetch();
    } catch {
      // silent
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
        {error}
      </div>
    );
  }

  const presets = data?.presets || [];

  if (presets.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-text-muted">
        No export presets saved yet. Create presets from the Submissions page.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-surface">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-text-muted">
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Filters</th>
            <th className="px-4 py-3 font-medium">Created by</th>
            <th className="px-4 py-3 font-medium">Created</th>
            <th className="px-4 py-3 font-medium" />
          </tr>
        </thead>
        <tbody>
          {presets.map((preset) => {
            const activeFilters = Object.entries(preset.config.filters || {})
              .filter(([, v]) => v)
              .map(([k, v]) => `${k}: ${v}`);
            return (
              <tr key={preset.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="px-4 py-3 text-text-primary">{preset.name}</td>
                <td className="px-4 py-3 text-text-muted">
                  {activeFilters.length > 0 ? activeFilters.join(", ") : "No filters"}
                </td>
                <td className="px-4 py-3 text-text-muted">{maskEmail(preset.admin_email)}</td>
                <td className="px-4 py-3 text-text-muted">
                  {new Date(preset.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleDelete(preset.id)}
                    className="text-xs text-red-400/70 transition hover:text-red-400"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
