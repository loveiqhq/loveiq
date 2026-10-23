"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

/**
 * The admin is AP-Analytics only (16 Oct 2026): its pages bring their own light shell
 * (app/admin/ap/layout.tsx) and the sign-in page draws itself. What stays here is the
 * signed-in admin's PostHog identity, from the cookie the sign-in callback sets.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const distinctId = document.cookie
      .split("; ")
      .find((cookie) => cookie.startsWith("admin_posthog_distinct_id="))
      ?.split("=")[1];

    if (distinctId) {
      posthog.identify(decodeURIComponent(distinctId));
    }
  }, []);

  return <>{children}</>;
}
