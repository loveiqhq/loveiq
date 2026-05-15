"use client";

interface Stage {
  name: string;
  count: number;
}

interface FunnelChartProps {
  stages: Stage[];
}

function formatStageName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const OPACITY_STEPS = [1, 0.8, 0.6, 0.4, 0.3, 0.2];

export default function FunnelChart({ stages }: FunnelChartProps) {
  if (stages.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-text-muted">No funnel data available.</div>
    );
  }

  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className="space-y-3">
      {stages.map((stage, idx) => {
        const widthPct = Math.max((stage.count / maxCount) * 100, 4);
        const opacity = OPACITY_STEPS[Math.min(idx, OPACITY_STEPS.length - 1)];
        const prevCount = idx > 0 ? stages[idx - 1]!.count : null;
        const dropOffPct =
          prevCount != null && prevCount > 0
            ? Math.round(((prevCount - stage.count) / prevCount) * 100)
            : null;

        return (
          <div key={stage.name}>
            {/* Drop-off indicator between stages */}
            {dropOffPct != null && (
              <div className="flex items-center gap-2 py-1.5 pl-4">
                <svg
                  className="h-4 w-4 shrink-0 text-text-muted"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 5v14M5 12l7 7 7-7" />
                </svg>
                <span className="text-xs text-text-muted">{dropOffPct}% drop-off</span>
              </div>
            )}

            {/* Stage bar */}
            <div className="flex items-center gap-4">
              <div className="w-40 shrink-0 text-right text-sm text-text-muted">
                {formatStageName(stage.name)}
              </div>
              <div className="flex-1">
                <div
                  className="rounded-md bg-accent-purple px-3 py-2 text-right text-sm font-medium text-text-primary transition-all"
                  style={{ width: `${widthPct}%`, opacity }}
                >
                  {stage.count.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
