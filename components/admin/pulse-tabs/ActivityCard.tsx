"use client";

interface ActivityEvent {
  event_type: string;
  event_time: string;
  email: string | null;
  utm: string | null;
  detail: string | null;
}

const EVENT_STYLES: Record<string, { border: string; badge: string; bg: string; label: string }> = {
  submission_completed: {
    border: "border-l-green-400",
    badge: "bg-green-500/10 text-green-400",
    bg: "",
    label: "Submission",
  },
  waitlist_signup: {
    border: "border-l-blue-400",
    badge: "bg-blue-500/10 text-blue-400",
    bg: "",
    label: "Waitlist",
  },
  survey_started: {
    border: "border-l-accent-purple",
    badge: "bg-accent-purple/10 text-accent-purple",
    bg: "",
    label: "Survey Started",
  },
  invite_sent: {
    border: "border-l-accent-orange",
    badge: "bg-accent-orange/10 text-accent-orange",
    bg: "",
    label: "Invite",
  },
};

const DEFAULT_STYLE = {
  border: "border-l-white/20",
  badge: "bg-white/5 text-text-muted",
  bg: "",
  label: "Event",
};

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

export default function ActivityCard({ event }: { event: ActivityEvent }) {
  const style = EVENT_STYLES[event.event_type] || DEFAULT_STYLE;

  return (
    <div className={`rounded-lg border border-white/10 bg-surface p-3 border-l-2 ${style.border}`}>
      {/* Row 1: Badge + time */}
      <div className="flex items-center justify-between">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.badge}`}>
          {style.label}
        </span>
        <span className="text-xs text-text-muted">{relativeTime(event.event_time)}</span>
      </div>

      {/* Row 2: Email + UTM + detail */}
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
        {event.email && <span className="text-text-primary">{event.email}</span>}
        {event.utm && event.utm !== "Direct" && (
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-text-muted">
            {event.utm}
          </span>
        )}
        {event.detail && <span className="text-text-muted">{event.detail}</span>}
      </div>
    </div>
  );
}
