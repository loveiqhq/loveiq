"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import ActivityCard from "./ActivityCard";

interface ActivityEvent {
  event_type: string;
  event_time: string;
  email: string | null;
  utm: string | null;
  detail: string | null;
}

const INITIAL_SINCE = new Date(Date.now() - 86_400_000).toISOString();

export default function ActivityFeedTab() {
  const [paused, setPaused] = useState(false);

  const { data, loading, error, refetch } = useAdminFetch<ActivityEvent[]>(
    "/api/admin/pulse/activity",
    { since: INITIAL_SINCE, limit: "200" }
  );

  // Polling via setInterval
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => refetch(), 10_000);
    return () => clearInterval(id);
  }, [paused, refetch]);

  const togglePause = useCallback(() => setPaused((p) => !p), []);

  const events = data || [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Live indicator */}
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                paused ? "bg-gray-500" : "animate-pulse bg-green-400"
              }`}
            />
            <span className="text-sm font-medium text-text-primary">
              {paused ? "Paused" : "Live"}
            </span>
          </div>
          <span className="text-sm text-text-muted">
            {events.length} event{events.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          onClick={togglePause}
          className="rounded-lg border border-white/10 bg-surface px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-white/5"
        >
          {paused ? "Resume" : "Pause"}
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Loading state (initial only) */}
      {loading && events.length === 0 && !error && (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
        </div>
      )}

      {/* Empty state */}
      {!loading && events.length === 0 && !error && (
        <div className="rounded-xl border border-white/10 bg-surface p-8 text-center text-sm text-text-muted">
          No recent activity
        </div>
      )}

      {/* Event list */}
      <div className="space-y-2">
        {events.map((event, i) => (
          <ActivityCard key={`${event.event_time}-${event.event_type}-${i}`} event={event} />
        ))}
      </div>
    </div>
  );
}
