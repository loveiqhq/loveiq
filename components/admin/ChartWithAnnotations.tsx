"use client";

import { useState, type ReactNode } from "react";
import { useAdminFetch } from "./hooks/useAdminFetch";
import { getCsrfToken } from "@/lib/csrf-client";

interface Annotation {
  id: number;
  annotation_date: string;
  note: string;
  admin_email: string;
}

interface AnnotationsData {
  annotations: Annotation[];
}

interface ChartWithAnnotationsProps {
  chartKey: string;
  dates: string[];
  children: ReactNode;
}

export default function ChartWithAnnotations({
  chartKey,
  dates,
  children,
}: ChartWithAnnotationsProps) {
  const { data, refetch } = useAdminFetch<AnnotationsData>(
    `/api/admin/annotations?chartKey=${encodeURIComponent(chartKey)}`
  );
  const [showAdd, setShowAdd] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const annotations = data?.annotations || [];

  // Map annotation dates to positions (percentage across the chart)
  const dateSet = new Set(dates);
  const annotationsWithPos = annotations
    .filter((a) => dateSet.has(a.annotation_date))
    .map((a) => ({
      ...a,
      position: (dates.indexOf(a.annotation_date) / Math.max(dates.length - 1, 1)) * 100,
    }));

  async function handleAdd() {
    if (!newDate || !newNote.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/annotations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({
          chart_key: chartKey,
          annotation_date: newDate,
          note: newNote.trim(),
        }),
      });
      if (res.ok) {
        setNewDate("");
        setNewNote("");
        setShowAdd(false);
        refetch();
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await fetch(`/api/admin/annotations/${id}`, {
        method: "DELETE",
        headers: { "x-csrf-token": getCsrfToken() },
      });
      refetch();
    } catch {
      // silent
    }
  }

  return (
    <div>
      {/* Chart with annotation overlay */}
      <div className="relative">
        {children}

        {/* Annotation markers */}
        {annotationsWithPos.map((a) => (
          <div
            key={a.id}
            className="absolute top-0 z-10"
            style={{ left: `${a.position}%`, height: "100%" }}
            onMouseEnter={() => setHoveredId(a.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <div className="h-full w-px bg-accent-orange/50" />
            <div className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-accent-orange" />

            {hoveredId === a.id && (
              <div className="absolute -top-2 left-3 z-50 w-48 rounded-lg border border-white/10 bg-[#1a1025] p-2 text-xs shadow-lg">
                <p className="font-medium text-text-primary">{a.annotation_date}</p>
                <p className="mt-1 text-text-muted">{a.note}</p>
                <button
                  onClick={() => handleDelete(a.id)}
                  className="mt-1 text-red-400/70 transition hover:text-red-400"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add annotation controls */}
      <div className="mt-2 flex items-center gap-2">
        {showAdd ? (
          <>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="rounded border border-white/10 bg-[#1a1025] px-2 py-1 text-xs text-text-primary outline-none"
            />
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Note..."
              className="flex-1 rounded border border-white/10 bg-[#1a1025] px-2 py-1 text-xs text-text-primary placeholder:text-text-muted outline-none"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <button
              onClick={handleAdd}
              disabled={saving || !newDate || !newNote.trim()}
              className="rounded px-2 py-1 text-xs text-accent-orange transition hover:bg-accent-orange/10 disabled:opacity-40"
            >
              Add
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="rounded px-2 py-1 text-xs text-text-muted transition hover:bg-white/5"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setShowAdd(true)}
            className="text-[10px] text-text-muted transition hover:text-text-primary"
          >
            + Add annotation
          </button>
        )}
      </div>
    </div>
  );
}
