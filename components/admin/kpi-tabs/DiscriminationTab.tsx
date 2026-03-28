"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import KpiDataTable from "./KpiDataTable";
import type { Column } from "./KpiDataTable";
import { surveyQuestions } from "@/data/survey-data";

interface DiscriminationItem {
  q_id: string;
  n_responses: number;
  discrimination_index: number;
}

interface DiscriminationData {
  questions: DiscriminationItem[];
}

function fmtIndex(val: unknown): string {
  if (val === null || val === undefined) return "—";
  const n = Number(val);
  if (isNaN(n)) return "—";
  return n.toFixed(3);
}

function colorIndex(val: unknown): string {
  const n = Number(val);
  if (isNaN(n)) return "";
  if (n >= 0.3) return "color:#4ade80";
  if (n >= 0.1) return "color:#facc15";
  return "color:#f87171";
}

export default function DiscriminationTab({ days }: { days: number }) {
  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (days > 0) p.days = String(days);
    return p;
  }, [days]);

  const { data, loading, error } = useAdminFetch<DiscriminationData>(
    "/api/admin/product-kpis/discrimination",
    params
  );

  const questionMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const q of surveyQuestions) {
      m.set(q.qId, q.question);
    }
    return m;
  }, []);

  const rows = useMemo(() => {
    if (!data?.questions) return [];
    return data.questions.map((q) => ({
      ...q,
      question_text: questionMap.get(q.q_id) || q.q_id,
    }));
  }, [data, questionMap]);

  const columns: Column<Record<string, any>>[] = [
    { key: "q_id", label: "qId", sortable: true },
    {
      key: "question_text",
      label: "Question",
      format: (v) => {
        const s = String(v);
        return s.length > 60 ? s.slice(0, 60) + "..." : s;
      },
    },
    {
      key: "discrimination_index",
      label: "Discrimination Index",
      align: "right",
      sortable: true,
      format: (v) => {
        const str = fmtIndex(v);
        const style = colorIndex(v);
        return style ? `<span style="${style}">${str}</span>` : str;
      },
    },
    {
      key: "n_responses",
      label: "Responses",
      align: "right",
      sortable: true,
    },
  ];

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

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-surface p-4">
        <p className="text-sm text-text-muted">
          <strong className="text-text-primary">Discrimination Index (eta-squared)</strong> measures
          how well each scale question differentiates between archetypes. Higher values (green,
          &gt;0.3) mean the question strongly distinguishes archetypes. Low values (red, &lt;0.1)
          suggest the question doesn&apos;t contribute much to archetype differentiation.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-muted">
          Not enough scored data for analysis.
        </p>
      ) : (
        <KpiDataTable
          data={rows}
          columns={columns}
          defaultSortKey="discrimination_index"
          defaultSortDir="desc"
        />
      )}
    </div>
  );
}
