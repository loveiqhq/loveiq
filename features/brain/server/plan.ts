/**
 * Where the plan and reality have come apart.
 *
 * The Notion board is the team's system of record by recorded decision, and it is already
 * in `brain_chunk` with `state`, `assignee`, `due`, `completed` and `edited` on every
 * task. Nothing read it for health — so a task could sit untouched for eleven weeks and
 * the only way to notice was for a person to scroll past it.
 *
 * EVERY THRESHOLD HERE WAS MEASURED, NOT CHOSEN. An alarm tuned by taste fires on healthy
 * work, and an alarm that fires on healthy work is muted inside a fortnight.
 */
import { supabaseFetch } from "@features/admin/server/supabase";

/**
 * 21 days. MEASURED 2026-09-12 across the 25 open tasks: the average sits at 13 days
 * idle and the oldest at 78. At 21 days exactly FOUR are flagged — the genuine
 * stragglers — and nothing that is merely being worked on slowly.
 */
export const STALE_DAYS = 21;

export interface PlanItem {
  title: string;
  assignee: string | null;
  idleDays?: number;
  due?: string;
  sourceId: string;
}

export interface PlanHealth {
  openCount: number;
  stale: PlanItem[];
  overdue: PlanItem[];
  /** Set when the board could not be read. An empty board and an unreadable one are not
   *  the same state, and a health check that reports "all clear" for the second is worse
   *  than one that reports nothing. */
  unavailable?: string;
}

/**
 * `due` IS NOT ALWAYS A DATE. 27 of the 205 due values on the board are RANGES
 * ("2025-12-19 to 2025-12-26"), because Notion lets a date property hold one. Casting
 * blindly throws; taking the last date is the deadline the range actually implies.
 */
export function dueDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parts = raw.split(/\s+to\s+/);
  const last = parts[parts.length - 1]?.trim() ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(last) ? last : null;
}

interface TaskRow {
  source_id: string;
  title: string | null;
  meta: Record<string, unknown> | null;
}

export function assess(rows: TaskRow[], today: string, now: number): PlanHealth {
  const open = rows.filter((r) => r.meta?.state === "open");
  const item = (r: TaskRow, extra: Partial<PlanItem> = {}): PlanItem => ({
    title: String(r.title ?? "(untitled)")
      .replace(/^Notion task:\s*/i, "")
      .slice(0, 110),
    assignee: typeof r.meta?.assignee === "string" ? r.meta.assignee : null,
    sourceId: `notion/${r.source_id}`,
    ...extra,
  });

  const stale = open
    .map((r) => {
      const edited = typeof r.meta?.edited === "string" ? Date.parse(r.meta.edited) : NaN;
      const idleDays = Number.isNaN(edited) ? null : Math.floor((now - edited) / 86_400_000);
      return idleDays !== null && idleDays >= STALE_DAYS ? item(r, { idleDays }) : null;
    })
    .filter((x): x is PlanItem => x !== null)
    .sort((a, b) => (b.idleDays ?? 0) - (a.idleDays ?? 0));

  /**
   * OVERDUE MEANS OPEN AND PAST ITS DATE, not "past its date with no completion stamp".
   * MEASURED: 169 board tasks are past a due date they still carry — 148 of them DONE
   * (4 without a completion date at all), 10 of them ideas nobody has started, and only
   * 11 genuinely open. Keying on the completion stamp would have flagged 25 and been
   * wrong about 14 of them, which is how a report stops being read.
   */
  const overdue = open
    .map((r) => {
      const due = dueDate(typeof r.meta?.due === "string" ? r.meta.due : null);
      return due && due < today ? item(r, { due }) : null;
    })
    .filter((x): x is PlanItem => x !== null)
    .sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));

  return { openCount: open.length, stale, overdue };
}

export async function planHealth(): Promise<PlanHealth> {
  const res = await supabaseFetch(
    `/rest/v1/brain_chunk?select=source_id,title,meta&source=eq.notion` +
      `&meta->>kind=eq.task&meta->>database=eq.Board&limit=1000`
  );
  if (!res.ok) {
    return {
      openCount: 0,
      stale: [],
      overdue: [],
      unavailable: `the board could not be read (${res.status})`,
    };
  }
  const rows = (await res.json()) as TaskRow[];
  return assess(rows, new Date().toISOString().slice(0, 10), Date.now());
}

/** One line for the daily brief, or null on a healthy day — silence is the point. */
export function briefLine(h: PlanHealth): string | null {
  if (h.unavailable) return null;
  if (h.stale.length === 0 && h.overdue.length === 0) return null;
  const bits: string[] = [];
  if (h.stale.length) {
    const worst = h.stale[0];
    bits.push(
      `${h.stale.length} open task${h.stale.length === 1 ? "" : "s"} untouched for ${STALE_DAYS}+ days` +
        (worst
          ? ` (longest: "${worst.title}" at ${worst.idleDays} days${worst.assignee ? `, ${worst.assignee}` : ""})`
          : "")
    );
  }
  if (h.overdue.length) bits.push(`${h.overdue.length} past its due date and still open`);
  return `On the board: ${bits.join("; ")}.`;
}

/** The searchable version, so "what is slipping" is answerable without the brief. */
export function healthChunkBody(h: PlanHealth): string {
  if (h.unavailable) return `The board could not be read: ${h.unavailable}.`;
  const lines: string[] = [
    `${h.openCount} tasks are open on the Notion board.`,
    "",
    `Untouched for ${STALE_DAYS} days or more (${h.stale.length}):`,
    ...(h.stale.length
      ? h.stale.map(
          (s) => `  ${s.idleDays} days idle — ${s.title}${s.assignee ? ` (${s.assignee})` : ""}`
        )
      : ["  none — every open task has moved recently"]),
    "",
    `Past their due date and still open (${h.overdue.length}):`,
    ...(h.overdue.length
      ? h.overdue.map((s) => `  due ${s.due} — ${s.title}${s.assignee ? ` (${s.assignee})` : ""}`)
      : ["  none"]),
    "",
    `"Open" is the derived state, not the raw Notion status, because the board renames its ` +
      `columns — it moved to per-person statuses in September and a filter on the old name ` +
      `matched one dead card. "Overdue" means open AND past its date: most tasks carrying a ` +
      `past date are simply finished, and counting those would make this unreadable.`,
  ];
  return lines.join("\n");
}
