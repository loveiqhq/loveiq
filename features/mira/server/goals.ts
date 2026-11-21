import { z } from "zod";
import { supabaseFetch } from "@features/admin/server/supabase";
import { daysBetween, localDay, progress, type Day } from "./goal-progress";
import type { GoalForPrompt } from "./prompt";

/**
 * Challenges & goals (22 Nov 2026): a signed-in person's small goals and the days they ticked
 * them (supabase/migrations/20261122010000_mira_goals.sql), with the service role from API
 * routes. Every read and write is scoped to the signed-in account's id, and the log's composite
 * key keeps a tick on its own person's goal, so nobody can reach another's goals by guessing ids.
 */

export const GOAL_TEXT_MAX = 120;
/** Goals on the go at once: a few small steps, not a to-do list. */
export const MAX_ACTIVE_GOALS = 5;
/**
 * Rail 15: an account or browser that said it is under 18 (server/minor.ts isMinor) sees, sets,
 * changes and ticks no goals; deleting them always works.
 */
export const ADULTS_ONLY = "Mira's coaching is only for adults.";

/** A goal as the API takes it: spaces tidied, 1 to GOAL_TEXT_MAX characters. */
export const goalText = z
  .string()
  .transform((s) => s.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1).max(GOAL_TEXT_MAX));
/** Days a week, 1 to 7, or null for none. */
export const weeklyTarget = z.number().int().min(1).max(7).nullable();

export type GoalRow = {
  id: string;
  /** The coaching topic it belongs to; today only Mira's "body-confidence". */
  challenge: string;
  /** In the person's own words (or Mira's, as they accepted them). */
  text: string;
  /** Days a week they aim for, 1 to 7, or none. */
  weekly_target: number | null;
  /** Added from Mira's suggestion in the chat, or written by hand. */
  via: "hand" | "mira";
  created_at: string;
  archived_at: string | null;
  completed_at: string | null;
};
/** A goal with the days it was ticked, newest first. */
export type Goal = GoalRow & { days: Day[] };

const COLS = "id,challenge,text,weekly_target,via,created_at,archived_at,completed_at";
const enc = encodeURIComponent;
const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
/** On the go: neither put away nor done. */
export const isActive = (g: Pick<GoalRow, "archived_at" | "completed_at">) =>
  !g.archived_at && !g.completed_at;

async function read<T>(path: string): Promise<T[]> {
  const res = await supabaseFetch(path);
  if (!res.ok) throw new Error(`mira goals read failed (${res.status})`);
  return (await res.json()) as T[];
}

/** The account's goals in the order they were set, each with the days it was ticked. */
export async function listGoals(userId: string): Promise<Goal[]> {
  const rows = await read<GoalRow & { log: Array<{ day: Day }> }>(
    `/rest/v1/mira_goal?user_id=eq.${enc(userId)}&select=${COLS},log:mira_goal_log(day)&log.order=day.desc&order=created_at.asc,id.asc`
  );
  return rows.map(({ log, ...goal }) => ({ ...goal, days: log.map((l) => l.day) }));
}

async function activeCount(userId: string): Promise<number> {
  const rows = await read<{ id: string }>(
    `/rest/v1/mira_goal?user_id=eq.${enc(userId)}&archived_at=is.null&completed_at=is.null&select=id`
  );
  return rows.length;
}

/**
 * A new goal, or "full" with MAX_ACTIVE_GOALS on the go. ponytail: two quick taps can both pass
 * the count and make one more than the cap; a trigger closes it if that ever matters.
 */
export async function createGoal(
  userId: string,
  goal: { text: string; weeklyTarget: number | null; via: GoalRow["via"] }
): Promise<Goal | "full"> {
  if ((await activeCount(userId)) >= MAX_ACTIVE_GOALS) return "full";
  const res = await supabaseFetch(`/rest/v1/mira_goal?select=${COLS}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: userId,
      text: goal.text,
      weekly_target: goal.weeklyTarget,
      via: goal.via,
    }),
  });
  if (!res.ok) throw new Error(`mira goal insert failed (${res.status})`);
  const [row] = (await res.json()) as GoalRow[];
  return { ...row!, days: [] };
}

export type GoalPatch = {
  text?: string;
  weeklyTarget?: number | null;
  /** Put away, or back on the go. */
  archived?: boolean;
  /** Done, or back on the go. */
  completed?: boolean;
};

/**
 * Changes one of the account's goals: "missing" when it has none with that id, "full" when
 * bringing it back on the go would pass MAX_ACTIVE_GOALS.
 */
export async function updateGoal(
  userId: string,
  id: string,
  patch: GoalPatch
): Promise<GoalRow | "missing" | "full"> {
  if (!isUuid(id)) return "missing";
  const mine = `id=eq.${enc(id)}&user_id=eq.${enc(userId)}`;
  const now = new Date().toISOString();
  const body = {
    ...(patch.text === undefined ? {} : { text: patch.text }),
    ...(patch.weeklyTarget === undefined ? {} : { weekly_target: patch.weeklyTarget }),
    ...(patch.archived === undefined ? {} : { archived_at: patch.archived ? now : null }),
    ...(patch.completed === undefined ? {} : { completed_at: patch.completed ? now : null }),
  };
  if (patch.archived === false || patch.completed === false) {
    const [current] = await read<GoalRow>(`/rest/v1/mira_goal?${mine}&select=${COLS}`);
    if (!current) return "missing";
    const back = !isActive(current) && isActive({ ...current, ...body });
    if (back && (await activeCount(userId)) >= MAX_ACTIVE_GOALS) return "full";
  }
  const res = await supabaseFetch(`/rest/v1/mira_goal?${mine}&select=${COLS}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`mira goal update failed (${res.status})`);
  const [row] = (await res.json()) as GoalRow[];
  return row ?? "missing";
}

/** Deletes one of the account's goals and its ticks; false when it has none with that id. */
export async function deleteGoal(userId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const res = await supabaseFetch(
    `/rest/v1/mira_goal?id=eq.${enc(id)}&user_id=eq.${enc(userId)}&select=id`,
    { method: "DELETE", headers: { Prefer: "return=representation" } }
  );
  if (!res.ok) throw new Error(`mira goal delete failed (${res.status})`);
  return ((await res.json()) as unknown[]).length > 0;
}

/** Deletes every goal of the account, and so their ticks (the goals page, the under-18 stop). */
export async function deleteGoals(userId: string): Promise<void> {
  const res = await supabaseFetch(`/rest/v1/mira_goal?user_id=eq.${enc(userId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`mira goals delete failed (${res.status})`);
}

/**
 * Ticks a goal for a day (once, however often it is tapped) or takes the tick back. The tick
 * carries its person, and the log's composite key refuses one whose goal is someone else's:
 * false then.
 */
export async function setTick(
  userId: string,
  goalId: string,
  day: Day,
  done: boolean
): Promise<boolean> {
  if (!isUuid(goalId)) return false;
  const res = done
    ? await supabaseFetch("/rest/v1/mira_goal_log?on_conflict=goal_id,day", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates" },
        body: JSON.stringify({ goal_id: goalId, user_id: userId, day }),
      })
    : await supabaseFetch(
        `/rest/v1/mira_goal_log?goal_id=eq.${enc(goalId)}&user_id=eq.${enc(userId)}&day=eq.${enc(day)}`,
        { method: "DELETE" }
      );
  if (done && res.status === 409) return false; // the foreign key: no goal of theirs
  if (!res.ok) throw new Error(`mira goal tick failed (${res.status})`);
  return true;
}

/** The account's goals on the go as Mira is told of them, with the week in their time zone. */
export async function goalsForPrompt(
  userId: string,
  timeZone: string,
  now = new Date()
): Promise<GoalForPrompt[]> {
  const today = localDay(now, timeZone);
  return (await listGoals(userId)).filter(isActive).map((g) => {
    const p = progress(
      {
        days: g.days,
        target: g.weekly_target,
        since: localDay(new Date(g.created_at), timeZone),
      },
      today
    );
    return {
      text: g.text,
      target: g.weekly_target,
      thisWeek: p.thisWeek,
      daysSinceLast: p.last === null ? null : daysBetween(p.last, today),
    };
  });
}
