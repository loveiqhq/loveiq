/**
 * AP-Analytics, Mira (beta): the AI coach's success figures as Marcus's "MVP success" boards lay
 * them out (canvas page "MVP success", 17 Nov 2026), read from Mira's own tables
 * (supabase/migrations/20261118120000_mira_mvp.sql), never from PostHog.
 *
 * Who is who: a person is their account (user_id) or, before signing in, their browser
 * (anon_id). A browser that signed in counts as that account throughout: signup_completed holds
 * both ids. The team is left out by its accounts' address (ADMIN_TEST_EMAIL_REGEX), with the
 * browsers they signed in from. An anonymous browser that never signed in, and a deleted
 * account's events (both links go with the account), can't be told apart: they are counted.
 *
 * A conversation is a chat_started. Messages carry no chat id, so a person's messages belong to
 * the chat they started last. A request writes its events together after the reply, in any
 * order, so a message written up to 2 s before a start is that chat's first.
 */
import { isStaffEmail } from "@shared/env/staff-email";
import { reportingDay, reportingDayStart } from "@shared/time/reporting-day";

import { fetchAllRows } from "../supabase";
import type { PageHead, Tile } from "./common";
import { addDays } from "./days";
import {
  bucketCaption,
  comparisonRange,
  rangeLabel,
  trendBuckets,
  windowOf,
  type ApFilters,
} from "./filters";
import { mean, ratio } from "./metrics";

const TOLERANCE_MS = 2_000;
const HOUR_MS = 3_600_000;
/** fetchAllRows stops here without a word; past it the counting belongs in SQL. */
const MAX_EVENTS = 100_000;
const EVENT_NAMES = [
  "chat_opened",
  "chat_started",
  "message_sent",
  "signup_completed",
  "rating",
  "crisis_shown",
];

export interface MiraUserRow {
  id: string;
  email: string;
  created_at: string;
  style: Record<string, unknown> | null;
  use_assessment: boolean;
}

export interface MiraEventRow {
  name: string;
  anon_id: string | null;
  user_id: string | null;
  created_at: string;
  /** props.rating on a rating event ("1" or "-1"): nothing else is read from props. */
  rating: string | null;
}

export interface MiraData {
  users: MiraUserRow[];
  events: MiraEventRow[];
  /** Accounts that let Mira use their LoveIQ result and whose address has a finished survey. */
  withResult: Set<string>;
}

/**
 * Every Mira account and every counted event since the beta began.
 * ponytail: counts in memory, fine for the beta; move the counting into one SQL function once
 * mira_event nears MAX_EVENTS (the read refuses past it rather than count part of it).
 */
export async function fetchMira(): Promise<MiraData> {
  const [users, events] = await Promise.all([
    fetchAllRows<MiraUserRow>(
      "/rest/v1/mira_user?select=id,email,created_at,style,use_assessment&order=id.asc"
    ),
    fetchAllRows<MiraEventRow>(
      `/rest/v1/mira_event?name=in.(${EVENT_NAMES.join(",")})` +
        "&select=name,anon_id,user_id,created_at,rating:props->>rating&order=id.asc",
      { maxRows: MAX_EVENTS + 1 }
    ),
  ]);
  if (!users || !events) throw new Error("Mira's tables could not be read");
  if (events.length > MAX_EVENTS) throw new Error("Too many Mira events to count in memory");
  const asked = users.filter((u) => u.use_assessment && !isStaffEmail(u.email));
  return { users, events, withResult: await withLoveIqResult(asked) };
}

/** The accounts whose address has a finished LoveIQ survey: what Mira reads into the chat. */
async function withLoveIqResult(users: MiraUserRow[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < users.length; i += 50) {
    const chunk = users.slice(i, i + 50);
    const list = encodeURIComponent(chunk.map((u) => `"${u.email}"`).join(","));
    const rows = await fetchAllRows<{ email: string }>(
      `/rest/v1/app_user?email=in.(${list})` +
        "&select=email,survey_submission!fk_survey_submission_user!inner(id)" +
        "&survey_submission.status=eq.completed&order=id.asc"
    );
    if (!rows) throw new Error("LoveIQ results could not be read");
    const found = new Set(rows.map((r) => r.email));
    for (const u of chunk) if (found.has(u.email)) out.add(u.id);
  }
  return out;
}

interface Person {
  /** chat_started, message_sent and chat_opened times (ms), oldest first. */
  starts: number[];
  msgs: number[];
  opens: number[];
  /** Berlin days with a message. */
  msgDays: Set<string>;
  account: MiraUserRow | null;
}

interface Counted {
  name: string;
  at: number;
  rating: number | null;
}

export interface Prepared {
  people: Map<string, Person>;
  /** The events counted (the team's left out), a deleted account's too. */
  events: Counted[];
  /** The accounts that are not the team's. */
  accounts: MiraUserRow[];
  /** The day of Mira's first record, the team's included. */
  firstDay: string | null;
  withResult: Set<string>;
}

const dayOfHour = new Map<number, string>();
/** An instant's Berlin day. Berlin is whole hours off UTC, so it is looked up once per hour. */
function dayOf(at: number): string {
  const hour = Math.floor(at / HOUR_MS);
  let day = dayOfHour.get(hour);
  if (!day) dayOfHour.set(hour, (day = reportingDay(new Date(hour * HOUR_MS))));
  return day;
}

export function prepare(data: MiraData): Prepared {
  const staff = new Set(data.users.filter((u) => isStaffEmail(u.email)).map((u) => u.id));
  const accounts = data.users.filter((u) => !staff.has(u.id));
  const byId = new Map(accounts.map((u) => [u.id, u]));
  // A browser is the account it first signed in to.
  const signedIn = new Map<string, string>();
  for (const e of data.events) {
    if (e.name === "signup_completed" && e.anon_id && e.user_id && !signedIn.has(e.anon_id))
      signedIn.set(e.anon_id, e.user_id);
  }
  const people = new Map<string, Person>();
  const events: Counted[] = [];
  let first = Infinity;
  for (const e of data.events) {
    const at = Date.parse(e.created_at);
    first = Math.min(first, at);
    const user = e.user_id ?? (e.anon_id ? signedIn.get(e.anon_id) : undefined) ?? null;
    if (user && staff.has(user)) continue;
    events.push({ name: e.name, at, rating: e.rating === null ? null : Number(e.rating) });
    const key = user ?? (e.anon_id ? `anon:${e.anon_id}` : null);
    if (!key) continue;
    let p = people.get(key);
    if (!p) {
      p = { starts: [], msgs: [], opens: [], msgDays: new Set(), account: null };
      p.account = user ? (byId.get(user) ?? null) : null;
      people.set(key, p);
    }
    if (e.name === "chat_started") p.starts.push(at);
    else if (e.name === "chat_opened") p.opens.push(at);
    else if (e.name === "message_sent") {
      p.msgs.push(at);
      p.msgDays.add(dayOf(at));
    }
  }
  for (const p of people.values()) {
    p.starts.sort((a, b) => a - b);
    p.msgs.sort((a, b) => a - b);
  }
  return {
    people,
    events,
    accounts,
    firstDay: Number.isFinite(first) ? dayOf(first) : null,
    withResult: data.withResult,
  };
}

interface Win {
  since: number;
  until: number;
}

function win(from: string, to: string): Win {
  const w = windowOf({ from, to });
  return { since: w.since.getTime(), until: w.until.getTime() };
}

const within = (at: number, w: Win) => at >= w.since && at < w.until;

/**
 * A person's chats started before `until`, each with the messages they sent in it before then.
 * ponytail: chats × messages per person; a two-pointer pass if someone ever has thousands.
 */
export function chatsOf(
  p: Pick<Person, "starts" | "msgs">,
  until: number
): Array<{ at: number; msgs: number }> {
  const starts = p.starts.filter((s) => s < until);
  return starts.map((at, i) => {
    const next = starts[i + 1];
    const end = Math.min(next === undefined ? Infinity : next - TOLERANCE_MS, until);
    return { at, msgs: p.msgs.filter((m) => m >= at - TOLERANCE_MS && m < end).length };
  });
}

interface Flags {
  opened: boolean;
  /** Started a conversation in the range. */
  started: boolean;
  /** One of them reached 3 messages from the person. */
  real: boolean;
  /** Had a free account by the range's end. */
  account: boolean;
  /** Conversations since the beta began, to the range's end. */
  convos: number;
}

function flags(p: Person, w: Win): Flags {
  const chats = chatsOf(p, w.until);
  const inRange = chats.filter((c) => within(c.at, w));
  return {
    opened: p.opens.some((at) => within(at, w)),
    started: inRange.length > 0,
    real: inRange.some((c) => c.msgs >= 3),
    account: p.account !== null && Date.parse(p.account.created_at) < w.until,
    convos: chats.length,
  };
}

export interface Figures {
  conversations: number;
  /** People who started a conversation in the range. */
  chatted: number;
  /** Of them: with a free account by the range's end; with 10 conversations so far. */
  signedUp: number;
  passedTen: number;
  /** Accounts created in the range. */
  signups: number;
  dau: number | null;
  wau: number | null;
  ups: number;
  downs: number;
  crisis: number;
  weekFour: { returned: number; of: number };
}

/** Every tile's figure for one range: the range itself, the one before, or a trend point. */
export function figures(prep: Prepared, from: string, to: string, today: string): Figures {
  const w = win(from, to);
  let chatted = 0;
  let signedUp = 0;
  let passedTen = 0;
  for (const p of prep.people.values()) {
    const f = flags(p, w);
    if (!f.started) continue;
    chatted++;
    if (f.account) signedUp++;
    if (f.convos >= 10) passedTen++;
  }
  const inRange = prep.events.filter((e) => within(e.at, w));
  const count = (name: string, rating?: number) =>
    inRange.filter((e) => e.name === name && (rating === undefined || e.rating === rating)).length;
  const fourth = cohorts(prep, to, today, 5).filter((c) => c.cells[4]);
  return {
    conversations: count("chat_started"),
    chatted,
    signedUp,
    passedTen,
    signups: prep.accounts.filter((a) => within(Date.parse(a.created_at), w)).length,
    ...active(prep, from, to),
    ups: count("rating", 1),
    downs: count("rating", -1),
    crisis: count("crisis_shown"),
    weekFour: {
      returned: fourth.reduce((n, c) => n + c.cells[4]!.active, 0),
      of: fourth.reduce((n, c) => n + c.users, 0),
    },
  };
}

/**
 * DAU % and WAU %: each day, the share of the accounts open by then that sent a message that
 * day, or in the 7 days to it; averaged over the range's days that had an account.
 */
function active(prep: Prepared, from: string, to: string): { dau: number | null; wau: number | null } {
  const dau: number[] = [];
  const wau: number[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const end = reportingDayStart(addDays(d, 1)).getTime();
    const open = prep.accounts.filter((a) => Date.parse(a.created_at) < end);
    if (!open.length) continue;
    const week = Array.from({ length: 7 }, (_, k) => addDays(d, -k));
    const days = open.map((a) => prep.people.get(a.id)?.msgDays);
    dau.push(days.filter((s) => s?.has(d)).length / open.length);
    wau.push(days.filter((s) => week.some((x) => s?.has(x))).length / open.length);
  }
  return { dau: mean(dau), wau: mean(wau) };
}

const monday = (day: string) =>
  addDays(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));

export interface CohortRow {
  /** The sign-up week's Monday. */
  week: string;
  users: number;
  /**
   * Week 0 (the sign-up week) on, Monday to Sunday: how many of the week's accounts sent a
   * message that week, and their conversations so far (all of them, by its end). Null until
   * the week is over.
   */
  cells: Array<{ active: number; convos: number } | null>;
}

/** The accounts by sign-up week, to the range's last day, oldest first. */
export function cohorts(prep: Prepared, to: string, today: string, weeks = 8): CohortRow[] {
  const groups = new Map<string, MiraUserRow[]>();
  for (const a of prep.accounts) {
    const day = dayOf(Date.parse(a.created_at));
    if (day > to) continue;
    const w = monday(day);
    groups.set(w, [...(groups.get(w) ?? []), a]);
  }
  return [...groups.keys()].sort().map((week) => {
    const users = groups.get(week)!;
    const cells = Array.from({ length: weeks }, (_, k) => {
      const start = addDays(week, 7 * k);
      const end = addDays(start, 6);
      if (end > to || end >= today) return null;
      const until = reportingDayStart(addDays(end, 1)).getTime();
      const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
      let active = 0;
      let convos = 0;
      for (const u of users) {
        const p = prep.people.get(u.id);
        if (!p) continue;
        if (days.some((d) => p.msgDays.has(d))) active++;
        convos += p.starts.filter((s) => s < until).length;
      }
      return { active, convos };
    });
    return { week, users: users.length, cells };
  });
}

const PER_USER = [
  { label: "1 conversation", min: 1, max: 1 },
  { label: "2–3", min: 2, max: 3 },
  { label: "4–9", min: 4, max: 9 },
  { label: "10–19", min: 10, max: 19 },
  { label: "20+", min: 20, max: Infinity },
];

export interface MiraStep {
  key: string;
  label: string;
  note: string;
  /** People; null where nothing can be counted yet. */
  n: number | null;
  ofFirst: number | null;
  ofPrev: number | null;
}

export interface MiraPayload extends PageHead {
  tiles: Record<string, Tile>;
  funnel: MiraStep[];
  perUser: Array<{ label: string; n: number; share: number | null; pastTen: boolean }>;
  cohorts: CohortRow[];
  /** Today's accounts, and what Mira knows of them. */
  knows: { accounts: number; style: number; result: number };
  safety: { conversations: number; crisis: number; notHelpful: number };
}

export function buildMiraPage(input: {
  data: MiraData;
  filters: ApFilters;
  today: string;
  now: Date;
}): MiraPayload {
  const { filters: f, today, now } = input;
  const prep = prepare(input.data);
  const first = prep.firstDay;
  const cmp = comparisonRange(f);
  // A period before Mira's first record would read as growth.
  const compared = Boolean(cmp && first && cmp.from >= first);
  const notes: string[] = [];
  if (!first) notes.push("Nothing recorded yet: the figures start with Mira's first visitor.");
  else if (first > f.to)
    notes.push(`Mira's records start on ${rangeLabel(first, first)}: pick a range from then.`);
  else if (cmp && !compared)
    notes.push(
      `Not compared with the period before: Mira's records start on ${rangeLabel(first, first)}.`
    );

  const cur = figures(prep, f.from, f.to, today);
  const prev = compared && cmp ? figures(prep, cmp.from, cmp.to, today) : null;
  const points = trendBuckets(f.from, f.to).map((b) => figures(prep, b.from, b.to, today));
  const trend = bucketCaption(f.from, f.to);
  const n = (v: number) => v.toLocaleString("en-US");
  const of = (a: number, b: number, who: string) => `${n(a)} of ${n(b)} ${who}`;

  const tile = (
    key: string,
    label: string,
    unit: Tile["unit"],
    pick: (x: Figures) => number | null,
    foot: string
  ): Tile => ({
    key,
    label,
    unit,
    value: pick(cur),
    prev: prev ? pick(prev) : null,
    goodWhen: "up",
    spark: points.map(pick),
    foot,
    blocked: null,
    trend,
  });
  const notYet = (key: string, label: string, why: string): Tile => ({
    key,
    label,
    unit: "pct",
    value: null,
    prev: null,
    goodWhen: "up",
    spark: [],
    foot: "",
    blocked: `Not measured yet: ${why}`,
    trend: "",
  });
  const afterBeta = "paid plans start after the beta.";
  const tiles: Record<string, Tile> = Object.fromEntries(
    [
      tile(
        "conversations",
        "Conversations",
        "count",
        (x) => x.conversations,
        `started by ${n(cur.chatted)} ${cur.chatted === 1 ? "person" : "people"}`
      ),
      tile(
        "passTen",
        "Pass 10 conversations",
        "pct",
        (x) => ratio(x.passedTen, x.chatted),
        of(cur.passedTen, cur.chatted, "who chatted")
      ),
      tile("signups", "Signed-up users", "count", (x) => x.signups, "free accounts created"),
      tile(
        "signupRate",
        "Conversation started → user CVR",
        "pct",
        (x) => ratio(x.signedUp, x.chatted),
        of(cur.signedUp, cur.chatted, "who chatted have an account")
      ),
      tile("dau", "DAU %", "pct", (x) => x.dau, "of signed-up users, per day"),
      tile("wau", "WAU %", "pct", (x) => x.wau, "of signed-up users, per 7 days"),
      tile("stickiness", "Stickiness", "ratio", (x) => ratio(x.dau, x.wau), "DAU ÷ WAU"),
      tile(
        "weekFour",
        "Week-4 return rate",
        "pct",
        (x) => ratio(x.weekFour.returned, x.weekFour.of),
        cur.weekFour.of
          ? of(cur.weekFour.returned, cur.weekFour.of, "accounts past week 4")
          : "no sign-up week has reached week 4"
      ),
      tile(
        "helpful",
        "Helpful answers",
        "pct",
        (x) => ratio(x.ups, x.ups + x.downs),
        of(cur.ups, cur.ups + cur.downs, "thumbs were up")
      ),
      notYet("nps", "NPS", "no screen asks it yet."),
      notYet("timeSpent", "Daily time spent", "Mira records messages, not time on the page."),
      notYet("bodyImage", "Body image improvement", "no body-image scale is asked yet."),
      notYet("profileDepth", "Profile depth", "2 of its 5 areas are recorded so far."),
      notYet("subscription", "Subscription rate", afterBeta),
      notYet("churn", "Subscriber churn", afterBeta),
    ].map((t) => [t.key, t])
  );

  // The people of the range, each step also passing every step above it, so it never rises.
  const range = [...prep.people.values()].map((p) => flags(p, win(f.from, f.to)));
  let left = range;
  const steps: Array<[string, string, string, (x: Flags) => boolean]> = [
    ["opened", "Opened Mira", "Her chat page loaded", (x) => x.opened],
    ["started", "Started a chat", "Sent a first message", (x) => x.started],
    ["real", "Real conversation", "3+ messages from them in one chat", (x) => x.real],
    ["account", "Created a free account", "By the range's last day", (x) => x.account],
    ["ten", "Reached 10 conversations", "Counted since the beta began", (x) => x.convos >= 10],
  ];
  const all: Array<Pick<MiraStep, "key" | "label" | "note" | "n">> = steps.map(
    ([key, label, note, keep]) => {
      left = left.filter(keep);
      return { key, label, note, n: left.length };
    }
  );
  all.push({ key: "paid", label: "Subscribed", note: "After the beta", n: null });
  const funnel = all.map((s, i) => ({
    ...s,
    ofFirst: s.n === null ? null : ratio(s.n, all[0]!.n),
    ofPrev: s.n === null || i === 0 ? null : ratio(s.n, all[i - 1]!.n),
  }));

  const chattedConvos = range.filter((x) => x.started).map((x) => x.convos);
  const perUser = PER_USER.map((b) => {
    const k = chattedConvos.filter((c) => c >= b.min && c <= b.max).length;
    return { label: b.label, n: k, share: ratio(k, chattedConvos.length), pastTen: b.min >= 10 };
  });

  return {
    range: { from: f.from, to: f.to, label: rangeLabel(f.from, f.to) },
    compare: compared && cmp ? { ...cmp, label: rangeLabel(cmp.from, cmp.to) } : null,
    generatedAt: now.toISOString(),
    notes,
    narrowed: null,
    tiles,
    funnel,
    perUser,
    cohorts: cohorts(prep, f.to, today).slice(-8),
    knows: {
      accounts: prep.accounts.length,
      style: prep.accounts.filter((a) => Object.keys(a.style ?? {}).length > 0).length,
      result: prep.accounts.filter((a) => prep.withResult.has(a.id)).length,
    },
    safety: { conversations: cur.conversations, crisis: cur.crisis, notHelpful: cur.downs },
  };
}
