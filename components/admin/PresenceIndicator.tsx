"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

interface PresenceState {
  email: string;
  page: string;
  lastSeen: string;
}

export default function PresenceIndicator() {
  const [onlineUsers, setOnlineUsers] = useState<PresenceState[]>([]);
  const [expanded, setExpanded] = useState(false);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const channel = supabase.channel("admin-presence", {
      config: { presence: { key: "admin" } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceState>();
        const users: PresenceState[] = [];
        for (const key in state) {
          for (const presence of state[key]) {
            users.push(presence);
          }
        }
        setOnlineUsers(users);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          try {
            const currentPage = window.location.pathname;
            await channel.track({
              email: "current-admin",
              page: currentPage,
              lastSeen: new Date().toISOString(),
            });
          } catch {
            // Not authenticated or presence not available
          }
        }
      });

    channelRef.current = channel;

    const handleRouteChange = () => {
      if (channelRef.current) {
        channelRef.current.track({
          email: "current-admin",
          page: window.location.pathname,
          lastSeen: new Date().toISOString(),
        });
      }
    };

    const interval = setInterval(handleRouteChange, 30000);

    return () => {
      clearInterval(interval);
      channel.unsubscribe();
    };
  }, []);

  const count = onlineUsers.length;
  if (count === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-text-muted transition hover:bg-white/10 hover:text-text-primary"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        {count} online
      </button>

      {expanded && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-white/10 bg-surface p-3 shadow-xl">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Currently Online
          </p>
          <div className="space-y-2">
            {onlineUsers.map((user, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="truncate text-text-primary">{user.email.replace(/@.*/, "")}</span>
                <span className="ml-auto truncate text-text-muted">
                  {user.page.replace("/admin/", "").replace("/admin", "Dashboard") || "Dashboard"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
