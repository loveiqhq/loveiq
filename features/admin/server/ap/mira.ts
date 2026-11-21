/**
 * AP-Analytics, Mira (beta): the AI coach's success figures as Marcus's "MVP success" boards lay
 * them out (canvas page "MVP success", 17 Nov 2026), read from Mira's own tables
 * (supabase/migrations/20261118120000_mira_mvp.sql), never from PostHog.
 *
 * Who is who: a person is their account (user_id) or, before signing in, their browser
 * (anon_id). A browser that signed in counts as that account throughout: signup_completed holds
 * both ids. The team is left out by its accounts' address (ADMIN_TEST_EMAIL_REGEX), with the
 * browsers they signed in from, and, from 21 Nov 2026, by its browsers (loveiq_team=1 or
 * loveiq_probe=1, shared/http/team-cookie.ts): an event from one carries props.team, an account
 * created or signed in from one is_team, and such an account or browser is left out with all it
 * did before. Anyone else's anonymous browser, and a deleted account's events (both links go
 * with the account) that no team browser sent, can't be told apart: they are counted.
 *
 * Where people came from (21 Nov 2026): chat_opened, chat_started and signup_completed carry the
 * visit's campaign tags or referring site (features/mira/server/attribution.ts); a person counts
 * under the first one recorded for them.
 *
 * A conversation is the design's "session with 3 or more messages from the user": a person's
 * messages split wherever more than 30 minutes pass between two (SESSION_GAP_MS), each part with
 * 3 or more of them, counted when its 3rd message is sent. Messages carry no chat id, so it is
 * read from their times alone, and a deleted account's own messages, which belong to nobody any
 * more, make no conversation.
 *
 * Outcomes (20 Nov 2026): body image from the body check (the Body Appreciation Scale-2, at the
 * start and after four weeks, mira_body_check), counted as improved or worse at a change of
 * BODY_RELIABLE_CHANGE or more; profile depth from the intake questions answered, the body check,
 * the coaching style and a LoveIQ result; topics and referrals from the markers Mira's replies
 * carry (features/mira/server/safety.ts), as ids, never words.
 */
import miraConfig from "@features/mira/content/mira-config.json";
import nudgeConfig from "@features/mira/content/nudges.json";
import { FOLLOW_UP_DAYS } from "@features/mira/server/body-check";
import { isStaffEmail } from "@shared/env/staff-email";
import { reportingDay, reportingDayStart } from "@shared/time/reporting-day";

import { fetchAllRows, supabaseFetch } from "../supabase";
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
import { fmt } from "./format";
import { mean, ratio } from "./metrics";
import {
  fetchJournal,
  journalFigures,
  type JournalFigures,
  type JournalRows,
} from "./mira-journal";

/** A chat's first message is written up to this long before its chat_started, or after it. */
const TOLERANCE_MS = 2_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
/** More than this between two messages starts a new session; one of 3+ is a conversation. */
export const SESSION_GAP_MS = 30 * MINUTE_MS;
const CONVERSATION_MSGS = 3;
/** Daily time spent: the gaps between messages up to this count as time with Mira. */
const ACTIVE_GAP_MS = 5 * MINUTE_MS;
/** A nudge starts a conversation when its person writes within this of clicking it. */
const NUDGE_REPLY_MS = 24 * HOUR_MS;
/** Reactivated by nudges: no message for this long when the nudge went, one within 48 h of it. */
const INACTIVE_MS = 7 * 24 * HOUR_MS;
const REACTIVATED_MS = 48 * HOUR_MS;
/**
 * The smallest change in a body check score (the mean of ten answers, 1 to 5) that is more than
 * the scale's noise: the reliable change index (Jacobson & Truax 1991), 1.96 × SD × √2 × √(1 − r),
 * with the BAS-2's community SD of about 0.90 and its 3-week test–retest reliability of .90
 * (Tylka & Wood-Barcalow 2015, Tables 2 and Study 1), which is 0.79; scores move in tenths.
 */
export const BODY_RELIABLE_CHANGE = 0.8;
/** The intake questions that make up the root-cause screen and the goal (mira-config.json). */
const ROOT_CAUSE_QUESTIONS = ["where", "onset"];
const GOAL_QUESTION = "change";
const EVENT_NAMES = [
  "chat_opened",
  "consent_given",
  "chat_started",
  "message_sent",
  "gate_shown",
  "signup_completed",
  "rating",
  "crisis_shown",
  "nps",
  "nudge_prefs_saved",
  "nudge_stopped",
  "intake_answered",
  "chat_topic",
  "referred",
  "body_check_offered",
  "body_check_started",
  // Logged by other streams from 21 Nov 2026: the "Keep this chat" card, and two safety stops.
  "keep_card_shown",
  "keep_card_keep",
  "keep_card_not_now",
  // The coaching-style tip on the chat's header button, and styles saved there (21 Nov 2026).
  "style_tip_shown",
  "style_tip_opened",
  "style_saved",
  "reply_declined",
  "minor_stop",
];

export interface MiraUserRow {
  id: string;
  email: string;
  created_at: string;
  style: Record<string, unknown> | null;
  use_assessment: boolean;
  /** Created or signed in from a team browser (20261121030000_mira_team_and_source.sql). */
  is_team?: boolean;
}

/** An event's source when the visit had neither campaign tags nor a referring site. */
export const DIRECT = "direct";

export interface MiraEventRow {
  name: string;
  anon_id: string | null;
  user_id: string | null;
  /** created_at, in milliseconds. */
  at: number;
  /**
   * The one prop read (supabase/migrations/20261120040000_mira_ap_events_props.sql): rating's
   * rating ("1", "-1"), chat_started's chip ("3", "-1" for own words), signup_completed's method
   * ("email", "google"), nps's score ("0" to "10", null for "Not now"), nudge_prefs_saved's
   * choice ("pause", …); null on any other event.
   */
  detail: string | null;
  /** Sent from a team browser (props.team); absent otherwise. */
  team?: true;
  /**
   * Where the visit came from, on chat_opened, chat_started and signup_completed: the link's
   * utm_source, else the referring site's host (no "www."), else DIRECT; absent where nothing
   * was recorded (before 21 Nov 2026, or a page that sent nothing).
   */
  source?: string;
}

export interface MiraNudgeRow {
  user_id: string;
  type: string;
  sent_at: string;
  clicked_at: string | null;
  /** Resend's first delivery and first open (Apple Mail's privacy opens included). */
  delivered_at: string | null;
  opened_at: string | null;
}

export interface MiraBodyCheckRow {
  user_id: string;
  score: number;
  created_at: string;
}

export interface MiraData {
  users: MiraUserRow[];
  events: MiraEventRow[];
  /** Nudge emails that went out (sent_at set). */
  nudges: MiraNudgeRow[];
  /** Every finished body check, oldest first. */
  bodyChecks: MiraBodyCheckRow[];
  /** Accounts that let Mira use their LoveIQ result and whose address has a finished survey. */
  withResult: Set<string>;
  /** The daily journal's days and settings (mira-journal.ts); null when they could not be read. */
  journal?: JournalRows | null;
}

/**
 * Every Mira account and every counted event since the beta began.
 * ponytail: counts in memory, fine for the beta; move the counting into SQL once mira_ap_events'
 * answer (every event's time) nears tens of megabytes.
 */
export async function fetchMira(): Promise<MiraData> {
  const [users, events, nudges, bodyChecks] = await Promise.all([
    fetchAllRows<MiraUserRow>(
      "/rest/v1/mira_user?select=id,email,created_at,style,use_assessment,is_team&order=id.asc"
    ),
    fetchEvents(),
    fetchAllRows<MiraNudgeRow>(
      "/rest/v1/mira_nudge?sent_at=not.is.null&select=user_id,type,sent_at,clicked_at,delivered_at,opened_at&order=created_at.asc"
    ),
    fetchAllRows<MiraBodyCheckRow>(
      "/rest/v1/mira_body_check?select=user_id,score,created_at&order=id.asc"
    ),
  ]);
  if (!users || !events || !nudges || !bodyChecks) {
    throw new Error("Mira's tables could not be read");
  }
  const asked = users.filter((u) => u.use_assessment && !isStaffEmail(u.email) && !u.is_team);
  return {
    users,
    events,
    nudges,
    bodyChecks: bodyChecks.map((b) => ({ ...b, score: Number(b.score) })),
    withResult: await withLoveIqResult(asked),
    // Its own card: a failed read says so there and leaves the rest of the page standing.
    journal: await fetchJournal(),
  };
}

/**
 * The counted events, in one request however many there are: mira_ap_events
 * (supabase/migrations/20261120040000_mira_ap_events_props.sql) groups them per person, name and
 * the prop read, each group's times in milliseconds, groups in the order of their first event (so
 * a browser's first sign-in still comes first). Paging through the rows a thousand at a time
 * stopped at 100,000 of them. From 20261121030000 each group also says whether a team browser
 * sent it, and where the visit came from ('' for a recorded visit without tags).
 */
async function fetchEvents(): Promise<MiraEventRow[] | null> {
  const res = await supabaseFetch("/rest/v1/rpc/mira_ap_events", {
    method: "POST",
    body: JSON.stringify({ p_names: EVENT_NAMES }),
    timeoutMs: 30_000,
  });
  if (!res.ok) return null;
  const groups = (await res.json()) as Array<
    [
      name: string,
      anon: string | null,
      user: string | null,
      detail: string | null,
      at: number[],
      team?: boolean,
      source?: string | null,
      referrerHost?: string | null,
    ]
  >;
  return groups.flatMap(([name, anon_id, user_id, detail, times, team, source, ref]) => {
    const from = typeof source === "string" ? source || ref?.replace(/^www\./, "") || DIRECT : null;
    return times.map((at) => ({
      name,
      anon_id,
      user_id,
      at,
      detail,
      ...(team === true ? { team: true as const } : {}),
      ...(from ? { source: from } : {}),
    }));
  });
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
  /**
   * Chats started, oldest first: when, the starter chip that opened it (its index in today's
   * starterChips, -1 for the person's own words, null where none was recorded: a crisis first
   * message, or before 20 Nov 2026) and whether it was started signed out.
   */
  starts: Array<{ at: number; chip: number | null; anon: boolean }>;
  /** message_sent, chat_opened, consent_given and gate_shown times (ms); messages oldest first. */
  msgs: number[];
  opens: number[];
  consents: number[];
  gates: number[];
  /** Berlin days with a message, each with its time with Mira (ms; see ACTIVE_GAP_MS). */
  msgDays: Map<string, number>;
  /** When each of the person's conversations reached its 3rd message. */
  convs: number[];
  account: MiraUserRow | null;
  /** The intake questions they answered (ids), signed out or in. */
  answered: Set<string>;
  /** Their new chats' topics (own words only), and Mira's referrals to a professional. */
  topics: Array<{ at: number; topic: string }>;
  refers: number[];
  /** When the body check was offered to them, and when they started it. */
  bodyOffers: number[];
  bodyStarts: number[];
  /** When the "Keep this chat" card was shown to them, and when they tapped Keep or Not now. */
  keepShown: number[];
  keepKept: number[];
  keepNotNow: number[];
  /** When the "Make Mira yours" tip was shown to them, opened, and when they saved a style. */
  tipShown: number[];
  tipOpened: number[];
  styleSaved: number[];
  /** The first source recorded for them (MiraEventRow.source), and when; null: none recorded. */
  from: { at: number; source: string } | null;
}

interface Counted {
  name: string;
  at: number;
  detail: string | null;
}

interface CountedNudge {
  user: string;
  type: string;
  sent: number;
  clicked: number | null;
  delivered: boolean;
  /** Delivered and opened. */
  opened: boolean;
  /** The last nudge its person got before a stop or a pause. */
  stopped: boolean;
}

export interface Prepared {
  people: Map<string, Person>;
  /** The events counted (the team's left out), a deleted account's too. */
  events: Counted[];
  /** The accounts that are not the team's. */
  accounts: MiraUserRow[];
  /** Each account's sign-up method: its first sign-in's ("email", "google"). */
  methods: Map<string, string | null>;
  /** The day of Mira's first record, the team's included. */
  firstDay: string | null;
  /** Nudges sent to accounts that are not the team's. */
  nudges: CountedNudge[];
  withResult: Set<string>;
  /** Each account's body checks (not the team's), oldest first. */
  bodyChecks: Map<string, Array<{ at: number; score: number }>>;
}

const dayOfHour = new Map<number, string>();
/** An instant's Berlin day. Berlin is whole hours off UTC, so it is looked up once per hour. */
function dayOf(at: number): string {
  const hour = Math.floor(at / HOUR_MS);
  let day = dayOfHour.get(hour);
  if (!day) dayOfHour.set(hour, (day = reportingDay(new Date(hour * HOUR_MS))));
  return day;
}

/** A person's messages (oldest first) split wherever more than 30 minutes pass between two. */
function sessions(msgs: number[]): number[][] {
  const out: number[][] = [];
  for (const m of msgs) {
    const last = out.at(-1);
    if (last && m - last.at(-1)! <= SESSION_GAP_MS) last.push(m);
    else out.push([m]);
  }
  return out;
}

/** A person's conversations (sessions of 3+ messages), each by the time of its 3rd message. */
export function conversationsOf(msgs: number[]): number[] {
  return sessions(msgs)
    .filter((s) => s.length >= CONVERSATION_MSGS)
    .map((s) => s[CONVERSATION_MSGS - 1]!);
}

/** The session that begins with the person's first message at or after `t`. */
const sessionFrom = (msgs: number[], t: number): number[] =>
  sessions(msgs.filter((m) => m >= t))[0] ?? [];

export function prepare(data: MiraData): Prepared {
  // The team: accounts with a team address or marked is_team, and the accounts and browsers
  // that sent anything from a team browser, with all they did before it was marked.
  const staff = new Set(
    data.users.filter((u) => isStaffEmail(u.email) || u.is_team).map((u) => u.id)
  );
  const teamBrowsers = new Set<string>();
  for (const e of data.events) {
    if (!e.team) continue;
    if (e.user_id) staff.add(e.user_id);
    if (e.anon_id) teamBrowsers.add(e.anon_id);
  }
  const accounts = data.users.filter((u) => !staff.has(u.id));
  const byId = new Map(accounts.map((u) => [u.id, u]));
  // A browser is the account it first signed in to; an account's method is its first sign-in's.
  const signedIn = new Map<string, string>();
  const firstSignIn = new Map<string, { at: number; method: string | null }>();
  for (const e of data.events) {
    if (e.name !== "signup_completed" || !e.user_id) continue;
    if (e.anon_id && !signedIn.has(e.anon_id)) signedIn.set(e.anon_id, e.user_id);
    const known = firstSignIn.get(e.user_id);
    if (!known || e.at < known.at) firstSignIn.set(e.user_id, { at: e.at, method: e.detail });
  }
  const people = new Map<string, Person>();
  const events: Counted[] = [];
  /** Each account's stops and pauses of its nudges. */
  const stops = new Map<string, number[]>();
  let first = Infinity;
  for (const e of data.events) {
    const { at } = e;
    first = Math.min(first, at);
    const user = e.user_id ?? (e.anon_id ? signedIn.get(e.anon_id) : undefined) ?? null;
    if ((user && staff.has(user)) || e.team || (e.anon_id && teamBrowsers.has(e.anon_id))) {
      continue;
    }
    events.push({ name: e.name, at, detail: e.detail });
    if (
      user &&
      (e.name === "nudge_stopped" || (e.name === "nudge_prefs_saved" && e.detail === "pause"))
    ) {
      stops.set(user, [...(stops.get(user) ?? []), at]);
    }
    const key = user ?? (e.anon_id ? `anon:${e.anon_id}` : null);
    if (!key) continue;
    let p = people.get(key);
    if (!p) {
      p = {
        starts: [],
        msgs: [],
        opens: [],
        consents: [],
        gates: [],
        msgDays: new Map(),
        convs: [],
        account: user ? (byId.get(user) ?? null) : null,
        answered: new Set(),
        topics: [],
        refers: [],
        bodyOffers: [],
        bodyStarts: [],
        keepShown: [],
        keepKept: [],
        keepNotNow: [],
        tipShown: [],
        tipOpened: [],
        styleSaved: [],
        from: null,
      };
      people.set(key, p);
    }
    if (e.source && (!p.from || at < p.from.at)) p.from = { at, source: e.source };
    if (e.name === "chat_started") {
      const chip = e.detail === null ? null : Number(e.detail);
      p.starts.push({ at, chip: Number.isInteger(chip) ? chip : null, anon: e.user_id === null });
    } else if (e.name === "message_sent") p.msgs.push(at);
    else if (e.name === "chat_opened") p.opens.push(at);
    else if (e.name === "consent_given") p.consents.push(at);
    else if (e.name === "gate_shown") p.gates.push(at);
    else if (e.name === "intake_answered" && e.detail) p.answered.add(e.detail);
    else if (e.name === "chat_topic" && e.detail) p.topics.push({ at, topic: e.detail });
    else if (e.name === "referred") p.refers.push(at);
    else if (e.name === "body_check_offered") p.bodyOffers.push(at);
    else if (e.name === "body_check_started") p.bodyStarts.push(at);
    else if (e.name === "keep_card_shown") p.keepShown.push(at);
    else if (e.name === "keep_card_keep") p.keepKept.push(at);
    else if (e.name === "keep_card_not_now") p.keepNotNow.push(at);
    else if (e.name === "style_tip_shown") p.tipShown.push(at);
    else if (e.name === "style_tip_opened") p.tipOpened.push(at);
    else if (e.name === "style_saved") p.styleSaved.push(at);
  }
  for (const p of people.values()) {
    p.starts.sort((a, b) => a.at - b.at);
    p.msgs.sort((a, b) => a - b);
    p.msgs.forEach((m, i) => {
      // A gap of 5 minutes or less is time with Mira, on the later message's day.
      const gap = i ? m - p.msgs[i - 1]! : Infinity;
      const day = dayOf(m);
      p.msgDays.set(day, (p.msgDays.get(day) ?? 0) + (gap <= ACTIVE_GAP_MS ? gap : 0));
    });
    p.convs = conversationsOf(p.msgs);
    p.refers.sort((a, b) => a - b);
  }

  const bodyChecks = new Map<string, Array<{ at: number; score: number }>>();
  for (const b of data.bodyChecks ?? []) {
    if (staff.has(b.user_id)) continue;
    const list = bodyChecks.get(b.user_id) ?? [];
    list.push({ at: Date.parse(b.created_at), score: b.score });
    bodyChecks.set(b.user_id, list);
  }
  for (const list of bodyChecks.values()) list.sort((a, b) => a.at - b.at);

  const nudges: CountedNudge[] = (data.nudges ?? [])
    .filter((n) => !staff.has(n.user_id))
    .map((n) => ({
      user: n.user_id,
      type: n.type,
      sent: Date.parse(n.sent_at),
      clicked: n.clicked_at ? Date.parse(n.clicked_at) : null,
      delivered: Boolean(n.delivered_at),
      opened: Boolean(n.delivered_at && n.opened_at),
      stopped: false,
    }));
  // A stop or pause counts against the last nudge its person got before it.
  for (const [user, times] of stops) {
    const theirs = nudges.filter((n) => n.user === user).sort((a, b) => a.sent - b.sent);
    for (const t of times) {
      const last = theirs.findLast((n) => n.sent < t);
      if (last) last.stopped = true;
    }
  }

  return {
    people,
    events,
    accounts,
    methods: new Map([...firstSignIn].map(([id, s]) => [id, s.method])),
    firstDay: Number.isFinite(first) ? dayOf(first) : null,
    withResult: data.withResult,
    nudges,
    bodyChecks,
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

interface Flags {
  opened: boolean;
  /** Gave the first-message consent by the range's end; an account's sign-up includes it. */
  consented: boolean;
  /** Started a chat in the range. */
  started: boolean;
  /** Conversations that reached their 3rd message in the range, and since the beta began. */
  convsIn: number;
  convs: number;
  /** Had a free account by the range's end. */
  account: boolean;
  /** The first chat they started signed out in the range. */
  anonStart: number | null;
}

function flags(p: Person, w: Win): Flags {
  const done = p.convs.filter((t) => t < w.until);
  const account = p.account !== null && Date.parse(p.account.created_at) < w.until;
  return {
    opened: p.opens.some((at) => within(at, w)),
    consented: account || p.consents.some((at) => at < w.until),
    started: p.starts.some((s) => within(s.at, w)),
    convsIn: done.filter((t) => t >= w.since).length,
    convs: done.length,
    account,
    anonStart: p.starts.find((s) => s.anon && within(s.at, w))?.at ?? null,
  };
}

export interface Nps {
  /** Scores given (0 to 10), and "Not now" taps. */
  answers: number;
  notNow: number;
  promoters: number;
  detractors: number;
  /** % promoters (9–10) − % detractors (0–6) of the scores given: −100 to +100. */
  score: number | null;
}

function npsOf(scores: Array<string | null>): Nps {
  const given = scores.filter((s): s is string => s !== null).map(Number);
  const promoters = given.filter((s) => s >= 9).length;
  const detractors = given.filter((s) => s <= 6).length;
  return {
    answers: given.length,
    notNow: scores.length - given.length,
    promoters,
    detractors,
    score: given.length ? (100 * (promoters - detractors)) / given.length : null,
  };
}

export interface NudgeCounts {
  sent: number;
  delivered: number;
  /** Of the delivered, opened (Apple Mail's privacy opens included). */
  opened: number;
  clicked: number;
  /** Clicked, then a message within 24 h of the click; the messages of those conversations. */
  started: number;
  messages: number;
  /** Of the delivered, the last nudge before a stop or pause. */
  stopped: number;
}

/**
 * The nudges sent in the range. One "started a conversation" when its person wrote within 24 h
 * of clicking it; that conversation's messages are theirs from then to a gap over 30 minutes.
 */
function nudgeCounts(prep: Prepared, w: Win, type?: string): NudgeCounts {
  const out = { sent: 0, delivered: 0, opened: 0, clicked: 0, started: 0, messages: 0, stopped: 0 };
  for (const n of prep.nudges) {
    if (!within(n.sent, w) || (type && n.type !== type)) continue;
    out.sent++;
    if (n.delivered) out.delivered++;
    if (n.opened) out.opened++;
    if (n.delivered && n.stopped) out.stopped++;
    if (n.clicked === null) continue;
    out.clicked++;
    const said = sessionFrom(prep.people.get(n.user)?.msgs ?? [], n.clicked);
    if (said.length && said[0]! < n.clicked + NUDGE_REPLY_MS) {
      out.started++;
      out.messages += said.length;
    }
  }
  return out;
}

/** The people a nudge in the range found 7+ days without a message, and who wrote within 48 h. */
function reactivated(prep: Prepared, w: Win): { back: number; of: number } {
  const away = new Set<string>();
  const back = new Set<string>();
  for (const n of prep.nudges) {
    if (!within(n.sent, w)) continue;
    const msgs = prep.people.get(n.user)?.msgs ?? [];
    if (msgs.some((m) => m < n.sent && m >= n.sent - INACTIVE_MS)) continue;
    away.add(n.user);
    if (msgs.some((m) => m >= n.sent && m < n.sent + REACTIVATED_MS)) back.add(n.user);
  }
  return { back: back.size, of: away.size };
}

export interface Figures {
  /** Conversations in the range (by their 3rd message), and the people who had them. */
  conversations: number;
  conversed: number;
  /** Of them: with 10 conversations so far. */
  passedTen: number;
  /**
   * People who started a chat signed out in the range; of them, those with an account created
   * after it, by the range's end.
   */
  anonChatters: number;
  converted: number;
  /** Accounts created in the range. */
  signups: number;
  dau: number | null;
  wau: number | null;
  /** Time with Mira (ms) per active account and day. */
  timeSpent: number | null;
  ups: number;
  downs: number;
  crisis: number;
  /** Replies Mira declined (support lines instead), and coaching stopped for someone under 18. */
  declined: number;
  minorStops: number;
  nps: Nps;
  weekFour: { returned: number; of: number };
  nudge: NudgeCounts;
  reactivated: { back: number; of: number };
  body: BodyChange;
  /** Referrals to a therapist or doctor, at most one per person and conversation. */
  referred: number;
}

export interface BodyChange {
  /** Four-week body checks finished in the range, each against its person's first. */
  pairs: number;
  improved: number;
  worse: number;
  /** The average change in score (points on the 1 to 5 scale). */
  change: number | null;
}

/**
 * The four-week body checks finished in the range: each person's first check after 28 days or
 * more, against their first. Improved or worse at BODY_RELIABLE_CHANGE or more, else no clear
 * change. Without a control group this is change, not cause.
 */
function bodyChange(prep: Prepared, w: Win): BodyChange {
  const changes: number[] = [];
  for (const list of prep.bodyChecks.values()) {
    const base = list[0];
    const follow = base && list.find((c) => c.at - base.at >= FOLLOW_UP_DAYS * 24 * HOUR_MS);
    if (!base || !follow || !within(follow.at, w)) continue;
    // In hundredths, so 3.5 → 4.3 is 0.8 and not 0.7999….
    changes.push(Math.round((follow.score - base.score) * 100) / 100);
  }
  return {
    pairs: changes.length,
    improved: changes.filter((c) => c >= BODY_RELIABLE_CHANGE).length,
    worse: changes.filter((c) => c <= -BODY_RELIABLE_CHANGE).length,
    change: mean(changes),
  };
}

/** Referrals in the range; one within 30 minutes of the person's last is the same conversation's. */
function referrals(prep: Prepared, w: Win): number {
  let n = 0;
  for (const p of prep.people.values()) {
    p.refers.forEach((at, i) => {
      if (within(at, w) && (i === 0 || at - p.refers[i - 1]! > SESSION_GAP_MS)) n++;
    });
  }
  return n;
}

/** Every tile's figure for one range: the range itself, the one before, or a trend point. */
export function figures(prep: Prepared, from: string, to: string, today: string): Figures {
  const w = win(from, to);
  let conversations = 0;
  let conversed = 0;
  let passedTen = 0;
  let anonChatters = 0;
  let converted = 0;
  for (const p of prep.people.values()) {
    const f = flags(p, w);
    conversations += f.convsIn;
    if (f.convsIn) {
      conversed++;
      if (f.convs >= 10) passedTen++;
    }
    if (f.anonStart !== null) {
      anonChatters++;
      const created = p.account ? Date.parse(p.account.created_at) : NaN;
      if (created > f.anonStart && created < w.until) converted++;
    }
  }
  const inRange = prep.events.filter((e) => within(e.at, w));
  const count = (name: string, detail?: string) =>
    inRange.filter((e) => e.name === name && (detail === undefined || e.detail === detail)).length;
  const fourth = cohorts(prep, to, today, 5).filter((c) => c.cells[4]);
  return {
    conversations,
    conversed,
    passedTen,
    anonChatters,
    converted,
    signups: prep.accounts.filter((a) => within(Date.parse(a.created_at), w)).length,
    ...active(prep, from, to),
    ups: count("rating", "1"),
    downs: count("rating", "-1"),
    crisis: count("crisis_shown"),
    declined: count("reply_declined"),
    minorStops: count("minor_stop"),
    nps: npsOf(inRange.filter((e) => e.name === "nps").map((e) => e.detail)),
    nudge: nudgeCounts(prep, w),
    reactivated: reactivated(prep, w),
    body: bodyChange(prep, w),
    referred: referrals(prep, w),
    weekFour: {
      returned: fourth.reduce((n, c) => n + c.cells[4]!.active, 0),
      of: fourth.reduce((n, c) => n + c.users, 0),
    },
  };
}

/**
 * DAU % and WAU %: each day, the share of the accounts open by then that sent a message that
 * day, or in the 7 days to it; averaged over the range's days that had an account. Daily time
 * spent: each day, the average time with Mira of the accounts that wrote that day; averaged
 * over the range's days that had one.
 */
function active(
  prep: Prepared,
  from: string,
  to: string
): { dau: number | null; wau: number | null; timeSpent: number | null } {
  const dau: number[] = [];
  const wau: number[] = [];
  const time: number[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const end = reportingDayStart(addDays(d, 1)).getTime();
    const open = prep.accounts.filter((a) => Date.parse(a.created_at) < end);
    if (!open.length) continue;
    const week = Array.from({ length: 7 }, (_, k) => addDays(d, -k));
    const days = open.map((a) => prep.people.get(a.id)?.msgDays);
    const wrote = days.filter((s) => s?.has(d));
    dau.push(wrote.length / open.length);
    wau.push(days.filter((s) => week.some((x) => s?.has(x))).length / open.length);
    if (wrote.length) time.push(wrote.reduce((t, s) => t + s!.get(d)!, 0) / wrote.length);
  }
  return { dau: mean(dau), wau: mean(wau), timeSpent: mean(time) };
}

const monday = (day: string) => addDays(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));

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
        convos += p.convs.filter((t) => t < until).length;
      }
      return { active, convos };
    });
    return { week, users: users.length, cells };
  });
}

export interface ChipRow {
  /** The starter chip as written, or "Their own words". */
  label: string;
  /** New chats in the range it opened, and their share of those with a chip recorded. */
  chats: number;
  share: number | null;
  /** Of those chats, the share that reached 3 messages before a gap over 30 minutes. */
  real: number | null;
}

/**
 * Which starter chip opened the range's new chats, most used first, the person's own words last.
 * ponytail: a chat records its chip's index in today's starterChips, so reordering the chips in
 * mira-config.json relabels the chats before it; record the chip's text if they ever move.
 */
function chips(prep: Prepared, w: Win): ChipRow[] {
  const rows = [...miraConfig.starterChips, "Their own words"].map((label) => ({
    label,
    chats: 0,
    real: 0,
  }));
  const own = rows.at(-1)!;
  let all = 0;
  for (const p of prep.people.values()) {
    for (const s of p.starts) {
      if (s.chip === null || !within(s.at, w)) continue;
      const row = s.chip === -1 ? own : s.chip < rows.length - 1 ? rows[s.chip] : undefined;
      if (!row) continue;
      all++;
      row.chats++;
      const third = sessionFrom(p.msgs, s.at - TOLERANCE_MS)[2];
      if (third !== undefined && third < w.until) row.real++;
    }
  }
  const out = rows.map((r) => ({
    label: r.label,
    chats: r.chats,
    share: ratio(r.chats, all),
    real: ratio(r.real, r.chats),
  }));
  return [...out.slice(0, -1).sort((a, b) => b.chats - a.chats), out.at(-1)!];
}

/** What Mira knows of today's accounts: the five areas of Marcus's "Profile depth". */
function knowsOf(prep: Prepared): Knows {
  const rows = prep.accounts.map((a) => {
    const said = prep.people.get(a.id)?.answered ?? new Set<string>();
    return {
      rootCause: ROOT_CAUSE_QUESTIONS.every((q) => said.has(q)),
      baseline: (prep.bodyChecks.get(a.id)?.length ?? 0) > 0,
      goals: said.has(GOAL_QUESTION),
      style: Object.keys(a.style ?? {}).length > 0,
      result: prep.withResult.has(a.id),
    };
  });
  const count = (pick: (r: (typeof rows)[number]) => boolean) => rows.filter(pick).length;
  return {
    accounts: rows.length,
    rootCause: count((r) => r.rootCause),
    baseline: count((r) => r.baseline),
    goals: count((r) => r.goals),
    style: count((r) => r.style),
    result: count((r) => r.result),
    depth: mean(rows.map((r) => Object.values(r).filter(Boolean).length / 5)),
  };
}

/**
 * The range's new chats opened in the person's own words, by the topic Mira gave the first
 * message (a starter chip is its own row in the chips table), with the period before's shares.
 */
function topics(
  prep: Prepared,
  w: Win,
  before: Win | null
): { topics: TopicRow[]; untopical: number } {
  const tally = (range: Win) => {
    const n = new Map<string, number>();
    let all = 0;
    for (const p of prep.people.values()) {
      for (const t of p.topics) {
        if (!within(t.at, range)) continue;
        n.set(t.topic, (n.get(t.topic) ?? 0) + 1);
        all++;
      }
    }
    return { n, all };
  };
  const cur = tally(w);
  const prev = before ? tally(before) : null;
  let own = 0;
  for (const p of prep.people.values()) {
    own += p.starts.filter((st) => st.chip === -1 && within(st.at, w)).length;
  }
  const rows = (miraConfig.topics as Array<{ id: string; label: string; example: string }>).map(
    (t) => ({
      id: t.id,
      label: t.label,
      example: t.example,
      chats: cur.n.get(t.id) ?? 0,
      share: ratio(cur.n.get(t.id) ?? 0, cur.all),
      prevShare: prev ? ratio(prev.n.get(t.id) ?? 0, prev.all) : null,
    })
  );
  const other = rows.filter((r) => r.id === "other");
  return {
    topics: [...rows.filter((r) => r.id !== "other").sort((a, b) => b.chats - a.chats), ...other],
    untopical: Math.max(0, own - cur.all),
  };
}

/** People offered and starting the body check in the range, and the checks finished in it. */
function bodyFunnel(prep: Prepared, w: Win) {
  let offered = 0;
  let started = 0;
  for (const p of prep.people.values()) {
    if (p.bodyOffers.some((at) => within(at, w))) offered++;
    if (p.bodyStarts.some((at) => within(at, w))) started++;
  }
  let baselines = 0;
  let followUps = 0;
  for (const list of prep.bodyChecks.values()) {
    list.forEach((c, i) => {
      if (!within(c.at, w)) return;
      if (i === 0) baselines++;
      else followUps++;
    });
  }
  return { offered, started, baselines, followUps };
}

/**
 * The "Keep this chat" card in the range: the people shown it; of them, those who tapped Keep,
 * and of those, the ones whose account was created after their first tap, by the range's end
 * (signing in to an older account is no new one); and those shown it who tapped Not now.
 */
function keepCardFunnel(prep: Prepared, w: Win) {
  const out = { shown: 0, kept: 0, accounts: 0, notNow: 0 };
  for (const p of prep.people.values()) {
    if (!p.keepShown.some((at) => within(at, w))) continue;
    out.shown++;
    if (p.keepNotNow.some((at) => within(at, w))) out.notNow++;
    const kept = p.keepKept.filter((at) => within(at, w));
    if (!kept.length) continue;
    out.kept++;
    const created = p.account ? Date.parse(p.account.created_at) : NaN;
    if (created > Math.min(...kept) && created < w.until) out.accounts++;
  }
  return out;
}

/**
 * The coaching-style tip in the range: the people shown it; of them, those who opened the panel
 * from it, and those who saved a style after first seeing it, by the range's end.
 */
function styleTipFunnel(prep: Prepared, w: Win) {
  const out = { shown: 0, opened: 0, saved: 0 };
  for (const p of prep.people.values()) {
    const shown = p.tipShown.filter((at) => within(at, w));
    if (!shown.length) continue;
    out.shown++;
    if (p.tipOpened.some((at) => within(at, w))) out.opened++;
    const first = Math.min(...shown);
    if (p.styleSaved.some((at) => at > first && at < w.until)) out.saved++;
  }
  return out;
}

/**
 * The people who opened Mira in the range, by where they first came from, and of them those who
 * started a chat and created an account in the range. Most opened first, nothing recorded last.
 */
function sources(prep: Prepared, w: Win): SourceRow[] {
  const rows = new Map<string | null, SourceRow>();
  for (const p of prep.people.values()) {
    if (!p.opens.some((at) => within(at, w))) continue;
    const source = p.from?.source ?? null;
    let r = rows.get(source);
    if (!r) {
      const label = source === null ? "Not recorded" : source === DIRECT ? "Direct" : source;
      rows.set(source, (r = { source, label, opened: 0, started: 0, accounts: 0, rate: null }));
    }
    r.opened++;
    if (p.starts.some((s) => within(s.at, w))) r.started++;
    if (p.account && within(Date.parse(p.account.created_at), w)) r.accounts++;
  }
  return [...rows.values()]
    .map((r) => ({ ...r, rate: ratio(r.accounts, r.opened) }))
    .sort(
      (a, b) =>
        Number(a.source === null) - Number(b.source === null) ||
        b.opened - a.opened ||
        String(a.source).localeCompare(String(b.source))
    );
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

export interface TopicRow {
  id: string;
  label: string;
  /** A paraphrased example from the design, never a person's words. */
  example: string;
  /** New chats in the range opened in the person's own words with this topic, and their share. */
  chats: number;
  share: number | null;
  /** The share in the period before, when the page compares. */
  prevShare: number | null;
}

export interface Knows {
  accounts: number;
  /** Answered where it shows up and when it started (the intake's root-cause questions). */
  rootCause: number;
  /** Did the first body check. */
  baseline: number;
  /** Said what they would do if it felt easier (the intake's goal question). */
  goals: number;
  /** A coaching style saved. */
  style: number;
  /** A LoveIQ result Mira may use. */
  result: number;
  /** Profile depth: the average share of the five areas Mira knows, per account. */
  depth: number | null;
}

export interface SourceRow {
  /** The link's utm_source, an untagged visit's referring site, DIRECT, or null: not recorded. */
  source: string | null;
  /** As the page writes it. */
  label: string;
  /** People who opened Mira in the range; of them, who started a chat and created an account. */
  opened: number;
  started: number;
  accounts: number;
  /** accounts ÷ opened. */
  rate: number | null;
}

export interface MiraPayload extends PageHead {
  tiles: Record<string, Tile>;
  funnel: MiraStep[];
  /** "Where people came from": the range's people who opened Mira, by their first source. */
  sources: SourceRow[];
  /** People shown the free-account card in the range, each once however often it showed. */
  gate: number;
  /** The range's sign-ups by their first sign-in's method. */
  signupsBy: { email: number; google: number };
  perUser: Array<{ label: string; n: number; share: number | null; pastTen: boolean }>;
  cohorts: CohortRow[];
  /** Today's accounts, and what Mira knows of them. */
  knows: Knows;
  safety: {
    conversations: number;
    crisis: number;
    declined: number;
    minorStops: number;
    notHelpful: number;
    referred: number;
  };
  /** The "Keep this chat" card in the range (keepCardFunnel). */
  keepCard: { shown: number; kept: number; accounts: number; notNow: number };
  /** The "Make Mira yours" tip in the range (styleTipFunnel). */
  styleTip: { shown: number; opened: number; saved: number };
  chips: ChipRow[];
  topics: TopicRow[];
  /** New chats in the range opened in the person's own words that carry no topic. */
  untopical: number;
  /** The body check in the range: offered to, started by, first and four-week checks finished. */
  bodyCheck: BodyChange & {
    offered: number;
    started: number;
    baselines: number;
    followUps: number;
    reliableChange: number;
  };
  nps: Nps;
  /** The nudge emails by kind, in the range. */
  nudgeTypes: Array<{ type: string; title: string } & NudgeCounts>;
  /** The daily journal's KPI card (mira-journal.ts). */
  journal: JournalFigures;
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

  const w = win(f.from, f.to);
  const cur = figures(prep, f.from, f.to, today);
  const prev = compared && cmp ? figures(prep, cmp.from, cmp.to, today) : null;
  const points = trendBuckets(f.from, f.to).map((b) => figures(prep, b.from, b.to, today));
  const trend = bucketCaption(f.from, f.to);
  const n = (v: number) => v.toLocaleString("en-US");
  const of = (a: number, b: number, who: string) => `${n(a)} of ${n(b)} ${who}`;
  const many = (k: number, one: string, more: string) => `${n(k)} ${k === 1 ? one : more}`;

  const tile = (
    key: string,
    label: string,
    unit: Tile["unit"],
    pick: (x: Figures) => number | null,
    foot: string,
    goodWhen: Tile["goodWhen"] = "up"
  ): Tile => ({
    key,
    label,
    unit,
    value: pick(cur),
    prev: prev ? pick(prev) : null,
    goodWhen,
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
  const knows = knowsOf(prep);
  const { nps } = cur;
  const notNow = fmt("pct", ratio(nps.notNow, nps.answers + nps.notNow));
  const tiles: Record<string, Tile> = Object.fromEntries(
    [
      tile(
        "conversations",
        "Conversations",
        "count",
        (x) => x.conversations,
        `by ${many(cur.conversed, "person", "people")}`
      ),
      tile(
        "passTen",
        "Pass 10 conversations",
        "pct",
        (x) => ratio(x.passedTen, x.conversed),
        of(cur.passedTen, cur.conversed, "who had a conversation")
      ),
      tile("signups", "Signed-up users", "count", (x) => x.signups, "free accounts created"),
      tile(
        "signupRate",
        "Conversation started → user CVR",
        "pct",
        (x) => ratio(x.converted, x.anonChatters),
        of(cur.converted, cur.anonChatters, "anonymous chatters signed up")
      ),
      tile("dau", "DAU %", "pct", (x) => x.dau, "of signed-up users, per day"),
      tile("wau", "WAU %", "pct", (x) => x.wau, "of signed-up users, per 7 days"),
      tile("stickiness", "Stickiness", "ratio", (x) => ratio(x.dau, x.wau), "DAU ÷ WAU"),
      tile(
        "timeSpent",
        "Daily time spent",
        "mmss",
        (x) => x.timeSpent,
        "per account that wrote, per day"
      ),
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
      {
        ...tile(
          "nps",
          "NPS",
          "count",
          (x) => x.nps.score,
          `${many(nps.answers, "answer", "answers")}, ${notNow} “Not now”`
        ),
        // A score from −100 to +100: a change in it is points, never a percentage of it.
        prev: null,
      },
      tile(
        "bodyImage",
        "Body image improvement",
        "pct",
        (x) => ratio(x.body.improved, x.body.pairs),
        cur.body.pairs
          ? of(cur.body.improved, cur.body.pairs, "four-week body checks improved")
          : "no four-week body check in the range yet"
      ),
      {
        ...tile(
          "profileDepth",
          "Profile depth",
          "pct",
          () => knows.depth,
          "of the 5 areas, per account, today"
        ),
        // Today's accounts as they are now: no earlier value to compare or chart.
        prev: null,
        spark: [],
      },
      tile("nudgesSent", "Nudges sent", "count", (x) => x.nudge.sent, "daily nudge emails"),
      tile(
        "nudgeOpen",
        "Open rate",
        "pct",
        (x) => ratio(x.nudge.opened, x.nudge.delivered),
        of(cur.nudge.opened, cur.nudge.delivered, "delivered were opened")
      ),
      tile(
        "nudgeCtr",
        "CTR",
        "pct",
        (x) => ratio(x.nudge.clicked, x.nudge.sent),
        of(cur.nudge.clicked, cur.nudge.sent, "nudges clicked")
      ),
      tile(
        "nudgeStarted",
        "Conversations started",
        "pct",
        (x) => ratio(x.nudge.started, x.nudge.sent),
        of(cur.nudge.started, cur.nudge.sent, "led to a message within 24 h of the click")
      ),
      tile(
        "nudgeMessages",
        "Avg. messages / conv.",
        "ratio",
        (x) => ratio(x.nudge.messages, x.nudge.started),
        `in ${many(cur.nudge.started, "conversation", "conversations")} from a nudge`
      ),
      tile(
        "nudgeUnsub",
        "Unsubscribe",
        "pct",
        (x) => ratio(x.nudge.stopped, x.nudge.delivered),
        of(cur.nudge.stopped, cur.nudge.delivered, "delivered were followed by a stop or pause"),
        "down"
      ),
      tile(
        "reactivated",
        "Reactivated by nudges",
        "pct",
        (x) => ratio(x.reactivated.back, x.reactivated.of),
        of(cur.reactivated.back, cur.reactivated.of, "away 7+ days wrote within 48 h")
      ),
      notYet("subscription", "Subscription rate", afterBeta),
      notYet("churn", "Subscriber churn", afterBeta),
    ].map((t) => [t.key, t])
  );

  // The people of the range, each step also passing every step above it, so it never rises.
  const range = [...prep.people.values()].map((p) => flags(p, w));
  let left = range;
  const steps: Array<[string, string, string, (x: Flags) => boolean]> = [
    ["opened", "Opened Mira", "Her chat page loaded", (x) => x.opened],
    ["consent", "Gave consent", "18+ and sensitive data, now or before", (x) => x.consented],
    ["started", "Started a chat", "Sent a first message", (x) => x.started],
    ["real", "Real conversation", "3+ messages, no gap over 30 min", (x) => x.convsIn > 0],
    ["account", "Created a free account", "By the range's last day", (x) => x.account],
    ["ten", "Reached 10 conversations", "Counted since the beta began", (x) => x.convs >= 10],
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

  const conversed = range.filter((x) => x.convsIn > 0).map((x) => x.convs);
  const perUser = PER_USER.map((b) => {
    const k = conversed.filter((c) => c >= b.min && c <= b.max).length;
    return { label: b.label, n: k, share: ratio(k, conversed.length), pastTen: b.min >= 10 };
  });
  const signedUp = prep.accounts.filter((a) => within(Date.parse(a.created_at), w));
  const by = (method: string) => signedUp.filter((a) => prep.methods.get(a.id) === method).length;

  return {
    range: { from: f.from, to: f.to, label: rangeLabel(f.from, f.to) },
    compare: compared && cmp ? { ...cmp, label: rangeLabel(cmp.from, cmp.to) } : null,
    generatedAt: now.toISOString(),
    notes,
    narrowed: null,
    tiles,
    funnel,
    sources: sources(prep, w),
    gate: [...prep.people.values()].filter((p) => p.gates.some((at) => within(at, w))).length,
    signupsBy: { email: by("email"), google: by("google") },
    perUser,
    cohorts: cohorts(prep, f.to, today).slice(-8),
    knows,
    safety: {
      conversations: cur.conversations,
      crisis: cur.crisis,
      notHelpful: cur.downs,
      referred: cur.referred,
      declined: cur.declined,
      minorStops: cur.minorStops,
    },
    keepCard: keepCardFunnel(prep, w),
    styleTip: styleTipFunnel(prep, w),
    chips: chips(prep, w),
    ...topics(prep, w, compared && cmp ? win(cmp.from, cmp.to) : null),
    bodyCheck: { ...cur.body, ...bodyFunnel(prep, w), reliableChange: BODY_RELIABLE_CHANGE },
    nps,
    nudgeTypes: nudgeConfig.types.map((k) => ({
      type: k.id,
      title: k.title,
      ...nudgeCounts(prep, w, k.id),
    })),
    journal: journalFigures(
      input.data.journal,
      new Set(prep.accounts.map((a) => a.id)),
      f.from,
      f.to
    ),
  };
}
