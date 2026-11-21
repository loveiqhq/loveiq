/**
 * AP-Analytics, Mira › Goals (Challenges & goals, 22 Nov 2026): who sets goals, how, and whether
 * they keep ticking them, read from Mira's goal tables
 * (supabase/migrations/20261122010000_mira_goals.sql) by ids and times, never a goal's words.
 * The team is left out as everywhere on the page (prepare's accounts and counted events). A
 * deleted goal or account leaves with its ticks, so it is no longer counted.
 */
import { fetchAllRows } from "../supabase";

export interface MiraGoalRow {
  id: string;
  user_id: string;
  via: "hand" | "mira";
  created_at: string;
}

export interface MiraGoalLogRow {
  goal_id: string;
  user_id: string;
  /** When the tick was made (its local day is not needed here). */
  created_at: string;
}

export interface MiraGoalRows {
  goals: MiraGoalRow[];
  logs: MiraGoalLogRow[];
}

export interface GoalFigures {
  /** Accounts with a goal set by the range's last day, of the accounts open by then. */
  people: number;
  accounts: number;
  /** Goals set in the range, from Mira's suggestion in the chat or by hand; her suggestions. */
  viaMira: number;
  byHand: number;
  suggested: number;
  /** Goals set in the range that are a week old now, and of them those ticked within 7 days. */
  weekOld: number;
  tickedInWeek: number;
  /** People who ticked a goal in the 7 days to the range's last day. */
  weeklyLoggers: number;
}

const WEEK_MS = 7 * 24 * 3_600_000;

/** Both tables, or null when either can't be read (say, before the migration is applied). */
export async function fetchGoalRows(): Promise<MiraGoalRows | null> {
  const [goals, logs] = await Promise.all([
    fetchAllRows<MiraGoalRow>("/rest/v1/mira_goal?select=id,user_id,via,created_at&order=id.asc"),
    fetchAllRows<MiraGoalLogRow>(
      "/rest/v1/mira_goal_log?select=goal_id,user_id,created_at&order=goal_id.asc,day.asc"
    ),
  ]).catch(() => [null, null]);
  return goals && logs ? { goals, logs } : null;
}

export function goalFigures(
  rows: MiraGoalRows,
  counted: {
    /** The accounts that are not the team's. */
    accounts: Array<{ id: string; created_at: string }>;
    /** The events counted (the team's left out). */
    events: Array<{ name: string; at: number }>;
  },
  w: { since: number; until: number },
  now: number
): GoalFigures {
  const ours = new Set(counted.accounts.map((a) => a.id));
  const goals = rows.goals.filter((g) => ours.has(g.user_id));
  const logs = rows.logs.filter((l) => ours.has(l.user_id));
  const at = (iso: string) => Date.parse(iso);
  const inRange = goals.filter((g) => at(g.created_at) >= w.since && at(g.created_at) < w.until);
  const weekOld = inRange.filter((g) => at(g.created_at) + WEEK_MS <= now);
  const firstTicks = new Map<string, number>();
  for (const l of logs) {
    const t = at(l.created_at);
    if (t < (firstTicks.get(l.goal_id) ?? Infinity)) firstTicks.set(l.goal_id, t);
  }
  return {
    people: new Set(goals.filter((g) => at(g.created_at) < w.until).map((g) => g.user_id)).size,
    accounts: counted.accounts.filter((a) => at(a.created_at) < w.until).length,
    viaMira: inRange.filter((g) => g.via === "mira").length,
    byHand: inRange.filter((g) => g.via === "hand").length,
    suggested: counted.events.filter(
      (e) => e.name === "goal_suggested" && e.at >= w.since && e.at < w.until
    ).length,
    weekOld: weekOld.length,
    tickedInWeek: weekOld.filter(
      (g) => (firstTicks.get(g.id) ?? Infinity) < at(g.created_at) + WEEK_MS
    ).length,
    weeklyLoggers: new Set(
      logs
        .filter((l) => at(l.created_at) >= w.until - WEEK_MS && at(l.created_at) < w.until)
        .map((l) => l.user_id)
    ).size,
  };
}
