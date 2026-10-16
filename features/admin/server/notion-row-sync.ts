/**
 * Keeping a Notion data table equal to rows a job computes: plan what to create, update
 * and trash, then write it at Notion's pace. Shared by the KPI report tables on "KPI
 * report data" (survey drop-off, KPI weekly numbers); each brings its own codec, the
 * properties a row is written with and the one string both sides compare.
 */
import {
  archiveNotionPage,
  createDatabaseRow,
  updateNotionPage,
} from "@features/brain/server/act/notion";

/** A row a job computes: unique by key, and dated by its week (a Monday). */
export interface SyncRow {
  key: string;
  week: string;
}

/** A row as Notion holds it: its page id, key, and value in the codec's string form. */
export interface ExistingRow {
  id: string;
  key: string;
  value: string;
  /** Its week, when the codec reads one: lets a frozen week be left alone. */
  week?: string;
}

export interface SyncPlan<T extends SyncRow> {
  create: T[];
  update: Array<{ id: string; row: T }>;
  archive: string[];
}

/**
 * What to write so Notion holds exactly `desired` for the weeks read. A week `frozen`
 * says is final keeps what Notion has: its rows are created when missing, never rewritten
 * or trashed, because the sources behind it may no longer give the same answer.
 */
export function planRowSync<T extends SyncRow>(
  desired: T[],
  existing: ExistingRow[],
  value: (row: T) => string,
  frozen: (week: string) => boolean = () => false
): SyncPlan<T> {
  const held = new Map<string, ExistingRow>();
  const archive: string[] = [];
  const seen = new Set<string>();
  for (const e of existing) {
    if (seen.has(e.id)) continue; // one row listed twice by a read, not a second copy
    seen.add(e.id);
    if (held.has(e.key)) {
      archive.push(e.id); // a second copy of a row, from two runs at once
    } else held.set(e.key, e);
  }
  const create: T[] = [];
  const update: Array<{ id: string; row: T }> = [];
  const wanted = new Set<string>();
  for (const row of desired) {
    wanted.add(row.key);
    const e = held.get(row.key);
    if (!e) create.push(row);
    else if (e.value !== value(row) && !frozen(row.week)) update.push({ id: e.id, row });
  }
  for (const [key, e] of held) {
    if (!wanted.has(key) && !(e.week !== undefined && frozen(e.week))) archive.push(e.id);
  }
  return { create, update, archive };
}

export interface SyncResult {
  created: number;
  updated: number;
  archived: number;
  /** Writes not started before time ran out; the next run picks them up. */
  pending: number;
  failed: number;
  firstError: string | null;
}

/** Notion's own pace: about three requests a second. */
const CONCURRENCY = 3;
/** After this many failed writes the rest are left for the next run, not hammered. */
const MAX_FAILURES = 5;

/**
 * Write the plan, the newest weeks first, so a run cut short by `isOutOfTime` leaves the
 * oldest numbers stale rather than the newest.
 */
export async function applyRowSync<T extends SyncRow>(
  databaseId: string,
  plan: SyncPlan<T>,
  isOutOfTime: () => boolean,
  properties: (row: T) => Record<string, unknown>,
  token?: string
): Promise<SyncResult> {
  type Task = {
    week: string;
    kind: "created" | "updated" | "archived";
    run: () => Promise<unknown>;
  };
  const tasks: Task[] = [
    ...plan.update.map(({ id, row }) => ({
      week: row.week,
      kind: "updated" as const,
      run: () => updateNotionPage(id, properties(row), token),
    })),
    ...plan.create.map((row) => ({
      week: row.week,
      kind: "created" as const,
      run: () => createDatabaseRow(databaseId, properties(row), token),
    })),
  ].sort((a, b) => (a.week < b.week ? 1 : a.week > b.week ? -1 : 0));
  tasks.push(
    ...plan.archive.map((id) => ({
      week: "",
      kind: "archived" as const,
      run: () => archiveNotionPage(id, token),
    }))
  );

  const result: SyncResult = {
    created: 0,
    updated: 0,
    archived: 0,
    pending: 0,
    failed: 0,
    firstError: null,
  };
  let next = 0;
  const worker = async () => {
    while (next < tasks.length && !isOutOfTime() && result.failed < MAX_FAILURES) {
      const task = tasks[next++]!;
      try {
        await task.run();
        result[task.kind] += 1;
      } catch (err) {
        result.failed += 1;
        result.firstError ??= err instanceof Error ? err.message : String(err);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  result.pending = tasks.length - next;
  return result;
}
