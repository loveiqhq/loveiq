import { supabaseFetch } from "@features/admin/server/supabase";
import { bandOf, checkByScale, scoreOf, supportNow } from "../content/checks";

/**
 * The self-checks' storage (supabase/migrations/20261122090000_mira_checks.sql): every read and
 * write is scoped to the signed-in account's id. Answers are stored as given and scored here,
 * never by the browser (content/checks.ts).
 */

const enc = encodeURIComponent;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CheckRow = { scale: string; answers: number[]; created_at: string };

export type ChecksState = {
  name: string | null;
  useChecks: boolean;
  useAssessment: boolean;
  country: string | null;
  /** Oldest first. */
  rows: CheckRow[];
};

/** The account's results with the settings the check pages show, in one read; null: no account. */
export async function readChecks(userId: string): Promise<ChecksState | null> {
  const res = await supabaseFetch(
    `/rest/v1/mira_user?id=eq.${enc(userId)}&select=name,use_checks,use_assessment,country,mira_check(scale,answers,created_at)&mira_check.order=created_at.asc&limit=1`
  );
  if (!res.ok) throw new Error(`mira checks read failed (${res.status})`);
  const [row] = (await res.json()) as Array<{
    name: string | null;
    use_checks: boolean;
    use_assessment: boolean;
    country: string | null;
    mira_check: CheckRow[] | null;
  }>;
  if (!row) return null;
  return {
    name: row.name,
    useChecks: row.use_checks,
    useAssessment: row.use_assessment,
    country: row.country,
    rows: row.mira_check ?? [],
  };
}

/** The account's latest result of one scale, or null. */
export async function lastCheck(userId: string, scale: string): Promise<CheckRow | null> {
  const res = await supabaseFetch(
    `/rest/v1/mira_check?user_id=eq.${enc(userId)}&scale=eq.${enc(scale)}&select=scale,answers,created_at&order=created_at.desc&limit=1`
  );
  if (!res.ok) throw new Error(`mira check read failed (${res.status})`);
  return ((await res.json()) as CheckRow[])[0] ?? null;
}

/** Stores a finished check; "duplicate" when that scale already has one today (a double submit). */
export async function addCheck(
  userId: string,
  scale: string,
  answers: number[]
): Promise<{ created_at: string } | "duplicate"> {
  const res = await supabaseFetch("/rest/v1/mira_check?select=created_at", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ user_id: userId, scale, answers }),
  });
  if (res.status === 409) return "duplicate";
  if (!res.ok) throw new Error(`mira check insert failed (${res.status})`);
  return ((await res.json()) as Array<{ created_at: string }>)[0]!;
}

/** "Delete my check results", and an under-18 stop (server/minor.ts): every result goes. */
export async function deleteChecks(userId: string): Promise<void> {
  const res = await supabaseFetch(`/rest/v1/mira_check?user_id=eq.${enc(userId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`mira check delete failed (${res.status})`);
}

export type CheckForMira = {
  title: string;
  name: string;
  band: string;
  daysAgo: number;
  /** The mood check's question 9 above "Not at all" (supportNow): never told as its band alone. */
  support: boolean;
};

/** A band older than this no longer describes the person, so Mira isn't told it. */
export const MIRA_CHECK_DAYS = 90;

/**
 * What Mira's context may say about the self-checks (server/prompt.ts): each check's latest band
 * from the last 90 days, and whether its question 9 opened the support lines, only when the person
 * turned on "Mira may use my check results". Never the answers or the score; none at all with the
 * switch off (the filter is on the account row, so no result is even read).
 */
export async function checksForMira(userId: string, now = new Date()): Promise<CheckForMira[]> {
  const since = new Date(now.getTime() - MIRA_CHECK_DAYS * DAY_MS).toISOString();
  const res = await supabaseFetch(
    `/rest/v1/mira_user?id=eq.${enc(userId)}&use_checks=is.true&select=mira_check(scale,answers,created_at)&mira_check.order=created_at.desc&mira_check.created_at=gte.${enc(since)}&limit=1`
  );
  if (!res.ok) throw new Error(`mira checks for context failed (${res.status})`);
  const [row] = (await res.json()) as Array<{ mira_check: CheckRow[] | null }>;
  const out: CheckForMira[] = [];
  const seen = new Set<string>();
  for (const r of row?.mira_check ?? []) {
    const check = checkByScale(r.scale);
    if (!check || seen.has(r.scale)) continue;
    seen.add(r.scale);
    out.push({
      title: check.title,
      name: check.name,
      band: bandOf(check, scoreOf(check, r.answers)).mira,
      daysAgo: Math.max(0, Math.floor((now.getTime() - Date.parse(r.created_at)) / DAY_MS)),
      support: supportNow(check, r.answers),
    });
  }
  return out;
}
