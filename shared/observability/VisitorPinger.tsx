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

    // Stamp the day-cookie ONLY after the POST resolves OK. Earlier behaviour
    // stamped before the fetch ("optimistic") which locked out the rest of
    // today's retries whenever the call failed (CSRF refresh race, 429 storm,
    // Vercel 502, Supabase circuit-open). On a transient outage at the UTC
    // day boundary this silently dropped visitors — and the day-after digest
    // had no way to recover them. Server PK on (visitor_id, day, event_type)
    // still guarantees at-most-once on the database side, so two tabs racing
    // through this branch produce one row, not two.
    fetch("/api/funnel-event", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": getCsrfToken(),
      },
      body: JSON.stringify({ event: "unique_visitor", visitor_id: visitorId }),
      keepalive: true,
    })
      .then((res) => {
        if (!res.ok) return; // leave the cookie unset so a later mount retries
        document.cookie = `${VISITOR_DAY_COOKIE}=${todayYmd}; path=/; max-age=${60 * 60 * 36}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
      })
      .catch(() => {
        // Network error / aborted: same as non-2xx — cookie stays unset, the
        // next page mount today can re-attempt. Server PK prevents duplicate
        // rows if both attempts eventually land.
      });
  }, []);

  return null;
};

export default VisitorPinger;
