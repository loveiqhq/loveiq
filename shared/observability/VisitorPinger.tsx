"use client";

import { useEffect, useRef } from "react";
import { getCsrfToken } from "@shared/http/csrf-client";
import { readCookie } from "@shared/observability/cookie";

const VISITOR_DAY_COOKIE = "liq_vday";

// Paths that should NOT count toward the unique-visitor metric:
// - /admin → admin staff browsing the back office
// - /login → the staging password gate (also admin-adjacent)
function isExcludedPath(pathname: string): boolean {
  return pathname.startsWith("/admin") || pathname === "/login";
}

/**
 * Fires the daily unique-visitor ping at most once per UTC day, per browser.
 *
 * The visitor id (`__liq_vid` / `__Host-liq_vid`) is minted by proxy.ts.
 * The day-stamp (`liq_vday`) is owned entirely by this component — middleware
 * must NOT touch it, otherwise it would overwrite to "today" on every request
 * before the client gets a chance to detect the stale value.
 */
const VisitorPinger = () => {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    if (isExcludedPath(window.location.pathname)) return;

    const visitorId = readCookie("__Host-liq_vid") || readCookie("__liq_vid");
    if (!visitorId) return; // proxy.ts will mint one on the next request

    const todayYmd = new Date().toISOString().slice(0, 10);
    if (readCookie(VISITOR_DAY_COOKIE) === todayYmd) return;

    // Optimistically stamp the cookie BEFORE the network call so a fast nav
    // can't re-trigger the ping in another tab.
    document.cookie = `${VISITOR_DAY_COOKIE}=${todayYmd}; path=/; max-age=${60 * 60 * 36}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;

    fetch("/api/funnel-event", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": getCsrfToken(),
      },
      body: JSON.stringify({ event: "unique_visitor", visitor_id: visitorId }),
      keepalive: true,
    }).catch(() => {
      // Best-effort: server-side dedup (PK on visitor_id+day) makes a retry
      // safe, but the cookie is already stamped optimistically to avoid a
      // race between tabs. A failed ping = lost data for that visitor/day.
    });
  }, []);

  return null;
};

export default VisitorPinger;
