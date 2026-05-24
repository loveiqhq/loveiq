"use client";

import { useState } from "react";
import { useAdminFetch } from "./hooks/useAdminFetch";

interface TimelineEvent {
  type: string;
  timestamp: string;
  label: string;
  detail?: string;
}

interface TimelineData {
  events: TimelineEvent[];
}

const typeColors: Record<string, string> = {
  waitlist_signup: "bg-blue-400",
  account_created: "bg-white/40",
  survey_start: "bg-accent-purple",
  chapter_start: "bg-accent-purple/60",
  survey_complete: "bg-green-400",
  scored: "bg-accent-orange",
  invite_sent: "bg-accent-orange/60",
  email_sent_waitlist_confirm: "bg-blue-300",
  email_sent_report_link: "bg-green-300",
  email_sent_invite: "bg-orange-300",
  report_shared: "bg-pink-400",
  report_viewed: "bg-emerald-300",
  paywall_view: "bg-yellow-300",
  paywall_initiated: "bg-yellow-400",
  begin_checkout: "bg-yellow-500",
  paywall_unlocked: "bg-green-500",
  report_engagement_1min: "bg-emerald-400/70",
  report_engagement_5min: "bg-emerald-500/80",
  report_engagement_10min: "bg-emerald-600",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatGap(ms: number): string {
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

export default function JourneyTimeline({ id }: { id: string }) {
  const { data, loading, error } = useAdminFetch<TimelineData>(
    `/api/admin/submissions/${id}/timeline`
  );
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
          <span className="text-sm text-text-muted">Loading timeline...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <p className="text-sm text-text-muted">Timeline unavailable</p>
      </div>
    );
  }

  if (!data || !data.events || data.events.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-surface p-5">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between"
      >
        <h3 className="text-sm font-semibold text-text-primary">
          User Journey ({data.events.length} events)
        </h3>
        <svg
          className={`h-4 w-4 text-text-muted transition ${expanded ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {expanded && (
        <div className="relative mt-4 ml-3 border-l border-white/10 pl-6">
          {data.events.map((event, i) => {
            const gap =
              i > 0
                ? // i > 0 so i-1 is in bounds.
                  new Date(event.timestamp).getTime() -
                  new Date(data.events[i - 1]!.timestamp).getTime()
                : 0;
            const showGap = gap > 3600_000; // > 1 hour

            return (
              <div key={`${event.type}-${i}`}>
                {showGap && (
                  <div className="relative -left-6 mb-2 flex items-center gap-2 pl-6">
                    <div className="absolute -left-[5px] h-2.5 w-2.5 rounded-full bg-white/10" />
                    <span className="text-[10px] text-text-muted">{formatGap(gap)} later</span>
                  </div>
                )}
                <div className="relative mb-4 flex items-start gap-3">
                  <div
                    className={`absolute -left-[29px] mt-1.5 h-2.5 w-2.5 rounded-full ${typeColors[event.type] || "bg-white/30"}`}
                  />
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm text-text-primary">{event.label}</span>
                      {event.detail && (
                        <span className="text-xs text-text-muted">{event.detail}</span>
                      )}
                    </div>
                    <p className="text-[10px] text-text-muted">{formatTime(event.timestamp)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
