"use client";

import { createContext, useContext, type ReactNode } from "react";

import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

/** Who is signed in and how fresh the sources are (/api/admin/ap/status), read once per page. */
export interface ApStatus {
  email: string;
  role: string;
  production: { ok: boolean };
  ga4: { lastDay: string | null };
  posthog: { ok: boolean; lastEvent: string | null };
  /**
   * The PostHog visits of the team's own finished surveys (the info cards' :team_visits); null
   * when they couldn't be read.
   */
  teamVisits?: string[] | null;
}

const Ctx = createContext<{ status: ApStatus | null; error: string | null }>({
  status: null,
  error: null,
});

export function ApStatusProvider({ children }: { children: ReactNode }) {
  const { data, error } = useAdminFetch<ApStatus>("/api/admin/ap/status");
  return <Ctx.Provider value={{ status: data, error }}>{children}</Ctx.Provider>;
}

export function useApStatus() {
  return useContext(Ctx);
}

const RANK: Record<string, number> = { viewer: 0, editor: 1, admin: 2 };

/**
 * What the signed-in admin may do, so a page offers only that. Unknown until the status
 * arrives: the buttons wait rather than offer what the server would refuse.
 */
export function useApRole() {
  const { status } = useContext(Ctx);
  const rank = status ? (RANK[status.role] ?? -1) : -1;
  return { canEdit: rank >= RANK.editor!, isAdmin: rank >= RANK.admin! };
}
