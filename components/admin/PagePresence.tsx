"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { usePathname } from "next/navigation";

export default function PagePresence() {
  const pathname = usePathname();
  const [viewerCount, setViewerCount] = useState(0);

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const channel = supabase.channel(`page-${pathname.replace(/\//g, "-")}`, {
      config: { presence: { key: pathname } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        let count = 0;
        for (const key in state) {
          // `key` comes from `for…in state`, so the lookup is defined.
          count += state[key]!.length;
        }
        setViewerCount(Math.max(count - 1, 0));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ joined: new Date().toISOString() });
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [pathname]);

  if (viewerCount === 0) return null;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-1 text-[11px] text-blue-400">
      <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
      {viewerCount} other{viewerCount !== 1 ? "s" : ""} viewing
    </span>
  );
}
