interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
}

export default function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface p-5">
      <p className="text-sm text-text-muted">{label}</p>
      <p className="mt-1 font-serif text-2xl font-bold text-text-primary">{value}</p>
      {sub && <p className="mt-1 text-xs text-text-muted">{sub}</p>}
    </div>
  );
}
