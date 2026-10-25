/**
 * The Report page (Marcus's "Assessment A · Report" artboard): how people get into their
 * report, how long they read, when they come back and what brings them, every chapter's
 * votes, and the feedback log.
 */
import { tourSteps, type TourAudience, type TourStepId } from "@features/report/logic/guidedTour";
import { TOUR_COPY } from "@features/report/ui/v3/guidedTourContent";
import { WIZARD_DRAWER } from "@features/survey/ui/wizard/wizardContent";
import { RETIRED_NAMES } from "@features/admin/ui/ap/retired-chapters";
import { POSTGREST_MAX_ROWS, supabaseFetch } from "@features/admin/server/supabase";

import { assessmentScope } from "./assessment";
import { shortDate } from "./days";
import { PRE_ON_SALE_FROM, PRE_PLANS, preBuysOf, type Facts, type SubFact } from "./facts";
import {
  activeNarrowing,
  bucketCaption,
  rangeLabel,
  trendBuckets,
  type ApFilters,
} from "./filters";
import { fmt, type GoodWhen, type Unit } from "./format";
import {
  EVENTS_COMPLETE_FROM,
  launched,
  mean,
  median,
  peopleBlocked,
  ratio,
  subsIn,
  totals,
  trend,
  type Totals,
  ageMatched,
  sameAge,
} from "./metrics";
import { freePreBlocked, head, readFoot, type PageHead, type Tile } from "./common";
import { POSTHOG_FROM, type PostHogResult, type ReportReturns } from "./posthog";
import { AGE_BANDS, ageBand, genderLabel } from "./survey-page";
import { teamUserIds } from "./team";
import { isPhoneRun } from "./unlock-feedback";
import { REPORT_TOKEN } from "@features/admin/server/team-export";

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
   * `chapter_stats_from`: readers who reached each chapter, their mean and median time in it,
   * and how many of them used each control. `pw_click` counts only readers who also saw a
   * paywall. `ms_median` is missing from a function older than 21 Oct 2026: blank.
   */
  chapter_stats: Array<{
    section: string;
    reached: number;
    ms_avg: number | null;
    ms_median?: number | null;
    opened: number;
    show_all: number;
    learn_more: number;
    try_this: number;
    pw_seen: number;
    pw_click: number;
  }>;
  /** Those readers who reached any chapter: Reach's denominator. */
  chapter_readers: number;
  /**
   * Of them, those who read before the slimmed report went live (22 Oct 2026): the reach base of
   * the chapters it left out. Absent from an older reader.
   */
  chapter_readers_before_slim?: number;
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
    /** Its send times are estimated from the report's time (no promo code dated them). */
    estimated?: boolean;
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
    ...(raw.chapter_readers_before_slim === undefined
      ? {}
      : { chapter_readers_before_slim: Number(raw.chapter_readers_before_slim) || 0 }),
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
      estimated: e.estimated === true,
    })),
    email_events_from: typeof raw.email_events_from === "string" ? raw.email_events_from : null,
    email_opens_from: typeof raw.email_opens_from === "string" ? raw.email_opens_from : null,
  };
}

/**
 * The guided tour's first runs (ap_report_tour) of the range's finishers, whenever they ran,
 * each said to be a free or a paid reader's: a free reader's tour has the unlock stop.
 */
export interface ReportTour {
  /** Per finisher's day and audience; unended: runs with no end stored. */
  days: Array<{
    day: string;
    audience: TourAudience;
    readers: number;
    runs: number;
    completed: number;
    skipped: number;
    left: number;
    unended: number;
  }>;
  /**
   * Per audience and stop, over the runs whose end carries its stops: reached, went on (Next
   * or Finish), went back at least once, skipped, left the page; each run's end is placed on
   * the furthest stop it reached, so next + skip + exit = reached.
   */
  stops: Array<{
    audience: TourAudience;
    id: TourStepId;
    reached: number;
    next: number;
    back: number;
    skip: number;
    exit: number;
    median_ms: number | null;
    timed: number;
  }>;
  /** Per audience, the runs whose end carries its stops: what the stops are out of. */
  placed: Array<{ audience: TourAudience; runs: number }>;
}

const AUDIENCES: readonly TourAudience[] = ["free", "paid"];
const isAudience = (v: unknown): v is TourAudience => v === "free" || v === "paid";

export async function fetchReportTour(from: string, to: string): Promise<ReportTour> {
  const res = await supabaseFetch("/rest/v1/rpc/ap_report_tour", {
    method: "POST",
    body: JSON.stringify({ p_from: from, p_to: to }),
    timeoutMs: 30_000,
  });
  if (!res.ok) throw new Error(`ap_report_tour failed (${res.status})`);
  const raw = (await res.json()) as Partial<ReportTour> | null;
  if (!raw || !Array.isArray(raw.days) || !Array.isArray(raw.stops) || !Array.isArray(raw.placed)) {
    throw new Error("ap_report_tour: unexpected shape");
  }
  const num = (v: unknown) => Number(v) || 0;
  return {
    days: raw.days
      .filter((d) => isAudience(d.audience))
      .map((d) => ({
        day: String(d.day),
        audience: d.audience,
        readers: num(d.readers),
        runs: num(d.runs),
        completed: num(d.completed),
        skipped: num(d.skipped),
        left: num(d.left),
        unended: num(d.unended),
      })),
    stops: raw.stops
      .filter((s) => isAudience(s.audience))
      .map((s) => ({
        audience: s.audience,
        id: s.id,
        reached: num(s.reached),
        next: num(s.next),
        back: num(s.back),
        skip: num(s.skip),
        exit: num(s.exit),
        median_ms: s.median_ms === null || s.median_ms === undefined ? null : num(s.median_ms),
        timed: num(s.timed),
      })),
    placed: raw.placed
      .filter((p) => isAudience(p.audience))
      .map((p) => ({ audience: p.audience, runs: num(p.runs) })),
  };
}

/**
 * The guided tour's first day on production with every first run's start and end stored, with
 * whose tour it was and its stops: the first whole day after its release on the evening of
 * 22 Oct (#631), whose earlier readers met no tour. A range starting earlier shows no tour
 * figures, and a period starting earlier is not compared.
 */
export const TOUR_TRACKING_FROM = "2026-10-23";

/** What each stop's spotlight frames, as the reader sees it (ui/v3/guidedTourAnchors.ts). */
const TOUR_TARGETS: Record<TourStepId, string> = {
  chapter_menu: "Chapter menu: the pill at the top, the sidebar from 1280px",
  show_all: "Show all · Typical Beliefs' first fold",
  chapter_toggle: "Chapter arrow · Typical Beliefs",
  try_this: "Try This & See What Shifts · Typical Beliefs",
  unlock: "Unlock Report · the first locked chapter",
};

/**
 * Whole percentages of `counts` that add up to 100, as shares (0.34): each rounded down, then
 * the points still missing go to the largest remainders. A count that is not nothing keeps at
 * least 1%, taken back from the largest share, so a skip is never shown as none. Null for none.
 */
export function wholeShares(counts: number[]): number[] | null {
  const total = counts.reduce((a, c) => a + c, 0);
  if (total <= 0) return null;
  const parts = counts.map((c) => {
    const exact = (c * 100) / total;
    return { exact, whole: c > 0 ? Math.max(1, Math.floor(exact)) : 0 };
  });
  for (let missing = 100 - parts.reduce((a, p) => a + p.whole, 0); missing !== 0;) {
    const step = Math.sign(missing);
    // Up: the largest remainder, the first of equals. Down: the largest share.
    const by = (p: (typeof parts)[number]) => (step > 0 ? p.exact - p.whole : p.whole);
    const pick = parts.reduce((best, p) => (by(p) > by(best) ? p : best));
    pick.whole += step;
    missing -= step;
  }
  return parts.map((p) => p.whole / 100);
}

/** A chapter vote (report_section_feedback), its comment already masked. */
export interface Vote {
  at: string;
  submission: number | null;
  /** The reader's account (app_user.id), the log's "User ID". */
  user: number | null;
  section: string;
  vote: "up" | "down";
  issue: string | null;
  comment: string | null;
}

/**
 * A reader's comment as the page may show it: email addresses, a report's link (its access
 * token: anyone with it could open that reader's report) and phone numbers masked, as the
 * unlock feedback's written answers are; a date or a price is no phone number (isPhoneRun).
 */
export function maskContacts(text: string): string {
  return text
    .replace(/[^\s@()<>"',;]+@[^\s@()<>"',;]+\.[^\s@()<>"',;]+/g, "[email]")
    .replace(REPORT_TOKEN, "[report link]")
    .replace(/\+?\d[\d\s()./-]{5,}\d/g, (m) => (isPhoneRun(m) ? "[phone]" : m));
}

/**
 * Every chapter vote since voting began, whatever the range: the design's "live, all time"
 * (Marcus, 12 Oct 2026: the relative quantity of feedback given). The team's own are left out
 * as ap_report_extras leaves them out (a vote on a team account's survey), and each comment is
 * masked before it leaves the server. Read whole, a page at a time.
 */
export async function fetchVotes(): Promise<Vote[]> {
  const staff = await teamUserIds();
  type Row = {
    created_at: string;
    survey_submission_id: number | null;
    section_id: string;
    feedback: string;
    issue: string | null;
    comment: string | null;
    survey_submission: { user_id: number | null } | null;
  };
  const rows: Row[] = [];
  for (let offset = 0; ; offset += POSTGREST_MAX_ROWS) {
    const res = await supabaseFetch(
      `/rest/v1/report_section_feedback?${new URLSearchParams({
        select:
          "created_at,survey_submission_id,section_id,feedback,issue,comment,survey_submission(user_id)",
        order: "created_at.desc,id.desc",
        limit: String(POSTGREST_MAX_ROWS),
        offset: String(offset),
      })}`,
      { paginated: true }
    );
    if (!res.ok) throw new Error(`report_section_feedback failed (${res.status})`);
    const page = (await res.json()) as Row[];
    rows.push(...page);
    if (page.length < POSTGREST_MAX_ROWS) break;
  }
  return rows
    .filter((r) => {
      const uid = r.survey_submission?.user_id;
      return uid === null || uid === undefined || !staff.has(Number(uid));
    })
    .map((r) => ({
      at: r.created_at,
      submission: r.survey_submission_id === null ? null : Number(r.survey_submission_id),
      user:
        r.survey_submission?.user_id === null || r.survey_submission?.user_id === undefined
          ? null
          : Number(r.survey_submission.user_id),
      section: r.section_id,
      vote: r.feedback === "up" ? ("up" as const) : ("down" as const),
      // An issue is one of the report's own keys; anything else is a reader's words, masked.
      issue: r.issue && !(r.issue in ISSUES) ? maskContacts(r.issue) : r.issue,
      comment: r.comment?.trim() ? maskContacts(r.comment.trim()) : null,
    }));
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
 * The ways back to a report PostHog tells apart (posthog.ts), in the design's order, each with
 * the design's name for it. An email without a campaign is the report-ready email every
 * finisher gets, or an invite reminder: not a campaign.
 */
const RETURN_SOURCES: Array<[posthog: string, label: string]> = [
  ["Bookmark or direct", "Bookmark / direct"],
  ["Email campaign link", "Email campaign"],
  ["Email link", "Report or invite email"],
  ["Share link from a friend", "Share link from a friend"],
  ["Another tagged link", "Other"],
];
/** The classes that came through an email, campaign or not. */
const EMAIL_RETURNS: ReadonlySet<string> = new Set(["Email campaign link", "Email link"]);

/**
 * Every nurture email stage that has been sent, live first, with what it was and when it went
 * out (read off the quotes' send marks). Until Pricing 2.0 (3 Aug 2026) a ladder ran: 6 h if
 * the report wasn't opened, then 30 h and 54 h with codes, and in early June a 78 h call
 * invite. Since then one 72 h email.
 */
const STAGES: Array<{ stage: string; status: "Live" | "Retired"; what: string }> = [
  {
    stage: "72h_no_unlock",
    status: "Live",
    what: "Sent 72 h after the report if not unlocked, with a 50% code · since 3 Aug 2026",
  },
  {
    stage: "54h_no_unlock",
    status: "Retired",
    what: "54 h, a 75% code · 16 May – 3 Aug 2026, retired with Pricing 2.0",
  },
  {
    stage: "30h_no_unlock",
    status: "Retired",
    what: "30 h, a 50% code · 16 May – 3 Aug 2026, retired with Pricing 2.0",
  },
  {
    stage: "6h_no_view",
    status: "Retired",
    what: "6 h, if the report wasn't opened · 16 May – 3 Aug 2026, retired with Pricing 2.0",
  },
  {
    stage: "78h_no_unlock",
    status: "Retired",
    what: "78 h, an invite to a 20-minute call · 2–15 Jun 2026, paused since",
  },
];
/** The chapter-nudge emails' last day: switched off with Pricing 2.0 (system flag). */
const CHAPTER_NUDGES_UNTIL = "2026-08-03";

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
/**
 * Chapters the live report rates outside its nav, so with no per-chapter reading: Report V4's
 * Summary, which takes the place of 2.0's "What this means for you" and posts its votes
 * under `summary`.
 */
const RATED_ONLY: Array<{ id: string; name: string; part: string }> = [
  { id: "summary", name: "Summary of your archetype", part: "Report V4 · Summary" },
];

/**
 * The live report's chapters in its own order (its nav), the ones it rates outside the nav,
 * then any older chapter id voted on.
 */
export function chapterList(seen: string[]): Array<{ id: string; name: string; part: string }> {
  const live = WIZARD_DRAWER.flatMap((p) =>
    p.rows.map((r) => ({ id: r.id, name: r.label, part: `${p.part} · ${p.label}` }))
  );
  const rated = new Set(RATED_ONLY.map((c) => c.id));
  const older = [...new Set(seen)]
    .filter((id) => !LIVE_CHAPTERS.has(id) && !rated.has(id))
    .sort()
    .map((id) => ({
      id,
      name: Object.hasOwn(RETIRED_NAMES, id) ? RETIRED_NAMES[id]! : prettyId(id),
      part: "Earlier report versions",
    }));
  return [...live, ...RATED_ONLY, ...older];
}

export function prettyId(id: string): string {
  const s = id.replace(/_amp_/g, " & ").replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * What a ratio or an average is worked out of, for its info card ("94 ÷ 419"): the readers (or
 * the milliseconds read) over the readers it is a share of.
 */
export interface Parts {
  num: number;
  den: number;
}

/** A headline tile, with the design's decimals for its value (`digits`). */
export type ReportTile = Tile & { digits?: number; parts?: Parts };

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
 * Whole percentages, as the wizard's and the tour's tiles are drawn; a share under 1% keeps a
 * tenth, so a handful never reads 0%.
 */
const wholeDigits = (v: number | null) => (v !== null && v > 0 && v < 0.01 ? 1 : 0);

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
  parts?: Parts;
}

/** A stop of the guided tour, as a reader of its audience gets it, and how its runs went there. */
export interface TourStopRow {
  n: number;
  id: TourStepId;
  /** The bubble's title and text, and what its spotlight frames. */
  name: string;
  purpose: string;
  target: string;
  /** Runs that came to the stop, of the runs whose end carries its stops (TourView.placed). */
  reached: number;
  reachedShare: number | null;
  medianMs: number | null;
  /** Whole-percent shares of the stop's runs, adding up to 1 (wholeShares); null with none. */
  next: number | null;
  skip: number | null;
  exit: number | null;
  /** Went back from it at least once, of its runs; null on the first stop, which has no Back. */
  back: number | null;
}

/** The guided tour for one audience: free readers get the unlock stop, paid readers do not. */
export interface TourView {
  key: TourAudience;
  /** "Free readers · 5 stops". */
  label: string;
  /** Tour started, Completed, Skipped tour, Left the tour / bounced. */
  tiles: ReportTile[];
  stops: TourStopRow[];
  /** The runs the table is of: their end was stored with their stops. */
  placed: number;
  /** Runs with no end stored: counted in Left the tour / bounced, on no stop. */
  unended: number;
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
  /**
   * Why the sections about readers (slides, time in report, returns but its ways back and the
   * campaigns, which are all traffic) are blank under these filters (peopleBlocked), or null.
   */
  blocked: string | null;
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
       * Of the slide's readers, those who stopped on it having pressed Skip Intro (on it, or
       * on a slide they went back to); null while Skip Intro was not recorded in the range.
       * Continue, Skip intro and Exit share the slide's readers out between them.
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
  /** The guided tour's first runs, all traffic (ap_report_tour), free readers then paid. */
  tour: {
    /** The day it is recorded from, as the page writes it ("20 Oct 2026"). */
    from: string;
    /** The range starts before `from`: the section is blank and says from when. */
    before: boolean;
    /** The range's readers who opened their report: what Tour started is a share of. */
    openers: number;
    audiences: TourView[];
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
      /** What the email was, and when it ran. */
      what: string;
      /** Its send times are estimated (report time + the stage's delay): no code dated them. */
      estimated: boolean;
      /** Reported delivered: what Clicked is a share of, and what Opened is (since opens). */
      delivered: number | null;
      deliveredOpens: number | null;
      /**
       * Sent and purchased are counts, 0 included, as drawn; a retired stage that sent and sold
       * nothing in the range has no other figure.
       */
      sent: number;
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
      purchased: number;
      revenue: number;
    }>;
    /** Since when opens and clicks are counted, for the note under the campaigns. */
    emailEvents: string;
    /** What the table can't list for this range (the chapter nudges), or null. */
    campaignNote: string | null;
  };
  /** What the wizard's slides can't see for this range, or null. */
  wizardNote: string | null;
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
    /** The median reader's time in it (what the page shows), and the mean (the CSV keeps it). */
    medianMs: number | null;
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
  /** Every chapter vote since voting began (all time, all traffic), whatever the filters. */
  feedback: {
    /** Why the votes are missing (they could not be read), or null. */
    error: string | null;
    /** The first vote's Berlin day; null before any. */
    from: string | null;
    good: number;
    bad: number;
    total: number;
    issues: Array<{ label: string; n: number }>;
    log: Array<{
      at: string;
      submission: number | null;
      user: number | null;
      /** The chapter's name, and its id (the search finds either). */
      chapter: string;
      id: string;
      vote: "Good" | "Bad";
      issue: string | null;
      /** The reader's comment, email addresses and phone numbers masked; null without one. */
      comment: string | null;
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

/** Of PostHog's return visits, those that came through any email link; null unread or none. */
function emailParts(r: PostHogResult<ReportReturns> | null): Parts | null {
  if (!r || !r.ok) return null;
  const by = new Map(r.value.sources.map((s) => [s.source, s.sessions]));
  const den = RETURN_SOURCES.reduce((a, [s]) => a + (by.get(s) ?? 0), 0);
  const num = [...EMAIL_RETURNS].reduce((a, s) => a + (by.get(s) ?? 0), 0);
  return den ? { num, den } : null;
}

function emailShare(r: PostHogResult<ReportReturns> | null): number | null {
  const p = emailParts(r);
  return p ? p.num / p.den : null;
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
  /**
   * The guided tour (ap_report_tour), read for a range from TOUR_TRACKING_FROM; null when it
   * was not read, or could not be. The period before's, for the tiles' changes.
   */
  tour?: ReportTour | null;
  previousTour?: ReportTour | null;
  /**
   * Every chapter vote, all time (fetchVotes): the chapters' feedback and the Feedback section.
   * Null when they could not be read; left out, none.
   */
  votes?: Vote[] | null;
  /** The report's EUR 1.99 gate now, read under "Free survey" only; null when it couldn't be. */
  gateOn?: boolean | null;
  filters: ApFilters;
  today: string;
  now: Date;
}): ReportPayload {
  const { facts, extras, filters: f, today, now } = input;
  const scope = assessmentScope(f);
  // A filter the records can't follow over this range: every tile is blank with the reason,
  // and an earlier period it can't follow either is not compared.
  const tablet = peopleBlocked(scope, facts.from);
  const previous =
    input.previous && !peopleBlocked(scope, input.previous.from) ? input.previous : null;
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
  // As the full unlock's: openers who pre-unlocked (paid EUR 1.99 for the Core Archetype) so far.
  const preRate = (list: SubFact[]) =>
    per((l) => l.filter((s) => s.openedAt && preBuysOf(s).length > 0).length, list);
  const preWhy =
    f.funnel === "free"
      ? freePreBlocked(
          input.gateOn,
          subs.some((s) => preBuysOf(s).length > 0)
        )
      : null;
  const spark = (pick: (x: SubFact[]) => number | null) =>
    trend(facts, scope, (_x, from, to) => pick(subsIn(facts, scope, from, to)));
  // Paywall clicks, share-method invites and the wizard's slides were recorded only with
  // cookie consent before 18 Sep 2026: their lines start there.
  const sparkFull = (pick: (x: SubFact[]) => number | null) =>
    trend(facts, scope, (_x, from, to) =>
      from >= EVENTS_COMPLETE_FROM ? pick(subsIn(facts, scope, from, to)) : null
    );
  const n = (v: number) => v.toLocaleString("en-US");
  // The wizard's back presses and skips are read for every reader, pay to start's too.
  const narrowed = activeNarrowing(f).length > 0 || f.funnel === "free";

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
        // Reading times were recorded only with cookie consent before 18 Sep 2026: a week of two
        // timed readers would dwarf the rest, so the line starts there.
        sparkFull((l) => readMean(l))
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
        sparkFull((l) => readMedian(l))
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
    // The Initial plan (EUR 1.99, the Core Archetype: on sale from PRE_ON_SALE_FROM through pay
    // to start). Over days before it, nobody could: no figure, and the tile says so. "Free
    // survey" sells it only through the report's gate: with that off and none sold, the same.
    PRE_PLANS.size && facts.from >= PRE_ON_SALE_FROM && !preWhy
      ? tile(
          "pre",
          "Pre unlock rate",
          "pct",
          preRate(subs),
          previous && previous.from >= PRE_ON_SALE_FROM ? preRate(prevSubs) : null,
          "Core Archetype (€1.99) purchases ÷ report openers",
          spark(preRate)
        )
      : {
          ...tile("pre", "Pre unlock rate", "pct", null, null, "", []),
          note: !PRE_PLANS.size
            ? "Initial plan not on sale yet"
            : facts.from < PRE_ON_SALE_FROM
              ? `Counted from ${rangeLabel(PRE_ON_SALE_FROM, PRE_ON_SALE_FROM)}`
              : (preWhy ?? ""),
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
  // What each rate and average is worked out of, for its info card.
  const readSum = rec.reduce((a, s) => a + s.readMs, 0);
  const openers = (pick: (s: SubFact) => unknown): Parts => ({
    num: readers.filter(pick).length,
    den: readers.length,
  });
  const tileParts: Record<string, Parts> = {
    read: { num: readSum, den: rec.length },
    returned: openers((s) => s.returnedAt),
    initiated: openers((s) => s.clickedAt),
    share: openers((s) => s.shared),
    rating: openers((s) => s.votes > 0),
    invite: openers((s) => s.invited),
    full: openers((s) => s.paidAt && s.full),
  };

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
  // Skip Intro, recorded from `skipsFrom`. Its pressers come as submissions too, so it follows
  // the filters; before `skipsFrom` nobody's skip is known, so a skip then reads as an exit.
  const skipsFrom = extras.wizard_skips_from;
  const skipsCounted = skipsFrom !== null && skipsFrom <= f.to;
  const skippedOn = new Map(extras.wizard_skips.map((k) => [k.slide, new Set(k.sids)]));
  const skippers = new Set(extras.wizard_skips.flatMap((k) => k.sids));
  const slides = SLIDES.map((s, i) => {
    const w = extras.wizard.find((x) => x.slide === i);
    const reached = reach[i]!;
    const wentOn = i < 5 ? reach[i + 1]! : openedAfter;
    const back = w?.went_back ?? 0;
    const readersHere = subs.filter((x) => i === 0 || (x.wizardSlide ?? 0) >= i);
    // Each of the slide's readers went on, skipped or left, by where they stopped: one who
    // stopped here having pressed Skip Intro (here, or on a slide they went back to) skipped,
    // the rest who stopped here left. So Continue, Skip intro and Exit add up to its readers.
    const skipped = readersHere.filter(
      (x) => skippers.has(x.id) && !(i < 5 ? (x.wizardSlide ?? 0) > i : x.openedAt)
    ).length;
    return {
      n: i + 1,
      name: s.name,
      purpose: s.purpose,
      reached,
      reachedShare: ratio(reached, started),
      cont: ratio(wentOn, reached),
      skip: skipsCounted ? ratio(skipped, reached) : null,
      back,
      // Slide 1 has no Back button: nothing to share out.
      backShare: narrowed || i === 0 ? null : ratio(back, reached),
      exit: ratio(reached - wentOn - skipped, reached),
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
          // PostHog has nothing before it starts: blank, never a count of none.
          f.from < POSTHOG_FROM
            ? `From PostHog, which starts on ${rangeLabel(POSTHOG_FROM, POSTHOG_FROM)}: pick a range from that day on.`
            : input.returns && !input.returns.ok
              ? input.returns.error
              : null
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
  const wizardParts: Record<string, Parts> = {
    completed: { num: openedAfter, den: started },
    left: { num: subs.filter((s) => !s.openedAt).length, den: started },
    ...(ownSkips
      ? { skipped: { num: subs.filter((x) => skippers.has(x.id)).length, den: started } }
      : {}),
  };

  // The guided tour, from our own records of every reader's first run, so all traffic: they
  // carry no source, device or tier. Shown for a range from TOUR_TRACKING_FROM, and compared
  // with a period that starts there too. Tour started is a share of the range's readers who
  // opened their report (Reports opened, all traffic): the tour runs as the report first opens,
  // and the runs counted are those same finishers', whenever they ran.
  const tourFrom = rangeLabel(TOUR_TRACKING_FROM, TOUR_TRACKING_FROM);
  const tourOn = launched(scope) && f.from >= TOUR_TRACKING_FROM;
  const tour = tourOn ? (input.tour ?? null) : null;
  const tourWhy = !launched(scope)
    ? "Not launched."
    : !tourOn
      ? `Recorded from ${tourFrom}: pick a range from that day on.`
      : tour
        ? null
        : "The guided tour could not be read just now. Try again in a minute.";
  const prevTour = previous && previous.from >= TOUR_TRACKING_FROM ? input.previousTour : null;
  const tourNoCmp =
    previous && previous.from < TOUR_TRACKING_FROM
      ? { note: `No comparison before ${tourFrom}` }
      : {};
  // The tour's records carry no funnel, source, device, tier or visitor: its readers are over
  // every reader who opened their report, whatever the filters.
  const tourOpeners = subsIn(facts, {
    ...scope,
    source: "all",
    device: "all",
    tier: "all",
    visitor: "all",
    funnel: "all",
  }).filter((s) => s.openedAt).length;
  /** An audience's runs over the range, or over one trend point's days. */
  const tourSums = (
    t: ReportTour | null | undefined,
    key: TourAudience,
    within?: { from: string; to: string }
  ) =>
    (t?.days ?? [])
      .filter(
        (d) => d.audience === key && (!within || (d.day >= within.from && d.day <= within.to))
      )
      .reduce(
        (a, d) => ({
          readers: a.readers + d.readers,
          runs: a.runs + d.runs,
          completed: a.completed + d.completed,
          skipped: a.skipped + d.skipped,
          // A run with no end stored left too, at no stop.
          left: a.left + d.left + d.unended,
          unended: a.unended + d.unended,
        }),
        { readers: 0, runs: 0, completed: 0, skipped: 0, left: 0, unended: 0 }
      );
  type TourSums = ReturnType<typeof tourSums>;
  const tourPoints = trendBuckets(facts.from, facts.to);
  const tourView = (key: TourAudience): TourView => {
    const ids = tourSteps({ includeUnlock: key === "free" });
    const cur = tourSums(tour, key);
    const was = prevTour ? tourSums(prevTour, key) : null;
    const tourTile = (
      tileKey: string,
      label: string,
      unit: Tile["unit"],
      pick: (x: TourSums) => number | null,
      goodWhen: GoodWhen
    ): ReportTile => ({
      ...tile(
        tileKey,
        label,
        unit,
        pick(cur),
        was ? pick(was) : null,
        "",
        tour ? tourPoints.map((b) => pick(tourSums(tour, key, b))) : [],
        tourWhy
      ),
      goodWhen,
      ...tourNoCmp,
    });
    const started = tourTile("tour-started", "Tour started", "count", (x) => x.readers, "up");
    const placed = tour?.placed.find((p) => p.audience === key)?.runs ?? 0;
    return {
      key,
      label: `${key === "free" ? "Free" : "Paid"} readers · ${ids.length} stops`,
      tiles: [
        tour && tourOpeners > 0
          ? {
              ...started,
              // Over every reader who opened their report: a run's audience is known, an
              // opener's isn't, so this tab's share is of all of them, free and paid together.
              share: `${fmt("pct", cur.readers / tourOpeners, 0)} of all ${n(tourOpeners)} ${
                tourOpeners === 1 ? "reader" : "readers"
              } who opened their report, free and paid together`,
            }
          : started,
        tourTile("tour-completed", "Completed", "pct", (x) => ratio(x.completed, x.runs), "up"),
        tourTile("tour-skipped", "Skipped tour", "pct", (x) => ratio(x.skipped, x.runs), "down"),
        tourTile(
          "tour-left",
          "Left the tour / bounced",
          "pct",
          (x) => ratio(x.left, x.runs),
          "down"
        ),
      ].map((t) => ({ ...t, digits: wholeDigits(t.value) })),
      stops: ids.map((id, i) => {
        const s = tour?.stops.find((x) => x.audience === key && x.id === id);
        const reached = s?.reached ?? 0;
        const [next = null, skip = null, exit = null] =
          wholeShares([s?.next ?? 0, s?.skip ?? 0, s?.exit ?? 0]) ?? [];
        return {
          n: i + 1,
          id,
          name: TOUR_COPY[id].title,
          purpose: TOUR_COPY[id].body,
          target: TOUR_TARGETS[id],
          reached,
          reachedShare: tour ? ratio(reached, placed) : null,
          medianMs: s && s.timed > 0 ? s.median_ms : null,
          next,
          skip,
          exit,
          back: i === 0 ? null : ratio(s?.back ?? 0, reached),
        };
      }),
      placed,
      unended: cur.unended,
    };
  };

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
  // Every group, an empty one with no figure: the design draws them all. Those who'd rather not
  // label it are "Not stated" with those who gave no answer, as the design groups them, and
  // "Other" is drawn when a reader of the range answered it.
  const genderOf = (s: SubFact) => {
    const g = genderLabel(s.gender);
    return g === "Rather not label" ? "Not stated" : g;
  };
  const genders = [
    "Women",
    "Men",
    "Non-binary",
    ...(rec.some((s) => genderOf(s) === "Other") ? ["Other"] : []),
    "Not stated",
  ];
  // Age is a required answer: "Not stated" only when a reader of the range has none (the design
  // draws the bands alone).
  const ages = [
    ...AGE_BANDS,
    ...(rec.some((s) => ageBand(s.age) === "Not stated") ? ["Not stated"] : []),
  ];

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

  // PostHog starts on POSTHOG_FROM: a range reaching back before it has no whole count of how
  // readers came back, so it says so rather than shares of the part it saw.
  const posthogWhole = f.from >= POSTHOG_FROM;
  const noPostHog = `From PostHog, which starts on ${rangeLabel(POSTHOG_FROM, POSTHOG_FROM)}: pick a range from that day on.`;
  let sources: ReportPayload["returns"]["sources"] = null;
  if (!posthogWhole) {
    sources = { ok: false, error: noPostHog };
  } else if (input.returns) {
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
  const viaEmailParts = posthogWhole ? emailParts(input.returns) : null;
  const viaEmail = viaEmailParts ? viaEmailParts.num / viaEmailParts.den : null;
  // Opens and clicks are of the emails the webhook reported delivered: clicks once it kept any
  // event, opens of those delivered after open tracking was switched on (later than the rest).
  // So a range reaching back before tracking still counts right, out of the emails it saw. A
  // range that ends before either began has nothing of it to count: blank, not 0.
  const opensFrom = extras.email_opens_from;
  const clicksFrom = extras.email_events_from;
  const opensCounted = opensFrom !== null && opensFrom <= f.to;
  const clicksCounted = clicksFrom !== null && clicksFrom <= f.to;
  const campaigns = STAGES.map(({ stage, status, what }) => {
    const e = extras.emails.find((x) => x.stage === stage);
    // A retired stage that sent and sold nothing in the range: 0 sent and 0 bought, as drawn,
    // and no other figure ("—"), as nothing it sent can have been opened or brought anyone back.
    const idle = status === "Retired" && !e?.sent && !e?.bought;
    // Sends dated by the report's time, not by a code: who came back "after" one can't be told.
    const estimated = e?.estimated === true;
    // No row: nothing was sent (or bought) for the stage, so nobody came back from it.
    const returned = idle || estimated ? null : e ? e.returned : 0;
    const sent = e?.sent ?? 0;
    // Of the stage's emails the webhook saw delivered: a stage sent only before tracking began
    // has none, so its opens and clicks are unknown ("—"), not 0.
    const opened = idle || !opensCounted || !e?.delivered_opens ? null : e.opened;
    const clicked = idle || !clicksCounted || !e?.delivered ? null : e.clicked;
    return {
      stage,
      status,
      what,
      estimated,
      delivered: idle ? null : (e?.delivered ?? null),
      deliveredOpens: idle ? null : (e?.delivered_opens ?? null),
      sent,
      opened,
      openRate: ratio(opened, e?.delivered_opens ?? null),
      clicked,
      clickRate: ratio(clicked, e?.delivered ?? null),
      returned,
      returnRate: ratio(returned, sent),
      purchased: e?.bought ?? 0,
      revenue: e?.revenue ?? 0,
    };
  });

  // Every vote since voting began, all traffic: the design's "live, all time". Null: they could
  // not be read, which the page says (no column of zeros).
  const votesError =
    input.votes === null
      ? "The chapter votes could not be read just now. Try again in a minute."
      : null;
  const votes = input.votes ?? [];
  const votesBy = new Map<string, { up: number; down: number }>();
  for (const v of votes) {
    const c = votesBy.get(v.section) ?? { up: 0, down: 0 };
    c[v.vote] += 1;
    votesBy.set(v.section, c);
  }
  const clicksBy = new Map(extras.paywall_clicks.map((c) => [c.section, c.readers]));
  // Reading per chapter, on days it was recorded: all traffic, like the votes, as its rows are
  // summed per chapter in the database. The live report's chapters, and an earlier version's
  // known chapter for the readers it had while it was live (no other key a browser sends).
  const readingFrom = extras.chapter_stats_from;
  const readingRecorded = readingFrom !== null && readingFrom <= f.to;
  const statsBy = new Map(extras.chapter_stats.map((c) => [c.section, c]));
  const readEarlier = [...statsBy.keys()].filter((id) => Object.hasOwn(RETIRED_NAMES, id));
  const chapters = chapterList([...votesBy.keys(), ...readEarlier]).map((c, i) => {
    const live =
      readingRecorded &&
      (LIVE_CHAPTERS.has(c.id) || (statsBy.has(c.id) && Object.hasOwn(RETIRED_NAMES, c.id)));
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
      // An earlier version's chapter: of the readers who read while it was in the report.
      reach: live
        ? ratio(
            reached,
            LIVE_CHAPTERS.has(c.id)
              ? extras.chapter_readers
              : (extras.chapter_readers_before_slim ?? extras.chapter_readers)
          )
        : null,
      medianMs: st?.ms_median === undefined || st.ms_median === null ? null : Number(st.ms_median),
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
    {
      ...box(
        "avg",
        "Avg. total time",
        "mmss",
        mean(rec.map((s) => s.readMs)),
        mean(prevRec.map((s) => s.readMs)),
        prevComparable
      ),
      parts: { num: readSum, den: rec.length },
    },
    box(
      "median",
      "Median total time",
      "mmss",
      median(rec.map((s) => s.readMs)),
      median(prevRec.map((s) => s.readMs)),
      prevComparable
    ),
    {
      ...box(
        "session",
        "Avg. per session",
        "mmss",
        perSession(rec),
        perSession(prevRec),
        prevComparable
      ),
      parts: { num: readSum, den: rec.reduce((a, s) => a + s.closed, 0) },
    },
    // Opens were recorded for everyone all along: compared whenever there is a period before.
    box("readers", "Readers", "count", readers.length, prevReaders.length, true),
  ];
  const returnBoxes: ChangeBox[] = [
    {
      ...box(
        "back",
        "Came back",
        "pct",
        returnedShare(subs),
        returnedShare(prevSubs),
        prevComparable,
        "up",
        0
      ),
      parts: tileParts.returned,
    },
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
      ...(viaEmailParts ? { parts: viaEmailParts } : {}),
    },
    // A session here is a visit: report sessions less than 30 minutes apart are one (ap_facts).
    {
      ...box(
        "visits",
        "Sessions per reader",
        "ratio",
        visitsPer(readers),
        visitsPer(prevReaders),
        prevComparable
      ),
      parts: { num: readers.reduce((a, s) => a + s.visits, 0), den: readers.length },
    },
  ];

  // Under a filter the records can't follow, the readers' sections are blank with the reason,
  // never a column of zeros; the boxes about readers read "—".
  const readerBox = (b: ChangeBox): ChangeBox =>
    tablet && b.key !== "email" ? { ...b, value: null, prev: null, parts: undefined } : b;
  return {
    // No figure here counts sales, so head() isn't given the facts that name the unseen ones.
    ...head(f, today, now, true),
    launched: launched(scope),
    blocked: tablet,
    tiles: tiles.map((t) => (tileParts[t.key] ? { ...t, parts: tileParts[t.key] } : t)),
    wizard: {
      tiles: wizardTiles.map((t) => ({
        ...t,
        digits: wholeDigits(t.value),
        ...(wizardParts[t.key] ? { parts: wizardParts[t.key] } : {}),
      })),
      slides: tablet ? [] : slides,
      skipsFrom,
    },
    tour: {
      from: tourFrom,
      before: launched(scope) && !tourOn,
      openers: tourOpeners,
      audiences: AUDIENCES.map(tourView),
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
      buckets: tablet
        ? []
        : TIME_BUCKETS.map(([label], i) => ({
            label,
            share: buckets[i]!,
            bench: benchBuckets[i]!,
          })),
      boxes: timeBoxes.map(readerBox),
      byGender: tablet ? [] : genders.map(group(genderOf)),
      byAge: tablet ? [] : ages.map(group((s) => ageBand(s.age))),
      depth: {
        from: readingFrom,
        readers: depthReaders,
        chapters: order.length,
        groups: [...TIME_GROUPS],
        bands: tablet ? [] : depthBands,
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
      boxes: returnBoxes.map(readerBox),
      days: tablet ? [] : days,
      sources,
      campaigns,
      emailEvents: emailEventsNote(opensFrom, clicksFrom),
      campaignNote:
        f.from <= CHAPTER_NUDGES_UNTIL
          ? `The chapter nudges (a locked chapter emailed every other day, switched off on ${rangeLabel(CHAPTER_NUDGES_UNTIL, CHAPTER_NUDGES_UNTIL)}) aren't listed: only each reader's last one was dated, so they can't be put in a range.`
          : null,
    },
    wizardNote:
      f.from < EVENTS_COMPLETE_FROM
        ? "Before 18 Sep 2026 a slide was recorded only for readers who accepted cookies, so for those days the later slides read low and Exit high. Left the wizard (the report never opened) counts everyone."
        : null,
    chapters,
    chapterReading: {
      from: readingFrom,
      readers: extras.chapter_readers,
      recorded: readingRecorded,
    },
    feedback: {
      error: votesError,
      from: votes.length
        ? new Date(Math.min(...votes.map((v) => Date.parse(v.at)))).toLocaleDateString("en-CA", {
            timeZone: "Europe/Berlin",
          })
        : null,
      good: votes.filter((v) => v.vote === "up").length,
      bad: votes.filter((v) => v.vote === "down").length,
      total: votes.length,
      // The reasons a bad vote can give, as ap_report_extras counts them.
      issues: Object.entries(ISSUES).map(([id, label]) => ({
        label,
        n: votes.filter((v) => v.vote === "down" && v.issue === id).length,
      })),
      log: [...votes]
        .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
        .map((r) => ({
          at: r.at,
          submission: r.submission,
          user: r.user,
          chapter: names.get(r.section) ?? prettyId(r.section),
          id: r.section,
          vote: r.vote === "up" ? ("Good" as const) : ("Bad" as const),
          issue: r.issue ? (ISSUES[r.issue] ?? r.issue) : null,
          comment: r.comment,
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
