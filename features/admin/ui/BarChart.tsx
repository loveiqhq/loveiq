interface BarItem {
  label: string;
  value: number;
  /** When set, rendered in place of `value` as the bar label (bar magnitude still uses `value`). */
  display?: string;
  /** Per-series values, required when the chart is given a `series` config (grouped mode). */
  seriesData?: Record<string, number>;
}

/** A series in grouped multi-series mode (e.g. one per gender). */
export interface BarSeries {
  key: string; // matches keys in BarItem.seriesData
  label: string; // legend + row label
  color: string; // Tailwind bg-* class, e.g. "bg-accent-purple"
}

interface BarChartProps {
  items: BarItem[];
  direction?: "horizontal" | "vertical";
  maxHeight?: number;
  /**
   * When provided, renders grouped multi-series bars (one labelled bar per
   * series within each category) plus a legend, instead of single-series.
   */
  series?: BarSeries[];
}

function getGridLines(maxValue: number): number[] {
  if (maxValue <= 1) return [1];
  const lines: number[] = [];
  for (let i = 1; i <= 4; i++) {
    const val = Math.round((maxValue * i) / 4);
    if (val > 0 && !lines.includes(val)) lines.push(val);
  }
  return lines;
}

export default function BarChart({
  items,
  direction = "horizontal",
  maxHeight = 200,
  series,
}: BarChartProps) {
  // ── Grouped multi-series mode ──────────────────────────────────────────────
  // Bars are scaled to the max series value across all items so series with
  // different totals (e.g. fewer men than women) stay visually comparable when
  // the caller passes within-series percentages.
  if (series && series.length > 0) {
    const maxSeriesValue = Math.max(
      ...items.flatMap((i) => series.map((s) => i.seriesData?.[s.key] ?? 0)),
      1
    );
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-text-muted">
              <span className={`inline-block h-2 w-4 rounded-sm ${s.color}`} />
              {s.label}
            </span>
          ))}
        </div>
        {items.map((item, idx) => (
          <div key={`${item.label}-${idx}`}>
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="max-w-[70%] truncate text-text-muted">{item.label}</span>
              {item.display && <span className="shrink-0 text-text-muted">{item.display}</span>}
            </div>
            <div className="space-y-1">
              {series.map((s) => {
                const v = item.seriesData?.[s.key] ?? 0;
                const pct = (v / maxSeriesValue) * 100;
                return (
                  <div key={s.key} className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-[10px] text-text-muted">{s.label}</span>
                    <div className="h-1.5 flex-1 rounded-full bg-white/5">
                      <div
                        className={`h-1.5 rounded-full ${s.color}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-12 shrink-0 text-right text-[10px] text-text-primary">
                      {v.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const maxValue = Math.max(...items.map((i) => i.value), 1);

  if (direction === "vertical") {
    const gridLines = getGridLines(maxValue);
    // If >15 items, show every Nth label to avoid overlap
    const labelStep = items.length > 15 ? Math.ceil(items.length / 10) : 1;

    return (
      <div className="flex">
        {/* Y-axis labels */}
        <div className="relative mr-2 flex-shrink-0 w-8" style={{ height: maxHeight }}>
          {gridLines.map((val) => {
            const bottom = (val / maxValue) * 100;
            return (
              <span
                key={val}
                className="absolute right-0 -translate-y-1/2 text-[10px] text-text-muted"
                style={{ bottom: `${bottom}%` }}
              >
                {val}
              </span>
            );
          })}
        </div>

        {/* Chart area with gridlines */}
        <div className="relative flex-1" style={{ height: maxHeight }}>
          {/* Horizontal gridlines */}
          {gridLines.map((val) => {
            const bottom = (val / maxValue) * 100;
            return (
              <div
                key={val}
                className="absolute left-0 right-0 border-t border-white/5"
                style={{ bottom: `${bottom}%` }}
              />
            );
          })}

          {/* Bars */}
          <div className="flex h-full items-stretch gap-1">
            {items.map((item, idx) => {
              const pct = (item.value / maxValue) * 100;
              return (
                <div
                  key={`${item.label}-${idx}`}
                  className="group flex flex-1 flex-col items-center"
                >
                  {/* Bar area — fills remaining space, bar grows from bottom */}
                  <div className="relative w-full flex-1">
                    <div
                      className="absolute bottom-0 left-0 right-0 rounded-t bg-accent-purple transition-colors group-hover:bg-accent-purple/80"
                      style={{ height: `${pct}%`, minHeight: item.value > 0 ? 2 : 0 }}
                    />
                    {/* Value label positioned just above bar */}
                    {item.value > 0 && (
                      <span
                        className="absolute left-1/2 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap"
                        style={{ bottom: `calc(${pct}% + 2px)` }}
                      >
                        {item.display ?? item.value}
                      </span>
                    )}
                  </div>
                  {/* X-axis label */}
                  {idx % labelStep === 0 ? (
                    <span className="mt-1 shrink-0 text-[10px] text-text-muted truncate max-w-full">
                      {item.label}
                    </span>
                  ) : (
                    <span className="mt-1 shrink-0 text-[10px] invisible">.</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item, idx) => {
        const pct = (item.value / maxValue) * 100;
        return (
          <div key={`${item.label}-${idx}`}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-text-muted truncate max-w-[60%]">{item.label}</span>
              <span className="text-text-primary">{item.display ?? item.value}</span>
            </div>
            <div className="h-2 rounded-full bg-white/5">
              <div className="h-2 rounded-full bg-accent-orange" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
