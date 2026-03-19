"use client";

import { useMemo } from "react";
import type { QuestionKpi } from "@/data/product-kpis";
import KpiDataTable, { type Column } from "./KpiDataTable";
import BarChart from "@/components/admin/BarChart";

const fmt = (v: unknown) => (v == null ? "—" : String(v));
const fmtPct = (v: unknown) => (v == null ? "—" : `${v}%`);
const fmtTime = (v: unknown) => (v == null ? "—" : `${v}s`);
const fmtFriction = (v: unknown) => (v == null ? "—" : (v as number).toFixed(2));
const fmtQuestion = (v: unknown) => {
  const s = String(v ?? "");
  return s.length > 60 ? s.slice(0, 57) + "..." : s;
};

const columns: Column<QuestionKpi>[] = [
  { key: "qId", label: "Q_ID" },
  { key: "cId", label: "Ch", align: "right" },
  { key: "question", label: "Question", format: fmtQuestion, sortable: false },
  { key: "reachN", label: "Reach", align: "right", format: fmt },
  { key: "dropoffPct", label: "Dropoff%", align: "right", format: fmtPct },
  { key: "avgActiveTimeS", label: "Avg Time", align: "right", format: fmtTime },
  { key: "backtrackPct", label: "Backtrack%", align: "right", format: fmtPct },
  { key: "guidanceTooltipOpenPct", label: "Tooltip%", align: "right", format: fmtPct },
  { key: "errorPct", label: "Error%", align: "right", format: fmtPct },
  { key: "frictionIndex", label: "Friction", align: "right", format: fmtFriction },
];

interface Props {
  data: QuestionKpi[];
  selectedChapter: string;
  onChapterChange: (chapter: string) => void;
}

export default function QuestionsTab({ data, selectedChapter, onChapterChange }: Props) {
  const chapterIds = useMemo(() => {
    const ids = [...new Set(data.map((q) => q.cId))];
    ids.sort((a, b) => Number(a) - Number(b));
    return ids;
  }, [data]);

  const filtered = useMemo(
    () => (selectedChapter === "all" ? data : data.filter((q) => q.cId === selectedChapter)),
    [data, selectedChapter]
  );

  const funnelItems = useMemo(
    () => filtered.map((q) => ({ label: q.qId, value: q.reachN ?? 0 })),
    [filtered]
  );

  const topFriction = useMemo(
    () =>
      [...data]
        .filter((q) => q.frictionIndex != null)
        .sort((a, b) => (b.frictionIndex ?? 0) - (a.frictionIndex ?? 0))
        .slice(0, 15)
        .map((q) => ({
          label: `${q.qId}: ${q.question.slice(0, 30)}`,
          value: Number((q.frictionIndex ?? 0).toFixed(2)),
        })),
    [data]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <label htmlFor="chapter-filter" className="text-sm text-text-muted">
          Chapter:
        </label>
        <select
          id="chapter-filter"
          value={selectedChapter}
          onChange={(e) => onChapterChange(e.target.value)}
          className="rounded-lg border border-white/10 bg-surface px-3 py-1.5 text-sm text-text-primary"
        >
          <option value="all">All chapters</option>
          {chapterIds.map((id) => (
            <option key={id} value={id}>
              Chapter {id}
            </option>
          ))}
        </select>
      </div>

      <KpiDataTable data={filtered} columns={columns} defaultSortKey="qId" />

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-medium text-text-muted">
          Reach Funnel{selectedChapter !== "all" ? ` (Ch ${selectedChapter})` : ""}
        </h3>
        <BarChart items={funnelItems} direction="vertical" maxHeight={220} />
      </div>
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-medium text-text-muted">Top 15 Friction Questions</h3>
        <BarChart items={topFriction} direction="horizontal" />
      </div>
    </div>
  );
}
