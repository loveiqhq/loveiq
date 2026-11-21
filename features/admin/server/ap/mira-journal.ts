/**
 * AP-Analytics, Mira (beta): the daily journal's KPI card (features/mira/server/journal.ts),
 * read from its own table. Only the days people checked in and today's two settings are read,
 * never a rating or a note. The team is left out as everywhere on the page: only the accounts
 * buildMiraPage counts (prepare's `accounts`) are counted here.
 */
import { addDays } from "./days";
import { fetchAllRows } from "../supabase";
import { mean } from "./metrics";

export interface JournalRows {
  /** Every check-in's person and day (the person's own calendar day). */
  entries: Array<{ user_id: string; day: string }>;
  /** The accounts with a journal setting on. */
  settings: Array<{
    id: string;
    journal_share?: string | null;
    journal_reminder_time?: string | null;
  }>;
}

export interface JournalFigures {
  /** False when the journal's tables could not be read: the card says so. */
  read: boolean;
  /** Today's accounts, the team's left out: the base of the settings' shares. */
  accounts: number;
  /** People with a check-in in the range, and the range's check-ins. */
  journalers: number;
  checkIns: number;
  /**
   * D7 retention: of the people whose first check-in ever was in the range, at least 7 days
   * before its last day, those who checked in again on day 7 or later, by that day.
   */
  d7: { returned: number; of: number };
  /** Each person's longest run of days in a row in the range, averaged over the range's people. */
  avgStreak: number | null;
  /** Today: accounts with the daily reminder on, letting Mira read the journal, and its notes. */
  reminders: number;
  sharing: number;
  notes: number;
}

/** Days and settings only; null rather than a part of either. */
export async function fetchJournal(): Promise<JournalRows | null> {
  const [entries, settings] = await Promise.all([
    fetchAllRows<JournalRows["entries"][number]>(
      "/rest/v1/mira_journal_entry?select=user_id,day&order=id.asc"
    ),
    fetchAllRows<JournalRows["settings"][number]>(
      "/rest/v1/mira_user?or=(journal_share.neq.off,journal_reminder_time.not.is.null)&select=id,journal_share,journal_reminder_time&order=id.asc"
    ),
  ]);
  return entries && settings ? { entries, settings } : null;
}

/** The longest run of consecutive days in a sorted list of unique days. */
function longestRun(sorted: string[]): number {
  let best = 0;
  let run = 0;
  sorted.forEach((d, i) => {
    run = i > 0 && addDays(sorted[i - 1]!, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

/**
 * The card's figures for the range (Berlin days; a check-in's day is its person's own, so a day
 * at the range's edge can fall a day either side). `rows` undefined is no journal yet (an empty
 * card), null is a failed read.
 */
export function journalFigures(
  rows: JournalRows | null | undefined,
  accounts: Set<string>,
  from: string,
  to: string
): JournalFigures {
  const out: JournalFigures = {
    read: rows !== null,
    accounts: accounts.size,
    journalers: 0,
    checkIns: 0,
    d7: { returned: 0, of: 0 },
    avgStreak: null,
    reminders: 0,
    sharing: 0,
    notes: 0,
  };
  if (!rows) return out;
  const byPerson = new Map<string, Set<string>>();
  for (const e of rows.entries) {
    if (!accounts.has(e.user_id)) continue;
    const set = byPerson.get(e.user_id) ?? new Set<string>();
    set.add(e.day);
    byPerson.set(e.user_id, set);
  }
  const runs: number[] = [];
  for (const set of byPerson.values()) {
    const all = [...set].sort();
    const inRange = all.filter((d) => d >= from && d <= to);
    out.checkIns += inRange.length;
    if (inRange.length) {
      out.journalers++;
      runs.push(longestRun(inRange));
    }
    const first = all[0]!;
    const day7 = addDays(first, 7);
    if (first >= from && day7 <= to) {
      out.d7.of++;
      if (all.some((d) => d >= day7 && d <= to)) out.d7.returned++;
    }
  }
  out.avgStreak = mean(runs);
  for (const s of rows.settings) {
    if (!accounts.has(s.id)) continue;
    if (s.journal_reminder_time) out.reminders++;
    if (s.journal_share === "scores" || s.journal_share === "notes") out.sharing++;
    if (s.journal_share === "notes") out.notes++;
  }
  return out;
}
