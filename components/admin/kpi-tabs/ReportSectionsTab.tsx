"use client";

import { useMemo } from "react";
import type { ReportSectionKpi } from "@/data/product-kpis";
import KpiDataTable, { type Column } from "./KpiDataTable";
import BarChart from "@/components/admin/BarChart";

const fmt = (v: unknown) => (v == null ? "—" : String(v));
const fmtPct = (v: unknown) => (v == null ? "—" : `${v}%`);
const fmtTime = (v: unknown) => (v == null ? "—" : `${v}s`);
const fmtFriction = (v: unknown) => (v == null ? "—" : (v as number).toFixed(2));

const columns: Column<ReportSectionKpi>[] = [
  { key: "index", label: "#", align: "right" },
  { key: "section", label: "Section" },
  { key: "reachN", label: "Reach", align: "right", format: fmt },
  { key: "dropoffPct", label: "Dropoff%", align: "right", format: fmtPct },
  { key: "avgActiveTimeS", label: "Avg Time", align: "right", format: fmtTime },
  { key: "scrollCompletePct", label: "Scroll%", align: "right", format: fmtPct },
  { key: "backtrackPct", label: "Backtrack%", align: "right", format: fmtPct },
  { key: "errorPct", label: "Error%", align: "right", format: fmtPct },
  { key: "frictionIndex", label: "Friction", align: "right", format: fmtFriction },
];

interface Props {
  data: ReportSectionKpi[];
}

export default function ReportSectionsTab({ data }: Props) {
  const funnelItems = useMemo(
    () => data.map((s) => ({ label: `S${s.index}`, value: s.reachN ?? 0 })),
    [data]
  );

  const frictionItems = useMemo(
    () =>
      [...data]
        .filter((s) => s.frictionIndex != null)
        .sort((a, b) => (b.frictionIndex ?? 0) - (a.frictionIndex ?? 0))
        .map((s) => ({
          label: `${s.index}. ${s.section}`,
          value: Number((s.frictionIndex ?? 0).toFixed(2)),
        })),
    [data]
  );

  return (
    <div className="space-y-8">
      <KpiDataTable data={data} columns={columns} defaultSortKey="index" />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-muted">Reach Funnel by Section</h3>
          <BarChart items={funnelItems} direction="vertical" maxHeight={220} />
        </div>
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-muted">Friction Index (sorted)</h3>
          <BarChart items={frictionItems} direction="horizontal" />
        </div>
      </div>
    </div>
  );
}
