"use client";

import { Fragment, useMemo, useState } from "react";

interface HeatmapGridProps {
  rows: string[];
  cols: string[];
  data: Array<{ v4: string; v5: string; count: number }>;
}

export default function HeatmapGrid({ rows, cols, data }: HeatmapGridProps) {
  const [tooltip, setTooltip] = useState<{
    v4: string;
    v5: string;
    count: number;
    pct: string;
    x: number;
    y: number;
  } | null>(null);

  const { lookup, maxCount, totalCount } = useMemo(() => {
    const map = new Map<string, number>();
    let max = 0;
    let total = 0;
    for (const d of data) {
      const key = `${d.v4}::${d.v5}`;
      map.set(key, d.count);
      if (d.count > max) max = d.count;
      total += d.count;
    }
    return { lookup: map, maxCount: max, totalCount: total };
  }, [data]);

  function getCount(row: string, col: string): number {
    return lookup.get(`${row}::${col}`) ?? 0;
  }

  function getOpacity(count: number): number {
    if (count === 0) return 0;
    return Math.max(0.1, count / maxCount);
  }

  function handleMouseEnter(
    e: React.MouseEvent<HTMLDivElement>,
    row: string,
    col: string,
    count: number
  ) {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = totalCount > 0 ? ((count / totalCount) * 100).toFixed(1) : "0.0";
    setTooltip({
      v4: row,
      v5: col,
      count,
      pct,
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  }

  function handleMouseLeave() {
    setTooltip(null);
  }

  return (
    <div className="relative">
      {/* Scrollable container for mobile */}
      <div className="overflow-x-auto">
        <div
          className="inline-grid gap-px"
          style={{
            gridTemplateColumns: `160px repeat(${cols.length}, minmax(40px, 1fr))`,
            gridTemplateRows: `80px repeat(${rows.length}, 40px)`,
          }}
        >
          {/* Empty top-left corner */}
          <div />

          {/* Column headers */}
          {cols.map((col) => (
            <div key={`col-${col}`} className="flex items-end justify-center overflow-hidden pb-1">
              <span
                className="origin-bottom-left -rotate-45 truncate whitespace-nowrap text-[10px] text-text-muted"
                title={col}
                style={{ maxWidth: "100px" }}
              >
                {col}
              </span>
            </div>
          ))}

          {/* Rows */}
          {rows.map((row) => (
            <Fragment key={`row-${row}`}>
              {/* Row label */}
              <div className="flex items-center overflow-hidden pr-2">
                <span className="truncate text-xs text-text-muted" title={row}>
                  {row}
                </span>
              </div>

              {/* Cells */}
              {cols.map((col) => {
                const count = getCount(row, col);
                const opacity = getOpacity(count);
                return (
                  <div
                    key={`${row}::${col}`}
                    className="relative flex cursor-default items-center justify-center rounded-sm transition-opacity"
                    style={{
                      backgroundColor:
                        count > 0 ? `rgba(156, 125, 255, ${opacity})` : "rgba(255, 255, 255, 0.02)",
                    }}
                    onMouseEnter={(e) => handleMouseEnter(e, row, col, count)}
                    onMouseLeave={handleMouseLeave}
                  >
                    {count > 0 && (
                      <span className="text-[10px] font-medium text-white">{count}</span>
                    )}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 rounded-lg border border-white/10 bg-[#1a1025] px-3 py-2 text-xs text-text-primary shadow-lg"
          style={{
            left: tooltip.x,
            top: tooltip.y - 8,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div>
            <span className="text-text-muted">V4:</span> {tooltip.v4}
          </div>
          <div>
            <span className="text-text-muted">V5:</span> {tooltip.v5}
          </div>
          <div>
            {tooltip.count} submissions ({tooltip.pct}%)
          </div>
        </div>
      )}
    </div>
  );
}
