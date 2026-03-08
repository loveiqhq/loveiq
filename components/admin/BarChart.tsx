interface BarItem {
  label: string;
  value: number;
}

interface BarChartProps {
  items: BarItem[];
  direction?: "horizontal" | "vertical";
  maxHeight?: number;
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
}: BarChartProps) {
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
          <div className="flex h-full items-end gap-1">
            {items.map((item, idx) => {
              const pct = (item.value / maxValue) * 100;
              return (
                <div key={item.label} className="group relative flex flex-1 flex-col items-center">
                  {/* Always-visible value above bar */}
                  <span className="mb-0.5 text-[10px] text-text-muted">
                    {item.value > 0 ? item.value : ""}
                  </span>
                  <div
                    className="w-full rounded-t bg-accent-purple/60 transition-colors group-hover:bg-accent-purple"
                    style={{ height: `${pct}%`, minHeight: item.value > 0 ? 2 : 0 }}
                  />
                  {idx % labelStep === 0 ? (
                    <span className="mt-1 text-[10px] text-text-muted truncate max-w-full">
                      {item.label}
                    </span>
                  ) : (
                    <span className="mt-1 text-[10px] invisible">.</span>
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
      {items.map((item) => {
        const pct = (item.value / maxValue) * 100;
        return (
          <div key={item.label}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-text-muted truncate max-w-[60%]">{item.label}</span>
              <span className="text-text-primary">{item.value}</span>
            </div>
            <div className="h-2 rounded-full bg-white/5">
              <div className="h-2 rounded-full bg-accent-orange/70" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
