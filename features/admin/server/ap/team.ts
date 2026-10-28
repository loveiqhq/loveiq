/**
 * The team's own accounts, as the database's ap_team_user view lists them: an @loveiq.org
 * address, or an account that redeemed the team's own 100% test code (the team testing from
 * another address; Eman, 24 Oct 2026). Every page leaves their surveys, votes and visits out,
 * as ap_facts and the other readers do. Read every five minutes; a failed read is not kept.
 */
import { supabaseFetch } from "@features/admin/server/supabase";

const CACHE_MS = 5 * 60_000;
let cached: { at: number; ids: Promise<Set<number>> } | null = null;

export function teamUserIds(): Promise<Set<number>> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.ids;
  // A fetch that throws at once is a failed read too, never a crash of the caller.
  const ids = Promise.resolve()
    .then(() => supabaseFetch("/rest/v1/ap_team_user?select=id&order=id.asc"))
    .then(async (res) => {
      if (!res.ok) throw new Error(`ap_team_user failed (${res.status})`);
      return new Set(((await res.json()) as Array<{ id: number }>).map((u) => Number(u.id)));
    });
  cached = { at: now, ids };
  ids.catch(() => {
    if (cached?.ids === ids) cached = null;
  });
  return ids;
}

/** For tests. */
export function clearTeamCache(): void {
  cached = null;
}
