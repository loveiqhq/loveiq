/**
 * The Report page (Marcus's "Assessment A · Report" artboard): how people get into their
 * report, how long they read, when they come back and what brings them, every chapter's
 * votes, and the feedback log.
 */
import { WIZARD_DRAWER } from "@features/survey/ui/wizard/wizardContent";
import { supabaseFetch } from "@features/admin/server/supabase";

import { assessmentScope } from "./assessment";
import { shortDate } from "./days";
import { PRE_PLANS, type Facts, type SubFact } from "./facts";
import { activeNarrowing, bucketCaption, rangeLabel, type ApFilters } from "./filters";
import { type GoodWhen, type Unit } from "./format";
import {
  EVENTS_COMPLETE_FROM,
  launched,
  mean,
  median,
  ratio,
  subsIn,
  tabletBlocked,
  totals,
  trend,
  type Totals,
  ageMatched,
  sameAge,
} from "./metrics";
import { head, readFoot, type PageHead, type Tile } from "./common";
import type { PostHogResult, ReportReturns } from "./posthog";
import { AGE_BANDS, ageBand, genderLabel } from "./survey-page";

export interface ReportExtras {
  wizard: Array<{
    slide: number;
    went_on: number;
    went_back: number;
    median_ms: number | null;
    timed: number;
  }>;
  /** The range's finishers who stepped through the map's deep dives (slide 2). */
  map_steppers: number[] | null;
  chapters: Array<{ section: string; up: number; down: number }>;
  paywall_clicks: Array<{ section: string; readers: number }>;
  /**
   * Reading per chapter (report_chapter_stats), over the range's readers who finished from
   * `chapter_stats_from`: readers who reached each chapter, their mean time in it, and how
   * many of them used each control. `pw_click` counts only readers who also saw a paywall.
   */
  chapter_stats: Array<{
    section: string;
    reached: number;
    ms_avg: number | null;
    opened: number;
    show_all: number;
    learn_more: number;
    try_this: number;
    pw_seen: number;
    pw_click: number;
  }>;
  /** Those readers who reached any chapter: Reach's denominator. */
  chapter_readers: number;
  /** Each of those readers' chapters reached (ids, unordered): how far into the report they got. */
  chapter_depth: Array<{ sid: number; chapters: string[] }>;
  /** The first day (Berlin) any chapter reading was recorded; null before the first. */
  chapter_stats_from: string | null;
  /** The range's finishers who pressed Skip Intro, by the slide (0-5) they pressed it on. */
  wizard_skips: Array<{ slide: number; n: number; sids: number[] }>;
  /** The first day (Berlin) any Skip Intro was recorded; null before the first. */
  wizard_skips_from: string | null;
  issues: Array<{ issue: string; n: number }>;
  feedback: Array<{
    at: string;
    submission: number | null;
    section: string;
    vote: string;
    issue: string | null;
    commented: boolean;
  }>;
  votes_total: number;
  /**
   * returned: of those sent, readers who came back through the email's link after it.
   * opened, clicked: of those sent, readers whose email the Resend webhook saw opened, or a
   * link in it clicked (email_message_event).
   */
  emails: Array<{
    stage: string;
    sent: number;
    /** Reported delivered by the webhook (all of it, and since open tracking began). */
    delivered: number | null;
    delivered_opens: number | null;
    opened: number | null;
    clicked: number | null;
    returned: number | null;
    bought: number;
    revenue: number;
  }>;
  /** The first Berlin day an email's own event was kept (clicks count from it); null before. */
  email_events_from: string | null;
  /** The first Berlin day an open was kept: open tracking is switched on after the rest. */
  email_opens_from: string | null;
}

export async function fetchReportExtras(from: string, to: string): Promise<ReportExtras> {
  const res = await supabaseFetch("/rest/v1/rpc/ap_report_extras", {
    method: "POST",
    body: JSON.stringify({ p_from: from, p_to: to }),
    timeoutMs: 30_000,
  });
  if (!res.ok) throw new Error(`ap_report_extras failed (${res.status})`);
  const raw = (await res.json()) as Partial<ReportExtras> | null;
  if (
    !raw ||
    !Array.isArray(raw.wizard) ||
    !Array.isArray(raw.chapters) ||
    !Array.isArray(raw.feedback) ||
    !Array.isArray(raw.emails)
  ) {
    throw new Error("ap_report_extras: unexpected shape");
  }
  return {
    wizard: raw.wizard,
    // Missing from an ap_report_extras older than these two parts: blank, never zero.
    map_steppers: Array.isArray(raw.map_steppers) ? raw.map_steppers.map(Number) : null,
    chapters: raw.chapters,
    paywall_clicks: raw.paywall_clicks ?? [],
    // Missing from an ap_report_extras older than per-chapter reading and Skip Intro: not
    // recorded, which the page says, never zeros.
    chapter_stats: Array.isArray(raw.chapter_stats) ? raw.chapter_stats : [],
    chapter_readers: Number(raw.chapter_readers) || 0,
    chapter_depth: Array.isArray(raw.chapter_depth)
      ? raw.chapter_depth.map((d) => ({
          sid: Number(d.sid),
          chapters: Array.isArray(d.chapters) ? d.chapters.map(String) : [],
        }))
      : [],
    chapter_stats_from: raw.chapter_stats_from ?? null,
    wizard_skips: Array.isArray(raw.wizard_skips)
      ? raw.wizard_skips.map((k) => ({
          slide: Number(k.slide),
          n: Number(k.n) || 0,
          sids: Array.isArray(k.sids) ? k.sids.map(Number) : [],
        }))
      : [],
    wizard_skips_from: raw.wizard_skips_from ?? null,
    issues: raw.issues ?? [],
    feedback: raw.feedback,
    votes_total: Number(raw.votes_total) || 0,
    emails: raw.emails.map((e) => ({
      ...e,
      returned: e.returned ?? null,
      delivered: e.delivered ?? null,
      delivered_opens: e.delivered_opens ?? null,
      opened: e.opened ?? null,
      clicked: e.clicked ?? null,
    })),
    email_events_from: typeof raw.email_events_from === "string" ? raw.email_events_from : null,
    email_opens_from: typeof raw.email_opens_from === "string" ? raw.email_opens_from : null,
  };
}

const SLIDES = [
  {
    name: "A note before you explore your report",
    purpose:
      "Thanks the reader; shows the research behind the report (papers, clinical models, books)",
  },
  {
    name: "Report parts & chapters",
    purpose: "Shows the chapter list: free chapters, featured chapters, locked insights",
  },
  {
    name: "Unlocking your report is fully risk free",
    purpose: "14-day money-back guarantee, no questions asked",
  },
  {
    name: "Take only what resonates",
    purpose: "Perspectives, not fixed definitions; keep what is meaningful",
  },
  { name: "Rate each report section", purpose: "Asks readers to rate every section as they read" },
  { name: "Invite your friends to grow", purpose: "Invite friends to take the survey too" },
];

/** The map's own steps (wizard_map_step) are recorded from this day. */
const MAP_STEPS_FROM = "2026-10-06";

/**
 * The four ways back to a report PostHog tells apart (posthog.ts), in the design's order, each
 * with the design's name for it.
 */
const RETURN_SOURCES: Array<[posthog: string, label: string]> = [
  ["Bookmark or direct", "Bookmark or direct"],
  ["Email link", "Email campaign"],
  ["Share link from a friend", "Share link from a friend"],
  ["Another tagged link", "Other"],
];

/** "1 share", "12 shares". */
const plural = (n: number, one: string) =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : `${one}s`}`;

const ISSUES: Record<string, string> = {
  inaccurate: "Feels inaccurate",
  incomplete: "Incomplete",
  unclear: "Unclear",
  irrelevant: "Not relevant to me",
  tone: "Tone",
  other: "Other",
};

/** The live report's chapters: what its per-chapter reading is recorded under. */
const LIVE_CHAPTERS: ReadonlySet<string> = new Set(
  WIZARD_DRAWER.flatMap((p) => p.rows.map((r) => r.id))
);

/** The live report's chapters in its own order (its nav), then any older chapter id voted on. */
export function chapterList(seen: string[]): Array<{ id: string; name: string; part: string }> {
  const live = WIZARD_DRAWER.flatMap((p) =>
    p.rows.map((r) => ({ id: r.id, name: r.label, part: `${p.part} · ${p.label}` }))
  );
  const older = [...new Set(seen)]
    .filter((id) => !LIVE_CHAPTERS.has(id))
    .sort()
    .map((id) => ({ id, name: prettyId(id), part: "Earlier report versions" }));
  return [...live, ...older];
}

export function prettyId(id: string): string {
  const s = id.replace(/_amp_/g, " & ").replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** A headline tile, with the design's decimals for its value (`digits`). */
export type ReportTile = Tile & { digits?: number };

/**
 * A headline rate's decimals, as the design writes them: two figures ("34%", "2.1%", "0.21%"),
 * and "0%" for none. Read off the rounded rate, so 9.96% is "10%", not "10.0%".
 */
export function twoFigures(v: number | null): number | undefined {
  if (v === null) return undefined;
  const p = Math.abs(v) * 100;
  return p >= 9.95 || p === 0 ? 0 : p >= 0.995 ? 1 : 2;
}

/**
 * A box under Time in report or Returns: its value and the period before's at the same age,
 * for the change as a percentage, or the note shown in its place.
 */
export interface ChangeBox {
  key: string;
  label: string;
  unit: Unit;
  value: number | null;
  prev: number | null;
  goodWhen: GoodWhen;
  digits?: number;
  note?: string;
}

/** Reading time for one group of readers: the mean and the median, and the benchmark's. */
export interface TimeGroup {
  label: string;
  ms: number | null;
  benchMs: number | null;
  medianMs: number | null;
  benchMedianMs: number | null;
}

export interface ReportPayload extends PageHead {
  launched: boolean;
  tiles: ReportTile[];
  wizard: {
    /** Intro started, completed all 6, skipped and left the report; rates whole, as drawn. */
    tiles: ReportTile[];
    slides: Array<{
      n: number;
      name: string;
      purpose: string;
      reached: number;
      reachedShare: number | null;
      cont: number | null;
      /**
       * Pressed Skip Intro on the slide, of its readers who finished once that was
       * recorded (`skipsFrom`); null with none of them.
       */
      skip: number | null;
      back: number;
      /** Back ÷ reached; null while a source, device or tier filter is on (back has none). */
      backShare: number | null;
      exit: number | null;
      medianMs: number | null;
      /** Slide 2 only: of its readers since MAP_STEPS_FROM, those who stepped through the map. */
      engaged: number | null;
    }>;
    /** The first day Skip Intro was recorded per slide; null before it was. */
    skipsFrom: string | null;
  };
  time: {
    readers: number;
    recorded: number;
    avgMs: number | null;
    /** The benchmark readers' average, for "vs all reports". */
    benchAvgMs: number | null;
    medianMs: number | null;
    perSessionMs: number | null;
    /** Avg. and median total time, avg. per session and readers, with their change. */
    boxes: ChangeBox[];
    buckets: Array<{ label: string; share: number; bench: number }>;
    byGender: TimeGroup[];
    byAge: TimeGroup[];
    /**
     * How far into the report readers got: each reader whose reading per chapter was recorded,
     * by the deepest live chapter they reached (its place among the report's chapters), split
     * by their total reading time (`groups`; the last is readers whose time was not recorded).
     */
    depth: {
      from: string | null;
      readers: number;
      chapters: number;
      groups: string[];
      bands: Array<{ label: string; counts: number[] }>;
    };
  };
  returns: {
    cameBack: number | null;
    medianDays: number | null;
    sessionsPerReader: number | null;
    viaEmail: number | null;
    /** Came back, median days to return, returned via email and visits per reader, with their change. */
    boxes: ChangeBox[];
    days: Array<{ label: string; share: number; cumulative: number | null }>;
    sources: PostHogResult<Array<{ source: string; share: number; sessions: number }>> | null;
    campaigns: Array<{
      stage: string;
      status: "Live" | "Retired";
      /** Null with every figure below for a retired stage that sent and sold nothing in the range. */
      sent: number | null;
      /** Of those sent, readers whose email was opened; null when the range is not all counted. */
      opened: number | null;
      /** opened ÷ sent. */
      openRate: number | null;
      /** Of those sent, readers who clicked a link in the email; null as opened. */
      clicked: number | null;
      /** clicked ÷ sent. */
      clickRate: number | null;
      /** Of those sent, readers who came back through the email's link after it was sent. */
      returned: number | null;
      /** returned ÷ sent. */
      returnRate: number | null;
      purchased: number | null;
      revenue: number;
    }>;
    /** Since when opens and clicks are counted, for the note under the campaigns. */
    emailEvents: string;
  };
  chapters: Array<{
    n: number;
    id: string;
    name: string;
    part: string;
    up: number;
    down: number;
    /** Readers who clicked a paywall or lock button, by the section granting access. */
    paywallReaders: number;
    /** The rest from per-chapter reading; null where the range has none recorded. */
    reach: number | null;
    avgMs: number | null;
    /** Of the chapter's readers (those who reached it); null where none did it. */
    showMore: number | null;
    learnMore: number | null;
    exercise: number | null;
    /** Clicked ÷ saw the chapter's paywall; null where nobody saw it. */
    paywall: number | null;
    paywallSeen: number;
    paywallClicked: number;
  }>;
  /** Per-chapter reading: from when, its readers in this range, and whether it has any days. */
  chapterReading: { from: string | null; readers: number; recorded: boolean };
  feedback: {
    good: number;
    bad: number;
    total: number;
    issues: Array<{ label: string; n: number }>;
    log: Array<{
      at: string;
      submission: number | null;
      chapter: string;
      vote: "Good" | "Bad";
      issue: string | null;
      commented: boolean;
    }>;
  };
}

/** Readers whose reading time was recorded (the end of a session is saved since 18 Sep 2026). */
function recorded(subs: SubFact[]): SubFact[] {
  return subs.filter((s) => s.openedAt && s.closed > 0);
}

const MINUTE = 60_000;
const TIME_BUCKETS: Array<[string, number, number]> = [
  ["< 1 min", 0, 1],
  ["1–3", 1, 3],
  ["3–5", 3, 5],
  ["5–10", 5, 10],
  ["10–20", 10, 20],
  ["20+", 20, Infinity],
];

function timeShares(list: SubFact[]): number[] {
  return TIME_BUCKETS.map(([, lo, hi]) =>
    list.length
      ? list.filter((s) => s.readMs >= lo * MINUTE && s.readMs < hi * MINUTE).length / list.length
      : 0
  );
}

const DAY_BANDS: Array<[string, number, number]> = [
  ["Same day", 0, 0],
  ["1 day", 1, 1],
  ["2–3 days", 2, 3],
  ["4–7 days", 4, 7],
  ["8–14 days", 8, 14],
  ["15–30 days", 15, 30],
  ["Over 30 days", 31, Infinity],
];

/** Bands of how far into the report a reader got, as a share of its chapters: [label, from, under]. */
const DEPTH_BANDS: Array<[string, number, number]> = [
  ["0–9%", 0, 10],
  ["10–24", 10, 25],
  ["25–49", 25, 50],
  ["50–74", 50, 75],
  ["75–94", 75, 95],
  ["95–100", 95, Infinity],
];

/** A reader's total reading time, as the design splits it; the last is "not recorded". */
const TIME_GROUPS = ["< 1 min", "1–5 min", "5–10 min", "10 min+", "Time not recorded"] as const;

/** Of PostHog's return visits, the share that came through an email link; null unread or none. */
function emailShare(r: PostHogResult<ReportReturns> | null): number | null {
  if (!r || !r.ok) return null;
  const by = new Map(r.value.sources.map((s) => [s.source, s.sessions]));
  const total = RETURN_SOURCES.reduce((a, [s]) => a + (by.get(s) ?? 0), 0);
  return total ? (by.get("Email link") ?? 0) / total : null;
}

/** Berlin calendar days between two instants. */
function berlinDays(a: string, b: string): number {
  const day = (iso: string) =>
    new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
  return Math.round((Date.parse(day(b)) - Date.parse(day(a))) / 86_400_000);
}

export function buildReportPage(input: {
  facts: Facts;
  previous: Facts | null;
  benchmark: Facts;
  extras: ReportExtras;
  /**
   * The comparison period's Skip Intro presses (its own ap_report_extras), for the Skipped intro
   * tile's change; without them that tile is not compared.
   */
  previousExtras?: Pick<ReportExtras, "wizard_skips"> | null;
  returns: PostHogResult<ReportReturns> | null;
  /** The period before's, for "Returned via email"'s change; null when it is not read. */
  previousReturns?: PostHogResult<ReportReturns> | null;
  filters: ApFilters;
  today: string;
  now: Date;
}): ReportPayload {
  const { facts, extras, filters: f, today, now } = input;
  const scope = assessmentScope(f);
  // The tablet filter before tablets were told apart: nobody counts as one, so every tile is
  // blank with the reason, and an earlier period from before then is not compared.
  const tablet = tabletBlocked(scope, facts.from);
  const previous =
    input.previous && !tabletBlocked(scope, input.previous.from) ? input.previous : null;
  const t = totals(facts, scope);
  // The earlier period at the same age as this one: its readers had no longer to act.
  const prevAged = previous ? ageMatched(previous, sameAge(facts, previous, now)) : null;
  const p: Totals | null = prevAged ? totals(prevAged, scope) : null;
  const caption = bucketCaption(facts.from, facts.to);
  const subs = subsIn(facts, scope);
  const readers = subs.filter((s) => s.openedAt);
  const rec = recorded(subs);
  const prevSubs = prevAged ? subsIn(prevAged, scope) : [];
  const readMean = (list: SubFact[]) => mean(recorded(list).map((s) => s.readMs));
  const per = (pick: (x: SubFact[]) => number, list: SubFact[]) =>
    ratio(pick(list), list.filter((s) => s.openedAt).length);
  const returnedShare = (list: SubFact[]) =>
    per((l) => l.filter((s) => s.openedAt && s.returnedAt).length, list);
  const initiated = (list: SubFact[]) =>
    per((l) => l.filter((s) => s.openedAt && s.clickedAt).length, list);
  const shareRate = (list: SubFact[]) =>
    per((l) => l.filter((s) => s.openedAt && s.shared).length, list);
  const rateRate = (list: SubFact[]) =>
    per((l) => l.filter((s) => s.openedAt && s.votes > 0).length, list);
  const inviteRate = (list: SubFact[]) =>
    per((l) => l.filter((s) => s.openedAt && s.invited).length, list);
  const unlockRate = (list: SubFact[]) =>
    per((l) => l.filter((s) => s.openedAt && s.paidAt && s.full).length, list);
  const preRate = (list: SubFact[]) =>
    per((l) => l.filter((s) => s.openedAt && s.paidAt && PRE_PLANS.has(s.plan ?? "")).length, list);
  const spark = (pick: (x: SubFact[]) => number | null) =>
    trend(facts, scope, (_x, from, to) => pick(subsIn(facts, scope, from, to)));
  // Paywall clicks, share-method invites and the wizard's slides were recorded only with
  // cookie consent before 18 Sep 2026: their lines start there.
  const sparkFull = (pick: (x: SubFact[]) => number | null) =>
    trend(facts, scope, (_x, from, to) =>
      from >= EVENTS_COMPLETE_FROM ? pick(subsIn(facts, scope, from, to)) : null
    );
  const n = (v: number) => v.toLocaleString("en-US");
  const narrowed = activeNarrowing(f).length > 0;

  const tile = (
    key: string,
    label: string,
    unit: Tile["unit"],
    value: number | null,
    prev: number | null,
    foot: string,
    sp: Array<number | null>,
    blocked: string | null = null
  ): ReportTile => ({
    key,
    label,
    unit,
    value,
    // The design's headline rates read "34%", "2.1%", "0.21%"; the wizard's are whole (below).
    digits: unit === "pct" ? twoFigures(value) : undefined,
    prev,
    goodWhen: "up",
    spark: sp,
    foot,
    blocked: blocked ?? tablet,
    trend: caption,
  });

  // Reading time (the end of a session), returns and paywall clicks are recorded for everyone
  // only from 18 Sep 2026: a comparison with a period before that is made of the gap, so those
  // figures say they are not compared. The earlier readers are read at the same age as these
  // (ageMatched), their reading and visits included.
  const prevComparable = previous ? previous.from >= EVENTS_COMPLETE_FROM : false;
  const withheld = previous && !prevComparable ? " · not compared: before 18 Sep" : "";
  // "18 Sep" kept on one line in a narrow tile.
  const noCmp = previous && !prevComparable ? "No comparison before 18\u00a0Sep" : null;
  const noCmpNote = noCmp ? { note: noCmp } : {};
  const sharers = readers.filter((s) => s.shared).length;
  const raters = readers.filter((s) => s.votes > 0).length;
  const inviters = readers.filter((s) => s.invited).length;
  const prevInviters = prevComparable
    ? prevSubs.filter((s) => s.openedAt && s.invited).length
    : null;
  const readTimes = (list: SubFact[]) => recorded(list).map((s) => s.readMs);
  const readMedian = (list: SubFact[]) => median(readTimes(list));
  const tiles: ReportTile[] = [
    tile(
      "opened",
      "Reports opened",
      "count",
      t.opened,
      p?.opened ?? null,
      `${p ? `vs ${n(p.opened)} · ` : ""}${pct(ratio(t.opened, t.subs))} of submissions`,
      trend(facts, scope, (x) => x.opened)
    ),
    {
      ...tile(
        "read",
        "Avg. read time",
        "mmss",
        readMean(subs),
        prevComparable ? readMean(prevSubs) : null,
        `${readFoot(readMedian(subs))} · recorded for ${n(rec.length)} of ${n(readers.length)}${withheld}`,
        spark((l) => readMean(l))
      ),
      ...noCmpNote,
    },
    {
      ...tile(
        "median",
        "Median read time",
        "mmss",
        readMedian(subs),
        prevComparable ? readMedian(prevSubs) : null,
        `half of the readers read longer · recorded for ${n(rec.length)} of ${n(readers.length)}${withheld}`,
        spark((l) => readMedian(l))
      ),
      ...noCmpNote,
    },
    {
      ...tile(
        "returned",
        "Returned",
        "pct",
        returnedShare(subs),
        // A visit's end was recorded for everyone only from 18 Sep: before, a long read
        // followed by a reopen could pass for a return.
        prevComparable ? returnedShare(prevSubs) : null,
        `opened again later${withheld}`,
        sparkFull(returnedShare)
      ),
      ...noCmpNote,
    },
    {
      ...tile(
        "initiated",
        "Paywall initiated",
        "pct",
        initiated(subs),
        prevComparable ? initiated(prevSubs) : null,
        `of report openers actively clicked a paywall CTA${withheld}`,
        sparkFull(initiated)
      ),
      ...noCmpNote,
    },
    tile(
      "share",
      "Share rate",
      "pct",
      shareRate(subs),
      previous ? shareRate(prevSubs) : null,
      `of report openers shared their report (${n(sharers)} of ${n(readers.length)})`,
      spark(shareRate)
    ),
    tile(
      "rating",
      "Rating rate",
      "pct",
      rateRate(subs),
      previous ? rateRate(prevSubs) : null,
      `of report openers rated at least one chapter (${n(raters)} of ${n(readers.length)} · ${plural(
        readers.reduce((a, s) => a + s.votes, 0),
        "vote"
      )})`,
      spark(rateRate)
    ),
    {
      ...tile(
        "invite",
        "Invite rate",
        "pct",
        inviteRate(subs),
        prevComparable ? inviteRate(prevSubs) : null,
        `of report openers invited a friend to the test (${n(inviters)} of ${n(readers.length)}${
          prevInviters === null ? "" : ` · prev. ${n(prevInviters)}`
        })${withheld}`,
        sparkFull(inviteRate)
      ),
      ...noCmpNote,
    },
    // The Initial plan (EUR 1.99, pay to start's initial report since 19.10). With no plan
    // key on sale, no figure, and the tile says so.
    PRE_PLANS.size
      ? tile(
          "pre",
          "Pre unlock rate",
          "pct",
          preRate(subs),
          previous ? preRate(prevSubs) : null,
          "Initial plan purchases ÷ report openers",
          spark(preRate)
        )
      : {
          ...tile("pre", "Pre unlock rate", "pct", null, null, "", []),
          note: "Initial plan not on sale yet",
        },
    tile(
      "full",
      "Full unlock rate",
      "pct",
      unlockRate(subs),
      previous ? unlockRate(prevSubs) : null,
      "Full, Full All and Core purchases ÷ report openers",
      spark(unlockRate)
    ),
  ];

  // The pre-report wizard: everyone who finished sees slide 1; a later slide is reached by
  // those who went on to it. Reached, went on and left come from the readers themselves (the
  // furthest slide each advanced to), so the filters apply; going back and the time on a
  // slide come from the slides' own events, which carry no source: always all traffic.
  const started = subs.length;
  const reach = [0, 1, 2, 3, 4, 5].map((i) =>
    i === 0 ? started : subs.filter((s) => (s.wizardSlide ?? 0) >= i).length
  );
  const openedAfter = subs.filter((s) => s.openedAt && (s.wizardSlide ?? 0) >= 5).length;
  // The map's steppers come as submissions, so unlike Back this share follows the filters.
  const steppers = extras.map_steppers ? new Set(extras.map_steppers) : null;
  const mapReaders = subs.filter((s) => s.day >= MAP_STEPS_FROM && (s.wizardSlide ?? 0) >= 1);
  // Skip Intro per slide, recorded from `skipsFrom`. Its pressers come as submissions too, so
  // it follows the filters; before `skipsFrom` nobody's skip is known.
  const skipsFrom = extras.wizard_skips_from;
  const skippedOn = new Map(extras.wizard_skips.map((k) => [k.slide, new Set(k.sids)]));
  const skippers = new Set(extras.wizard_skips.flatMap((k) => k.sids));
  const slides = SLIDES.map((s, i) => {
    const w = extras.wizard.find((x) => x.slide === i);
    const reached = reach[i]!;
    const wentOn = i < 5 ? reach[i + 1]! : openedAfter;
    const back = w?.went_back ?? 0;
    const readersHere = subs.filter((x) => i === 0 || (x.wizardSlide ?? 0) >= i);
    const skipped = skippedOn.get(i) ?? new Set<number>();
    // Stopped here but pressed Skip Intro, here or on a slide they went back to: they
    // skipped, they did not leave.
    const skippedOnly = readersHere.filter(
      (x) => skippers.has(x.id) && !(i < 5 ? (x.wizardSlide ?? 0) > i : x.openedAt)
    ).length;
    const recordedHere = skipsFrom === null ? [] : readersHere.filter((x) => x.day >= skipsFrom);
    return {
      n: i + 1,
      name: s.name,
      purpose: s.purpose,
      reached,
      reachedShare: ratio(reached, started),
      cont: ratio(wentOn, reached),
      skip: ratio(recordedHere.filter((x) => skipped.has(x.id)).length, recordedHere.length),
      back,
      // Slide 1 has no Back button: nothing to share out.
      backShare: narrowed || i === 0 ? null : ratio(back, reached),
      exit: reached ? Math.max(0, reached - wentOn - skippedOnly) / reached : null,
      medianMs: w && w.timed > 0 && w.median_ms !== null ? Number(w.median_ms) : null,
      engaged:
        i === 1 && steppers
          ? ratio(mapReaders.filter((x) => steppers.has(x.id)).length, mapReaders.length)
          : null,
    };
  });
  // Skipped intro from our own records when every day of the range has them: a share of the
  // intro's starters, by the filters, compared when the earlier period has them all too.
  // Before, PostHog's count of the sessions it saw press it: it sees part of the readers, so
  // that stays a count, never a share of our finishers.
  const ownSkips = skipsFrom !== null && f.from >= skipsFrom;
  const skipShare = (l: SubFact[], who: ReadonlySet<number>) =>
    ratio(l.filter((x) => who.has(x.id)).length, l.length);
  const prevSkippers = input.previousExtras
    ? new Set(input.previousExtras.wizard_skips.flatMap((k) => k.sids))
    : null;
  // The slide most of the range's starters pressed it on. The presses come by slide, so a tie
  // goes to the earlier one.
  let topSkip: { slide: number; n: number } | null = null;
  for (const [slide, who] of skippedOn) {
    const k = subs.filter((x) => who.has(x.id)).length;
    if (k > (topSkip?.n ?? 0)) topSkip = { slide, n: k };
  }
  const skippedTile: ReportTile = ownSkips
    ? {
        ...tile(
          "skipped",
          "Skipped intro",
          "pct",
          skipShare(subs, skippers),
          prevSkippers && previous && previous.from >= skipsFrom
            ? skipShare(prevSubs, prevSkippers)
            : null,
          topSkip ? `most skips on slide ${topSkip.slide + 1}` : "nobody pressed Skip Intro",
          spark((l) => skipShare(l, skippers))
        ),
        goodWhen: "down",
        // An earlier period from before Skip Intro was recorded has no share to compare.
        ...(previous && previous.from < skipsFrom
          ? { note: `No comparison before ${rangeLabel(skipsFrom, skipsFrom)}` }
          : {}),
      }
    : {
        ...tile(
          "skipped",
          "Skipped intro",
          "count",
          input.returns && input.returns.ok ? input.returns.value.wizardSkips : null,
          null,
          `sessions PostHog saw press Skip Intro${narrowed ? " · all traffic" : ""}${
            skipsFrom ? ` · our own share from ${rangeLabel(skipsFrom, skipsFrom)}` : ""
          }`,
          [],
          input.returns && !input.returns.ok ? input.returns.error : null
        ),
        goodWhen: "down",
        trend: "",
        // A count of the sessions PostHog saw, not a share of our readers: said so, not compared.
        note: "sessions PostHog saw",
      };
  // Continued through slide 6: reached it, then opened the report (its Continue).
  const completedShare = (l: SubFact[]) =>
    ratio(l.filter((s) => s.openedAt && (s.wizardSlide ?? 0) >= 5).length, l.length);
  // Finishers whose report was never opened (so far): they left during the intro.
  const leftShare = (l: SubFact[]) => ratio(l.filter((s) => !s.openedAt).length, l.length);
  const wizardTiles: ReportTile[] = [
    tile(
      "intro",
      "Intro started",
      "count",
      started,
      p?.subs ?? null,
      `${p ? `vs ${n(p.subs)} · ` : ""}everyone who finished the survey`,
      trend(facts, scope, (x) => x.subs)
    ),
    {
      ...tile(
        "completed",
        "Completed",
        "pct",
        completedShare(subs),
        prevComparable ? completedShare(prevSubs) : null,
        `continued through slide 6${withheld}`,
        sparkFull(completedShare)
      ),
      ...noCmpNote,
    },
    skippedTile,
    {
      ...tile(
        "left",
        "Left the wizard / bounced",
        "pct",
        leftShare(subs),
        p ? leftShare(prevSubs) : null,
        "closed during the intro",
        spark(leftShare)
      ),
      goodWhen: "down",
    },
  ];

  const benchRec = recorded(
    subsIn(input.benchmark, { ...scope, source: "all", device: "all", tier: "all", visitor: "all" })
  ).filter((s) => s.day >= EVENTS_COMPLETE_FROM);
  const buckets = timeShares(rec);
  const benchBuckets = timeShares(benchRec);
  const groupTimes = (list: SubFact[], key: (s: SubFact) => string, label: string) =>
    list.filter((s) => key(s) === label).map((s) => s.readMs);
  const group = (key: (s: SubFact) => string) => (label: string) => {
    const mine = groupTimes(rec, key, label);
    const bench = groupTimes(benchRec, key, label);
    return {
      label,
      ms: mean(mine),
      benchMs: mean(bench),
      medianMs: median(mine),
      benchMedianMs: median(bench),
    };
  };
  // Every group, an empty one with no figure: the design draws them all.
  const genders = ["Women", "Men", "Non-binary", "Other", "Prefer not to say", "Not stated"];
  const ages = [...AGE_BANDS, "Not stated"];

  const returnersOf = (l: SubFact[]) => l.filter((s) => s.openedAt && s.visits > 1 && s.returnedAt);
  const gapsOf = (l: SubFact[]) =>
    returnersOf(l).map((s) => berlinDays(s.openedAt!, s.returnedAt!));
  const returners = returnersOf(readers);
  const gaps = gapsOf(readers);
  let cum = 0;
  const days: ReportPayload["returns"]["days"] = DAY_BANDS.map(([label, lo, hi]) => {
    const share = readers.length
      ? gaps.filter((g) => g >= lo && g <= hi).length / readers.length
      : 0;
    cum += share;
    return { label, share, cumulative: cum };
  });
  days.push({
    label: "Not yet",
    share: readers.length ? 1 - returners.length / readers.length : 0,
    cumulative: null,
  });

  let sources: ReportPayload["returns"]["sources"] = null;
  if (input.returns) {
    if (input.returns.ok) {
      const by = new Map(input.returns.value.sources.map((s) => [s.source, s.sessions]));
      const total = RETURN_SOURCES.reduce((a, [s]) => a + (by.get(s) ?? 0), 0);
      sources = {
        ok: true,
        value: RETURN_SOURCES.map(([key, source]) => {
          const sessions = by.get(key) ?? 0;
          return { source, sessions, share: total ? sessions / total : 0 };
        }),
      };
    } else {
      sources = input.returns;
    }
  }
  const viaEmail = emailShare(input.returns);
  // Opens and clicks are of the emails the webhook reported delivered: clicks once it kept any
  // event, opens of those delivered after open tracking was switched on (later than the rest).
  // So a range reaching back before tracking still counts right, out of the emails it saw. A
  // range that ends before either began has nothing of it to count: blank, not 0.
  const opensFrom = extras.email_opens_from;
  const clicksFrom = extras.email_events_from;
  const opensCounted = opensFrom !== null && opensFrom <= f.to;
  const clicksCounted = clicksFrom !== null && clicksFrom <= f.to;
  const campaigns = ["72h_no_unlock", "54h_no_unlock", "30h_no_unlock"].map((stage) => {
    const e = extras.emails.find((x) => x.stage === stage);
    const status = stage === "72h_no_unlock" ? ("Live" as const) : ("Retired" as const);
    // A retired stage that sent and sold nothing in the range has no figures: "—", not 0.
    const idle = status === "Retired" && !e?.sent && !e?.bought;
    // No row: nothing was sent (or bought) for the stage, so nobody came back from it.
    const returned = idle ? null : e ? e.returned : 0;
    const sent = idle ? null : (e?.sent ?? 0);
    const opened = idle || !opensCounted ? null : e ? e.opened : 0;
    const clicked = idle || !clicksCounted ? null : e ? e.clicked : 0;
    return {
      stage,
      status,
      sent,
      opened,
      openRate: ratio(opened, e?.delivered_opens ?? null),
      clicked,
      clickRate: ratio(clicked, e?.delivered ?? null),
      returned,
      returnRate: ratio(returned, sent),
      purchased: idle ? null : (e?.bought ?? 0),
      revenue: e?.revenue ?? 0,
    };
  });

  const votesBy = new Map(extras.chapters.map((c) => [c.section, c]));
  const clicksBy = new Map(extras.paywall_clicks.map((c) => [c.section, c.readers]));
  // Reading per chapter, for the live report's chapters on days it was recorded: all
  // traffic, like the votes, as its rows are summed per chapter in the database.
  const readingFrom = extras.chapter_stats_from;
  const readingRecorded = readingFrom !== null && readingFrom <= f.to;
  const statsBy = new Map(extras.chapter_stats.map((c) => [c.section, c]));
  const chapters = chapterList(extras.chapters.map((c) => c.section)).map((c, i) => {
    const live = readingRecorded && LIVE_CHAPTERS.has(c.id);
    const st = live ? statsBy.get(c.id) : undefined;
    const reached = Number(st?.reached) || 0;
    // A share of the chapter's readers; blank where nobody used it (or it has no such control).
    const used = (n: number | undefined) => (Number(n) > 0 ? ratio(Number(n), reached) : null);
    const seen = Number(st?.pw_seen) || 0;
    const clicked = Number(st?.pw_click) || 0;
    return {
      n: i + 1,
      ...c,
      up: votesBy.get(c.id)?.up ?? 0,
      down: votesBy.get(c.id)?.down ?? 0,
      paywallReaders: clicksBy.get(c.id) ?? 0,
      reach: live ? ratio(reached, extras.chapter_readers) : null,
      avgMs: st && st.ms_avg !== null ? Number(st.ms_avg) : null,
      showMore: used(st?.show_all),
      learnMore: used(st?.learn_more),
      exercise: used(st?.try_this),
      paywall: ratio(clicked, seen),
      paywallSeen: seen,
      paywallClicked: clicked,
    };
  });
  const names = new Map(chapters.map((c) => [c.id, c.name]));

  // How far each reader got: the deepest live chapter they reached, as its place among the
  // report's chapters, and their total reading time. Readers come as submissions, so the
  // filters apply; one whose time was not recorded has a group of their own.
  const order = chapterList([])
    .filter((c) => LIVE_CHAPTERS.has(c.id))
    .map((c) => c.id);
  const place = new Map(order.map((id, i) => [id, i + 1]));
  const inScope = new Map(subs.map((x) => [x.id, x]));
  const depthBands = DEPTH_BANDS.map(([label]) => ({ label, counts: TIME_GROUPS.map(() => 0) }));
  let depthReaders = 0;
  for (const d of readingRecorded ? extras.chapter_depth : []) {
    const reader = inScope.get(d.sid);
    const deepest = Math.max(0, ...d.chapters.map((id) => place.get(id) ?? 0));
    if (!reader || !deepest) continue;
    const share = (deepest / order.length) * 100;
    const band = DEPTH_BANDS.findIndex(([, lo, hi]) => share >= lo && share < hi);
    const minutes = reader.readMs / MINUTE;
    const g = reader.closed === 0 ? 4 : minutes < 1 ? 0 : minutes < 5 ? 1 : minutes < 10 ? 2 : 3;
    depthBands[band]!.counts[g]! += 1;
    depthReaders += 1;
  }

  // The boxes under Time and Returns, each against the period before at the same age.
  const prevReaders = prevSubs.filter((s) => s.openedAt);
  const prevRec = recorded(prevSubs);
  const perSession = (l: SubFact[]) =>
    ratio(
      l.reduce((a, s) => a + s.readMs, 0),
      l.reduce((a, s) => a + s.closed, 0)
    );
  const visitsPer = (l: SubFact[]) =>
    ratio(
      l.reduce((a, s) => a + s.visits, 0),
      l.length
    );
  const box = (
    key: string,
    label: string,
    unit: Unit,
    value: number | null,
    prev: number | null,
    comparable: boolean,
    goodWhen: GoodWhen = "up",
    digits?: number
  ): ChangeBox => ({
    key,
    label,
    unit,
    value,
    prev: previous && comparable ? prev : null,
    goodWhen,
    ...(digits !== undefined ? { digits } : {}),
    ...(previous && !comparable && noCmp ? { note: noCmp } : {}),
  });
  const timeBoxes: ChangeBox[] = [
    box(
      "avg",
      "Avg. total time",
      "mmss",
      mean(rec.map((s) => s.readMs)),
      mean(prevRec.map((s) => s.readMs)),
      prevComparable
    ),
    box(
      "median",
      "Median total time",
      "mmss",
      median(rec.map((s) => s.readMs)),
      median(prevRec.map((s) => s.readMs)),
      prevComparable
    ),
    box(
      "session",
      "Avg. per session",
      "mmss",
      perSession(rec),
      perSession(prevRec),
      prevComparable
    ),
    // Opens were recorded for everyone all along: compared whenever there is a period before.
    box("readers", "Readers", "count", readers.length, prevReaders.length, true),
  ];
  const returnBoxes: ChangeBox[] = [
    box(
      "back",
      "Came back",
      "pct",
      returnedShare(subs),
      returnedShare(prevSubs),
      prevComparable,
      "up",
      0
    ),
    box(
      "days",
      "Median days to return",
      "days",
      median(gaps),
      median(gapsOf(prevReaders)),
      prevComparable,
      "down"
    ),
    {
      ...box(
        "email",
        "Returned via email",
        "pct",
        viaEmail,
        emailShare(input.previousReturns ?? null),
        true,
        "up",
        0
      ),
      // PostHog's own reading of the period before; blank when it was not read.
    },
    box(
      "visits",
      "Visits per reader",
      "ratio",
      visitsPer(readers),
      visitsPer(prevReaders),
      prevComparable
    ),
  ];

  return {
    ...head(f, today, now),
    launched: launched(scope),
    tiles,
    // Whole percentages, as drawn; a share under 1% keeps a tenth so a handful never reads 0%.
    wizard: {
      tiles: wizardTiles.map((t) => ({
        ...t,
        digits: t.value !== null && t.value > 0 && t.value < 0.01 ? 1 : 0,
      })),
      slides,
      skipsFrom,
    },
    time: {
      readers: readers.length,
      recorded: rec.length,
      avgMs: mean(rec.map((s) => s.readMs)),
      benchAvgMs: mean(benchRec.map((s) => s.readMs)),
      medianMs: median(rec.map((s) => s.readMs)),
      perSessionMs: ratio(
        rec.reduce((a, s) => a + s.readMs, 0),
        rec.reduce((a, s) => a + s.closed, 0)
      ),
      buckets: TIME_BUCKETS.map(([label], i) => ({
        label,
        share: buckets[i]!,
        bench: benchBuckets[i]!,
      })),
      boxes: timeBoxes,
      byGender: genders.map(group((s) => genderLabel(s.gender))),
      byAge: ages.map(group((s) => ageBand(s.age))),
      depth: {
        from: readingFrom,
        readers: depthReaders,
        chapters: order.length,
        groups: [...TIME_GROUPS],
        bands: depthBands,
      },
    },
    returns: {
      cameBack: returnedShare(subs),
      medianDays: median(gaps),
      sessionsPerReader: ratio(
        readers.reduce((a, s) => a + s.visits, 0),
        readers.length
      ),
      viaEmail,
      boxes: returnBoxes,
      days,
      sources,
      campaigns,
      emailEvents: emailEventsNote(opensFrom, clicksFrom),
    },
    chapters,
    chapterReading: {
      from: readingFrom,
      readers: extras.chapter_readers,
      recorded: readingRecorded,
    },
    feedback: {
      good: extras.chapters.reduce((a, c) => a + c.up, 0),
      bad: extras.chapters.reduce((a, c) => a + c.down, 0),
      total: extras.votes_total,
      issues: Object.entries(ISSUES).map(([id, label]) => ({
        label,
        n: extras.issues.find((x) => x.issue === id)?.n ?? 0,
      })),
      log: extras.feedback.map((r) => ({
        at: r.at,
        submission: r.submission,
        chapter: names.get(r.section) ?? prettyId(r.section),
        vote: r.vote === "up" ? ("Good" as const) : ("Bad" as const),
        issue: r.issue ? (ISSUES[r.issue] ?? r.issue) : null,
        commented: r.commented,
      })),
    },
  };
}

/**
 * The note under the campaigns: what opens and clicks are out of, and since when. Clicks count
 * from the first event of any kind, so they never start after opens.
 */
function emailEventsNote(opens: string | null, clicks: string | null): string {
  const day = (d: string) => `${shortDate(d)} ${d.slice(0, 4)}`;
  if (!clicks) return "Opens and clicks are not recorded yet.";
  if (!opens) {
    return `Clicks are of the emails delivered since ${day(clicks)}, when recording began; opens are not recorded yet.`;
  }
  return opens === clicks
    ? `Opens and clicks are of the emails delivered since ${day(clicks)}, when recording began.`
    : `Clicks are of the emails delivered since ${day(clicks)}, and opens of those delivered since ${day(opens)}, when open tracking began.`;
}

function pct(v: number | null): string {
  return v === null ? "—" : `${(v * 100).toFixed(v * 100 >= 10 ? 1 : 2)}%`;
}
