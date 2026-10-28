import { exitReasons, type ExitStage } from "@features/report/ui/gate/exit/exitContent";
import { reportingDay, reportingDayStart } from "@shared/time/reporting-day";
import { fetchAllRows } from "../supabase";
import { FULL_PLANS, PRE_PLANS, type SubFact } from "./facts";
import { maskNote } from "./unlock-feedback";

/**
 * AP-Analytics, Payment · Paygate exits: what readers did on the paygate's two exit pages
 * (features/report/ui/gate/exit; Marcus's "Paygate exit pages", 28.10). `pre` opens from the
 * EUR 1.99 gate's "Not ready to unlock yet", `full` from the plan picker's for a EUR 1.99
 * holder. Marcus, 28.10: "think of measuring / tracking it … add it to the payment report".
 *
 * Read from the pages' own events in analytics_event, for the range's finishers only (the
 * page's people: its filters, the team and our tests left out). A reason is each reader's
 * latest; "paid after" counts a payment within 24 hours of the reader's first view of the page,
 * because E07's gift (the day after the gate, experiment #9) muddies anything later.
 */

/** The pages' first day: no row is older. */
export const EXITS_FROM = "2026-10-28";

/** A payment this soon after the first view counts as paid after the page. */
const PAID_WITHIN_S = 24 * 60 * 60;

/** The newest sentences the section shows, masked. */
const WORDS_SHOWN = 10;

export interface ExitEventRow {
  survey_submission_id: number;
  event_type: string;
  event_time: string;
  stage: string | null;
  reason: string | null;
  place: string | null;
  via: string | null;
  note: string | null;
}

const SELECT =
  "survey_submission_id,event_type,event_time,stage:metadata->>stage,reason:metadata->>reason," +
  "place:metadata->>place,via:metadata->>via,note:metadata->>answer_text";

/**
 * The pages' events since the range's first day (or the pages' own): the exit events, and the
 * EUR 1.99 page's Unlock presses made on its exit page (`initial_gate_cta_click`, place
 * `exit_card` / `exit_sticky`). Null when either read fails: a partial read is never counted.
 */
export async function readPaygateExitRows(from: string): Promise<ExitEventRow[] | null> {
  const since = encodeURIComponent(
    reportingDayStart(from > EXITS_FROM ? from : EXITS_FROM).toISOString()
  );
  const [exits, presses] = await Promise.all([
    fetchAllRows<ExitEventRow>(
      "/rest/v1/analytics_event?event_type=in.(paygate_exit_viewed,paygate_exit_reason," +
        "paygate_exit_note,paygate_exit_cta_click,paygate_exit_leave)" +
        `&event_time=gte.${since}&select=${SELECT}&order=id.asc`
    ),
    fetchAllRows<ExitEventRow>(
      "/rest/v1/analytics_event?event_type=eq.initial_gate_cta_click" +
        `&metadata->>place=in.(exit_card,exit_sticky)&event_time=gte.${since}&select=${SELECT}&order=id.asc`
    ),
  ]);
  if (!exits || !presses) return null;
  return [...exits, ...presses];
}

export interface ExitReasonCount {
  code: string;
  label: string;
  n: number;
  /** Of the readers who answered on this page. */
  share: number;
}

export interface ExitPageRow {
  stage: ExitStage;
  name: string;
  /** Readers who saw the page, each once, and the views. */
  reached: number;
  views: number;
  /** Readers who tapped a reason, and who wrote a sentence. */
  answered: number;
  wrote: number;
  /** Each reader's latest reason, ranked. */
  reasons: ExitReasonCount[];
  /** Readers who pressed Unlock on the page: on its card, on its bar, either. */
  pressed: { card: number; sticky: number; any: number };
  /** Readers who paid within 24 hours of their first view: the EUR 1.99 (pre), the full report (full). */
  paidAfter: number;
  /** How readers left it: "Maybe later", the back arrow, "Back to my open chapters". */
  left: { maybeLater: number; back: number; chapters: number };
  /** The newest sentences, masked as Unlock feedback's are. */
  words: Array<{ day: string; reason: string | null; text: string }>;
}

export interface PaygateExitsBlock {
  /** Why the section is blank (a filter the records can't follow, before the pages, a failed read), or null. */
  why: string | null;
  pages: ExitPageRow[];
}

const STAGES: ReadonlyArray<{ stage: ExitStage; name: string; plans: ReadonlySet<string> }> = [
  { stage: "pre", name: "After the €1.99 page", plans: PRE_PLANS },
  { stage: "full", name: "After the full report's plans", plans: FULL_PLANS },
];

/** A row's page: the gate's exit-page presses carry a place, not a stage. */
function stageOf(row: ExitEventRow): ExitStage | null {
  if (row.event_type === "initial_gate_cta_click") return "pre";
  return row.stage === "pre" || row.stage === "full" ? row.stage : null;
}

const epoch = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

export function buildPaygateExits(input: {
  subs: SubFact[];
  rows: ExitEventRow[] | null;
  /** peopleBlocked's reason under these filters, or null. */
  blocked: string | null;
  /** The range's last day. */
  to: string;
}): PaygateExitsBlock {
  if (input.blocked) return { why: input.blocked, pages: [] };
  if (input.to < EXITS_FROM) {
    return { why: "The exit pages are recorded from 28 Oct 2026, after this range.", pages: [] };
  }
  if (!input.rows) return { why: "The exit pages' events could not be read just now.", pages: [] };

  const subsById = new Map(input.subs.map((s) => [s.id, s]));
  const mine = input.rows.filter((r) => subsById.has(r.survey_submission_id));

  const pages = STAGES.map(({ stage, name, plans }): ExitPageRow => {
    const rows = mine
      .filter((r) => stageOf(r) === stage)
      .sort((a, b) => a.event_time.localeCompare(b.event_time));
    const firstView = new Map<number, string>();
    let views = 0;
    const latestReason = new Map<number, string>();
    const wrote = new Set<number>();
    const pressedCard = new Set<number>();
    const pressedSticky = new Set<number>();
    const left = {
      maybeLater: new Set<number>(),
      back: new Set<number>(),
      chapters: new Set<number>(),
    };
    const notes: ExitEventRow[] = [];

    for (const r of rows) {
      const sid = r.survey_submission_id;
      switch (r.event_type) {
        case "paygate_exit_viewed":
          views += 1;
          if (!firstView.has(sid)) firstView.set(sid, r.event_time);
          break;
        case "paygate_exit_reason":
          if (r.reason) latestReason.set(sid, r.reason);
          break;
        case "paygate_exit_note":
          wrote.add(sid);
          if (r.note) notes.push(r);
          break;
        case "paygate_exit_cta_click":
        case "initial_gate_cta_click": {
          const place = r.place?.replace(/^exit_/, "");
          if (place === "sticky") pressedSticky.add(sid);
          else pressedCard.add(sid);
          break;
        }
        case "paygate_exit_leave":
          if (r.via === "maybe_later") left.maybeLater.add(sid);
          else if (r.via === "chapters") left.chapters.add(sid);
          else if (r.via === "back") left.back.add(sid);
          break;
      }
    }

    const labels = new Map<string, string>(exitReasons(stage, 199).map((r) => [r.code, r.label]));
    const counts = new Map<string, number>();
    for (const code of latestReason.values()) counts.set(code, (counts.get(code) ?? 0) + 1);
    const answered = latestReason.size;
    const reasons = [...counts.entries()]
      .map(([code, n]) => ({
        code,
        label: labels.get(code) ?? code,
        n,
        share: answered > 0 ? n / answered : 0,
      }))
      .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));

    let paidAfter = 0;
    for (const [sid, seen] of firstView) {
      const from = epoch(seen);
      const paid = (subsById.get(sid)?.pays ?? []).some(
        ([t, amount, plan]) =>
          amount > 0 && plans.has(plan ?? "") && t >= from && t <= from + PAID_WITHIN_S
      );
      if (paid) paidAfter += 1;
    }

    const words = notes
      .slice(-WORDS_SHOWN)
      .reverse()
      .map((r) => ({
        day: reportingDay(new Date(r.event_time)),
        reason: latestReason.get(r.survey_submission_id) ?? null,
        text: maskNote(r.note ?? ""),
      }));

    return {
      stage,
      name,
      reached: firstView.size,
      views,
      answered,
      wrote: wrote.size,
      reasons,
      pressed: {
        card: pressedCard.size,
        sticky: pressedSticky.size,
        any: new Set([...pressedCard, ...pressedSticky]).size,
      },
      paidAfter,
      left: {
        maybeLater: left.maybeLater.size,
        back: left.back.size,
        chapters: left.chapters.size,
      },
      words,
    };
  });

  return { why: null, pages };
}
