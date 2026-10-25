/**
 * The Unlock feedback page (Marcus's canvas of 18 Oct 2026): what the "why didn't you unlock?"
 * email did from send to answer and how clean those answers are, why readers say they did not
 * unlock (with what they added on the follow-up page and their own words), by segment and by day
 * after the send, the subject test, what the free unlocks did with their report against paying
 * readers, and the written answers, masked.
 *
 * One read per range (ap_unlock_feedback: one row per email sent in it, and the range's paying
 * readers). Every rule is here, over that payload, so each one is tested.
 */
import { WIZARD_DRAWER } from "@features/survey/ui/wizard/wizardContent";
import { masker, MASKED, type Masker } from "@features/admin/server/team-export";
import { supabaseFetch } from "@features/admin/server/supabase";
import {
  isUnlockReason,
  keepKnownChips,
  REASON_COPY,
  UNLOCK_REASONS,
  type ReasonTheme,
  type UnlockReason,
} from "@features/unlock-feedback/logic/reasons";
import {
  isSubjectArm,
  SUBJECT_ARMS,
  subjectLabel,
  type SubjectArm,
} from "@features/unlock-feedback/logic/subjects";

import { head, type PageHead, type Tile } from "./common";
import { classifySource } from "./facts";
import {
  bucketCaption,
  comparisonRange,
  dayCount,
  rangeLabel,
  trendBuckets,
  type ApFilters,
} from "./filters";
import { fmt, type Unit } from "./format";
import { mean, median, ratio, sameAge } from "./metrics";
import { AGE_BANDS, ageBand, genderLabel } from "./survey-page";

/** What a reader did after their unlock, as the migration reads it. */
export interface AfterUnlock {
  /** Each chapter reached after the unlock, by its id, with when. */
  reached: Record<string, string>;
  /** Reading time over the report sessions begun after it, and how many were counted. */
  readMs: number;
  closed: number;
  ups: number;
  downs: number;
  /** Shared the report or invited someone after it. */
  shared: boolean;
}

/** One email sent in the range, with everything that happened to it since. */
export interface FeedbackEmail {
  /** The Berlin day it was sent. */
  day: string;
  arm: string | null;
  sentAt: string;
  /** The survey's tracker, for leaving our own probes out. */
  src: string | null;
  med: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  bouncedAt: string | null;
  reason: string | null;
  answeredAt: string | null;
  changedAt: string | null;
  loads: number;
  chips: string[];
  /** The reader's own words, as stored: masked before anything leaves the server. */
  note: string | null;
  detailAt: string | null;
  device: string | null;
  alreadyPaid: boolean;
  unlockedAt: string | null;
  gender: string | null;
  age: string | null;
  archetype: string | null;
  unsubAt: string | null;
  after: AfterUnlock | null;
}

export interface UnlockFeedbackData {
  rows: FeedbackEmail[];
  /** The readers whose first full unlock was paid in the range. */
  paid: Array<{ day: string; src: string | null; med: string | null; after: AfterUnlock }>;
  /** The Berlin day the first email went out; null before. */
  firstSent: string | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};

/** A paying reader's "after" when the function sent none: nothing done yet. */
const NOTHING_AFTER: AfterUnlock = {
  reached: {},
  readMs: 0,
  closed: 0,
  ups: 0,
  downs: 0,
  shared: false,
};

function parseAfter(v: unknown): AfterUnlock | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const reached: Record<string, string> = {};
  if (o.reached && typeof o.reached === "object") {
    for (const [id, at] of Object.entries(o.reached)) if (typeof at === "string") reached[id] = at;
  }
  return {
    reached,
    readMs: num(o.read_ms),
    closed: num(o.closed),
    ups: num(o.ups),
    downs: num(o.downs),
    shared: o.shared === true,
  };
}

/** The function's JSON, checked: a part that is missing stops the page, it never reads as zero. */
export function parseUnlockFeedback(raw: unknown): UnlockFeedbackData {
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || !Array.isArray(o.rows) || !Array.isArray(o.paid)) {
    throw new Error("ap_unlock_feedback: unexpected shape");
  }
  return {
    rows: (o.rows as Record<string, unknown>[]).map((r) => ({
      day: String(r.day),
      arm: str(r.arm),
      sentAt: String(r.sent_at),
      src: str(r.src),
      med: str(r.med),
      deliveredAt: str(r.delivered_at),
      openedAt: str(r.opened_at),
      clickedAt: str(r.clicked_at),
      bouncedAt: str(r.bounced_at),
      reason: str(r.reason),
      answeredAt: str(r.answered_at),
      changedAt: str(r.changed_at),
      loads: num(r.loads),
      chips: Array.isArray(r.chips)
        ? r.chips.filter((c): c is string => typeof c === "string")
        : [],
      note: str(r.note),
      detailAt: str(r.detail_at),
      device: str(r.device),
      alreadyPaid: r.already_paid === true,
      unlockedAt: str(r.unlocked_at),
      gender: str(r.gender),
      age: str(r.age),
      archetype: str(r.archetype),
      unsubAt: str(r.unsub_at),
      after: parseAfter(r.after),
    })),
    paid: (o.paid as Record<string, unknown>[]).map((p) => ({
      day: String(p.day),
      src: str(p.src),
      med: str(p.med),
      after: parseAfter(p.after) ?? NOTHING_AFTER,
    })),
    firstSent: str(o.first_sent),
  };
}

export async function fetchUnlockFeedback(from: string, to: string): Promise<UnlockFeedbackData> {
  const res = await supabaseFetch("/rest/v1/rpc/ap_unlock_feedback", {
    method: "POST",
    body: JSON.stringify({ p_from: from, p_to: to }),
    timeoutMs: 30_000,
  });
  if (!res.ok) throw new Error(`ap_unlock_feedback failed (${res.status})`);
  return parseUnlockFeedback(await res.json());
}

/** An answer this soon after delivery is a link scanner or a bot running the page, not a person. */
export const BOT_MS = 2_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** A group under this many answers is greyed out and not compared (Marcus's segments). */
export const MIN_GROUP = 20;
/** The written answers the page lists, newest first. */
export const WRITTEN_MAX = 500;
/** The report's first chapter: a reader "opened the report" once they read past it. */
const FIRST_CHAPTER = WIZARD_DRAWER[0]?.rows[0]?.id ?? "introduction";
/** z of a two-sided 90% interval. */
const Z90 = 1.6448536269514722;

/**
 * A run of digits as people write a phone number: spaced, dashed, dotted or bracketed, a + or an
 * opening bracket before. Never inside a word, so the code an address is masked to (masked-1a2b…)
 * is not cut into. It is a phone number from seven digits (isPhoneRun).
 */
const DIGIT_RUN = /(?<![\w-])[(+]*\d[\d\s()./-]*\d(?!\w)/g;
/**
 * Seven digits or more that are no phone number, kept narrow so a number never slips through
 * dressed as one: a real date (23.10.2026, 2026-10-23), prices of up to four digits each
 * (19.99 / 29.99, 9.99-19.99), or a round thousands figure (1.000.000). Anything else of seven
 * digits or more is masked.
 */
const NOT_A_PHONE =
  /^(?:(?:0?[1-9]|[12]\d|3[01])\.(?:0?[1-9]|1[0-2])\.(?:\d{2}|(?:19|20)\d{2})|(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])|\d{1,4}[.,]\d{2}(?:\s*[/–-]\s*\d{1,4}[.,]\d{2})*|[1-9]\d{0,2}(?:[.,]000)+)$/;

/** A run of digits (DIGIT_RUN) that reads as a phone number. */
export function isPhoneRun(run: string): boolean {
  return run.replace(/\D/g, "").length >= 7 && !NOT_A_PHONE.test(run.trim());
}

/**
 * A reader's words as the page may show them: email addresses and report links masked as the raw
 * data explorer masks text (team-export's masker), then phone numbers. Names are not found in
 * free text, as in the team's copy of the data.
 */
export function maskNote(text: string, m: Masker = masker()): string {
  return m.text(text.trim()).replace(DIGIT_RUN, (run) => (isPhoneRun(run) ? MASKED : run));
}

/** The Wilson score interval of k in n, 90% by default; null with nobody to go on. */
export function wilson(k: number, n: number, z = Z90): { lo: number; hi: number } | null {
  if (n <= 0) return null;
  const p = k / n;
  const z2 = z * z;
  const d = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / d;
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

/** When a reader first reached a chapter past the report's first after their unlock; null if never. */
export function readPastFirst(a: AfterUnlock): number | null {
  const times = Object.entries(a.reached)
    .filter(([id]) => id !== FIRST_CHAPTER)
    .map(([, at]) => Date.parse(at))
    .filter(Number.isFinite);
  return times.length ? Math.min(...times) : null;
}

const hasDetail = (r: FeedbackEmail) => r.chips.length > 0 || Boolean(r.note?.trim());
/** Our own probes and verification runs, by the survey's tracker: never counted, as on every AP page. */
const isProbe = (x: { src: string | null; med: string | null }) =>
  classifySource({ src: x.src, med: x.med, ads: false }) === "test";

/** An email as the page counts it, read as it stood at `cut` (an earlier period at the same age). */
export interface CountedEmail {
  row: FeedbackEmail;
  delivered: boolean;
  opened: boolean;
  /** A click Resend saw, or an answer: either is a tap on a link in the email. */
  clicked: boolean;
  bounced: boolean;
  /** An answer we count; null when there is none, or it was a scanner's or a bot's. */
  answer: UnlockReason | null;
  /** Clicked, but no answer we count. */
  bot: boolean;
  /** Repeat taps on the email's links and reloads of the page, after the answer we count. */
  repeats: number;
  changed: boolean;
  /** Picked a chip or wrote something on the follow-up page. */
  detail: boolean;
  /** An answer we count that unlocked the report for free (not a reader who had bought). */
  unlocked: boolean;
  /** Unlocked, then read past the report's first chapter. */
  openedReport: boolean;
  unsubscribed: boolean;
}

export function countEmail(r: FeedbackEmail, cut: number | null = null): CountedEmail {
  const by = (t: string | null) => t !== null && (cut === null || Date.parse(t) <= cut);
  const answered = by(r.answeredAt) && isUnlockReason(r.reason);
  const fast =
    answered &&
    r.deliveredAt !== null &&
    Date.parse(r.answeredAt!) - Date.parse(r.deliveredAt) < BOT_MS;
  const counted = answered && !fast;
  // Each step implies the one before (an answer was a tap on a reason link, a click needs the
  // email open, an open needs it delivered): an email read with its images off records no open,
  // and a lost webhook no delivery, so no step outnumbers the one before it.
  const clicked = by(r.clickedAt) || answered;
  const opened = by(r.openedAt) || clicked;
  const delivered = by(r.deliveredAt) || opened;
  const unlocked = counted && !r.alreadyPaid && by(r.unlockedAt);
  const past = unlocked && r.after ? readPastFirst(r.after) : null;
  return {
    row: r,
    delivered,
    opened,
    clicked,
    bounced: by(r.bouncedAt),
    answer: counted ? (r.reason as UnlockReason) : null,
    bot: clicked && !counted,
    repeats: counted ? Math.max(0, r.loads - 1) : 0,
    changed: counted && by(r.changedAt),
    // Every follow-up post replaces the chips and words and stamps detail_at, a change of answer
    // alone too: so detail is what is there, and detail_at only dates it.
    detail: counted && hasDetail(r) && (cut === null || by(r.detailAt)),
    unlocked,
    openedReport: past !== null && (cut === null || past <= cut),
    unsubscribed: by(r.unsubAt),
  };
}

interface Counts {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  bots: number;
  answers: number;
  repeats: number;
  changed: number;
  detail: number;
  unlocks: number;
  /** Answers from readers who had bought before answering: nothing to unlock. */
  boughtFirst: number;
  openedReport: number;
  unsubscribed: number;
}

function counts(list: CountedEmail[]): Counts {
  const n = (pick: (e: CountedEmail) => boolean) => list.filter(pick).length;
  return {
    sent: list.length,
    delivered: n((e) => e.delivered),
    opened: n((e) => e.opened),
    clicked: n((e) => e.clicked),
    bounced: n((e) => e.bounced),
    bots: n((e) => e.bot),
    answers: n((e) => e.answer !== null),
    repeats: list.reduce((a, e) => a + e.repeats, 0),
    changed: n((e) => e.changed),
    detail: n((e) => e.detail),
    unlocks: n((e) => e.unlocked),
    boughtFirst: n((e) => e.answer !== null && e.row.alreadyPaid),
    openedReport: n((e) => e.openedReport),
    unsubscribed: n((e) => e.unsubscribed),
  };
}

export interface FunnelStep {
  key: string;
  name: string;
  note: string;
  n: number;
  /** Of the step before (Opened report: of the free unlocks); null for Sent. */
  ofPrev: number | null;
  ofDelivered: number | null;
  /** The bar, as a share of delivered (of sent while nothing is delivered), at most 1. */
  bar: number;
}

export interface QualityLine {
  key: string;
  name: string;
  note: string;
  n: number;
  /** Taken off the raw clicks, as drawn ("−131"). */
  minus?: boolean;
  tone: "ink" | "bad" | "muted";
  strong?: boolean;
}

export interface ReasonRow {
  code: UnlockReason;
  label: string;
  theme: ReasonTheme;
  n: number;
  /** Of the answers we count. */
  share: number | null;
  /** Against the most-chosen reason. */
  bar: number;
  /** Of them, those who picked a chip or wrote something. */
  detail: number;
  question: string;
  chips: Array<{ label: string; n: number }>;
  /** The newest notes for it, masked. */
  quotes: string[];
}

export interface SegmentColumn {
  key: string;
  name: string;
  n: number;
  /** Under MIN_GROUP answers: greyed out and not compared. */
  small: boolean;
}

export interface ArmRow {
  arm: SubjectArm;
  subject: string;
  delivered: number;
  answers: number;
  rate: number | null;
  /** The rate's 90% Wilson interval. */
  lo: number | null;
  hi: number | null;
}

export interface AfterRow {
  key: string;
  name: string;
  unit: Unit;
  digits?: number;
  free: number | null;
  paid: number | null;
}

export interface WrittenAnswer {
  /** When it was written (the follow-up post), else when they answered. */
  at: string;
  reason: string;
  /** Masked: no email address, report link or phone number. */
  text: string;
  archetype: string | null;
  device: string | null;
}

export interface UnlockFeedbackPayload extends PageHead {
  /** The design's "Epic running · day N", from the first email; null before it. */
  running: { since: string; day: number } | null;
  tiles: Tile[];
  funnel: FunnelStep[];
  bounced: number;
  quality: QualityLine[];
  /** The answers we count: every share below is of them. */
  answers: number;
  themes: Array<{ name: ReasonTheme; n: number; share: number | null }>;
  reasons: ReasonRow[];
  segments: {
    columns: SegmentColumn[];
    rows: Array<{ code: UnlockReason; label: string; cells: Array<number | null> }>;
  };
  time: {
    /** Answers by days after the send, D0 (its first 24 hours) to D10+. */
    days: Array<{ label: string; n: number }>;
    medianMs: number | null;
    /** Of the answers, those in the first 48 hours. */
    within48h: number | null;
    unsubscribed: number;
    unsubRate: number | null;
  };
  arms: ArmRow[];
  after: { free: number; paid: number; rows: AfterRow[] };
  written: { total: number; rows: WrittenAnswer[] };
}

/** The follow-up's question as the admin canvas words it, where that is not the reader's own. */
const ADMIN_QUESTION: Partial<Record<UnlockReason, string>> = {
  free_enough: "What did they come to LoveIQ for?",
  unclear_content: "What would have helped them decide?",
  privacy: "What gave them pause?",
  other: "Free text only",
};

const DEVICE_NAMES: Record<string, string> = {
  mobile: "Mobile",
  desktop: "Desktop",
  tablet: "Tablet",
};

/** The design's columns: device as /why saw it (on the first answer), gender and age as AP reads them. */
const SEGMENTS: Array<{ key: string; name: string; has: (r: FeedbackEmail) => boolean }> = [
  ...["mobile", "desktop", "tablet"].map((d) => ({
    key: d,
    name: DEVICE_NAMES[d]!,
    has: (r: FeedbackEmail) => r.device === d,
  })),
  ...["Women", "Men"].map((g) => ({
    key: g.toLowerCase(),
    name: g,
    has: (r: FeedbackEmail) => genderLabel(r.gender) === g,
  })),
  ...AGE_BANDS.map((a) => ({
    key: `age-${a}`,
    name: `Age ${a}`,
    has: (r: FeedbackEmail) => ageBand(r.age) === a,
  })),
];

/** Largest first, the one `last` picks at the end; a tie keeps the order given. */
const byCount = <T extends { n: number }>(list: T[], last: (x: T) => boolean) =>
  [...list].sort((a, b) => Number(last(a)) - Number(last(b)) || b.n - a.n);

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function afterRows(free: AfterUnlock[], paid: AfterUnlock[]): AfterRow[] {
  const both = (pick: (g: AfterUnlock[]) => number | null) => ({
    free: pick(free),
    paid: pick(paid),
  });
  return [
    {
      key: "opened",
      name: "Opened the full report",
      unit: "pct",
      digits: 1,
      ...both((g) => ratio(g.filter((a) => readPastFirst(a) !== null).length, g.length)),
    },
    {
      key: "time",
      name: "Avg. time in report",
      unit: "mmss",
      ...both((g) => mean(g.filter((a) => a.closed > 0).map((a) => a.readMs))),
    },
    {
      key: "chapters",
      name: "Chapters opened",
      unit: "ratio",
      digits: 1,
      ...both((g) => mean(g.map((a) => Object.keys(a.reached).length).filter((n) => n > 0))),
    },
    {
      key: "thumbs",
      name: "Thumbs up on chapters",
      unit: "pct",
      digits: 0,
      ...both((g) => ratio(sum(g.map((a) => a.ups)), sum(g.map((a) => a.ups + a.downs)))),
    },
    {
      key: "shared",
      name: "Shared or invited a partner",
      unit: "pct",
      digits: 1,
      ...both((g) => ratio(g.filter((a) => a.shared).length, g.length)),
    },
  ];
}

export function buildUnlockFeedbackPage(input: {
  data: UnlockFeedbackData;
  /** The period before's emails, for the tiles' change; null when it is not compared or unread. */
  previous: UnlockFeedbackData | null;
  filters: ApFilters;
  today: string;
  now: Date;
}): UnlockFeedbackPayload {
  const { data, filters: f, today, now } = input;
  // Every email, over all traffic: the page's notes must not describe filters a shared link
  // carried in from another page (the bar shows them fixed).
  const all: ApFilters = { ...f, source: "all", device: "all", tier: "all", visitor: "all" };
  const pageHead = head(all, today, now);
  const notes = [...pageHead.notes];
  const firstSent = data.firstSent;
  if (!firstSent) {
    notes.push("The email has not been sent yet: every figure here starts with the first send.");
  } else if (firstSent > f.to) {
    notes.push(
      `The email was first sent on ${rangeLabel(firstSent, firstSent)}: pick a range from that day on.`
    );
  }

  const emails = data.rows.filter((r) => !isProbe(r)).map((r) => countEmail(r));
  const c = counts(emails);

  // The period before, at the same age as this one (its readers had no longer to answer), and
  // only when all of it came after the first email: a period partly before it would read as growth.
  const cmp = comparisonRange(f);
  const compared = Boolean(input.previous && cmp && firstSent && cmp.from >= firstSent);
  const prev =
    compared && cmp
      ? counts(
          input
            .previous!.rows.filter((r) => !isProbe(r))
            .map((r) => countEmail(r, sameAge(f, cmp, now).getTime()))
        )
      : null;
  if (cmp && firstSent && cmp.from < firstSent && firstSent <= f.to) {
    notes.push(
      `Not compared with the period before: the first email went out on ${rangeLabel(firstSent, firstSent)}.`
    );
  }

  const caption = bucketCaption(f.from, f.to);
  const points = trendBuckets(f.from, f.to);
  const n = (v: number) => v.toLocaleString("en-US");
  const of = (a: number, b: number) => fmt("pct", ratio(a, b), 1);
  const tile = (
    key: string,
    label: string,
    pick: (t: Counts) => number,
    foot: string,
    goodWhen: Tile["goodWhen"] = "up"
  ): Tile => ({
    key,
    label,
    unit: "count",
    value: pick(c),
    prev: prev ? pick(prev) : null,
    goodWhen,
    spark: points.map((b) =>
      pick(counts(emails.filter((e) => e.row.day >= b.from && e.row.day <= b.to)))
    ),
    foot,
    blocked: null,
    trend: caption,
  });
  const tiles: Tile[] = [
    tile(
      "delivered",
      "Delivered",
      (t) => t.delivered,
      `${of(c.delivered, c.sent)} of ${n(c.sent)} sent`
    ),
    tile("answers", "Answers", (t) => t.answers, `${of(c.answers, c.delivered)} of delivered`),
    tile("detail", "Added detail", (t) => t.detail, `${of(c.detail, c.answers)} of answers`),
    tile(
      "unlocks",
      "Free unlocks",
      (t) => t.unlocks,
      c.boughtFirst ? `one per answer · ${n(c.boughtFirst)} had bought already` : "one per answer"
    ),
    tile(
      "report",
      "Opened report",
      (t) => t.openedReport,
      `${of(c.openedReport, c.unlocks)} of unlocks`
    ),
    tile(
      "unsubscribed",
      "Unsubscribed",
      (t) => t.unsubscribed,
      `${of(c.unsubscribed, c.delivered)} of delivered`,
      "down"
    ),
  ];

  const steps: Array<[string, string, string, number, number | null]> = [
    ["sent", "Sent", "Unpaid results, 3 hours old, not bought since", c.sent, null],
    ["delivered", "Delivered", "Bounces and suppressed addresses removed", c.delivered, c.sent],
    ["opened", "Opened", "A ceiling: Apple Mail opens every email", c.opened, c.delivered],
    ["clicked", "Clicked a reason", "Raw clicks, scanners included", c.clicked, c.opened],
    ["answered", "Answer confirmed", "Page loaded in a real browser", c.answers, c.clicked],
    ["detail", "Added detail", "Picked a chip or wrote text", c.detail, c.answers],
    ["report", "Opened report", "Read past the first chapter", c.openedReport, c.unlocks],
  ];
  const barBase = c.delivered || c.sent;
  const funnel: FunnelStep[] = steps.map(([key, name, note, value, base], i) => ({
    key,
    name,
    note,
    n: value,
    ofPrev: base === null ? null : ratio(value, base),
    ofDelivered: i === 0 ? null : ratio(value, c.delivered),
    bar: barBase ? Math.min(1, value / barBase) : 0,
  }));

  const quality: QualityLine[] = [
    {
      key: "raw",
      name: "Raw reason clicks",
      note: "The first click in each email, scanners included",
      n: c.clicked,
      tone: "ink",
    },
    {
      key: "bots",
      name: "Scanner and bot clicks",
      note: "No page load in a browser, or under 2 s after delivery",
      n: c.bots,
      minus: true,
      tone: "bad",
    },
    {
      key: "answers",
      name: "Answers we count",
      note: "One per person",
      n: c.answers,
      tone: "ink",
      strong: true,
    },
    {
      key: "repeats",
      name: "Repeat taps and reloads",
      note: "Same link tapped again, or the page reloaded; first kept",
      n: c.repeats,
      tone: "muted",
    },
    {
      key: "changed",
      name: "Changed their answer",
      note: "Switched reason on the follow-up page; last one kept",
      n: c.changed,
      tone: "muted",
    },
  ];

  // The answers we count, and their words, masked once.
  const m = masker();
  const answered = emails.filter((e) => e.answer !== null);
  const writtenAt = (e: CountedEmail) => e.row.detailAt ?? e.row.answeredAt!;
  const words = answered
    .filter((e) => e.row.note?.trim())
    .sort((a, b) => Date.parse(writtenAt(b)) - Date.parse(writtenAt(a)))
    .map((e) => ({ e, text: maskNote(e.row.note!, m) }));

  const reasonRows = UNLOCK_REASONS.map((code) => {
    const mine = answered.filter((e) => e.answer === code);
    const copy = REASON_COPY[code];
    const chips = copy.chips.map((label) => ({
      label,
      n: mine.filter((e) => keepKnownChips(code, e.row.chips).includes(label)).length,
    }));
    return {
      code,
      label: copy.short,
      theme: copy.theme,
      n: mine.length,
      share: ratio(mine.length, answered.length),
      bar: 0,
      detail: mine.filter((e) => e.detail).length,
      question: ADMIN_QUESTION[code] ?? copy.question,
      chips: byCount(chips, () => false),
      quotes: words
        .filter((x) => x.e.answer === code)
        .slice(0, 2)
        .map((x) => x.text),
    };
  });
  const top = Math.max(1, ...reasonRows.map((r) => r.n));
  const reasons: ReasonRow[] = byCount(reasonRows, (r) => r.code === "other").map((r) => ({
    ...r,
    bar: r.n / top,
  }));
  const themes = byCount(
    (["Price", "Offer", "Friction", "Trust", "Other"] as const).map((name) => {
      const k = sum(reasons.filter((r) => r.theme === name).map((r) => r.n));
      return { name, n: k, share: ratio(k, answered.length) };
    }),
    (t) => t.name === "Other"
  );

  const columns = SEGMENTS.map((s) => {
    const k = answered.filter((e) => s.has(e.row)).length;
    return { key: s.key, name: s.name, n: k, small: k < MIN_GROUP };
  });
  const segments = {
    columns,
    rows: reasons.map((r) => ({
      code: r.code,
      label: r.label,
      cells: SEGMENTS.map((s, i) =>
        ratio(answered.filter((e) => e.answer === r.code && s.has(e.row)).length, columns[i]!.n)
      ),
    })),
  };

  const waits = answered.map((e) => Date.parse(e.row.answeredAt!) - Date.parse(e.row.sentAt));
  const days = Array.from({ length: 11 }, (_, i) => ({ label: i === 10 ? "D10+" : `D${i}`, n: 0 }));
  for (const w of waits) days[Math.min(10, Math.max(0, Math.floor(w / DAY_MS)))]!.n += 1;

  const arms: ArmRow[] = SUBJECT_ARMS.map((arm) => {
    const mine = emails.filter((e) => isSubjectArm(e.row.arm) && e.row.arm === arm);
    const delivered = mine.filter((e) => e.delivered).length;
    const k = mine.filter((e) => e.answer !== null).length;
    const ci = wilson(k, delivered);
    return {
      arm,
      subject: subjectLabel(arm),
      delivered,
      answers: k,
      rate: ratio(k, delivered),
      lo: ci?.lo ?? null,
      hi: ci?.hi ?? null,
    };
  });

  // Paying readers in the same period, from the first email on: before it there were no free
  // unlocks to set them against (and the report's reading per chapter is younger still).
  const free = emails.filter((e) => e.unlocked && e.row.after).map((e) => e.row.after!);
  const paid = data.paid
    .filter((p) => !isProbe(p) && (firstSent === null || p.day >= firstSent))
    .map((p) => p.after);

  return {
    ...pageHead,
    notes,
    running: firstSent ? { since: firstSent, day: Math.max(1, dayCount(firstSent, today)) } : null,
    tiles,
    funnel,
    bounced: c.bounced,
    quality,
    answers: answered.length,
    themes,
    reasons,
    segments,
    time: {
      days,
      medianMs: median(waits),
      within48h: ratio(waits.filter((w) => w < 2 * DAY_MS).length, waits.length),
      unsubscribed: c.unsubscribed,
      unsubRate: ratio(c.unsubscribed, c.delivered),
    },
    arms,
    after: { free: free.length, paid: paid.length, rows: afterRows(free, paid) },
    written: {
      total: words.length,
      rows: words.slice(0, WRITTEN_MAX).map(({ e, text }) => ({
        at: writtenAt(e),
        reason: REASON_COPY[e.answer!].short,
        text,
        archetype: e.row.archetype,
        device: e.row.device ? (DEVICE_NAMES[e.row.device] ?? null) : null,
      })),
    },
  };
}
