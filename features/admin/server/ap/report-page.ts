/**
 * The Report page (Marcus's "Assessment A · Report" artboard): how people get into their
 * report, how long they read, when they come back and what brings them, every chapter's
 * votes, and the feedback log.
 */
import { WIZARD_DRAWER } from "@features/survey/ui/wizard/wizardContent";
import { supabaseFetch } from "@features/admin/server/supabase";

import { assessmentScope } from "./assessment";
import { type Facts, type SubFact } from "./facts";
import { activeNarrowing, bucketCaption, type ApFilters } from "./filters";
import {
  EVENTS_COMPLETE_FROM,
  launched,
  mean,
  median,
  ratio,
  subsIn,
  totals,
  trend,
  type Totals,
  ageMatched,
  sameAge,
} from "./metrics";
import { head, readFoot, type PageHead, type Tile } from "./overview";
import type { PostHogResult, ReportReturns } from "./posthog";
import { genderLabel } from "./survey-page";

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
  /** returned: of those sent, readers who came back through the email's link after it. */
  emails: Array<{
    stage: string;
    sent: number;
    returned: number | null;
    bought: number;
    revenue: number;
  }>;
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
    issues: raw.issues ?? [],
    feedback: raw.feedback,
    votes_total: Number(raw.votes_total) || 0,
    emails: raw.emails.map((e) => ({ ...e, returned: e.returned ?? null })),
  };
}

const SLIDES = [
  {
    name: "A note before you explore your report",
    purpose: "Thanks the reader; the research behind the report (papers, clinical models, books)",
  },
  {
    name: "Report parts & chapters",
    purpose: "The chapter map: free chapters, the four deep dives, locked insights",
  },
  { name: "Unlocking your report is fully risk free", purpose: "14-day money-back guarantee" },
  { name: "Take only what resonates", purpose: "Perspectives, not fixed definitions" },
  { name: "Rate each report section", purpose: "Asks readers to rate every section as they read" },
  { name: "Invite your friends to grow", purpose: "Invite friends to take the survey too" },
];

/** The map's own steps (wizard_map_step) are recorded from this day. */
const MAP_STEPS_FROM = "2026-10-06";

/** The four ways back to a report PostHog tells apart (posthog.ts), in the design's order. */
const RETURN_SOURCES = [
  "Bookmark or direct",
  "Email link",
  "Share link from a friend",
  "Another tagged link",
];

const ISSUES: Record<string, string> = {
  inaccurate: "Feels inaccurate",
  incomplete: "Incomplete",
  unclear: "Unclear",
  irrelevant: "Not relevant to me",
  tone: "Tone",
  other: "Other",
};

/** The live report's chapters in its own order (its nav), then any older chapter id voted on. */
export function chapterList(seen: string[]): Array<{ id: string; name: string; part: string }> {
  const live = WIZARD_DRAWER.flatMap((p) =>
    p.rows.map((r) => ({ id: r.id, name: r.label, part: `${p.part} · ${p.label}` }))
  );
  const ids = new Set(live.map((c) => c.id));
  const older = [...new Set(seen)]
    .filter((id) => !ids.has(id))
    .sort()
    .map((id) => ({ id, name: prettyId(id), part: "Earlier report versions" }));
  return [...live, ...older];
}

export function prettyId(id: string): string {
  const s = id.replace(/_amp_/g, " & ").replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface ReportPayload extends PageHead {
  launched: boolean;
  tiles: Tile[];
  wizard: {
    /** Intro started, completed all 6, skipped (PostHog) and left the report. */
    tiles: Tile[];
    slides: Array<{
      n: number;
      name: string;
      purpose: string;
      reached: number;
      reachedShare: number | null;
      cont: number | null;
      back: number;
      /** Back ÷ reached; null while a source, device or tier filter is on (back has none). */
      backShare: number | null;
      exit: number | null;
      medianMs: number | null;
      /** Slide 2 only: of its readers since MAP_STEPS_FROM, those who stepped through the map. */
      engaged: number | null;
    }>;
  };
  time: {
    readers: number;
    recorded: number;
    avgMs: number | null;
    /** The benchmark readers' average, for "vs all reports". */
    benchAvgMs: number | null;
    medianMs: number | null;
    perSessionMs: number | null;
    buckets: Array<{ label: string; share: number; bench: number }>;
    byGender: Array<{ label: string; ms: number | null; benchMs: number | null }>;
    byAge: Array<{ label: string; ms: number | null; benchMs: number | null }>;
  };
  returns: {
    cameBack: number | null;
    medianDays: number | null;
    sessionsPerReader: number | null;
    viaEmail: number | null;
    days: Array<{ label: string; share: number; cumulative: number | null }>;
    sources: PostHogResult<Array<{ source: string; share: number; sessions: number }>> | null;
    campaigns: Array<{
      stage: string;
      status: "Live" | "Retired";
      sent: number;
      /** Of those sent, readers who came back through the email's link after it was sent. */
      returned: number | null;
      /** returned ÷ sent. */
      returnRate: number | null;
      purchased: number;
      revenue: number;
    }>;
  };
  chapters: Array<{
    n: number;
    id: string;
    name: string;
    part: string;
    up: number;
    down: number;
    paywallReaders: number;
  }>;
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
  returns: PostHogResult<ReportReturns> | null;
  filters: ApFilters;
  today: string;
  now: Date;
}): ReportPayload {
  const { facts, previous, extras, filters: f, today, now } = input;
  const scope = assessmentScope(f);
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
    per((l) => l.filter((s) => s.openedAt && s.paidAt).length, list);
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
  ): Tile => ({
    key,
    label,
    unit,
    value,
    prev,
    goodWhen: "up",
    spark: sp,
    foot,
    blocked,
    trend: caption,
  });

  // Reading time (the end of a session) and paywall clicks are recorded for everyone only
  // from 18 Sep 2026: a comparison with a period before that is made of the gap. The lilac
  // banner explains the gap, so a foot only says the comparison is withheld.
  const prevComparable = previous ? previous.from >= EVENTS_COMPLETE_FROM : false;
  const withheld = previous && !prevComparable ? " · not compared: before 18 Sep" : "";
  const tiles: Tile[] = [
    tile(
      "opened",
      "Reports opened",
      "count",
      t.opened,
      p?.opened ?? null,
      `${p ? `vs ${n(p.opened)} · ` : ""}${pct(ratio(t.opened, t.subs))} of submissions`,
      trend(facts, scope, (x) => x.opened)
    ),
    tile(
      "read",
      "Avg. read time",
      "mmss",
      readMean(subs),
      // Reading time has no time per step, so it cannot be cut at the same age.
      null,
      `${readFoot(median(rec.map((s) => s.readMs)))} · recorded for ${n(rec.length)} of ${n(readers.length)}${previous ? " · not compared: earlier readers' later visits count too" : ""}`,
      spark((l) => readMean(l))
    ),
    tile(
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
    tile(
      "initiated",
      "Paywall initiated",
      "pct",
      initiated(subs),
      prevComparable ? initiated(prevSubs) : null,
      `of report openers actively clicked a paywall button${withheld}`,
      sparkFull(initiated)
    ),
    tile(
      "share",
      "Share rate",
      "pct",
      shareRate(subs),
      previous ? shareRate(prevSubs) : null,
      `of report openers shared their report (${n(readers.filter((s) => s.shared).length)} of ${n(readers.length)})`,
      spark(shareRate)
    ),
    tile(
      "rating",
      "Rating rate",
      "pct",
      rateRate(subs),
      previous ? rateRate(prevSubs) : null,
      `of report openers rated at least one chapter (${n(readers.filter((s) => s.votes > 0).length)} of ${n(readers.length)} · ${n(readers.reduce((a, s) => a + s.votes, 0))} votes)`,
      spark(rateRate)
    ),
    tile(
      "invite",
      "Invite rate",
      "pct",
      inviteRate(subs),
      prevComparable ? inviteRate(prevSubs) : null,
      `of report openers invited a friend (${n(readers.filter((s) => s.invited).length)} of ${n(readers.length)})${withheld}`,
      sparkFull(inviteRate)
    ),
    tile(
      "initial",
      "Initial unlock rate",
      "pct",
      null,
      null,
      "",
      [],
      "No Initial plan is sold yet: the €4.99 light tier agreed on 12 Oct has not shipped."
    ),
    tile(
      "full",
      "Full unlock rate",
      "pct",
      unlockRate(subs),
      previous ? unlockRate(prevSubs) : null,
      "any paid plan ÷ report openers (so far)",
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
  const slides = SLIDES.map((s, i) => {
    const w = extras.wizard.find((x) => x.slide === i);
    const reached = reach[i]!;
    const wentOn = i < 5 ? reach[i + 1]! : openedAfter;
    const back = w?.went_back ?? 0;
    return {
      n: i + 1,
      name: s.name,
      purpose: s.purpose,
      reached,
      reachedShare: ratio(reached, started),
      cont: ratio(wentOn, reached),
      back,
      // Slide 1 has no Back button: nothing to share out.
      backShare: narrowed || i === 0 ? null : ratio(back, reached),
      exit: reached ? Math.max(0, 1 - wentOn / reached) : null,
      medianMs: w && w.timed > 0 && w.median_ms !== null ? Number(w.median_ms) : null,
      engaged:
        i === 1 && steppers
          ? ratio(mapReaders.filter((x) => steppers.has(x.id)).length, mapReaders.length)
          : null,
    };
  });
  const skips = input.returns && input.returns.ok ? input.returns.value.wizardSkips : null;
  const completedShare = (l: SubFact[]) =>
    ratio(l.filter((s) => (s.wizardSlide ?? 0) >= 5).length, l.length);
  // Finishers whose report was never opened (so far): they left during the intro.
  const leftShare = (l: SubFact[]) => ratio(l.filter((s) => !s.openedAt).length, l.length);
  const wizardTiles: Tile[] = [
    tile(
      "intro",
      "Intro started",
      "count",
      started,
      p?.subs ?? null,
      `${p ? `vs ${n(p.subs)} · ` : ""}everyone who finished the survey`,
      trend(facts, scope, (x) => x.subs)
    ),
    tile(
      "completed",
      "Completed all 6",
      "pct",
      completedShare(subs),
      prevComparable ? completedShare(prevSubs) : null,
      `reached the last slide${withheld}`,
      sparkFull(completedShare)
    ),
    // A count: PostHog sees part of the readers, so its skips over our finishers is no rate.
    {
      ...tile(
        "skipped",
        "Skipped intro",
        "count",
        skips,
        null,
        `clicked Skip Intro, as PostHog saw it${narrowed ? " · all traffic" : ""}`,
        [],
        input.returns && !input.returns.ok ? input.returns.error : null
      ),
      goodWhen: "down",
      trend: "",
    },
    {
      ...tile(
        "left",
        "Left the report",
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
  const groupMean = (list: SubFact[], key: (s: SubFact) => string, label: string) =>
    mean(list.filter((s) => key(s) === label).map((s) => s.readMs));
  const genders = ["Women", "Men", "Non-binary", "Other", "Prefer not to say"];
  const ages = ["18–24", "25–34", "35–44", "45–54", "55–64", "65+"];

  const returners = readers.filter((s) => s.visits > 1 && s.returnedAt);
  const gaps = returners.map((s) => berlinDays(s.openedAt!, s.returnedAt!));
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
  let viaEmail: number | null = null;
  if (input.returns) {
    if (input.returns.ok) {
      const by = new Map(input.returns.value.sources.map((s) => [s.source, s.sessions]));
      const total = RETURN_SOURCES.reduce((a, s) => a + (by.get(s) ?? 0), 0);
      sources = {
        ok: true,
        value: RETURN_SOURCES.map((source) => {
          const sessions = by.get(source) ?? 0;
          return { source, sessions, share: total ? sessions / total : 0 };
        }),
      };
      viaEmail = total ? (by.get("Email link") ?? 0) / total : null;
    } else {
      sources = input.returns;
    }
  }
  const campaigns = ["72h_no_unlock", "54h_no_unlock", "30h_no_unlock"].map((stage) => {
    const e = extras.emails.find((x) => x.stage === stage);
    // No row: nothing was sent (or bought) for the stage, so nobody came back from it.
    const returned = e ? e.returned : 0;
    return {
      stage,
      status: stage === "72h_no_unlock" ? ("Live" as const) : ("Retired" as const),
      sent: e?.sent ?? 0,
      returned,
      returnRate: ratio(returned, e?.sent ?? 0),
      purchased: e?.bought ?? 0,
      revenue: e?.revenue ?? 0,
    };
  });

  const votesBy = new Map(extras.chapters.map((c) => [c.section, c]));
  const clicksBy = new Map(extras.paywall_clicks.map((c) => [c.section, c.readers]));
  const chapters = chapterList(extras.chapters.map((c) => c.section)).map((c, i) => ({
    n: i + 1,
    ...c,
    up: votesBy.get(c.id)?.up ?? 0,
    down: votesBy.get(c.id)?.down ?? 0,
    paywallReaders: clicksBy.get(c.id) ?? 0,
  }));
  const names = new Map(chapters.map((c) => [c.id, c.name]));

  return {
    ...head(f, today, now),
    launched: launched(scope),
    tiles,
    wizard: { tiles: wizardTiles, slides },
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
      byGender: genders.map((g) => ({
        label: g,
        ms: groupMean(rec, (s) => genderLabel(s.gender), g),
        benchMs: groupMean(benchRec, (s) => genderLabel(s.gender), g),
      })),
      byAge: ages.map((a) => ({
        label: a,
        ms: groupMean(rec, (s) => s.age ?? "", a),
        benchMs: groupMean(benchRec, (s) => s.age ?? "", a),
      })),
    },
    returns: {
      cameBack: returnedShare(subs),
      medianDays: median(gaps),
      sessionsPerReader: ratio(
        readers.reduce((a, s) => a + s.visits, 0),
        readers.length
      ),
      viaEmail,
      days,
      sources,
      campaigns,
    },
    chapters,
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

function pct(v: number | null): string {
  return v === null ? "—" : `${(v * 100).toFixed(v * 100 >= 10 ? 1 : 2)}%`;
}
