/**
 * AP-Analytics' Emails pages (Marcus's board "Assessment A · Emails", LoveIQ Sync 5 Nov 2026: one
 * page of every email under Reports, and each assessment's own; 9 Nov: test versions split out).
 * Every email we send: how many arrive, are opened and clicked, and how many readers then did
 * what the email is sent for, per email and per version.
 *
 * Two sources, never both for one email on one day (EMAILS says which):
 * - Per reader (email_message_event, kept by the Resend webhook from the stage and sub tags): an
 *   email belongs to the day it was sent and every later event of it counts; the team and our
 *   own probes are left out; the goal is read per reader, within 7 days of the send.
 * - Resend's daily tallies (email_experiment_event, per test version), for an email no reader can
 *   be named for (survey paused goes to an unfinished survey): an event counts on its own day,
 *   the team's own tests are in, and a reader clicking twice counts twice.
 * The tallies of Survey done, the receipts, share and invite also hold staging's test emails
 * (staging sends through the same Resend account: on 3 Nov, 22 sent = 10 here + 12 on staging),
 * so those emails are counted from EMAIL_TAGS_FROM, per reader, and not before.
 *
 * One read per range (ap_emails); every rule is here, over its payload, so each one is tested.
 */
import { isUnlockReason } from "@features/unlock-feedback/logic/reasons";
import { supabaseFetch } from "@features/admin/server/supabase";
import { reportingDay } from "@shared/time/reporting-day";

import { head, type PageHead, type Tile } from "./common";
import { addDays } from "./days";
import { classifySource } from "./facts";
import {
  bucketCaption,
  buckets,
  comparisonRange,
  rangeLabel,
  trendBuckets,
  type ApFilters,
} from "./filters";
import { ratio, sameAge } from "./metrics";
import { BOT_MS } from "./unlock-feedback";

import {
  CLICK_DAYS,
  EMAIL_TAGS_FROM,
  EMAILS,
  MIN_DELIVERED,
  OPENS_FROM,
  goalsByStage,
  type EmailDef,
  type Funnel,
  type GoalKind,
  type Scope,
} from "./email-registry";

export * from "./email-registry";

// ---------------------------------------------------------------------------------------------
// The function's payload.

export interface Msg {
  stage: string;
  variant: string | null;
  sentAt: string;
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  bouncedAt: string | null;
  complainedAt: string | null;
  src: string | null;
  med: string | null;
  goalAt: string | null;
  goalReason: string | null;
}

export interface TallyRow {
  experiment: string;
  arm: string;
  day: string;
  event: string;
  n: number;
}

export interface EmailsData {
  msgs: Msg[];
  tallies: TallyRow[];
  unsubs: Array<{ campaign: string | null; day: string; n: number }>;
  finished: Array<{ day: string; src: string | null; med: string | null; n: number }>;
}

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const list = (o: Record<string, unknown>, k: string): Record<string, unknown>[] => {
  if (!Array.isArray(o[k])) throw new Error("ap_emails: unexpected shape");
  return o[k] as Record<string, unknown>[];
};

/** The function's JSON, checked: a part that is missing stops the page, it never reads as zero. */
export function parseEmails(raw: unknown): EmailsData {
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== "object") throw new Error("ap_emails: unexpected shape");
  return {
    msgs: list(o, "msgs").map((m) => ({
      stage: String(m.stage),
      variant: str(m.variant),
      sentAt: String(m.sent_at),
      deliveredAt: str(m.delivered_at),
      openedAt: str(m.opened_at),
      clickedAt: str(m.clicked_at),
      bouncedAt: str(m.bounced_at),
      complainedAt: str(m.complained_at),
      src: str(m.src),
      med: str(m.med),
      goalAt: str(m.goal_at),
      goalReason: str(m.goal_reason),
    })),
    tallies: list(o, "tallies").map((t) => ({
      experiment: String(t.experiment),
      arm: String(t.arm),
      day: String(t.day),
      event: String(t.event),
      n: num(t.n),
    })),
    unsubs: list(o, "unsubs").map((u) => ({
      campaign: str(u.campaign),
      day: String(u.day),
      n: num(u.n),
    })),
    finished: list(o, "finished").map((f) => ({
      day: String(f.day),
      src: str(f.src),
      med: str(f.med),
      n: num(f.n),
    })),
  };
}

export async function fetchEmails(from: string, to: string): Promise<EmailsData> {
  const res = await supabaseFetch("/rest/v1/rpc/ap_emails", {
    method: "POST",
    body: JSON.stringify({ p_from: from, p_to: to, p_goals: goalsByStage() }),
    timeoutMs: 30_000,
  });
  if (!res.ok) throw new Error(`ap_emails failed (${res.status})`);
  return parseEmails(await res.json());
}

/** The window one read covers: the range and the clicks line's last 30 days. */
export function readWindow(f: Pick<ApFilters, "from" | "to">): { from: string; to: string } {
  const lineFrom = addDays(f.to, -(CLICK_DAYS - 1));
  return { from: lineFrom < f.from ? lineFrom : f.from, to: f.to };
}

// ---------------------------------------------------------------------------------------------
// Counting.

/** Our own probes and verification runs, by the survey's tracker: never counted. */
const isProbe = (x: { src: string | null; med: string | null }) =>
  classifySource({ src: x.src, med: x.med, ads: false }) === "test";

const dayOf = (at: string) => reportingDay(new Date(at));
const within = (day: string, from: string, to: string) => day >= from && day <= to;

/** One email's or version's figures over a range. */
export interface Stat {
  sent: number;
  delivered: number;
  bounced: number;
  opened: number;
  /** The delivered emails an open could be known for (sent from OPENS_FROM). */
  openBase: number;
  clicked: number;
  complained: number;
  /** Null for a version: an unsubscribe is kept by campaign, not by version. */
  unsub: number | null;
  /** Readers who reached the goal in 7 days; null when it can't be read. */
  conv: number | null;
  /** The sends the goal was read for (per reader only). */
  convSent: number;
}

const ZERO: Stat = {
  sent: 0,
  delivered: 0,
  bounced: 0,
  opened: 0,
  openBase: 0,
  clicked: 0,
  complained: 0,
  unsub: 0,
  conv: null,
  convSent: 0,
};

export function addStats(a: Stat, b: Stat): Stat {
  return {
    sent: a.sent + b.sent,
    delivered: a.delivered + b.delivered,
    bounced: a.bounced + b.bounced,
    opened: a.opened + b.opened,
    openBase: a.openBase + b.openBase,
    clicked: a.clicked + b.clicked,
    complained: a.complained + b.complained,
    unsub: a.unsub === null && b.unsub === null ? null : (a.unsub ?? 0) + (b.unsub ?? 0),
    conv: a.conv === null && b.conv === null ? null : (a.conv ?? 0) + (b.conv ?? 0),
    convSent: a.convSent + b.convSent,
  };
}

/** An email kept per reader, as the page counts it, read as it stood at `cut`. */
export interface Counted {
  delivered: boolean;
  opened: boolean;
  clicked: boolean;
  bounced: boolean;
  complained: boolean;
  goal: boolean;
  /** When it was clicked (for the clicks line): the click, or the answer that was one. */
  clickAt: string | null;
}

/**
 * Each step implies the one before (as on Unlock feedback): a click needs the email open, an
 * open needs it delivered, and an answer to the unlock question is a tap on a link in it. An
 * email read with its images off records no open, and a lost webhook no delivery, so no step
 * outnumbers the one before it. An answer within 2 s of the delivery, or with no reason we
 * know, is a scanner's: not an answer.
 */
export function countMsg(m: Msg, kind: GoalKind | undefined, cut: number | null = null): Counted {
  const by = (t: string | null) => t !== null && (cut === null || Date.parse(t) <= cut);
  let goal = by(m.goalAt);
  if (goal && kind === "answer") {
    const fast =
      m.deliveredAt !== null && Date.parse(m.goalAt!) - Date.parse(m.deliveredAt) < BOT_MS;
    goal = isUnlockReason(m.goalReason) && !fast;
  }
  const answered = kind === "answer" && goal;
  const clicked = by(m.clickedAt) || answered;
  const opened = by(m.openedAt) || clicked;
  const delivered = by(m.deliveredAt) || opened;
  const clickAt = by(m.clickedAt) ? m.clickedAt : answered ? m.goalAt : null;
  return {
    delivered,
    opened,
    clicked,
    bounced: by(m.bouncedAt),
    complained: by(m.complainedAt),
    goal,
    clickAt,
  };
}

/** The days in [from, to] this email is counted per reader, and from its tallies. */
function readerDays(d: EmailDef, from: string, to: string): { from: string; to: string } | null {
  if (!d.readerFrom || !d.stages.length) return null;
  const a = from > d.readerFrom ? from : d.readerFrom;
  return a <= to ? { from: a, to } : null;
}

function tallyDays(d: EmailDef, from: string, to: string): { from: string; to: string } | null {
  if (!d.tally) return null;
  const a = from > d.tally.from ? from : d.tally.from;
  const z = d.tally.to && d.tally.to < to ? d.tally.to : to;
  return a <= z ? { from: a, to: z } : null;
}

interface Reading {
  data: EmailsData;
  /** Events after it don't count (the period before, at the same age); null: none. */
  cut: number | null;
}

/** One email's (or one of its versions') figures over [from, to]. */
export function statOf(d: EmailDef, r: Reading, from: string, to: string, version?: string): Stat {
  let s: Stat = { ...ZERO, conv: d.goalKind ? 0 : null, unsub: version === undefined ? 0 : null };
  const rd = readerDays(d, from, to);
  if (rd) {
    for (const m of r.data.msgs) {
      if (!d.stages.includes(m.stage) || isProbe(m)) continue;
      if (version !== undefined && (m.variant ?? "") !== version) continue;
      const day = dayOf(m.sentAt);
      if (!within(day, rd.from, rd.to)) continue;
      const c = countMsg(m, d.goalKind, r.cut);
      s.sent += 1;
      s.delivered += c.delivered ? 1 : 0;
      s.bounced += c.bounced ? 1 : 0;
      s.opened += c.opened ? 1 : 0;
      s.openBase += c.delivered && day >= OPENS_FROM ? 1 : 0;
      s.clicked += c.clicked ? 1 : 0;
      s.complained += c.complained ? 1 : 0;
      if (s.conv !== null) {
        s.conv += c.goal ? 1 : 0;
        s.convSent += 1;
      }
    }
  }
  const td = tallyDays(d, from, to);
  if (td) {
    for (const t of r.data.tallies) {
      if (t.experiment !== d.tally!.experiment || !within(t.day, td.from, td.to)) continue;
      if (version !== undefined && t.arm !== version) continue;
      if (t.event === "sent") s.sent += t.n;
      else if (t.event === "delivered") {
        s.delivered += t.n;
        if (t.day >= OPENS_FROM) s.openBase += t.n;
      } else if (t.event === "bounced") s.bounced += t.n;
      else if (t.event === "opened") s.opened += t.n;
      else if (t.event === "clicked") s.clicked += t.n;
      else if (t.event === "complained") s.complained += t.n;
    }
  }
  // Unsubscribes by the campaign of the link, on the days the email itself is counted.
  if (version === undefined && d.unsub.length) {
    let u = 0;
    for (const x of r.data.unsubs) {
      if (!x.campaign || !d.unsub.includes(x.campaign)) continue;
      if ((rd && within(x.day, rd.from, rd.to)) || (td && within(x.day, td.from, td.to))) u += x.n;
    }
    s = { ...s, unsub: u };
  }
  return s;
}

/** The versions an email was sent as over the range, when there are two or more. */
function versionsOf(d: EmailDef, r: Reading, from: string, to: string): string[] {
  const seen = new Set<string>();
  const rd = readerDays(d, from, to);
  if (rd) {
    for (const m of r.data.msgs) {
      if (d.stages.includes(m.stage) && !isProbe(m) && within(dayOf(m.sentAt), rd.from, rd.to)) {
        seen.add(m.variant ?? "");
      }
    }
  }
  const td = tallyDays(d, from, to);
  if (td) {
    for (const t of r.data.tallies) {
      if (
        t.experiment === d.tally!.experiment &&
        t.event === "sent" &&
        within(t.day, td.from, td.to)
      )
        seen.add(t.arm);
    }
  }
  return seen.size > 1
    ? [...seen].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)))
    : [];
}

/** Clicks per day over the 30 days ending `to`: per reader by the click's day, tallies by theirs. */
function clicksByDay(d: EmailDef, r: Reading, to: string): number[] {
  const from = addDays(to, -(CLICK_DAYS - 1));
  const out = new Array<number>(CLICK_DAYS).fill(0);
  const index = (day: string) =>
    Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
  if (d.readerFrom && d.stages.length) {
    for (const m of r.data.msgs) {
      if (!d.stages.includes(m.stage) || isProbe(m)) continue;
      const at = countMsg(m, d.goalKind).clickAt;
      if (!at) continue;
      const day = dayOf(at);
      if (day < d.readerFrom || dayOf(m.sentAt) < d.readerFrom || !within(day, from, to)) continue;
      out[index(day)]! += 1;
    }
  }
  const td = tallyDays(d, from, to);
  if (td) {
    for (const t of r.data.tallies) {
      if (
        t.experiment === d.tally!.experiment &&
        t.event === "clicked" &&
        within(t.day, td.from, td.to)
      )
        out[index(t.day)]! += t.n;
    }
  }
  return out;
}

/** "72 clicks · +0.4/wk": the least-squares slope over the days, per week. */
export function clickTrend(days: number[]): {
  text: string;
  tone: "good" | "bad" | "flat" | "none";
} {
  const total = days.reduce((a, b) => a + b, 0);
  if (!total) return { text: "no clicks", tone: "none" };
  const n = days.length;
  const mx = (n - 1) / 2;
  const my = total / n;
  let num = 0;
  let den = 0;
  days.forEach((y, i) => {
    num += (i - mx) * (y - my);
    den += (i - mx) * (i - mx);
  });
  const perWeek = (den ? num / den : 0) * 7;
  const clicks = `${total.toLocaleString("en-US")} click${total === 1 ? "" : "s"}`;
  if (Math.abs(perWeek) < 0.05) return { text: `${clicks} · flat`, tone: "flat" };
  return {
    text: `${clicks} · ${perWeek > 0 ? "+" : "−"}${Math.abs(perWeek).toFixed(1)}/wk`,
    tone: perWeek > 0 ? "good" : "bad",
  };
}

// ---------------------------------------------------------------------------------------------
// The page.

export type Standing = "plain" | "best" | "worst" | "thin";

export interface EmailRow {
  key: string;
  name: string;
  /** Version rows sit under their email. */
  version: string | null;
  assessment: "A" | null;
  funnel: Funnel | null;
  also: Funnel[];
  goal: string;
  goalNote: string | null;
  /** Null: nothing counted for this email in the range, and `note` says why. */
  stat: Stat | null;
  note: string | null;
  /** Best and worst among the emails with 20 or more delivered, per rate. */
  standing: Record<"conv" | "click" | "open" | "bounce" | "unsub", Standing>;
  /** Per reader, from tallies, or both over the range. */
  source: "reader" | "tally" | "both" | null;
  clicks: number[];
  clickTrend: { text: string; tone: "good" | "bad" | "flat" | "none" };
}

export interface EmailsPayload extends PageHead {
  scope: Scope;
  tiles: Tile[];
  finished: number;
  mix: Array<{ label: string; n: number }>;
  byAssessment: Array<{
    name: string;
    status: "live" | "soon" | "none";
    stat: Stat | null;
    emails: number;
  }>;
  rows: EmailRow[];
  total: {
    stat: Stat;
    emails: number;
    uncounted: number;
    clicks: number[];
    clickTrend: EmailRow["clickTrend"];
  };
  weeks: Array<{ label: string; from: string; to: string; sent: number; clicked: number }>;
  clicksFrom: string;
  /** Built and switched off: listed from their first send. */
  off: number;
}

/** An email no registry entry names: the per-reader rows' stage, or the tallies' test. */
function unknownDefs(data: EmailsData): EmailDef[] {
  const stages = new Set(EMAILS.flatMap((d) => d.stages));
  const tests = new Set(EMAILS.flatMap((d) => (d.tally ? [d.tally.experiment] : [])));
  // The tallies of the tests above, and of the old ones whose emails are read per reader now.
  const known = new Set([
    ...tests,
    "survey-complete",
    "purchase-full_report",
    "purchase-all_reports",
    "unlock_feedback_subject",
  ]);
  const out: EmailDef[] = [];
  for (const s of [...new Set(data.msgs.map((m) => m.stage))].sort()) {
    if (stages.has(s)) continue;
    out.push({
      key: `stage:${s}`,
      name: s.replace(/[_-]+/g, " "),
      stages: [s],
      readerFrom: "2026-01-01",
      assessment: null,
      funnel: "shared",
      goal: "—",
      goalNote: "Not set for this email yet.",
      unsub: [s],
      live: false,
    });
  }
  for (const e of [...new Set(data.tallies.map((t) => t.experiment))].sort()) {
    if (known.has(e)) continue;
    out.push({
      key: `test:${e}`,
      name: e.replace(/[_-]+/g, " "),
      stages: [],
      tally: { experiment: e, from: "2026-01-01" },
      assessment: null,
      funnel: "shared",
      goal: "—",
      goalNote: "Not set for this email yet.",
      unsub: [],
      live: false,
    });
  }
  return out;
}

const rate = {
  conv: (s: Stat) => (s.conv === null ? null : ratio(s.conv, s.convSent)),
  click: (s: Stat) => ratio(s.clicked, s.delivered),
  open: (s: Stat) => ratio(s.opened, s.openBase),
  bounce: (s: Stat) => ratio(s.bounced, s.sent),
  unsub: (s: Stat) => (s.unsub === null ? null : ratio(s.unsub, s.delivered)),
};
const LOWER_IS_BETTER = new Set(["bounce", "unsub"]);

function standings(rows: EmailRow[]): void {
  const main = rows.filter((r) => r.version === null && r.stat);
  for (const k of Object.keys(rate) as Array<keyof typeof rate>) {
    const rated = main.filter(
      (r) => r.stat!.delivered >= MIN_DELIVERED && rate[k](r.stat!) !== null
    );
    const xs = rated.map((r) => rate[k](r.stat!)!);
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    for (const r of main) {
      const v = rate[k](r.stat!);
      if (v === null) continue;
      if (r.stat!.delivered < MIN_DELIVERED) r.standing[k] = "thin";
      else if (rated.length >= 2 && lo !== hi) {
        const best = LOWER_IS_BETTER.has(k) ? lo : hi;
        const worst = LOWER_IS_BETTER.has(k) ? hi : lo;
        r.standing[k] = v === best ? "best" : v === worst ? "worst" : "plain";
      }
    }
  }
  // A version is ranked against its email's other versions, best only (as the design marks a
  // test's winner), on conversions and clicks.
  const groups = new Map<string, EmailRow[]>();
  for (const r of rows)
    if (r.version !== null && r.stat) groups.set(r.key, [...(groups.get(r.key) ?? []), r]);
  for (const vs of groups.values()) {
    for (const k of ["conv", "click"] as const) {
      const rated = vs.filter(
        (r) => r.stat!.delivered >= MIN_DELIVERED && rate[k](r.stat!) !== null
      );
      if (rated.length < 2) continue;
      const hi = Math.max(...rated.map((r) => rate[k](r.stat!)!));
      if (hi <= 0 || rated.every((r) => rate[k](r.stat!) === hi)) continue;
      for (const r of rated) if (rate[k](r.stat!) === hi) r.standing[k] = "best";
    }
  }
}

const PLAIN = (): EmailRow["standing"] => ({
  conv: "plain",
  click: "plain",
  open: "plain",
  bounce: "plain",
  unsub: "plain",
});

export function buildEmailsPage(input: {
  data: EmailsData;
  /** The period before's read, for the tiles' change; null when not compared or unread. */
  previous: EmailsData | null;
  filters: ApFilters;
  scope: Scope;
  today: string;
  now: Date;
}): EmailsPayload {
  const { data, filters: f, scope, today, now } = input;
  // Every email, over all traffic: the bar shows the narrowing filters fixed.
  const all: ApFilters = { ...f, source: "all", device: "all", tier: "all", visitor: "all" };
  const pageHead = head(all, today, now);
  const notes = [...pageHead.notes];
  const cur: Reading = { data, cut: null };
  const cmp = comparisonRange(f);
  const prev: Reading | null =
    input.previous && cmp ? { data: input.previous, cut: sameAge(f, cmp, now).getTime() } : null;

  const defs = [...EMAILS, ...unknownDefs(data)].filter(
    (d) => scope === "overall" || d.assessment === "A"
  );

  const rows: EmailRow[] = [];
  let off = 0;
  for (const d of defs) {
    const counted = Boolean(readerDays(d, f.from, f.to) || tallyDays(d, f.from, f.to));
    const stat = counted ? statOf(d, cur, f.from, f.to) : null;
    if (!d.live && (!stat || stat.sent === 0)) {
      if (d.switchedOff) off += 1;
      continue;
    }
    // Counted from a day after the range, or inside it: the row says from when.
    const from = d.readerFrom ?? d.tally?.from ?? null;
    const note = d.untracked
      ? "not counted"
      : !counted
        ? from && from > f.to
          ? `counted from ${rangeLabel(from, from)}`
          : "not counted"
        : from && from > f.from
          ? `from ${rangeLabel(from, from)}`
          : stat!.sent === 0
            ? "none sent"
            : null;
    const rd = readerDays(d, f.from, f.to);
    const td = tallyDays(d, f.from, f.to);
    const clicks = clicksByDay(d, cur, f.to);
    rows.push({
      key: d.key,
      name: d.name,
      version: null,
      assessment: d.assessment,
      funnel: d.assessment ? d.funnel : null,
      also: d.also ?? [],
      goal: d.goal,
      goalNote: d.goalKind ? null : (d.goalNote ?? null),
      stat,
      note,
      standing: PLAIN(),
      source: rd && td ? "both" : rd ? "reader" : td ? "tally" : null,
      clicks,
      clickTrend: clickTrend(clicks),
    });
    if (stat && !d.untracked) {
      for (const v of versionsOf(d, cur, f.from, f.to)) {
        rows.push({
          ...rows[rows.length - 1]!,
          version: v,
          name: v ? `Version ${v.toUpperCase()}` : "No version",
          stat: statOf(d, cur, f.from, f.to, v),
          note: null,
          standing: PLAIN(),
          clicks: [],
          clickTrend: { text: "", tone: "none" },
        });
      }
    }
  }
  standings(rows);

  const main = rows.filter((r) => r.version === null);
  const counted = main.filter((r) => r.stat);
  const sumOf = (xs: EmailRow[]) =>
    xs.reduce<Stat>((a, r) => addStats(a, r.stat!), { ...ZERO, unsub: 0 });
  const totalStat = sumOf(counted);
  const totalClicks = new Array<number>(CLICK_DAYS).fill(0);
  for (const r of main) r.clicks.forEach((c, i) => (totalClicks[i]! += c));

  // The tiles: every counted email together; each line point is one of the range's whole weeks
  // (or months), the change against the period before at the same age.
  const scopeDefs = defs.filter((d) => main.some((r) => r.key === d.key && r.stat));
  const statIn = (r: Reading, from: string, to: string): Stat => {
    const s = scopeDefs.reduce<Stat>((a, d) => addStats(a, statOf(d, r, from, to)), {
      ...ZERO,
      unsub: 0,
    });
    return s;
  };
  const points = trendBuckets(f.from, f.to);
  const caption = bucketCaption(f.from, f.to);
  // Compared only when each email counted now was counted over the whole period before: an
  // email whose counting began later would read as growth.
  const late = scopeDefs.filter((d) => (d.readerFrom ?? d.tally?.from ?? "") > (cmp?.from ?? ""));
  const prevStat = prev && cmp && !late.length ? statIn(prev, cmp.from, cmp.to) : null;
  if (cmp && late.length) {
    const first = late
      .map((d) => d.readerFrom ?? d.tally!.from)
      .sort()
      .at(-1)!;
    notes.push(
      `Not compared with the period before: ${late.length === 1 ? `${late[0]!.name} is` : `${late.length} of these emails are`} counted only from ${rangeLabel(first, first)}.`
    );
  }
  const pointStats = points.map((b) => statIn(cur, b.from, b.to));
  const n = (v: number) => v.toLocaleString("en-US");
  const tile = (
    key: string,
    label: string,
    unit: Tile["unit"],
    pick: (s: Stat) => number | null,
    foot: string,
    goodWhen: Tile["goodWhen"]
  ): Tile => ({
    key,
    label,
    unit,
    value: pick(totalStat),
    prev: prevStat ? pick(prevStat) : null,
    goodWhen,
    spark: pointStats.map(pick),
    foot,
    blocked: null,
    trend: caption,
  });
  const tiles: Tile[] = [
    tile("sent", "Emails sent", "count", (s) => s.sent, `${counted.length} emails`, "either"),
    tile(
      "delivered",
      "Delivered",
      "pct",
      (s) => ratio(s.delivered, s.sent),
      `${n(totalStat.delivered)} of ${n(totalStat.sent)} sent`,
      "up"
    ),
    tile(
      "bounced",
      "Bounced",
      "pct",
      (s) => ratio(s.bounced, s.sent),
      `${n(totalStat.bounced)} of ${n(totalStat.sent)} sent`,
      "down"
    ),
    tile(
      "opened",
      "Opened",
      "pct",
      (s) => ratio(s.opened, s.openBase),
      `${n(totalStat.opened)} of ${n(totalStat.openBase)} delivered`,
      "up"
    ),
    tile(
      "clicked",
      "Clicked",
      "pct",
      (s) => ratio(s.clicked, s.delivered),
      `${n(totalStat.clicked)} of ${n(totalStat.delivered)} delivered`,
      "up"
    ),
    tile("complaints", "Spam complaints", "count", (s) => s.complained, "marked as spam", "down"),
    tile(
      "unsub",
      "Unsubscribed",
      "pct",
      (s) => (s.unsub === null ? null : ratio(s.unsub, s.delivered)),
      `${n(totalStat.unsub ?? 0)} of ${n(totalStat.delivered)} delivered`,
      "down"
    ),
  ];

  const finished = data.finished
    .filter((x) => within(x.day, f.from, f.to) && !isProbe(x))
    .reduce((a, x) => a + x.n, 0);

  // Where the emails go: the four sent most, and the rest.
  const bySent = counted
    .filter((r) => r.stat!.sent > 0)
    .sort((a, b) => b.stat!.sent - a.stat!.sent);
  const mix = bySent.slice(0, 4).map((r) => ({ label: r.name, n: r.stat!.sent }));
  const rest = bySent.slice(4).reduce((a, r) => a + r.stat!.sent, 0);
  if (rest) mix.push({ label: "Everything else", n: rest });

  const aRows = counted.filter((r) => r.assessment === "A");
  const noneRows = counted.filter((r) => r.assessment === null);
  const byAssessment: EmailsPayload["byAssessment"] =
    scope === "overall"
      ? [
          {
            name: "Assessment A",
            status: "live",
            stat: aRows.length ? sumOf(aRows) : null,
            emails: aRows.length,
          },
          { name: "Assessment B", status: "soon", stat: null, emails: 0 },
          { name: "Assessment C", status: "soon", stat: null, emails: 0 },
          {
            name: "Not tied to an assessment",
            status: noneRows.length ? "live" : "none",
            stat: noneRows.length ? sumOf(noneRows) : null,
            emails: noneRows.length,
          },
        ]
      : [];

  // Week by week: each Monday-to-Sunday week of the range (cut at its ends), the emails sent in
  // it and their clicks.
  const weeks = buckets(f.from, f.to, "week").map((b) => {
    const s = statIn(cur, b.from, b.to);
    return { label: b.label, from: b.from, to: b.to, sent: s.sent, clicked: s.clicked };
  });

  if (f.from < EMAIL_TAGS_FROM) {
    notes.push(
      `Survey done, the receipts, the pay-to-start report emails, share and invite are counted from ${rangeLabel(EMAIL_TAGS_FROM, EMAIL_TAGS_FROM)}: before, Resend's counts of them also held staging's test emails.`
    );
  }
  if (f.from < OPENS_FROM) {
    notes.push(
      `Opens are known from ${rangeLabel(OPENS_FROM, OPENS_FROM)}, when open tracking went on.`
    );
  }

  return {
    ...pageHead,
    notes,
    scope,
    tiles,
    finished,
    mix,
    byAssessment,
    rows,
    total: {
      stat: totalStat,
      emails: main.length,
      uncounted: main.length - counted.length,
      clicks: totalClicks,
      clickTrend: clickTrend(totalClicks),
    },
    weeks,
    clicksFrom: addDays(f.to, -(CLICK_DAYS - 1)),
    off,
  };
}
