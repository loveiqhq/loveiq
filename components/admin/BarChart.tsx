interface BarItem {
  label: string;
  value: number;
}

interface BarChartProps {
  items: BarItem[];
  direction?: "horizontal" | "vertical";
  maxHeight?: number;
}

export default function BarChart({
  items,
  direction = "horizontal",
  maxHeight = 200,
}: BarChartProps) {
  const maxValue = Math.max(...items.map((i) => i.value), 1);

  if (direction === "vertical") {
    return (
      <div className="flex items-end gap-1" style={{ height: maxHeight }}>
        {items.map((item) => {
          const pct = (item.value / maxValue) * 100;
          return (
            <div key={item.label} className="group relative flex flex-1 flex-col items-center">
              <div
                className="w-full rounded-t bg-accent-purple/60 transition-colors group-hover:bg-accent-purple"
                style={{ height: `${pct}%`, minHeight: item.value > 0 ? 2 : 0 }}
              />
              <span className="mt-1 text-[10px] text-text-muted truncate max-w-full">
                {item.label}
              </span>
              <span className="absolute -top-5 hidden text-[10px] text-text-muted group-hover:block">
                {item.value}
              </span>
            </div>
          );
        })}
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
