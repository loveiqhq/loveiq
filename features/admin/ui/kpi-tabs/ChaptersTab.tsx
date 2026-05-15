"use client";

import { useMemo } from "react";
import type { ChapterKpi } from "@/data/product-kpis";
import KpiDataTable, { type Column } from "./KpiDataTable";
import BarChart from "@features/admin/ui/BarChart";

const fmt = (v: unknown) => (v == null ? "—" : String(v));
const fmtPct = (v: unknown) => (v == null ? "—" : `${Number(v).toFixed(1)}%`);
const fmtTime = (v: unknown) => (v == null ? "—" : `${v}s`);
const fmtFriction = (v: unknown) => (v == null ? "—" : (v as number).toFixed(2));

const columns: Column<ChapterKpi>[] = [
  { key: "cId", label: "C_ID", align: "right" },
  { key: "chapterName", label: "Chapter" },
  { key: "numQsIys", label: "# Qs", align: "right", format: fmt },
  { key: "entryN", label: "Entry", align: "right", format: fmt },
  { key: "completionPct", label: "Completion%", align: "right", format: fmtPct },
  { key: "dropoffPct", label: "Dropoff%", align: "right", format: fmtPct },
  { key: "timePerEntryS", label: "Time/Entry", align: "right", format: fmtTime },
  { key: "frictionIndex", label: "Friction", align: "right", format: fmtFriction },
];

interface Props {
  data: ChapterKpi[];
}

export default function ChaptersTab({ data }: Props) {
  const withData = useMemo(() => data.filter((c) => c.entryN != null), [data]);
  const withoutData = useMemo(() => data.filter((c) => c.entryN == null), [data]);

  const completionItems = useMemo(
    () =>
      withData.map((c) => ({
        label: `Ch ${c.cId}`,
        value: Math.round(c.completionPct ?? 0),
      })),
    [withData]
  );

  const frictionItems = useMemo(
    () =>
      [...withData]
        .sort((a, b) => (b.frictionIndex ?? 0) - (a.frictionIndex ?? 0))
        .map((c) => ({
          label: `${c.cId}. ${c.chapterName.slice(0, 30)}`,
          value: Number((c.frictionIndex ?? 0).toFixed(2)),
        })),
    [withData]
  );

  return (
    <div className="space-y-6">
      <KpiDataTable data={data} columns={columns} defaultSortKey="cId" />

      {withoutData.length > 0 && (
        <p className="text-xs text-text-muted">
          Chapters without data (not yet in IYS):{" "}
          {withoutData.map((c) => `${c.cId} (${c.chapterName})`).join(", ")}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-muted">Completion % by Chapter</h3>
          <BarChart items={completionItems} direction="vertical" maxHeight={220} />
        </div>
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-muted">Friction by Chapter</h3>
          <BarChart items={frictionItems} direction="horizontal" />
        </div>
      </div>
    </div>
  );
}
