interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  delta?: number | null;
  deltaLabel?: string;
}

export default function StatCard({ label, value, sub, delta, deltaLabel }: StatCardProps) {
  const hasDelta = delta != null && isFinite(delta);

  return (
    <div className="rounded-xl border border-white/10 bg-surface p-5">
      <p className="text-sm text-text-muted">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="font-serif text-2xl font-bold text-text-primary">{value}</p>
        {hasDelta && (
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              delta > 0
                ? "bg-emerald-500/10 text-emerald-400"
                : delta < 0
                  ? "bg-red-500/10 text-red-400"
                  : "bg-white/5 text-text-muted"
            }`}
          >
            {delta > 0 ? "\u2191" : delta < 0 ? "\u2193" : "\u2192"}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      {(sub || deltaLabel) && (
        <p className="mt-1 text-xs text-text-muted">{deltaLabel && hasDelta ? deltaLabel : sub}</p>
      )}
    </div>
  );
}
