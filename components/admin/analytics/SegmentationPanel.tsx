"use client";

import BarChart from "@/components/admin/BarChart";

interface SegmentRow {
  label: string;
  count: number;
  pct: number;
}

interface SegmentationData {
  archetype: SegmentRow[];
  country: SegmentRow[];
  gender: SegmentRow[];
  age: SegmentRow[];
}

interface SegmentationPanelProps {
  completion: SegmentationData;
  paid: SegmentationData;
}

const DIMENSIONS: Array<{ key: keyof SegmentationData; label: string }> = [
  { key: "archetype", label: "Primary Archetype" },
  { key: "country", label: "Country" },
  { key: "gender", label: "Gender" },
  { key: "age", label: "Age bucket" },
];

function toBarItems(rows: SegmentRow[]): Array<{ label: string; value: number }> {
  return rows.map((r) => ({ label: `${r.label} (${r.pct.toFixed(1)}%)`, value: r.count }));
}

export default function SegmentationPanel({ completion, paid }: SegmentationPanelProps) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-text-muted">
        Side-by-side segmentation: who completes the survey vs. who pays. Gaps surface where
        targeting or messaging needs work — high completion but low paid % means a value or pricing
        issue, not an acquisition issue.
      </p>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {DIMENSIONS.map((dim) => (
          <div key={dim.key} className="rounded-xl border border-white/10 bg-surface p-5">
            <h3 className="font-serif text-base font-semibold text-text-primary">{dim.label}</h3>
            <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Completion
                </p>
                {completion[dim.key].length === 0 ? (
                  <p className="text-sm text-text-muted">—</p>
                ) : (
                  <BarChart items={toBarItems(completion[dim.key])} />
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Paid
                </p>
                {paid[dim.key].length === 0 ? (
                  <p className="text-sm text-text-muted">—</p>
                ) : (
                  <BarChart items={toBarItems(paid[dim.key])} />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
