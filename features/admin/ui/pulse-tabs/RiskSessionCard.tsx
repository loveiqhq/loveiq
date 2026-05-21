"use client";

const TOTAL_QUESTIONS = 62;

interface AtRiskSession {
  session_id: string;
  current_index: number;
  started_at: string;
  saved_at: string;
  answers_count: number;
  minutes_since_save: number;
  total_minutes: number;
  backtrack_count: number;
  total_events: number;
  risk_level: string;
}

const RISK_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  stale: { bg: "bg-red-500/10", text: "text-red-400", label: "Stale" },
  struggling: { bg: "bg-amber-500/10", text: "text-amber-400", label: "Struggling" },
  high_backtrack: { bg: "bg-yellow-500/10", text: "text-yellow-400", label: "High Backtrack" },
  normal: { bg: "bg-white/5", text: "text-text-muted", label: "Normal" },
};

const DEFAULT_RISK_STYLE = { bg: "bg-white/5", text: "text-text-muted", label: "Unknown" };

function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function RiskSessionCard({ session }: { session: AtRiskSession }) {
  const riskStyle = RISK_STYLES[session.risk_level] || DEFAULT_RISK_STYLE;
  const progressPct = Math.min(Math.round((session.current_index / TOTAL_QUESTIONS) * 100), 100);

  return (
    <div className="relative rounded-lg border border-white/10 bg-surface p-4">
      {/* Risk badge (top-right) */}
      <span
        className={`absolute right-3 top-3 rounded-full px-2 py-0.5 text-xs font-medium ${riskStyle.bg} ${riskStyle.text}`}
      >
        {riskStyle.label}
      </span>

      {/* Session ID */}
      <div className="text-sm font-mono text-text-primary">{session.session_id.slice(0, 8)}</div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="h-2 w-full rounded-full bg-white/10">
          <div
            className="h-2 rounded-full bg-accent-purple transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="mt-1 text-xs text-text-muted">
          Question {session.current_index} of {TOTAL_QUESTIONS} ({session.answers_count} answers)
        </div>
      </div>

      {/* Metrics row */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
        <span>Last active: {session.minutes_since_save}m ago</span>
        <span>Total time: {session.total_minutes}m</span>
        <span>Backtracks: {session.backtrack_count}</span>
      </div>

      {/* Started time */}
      <div className="mt-2 text-xs text-text-muted">Started {relativeTime(session.started_at)}</div>
    </div>
  );
}
