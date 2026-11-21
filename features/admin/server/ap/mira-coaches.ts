/**
 * AP › Mira, "Coaches & picks" (22 Nov 2026, features/mira/content/coaches.ts): who people want
 * to talk to next (Notify me per coming-soon coach, the demand signal), the coaches page and
 * "Find my challenge" with its outcomes, Home's picks and their clicks, the guide's "Ask Mira
 * about this" per practice and whether a chat followed, and searches that found nothing. Read
 * from mira.ts's prepared events, so the team is left out exactly as everywhere on the page.
 * Every detail is an id or a number (the events never carry words).
 */
import { COACHES, coachIdFor } from "@features/mira/content/coaches";
import { GUIDE_PRACTICES } from "@features/mira/content/guide";

/** The events this card reads, which mira.ts asks mira_ap_events for (EVENT_NAMES). */
export const COACH_KPI_EVENTS = [
  "coaches_viewed",
  "notify_me",
  "finder_started",
  "finder_done",
  "picks_shown",
  "pick_clicked",
  "guide_ask",
  "search_empty",
];

/** A chat started this soon after opening it from the guide counts as started from there. */
const GUIDE_START_MS = 30 * 60_000;

/** One counted event (mira.ts `Counted`): `who` is the account, or `anon:` and the browser id. */
interface Ev {
  name: string;
  at: number;
  detail: string | null;
  who: string | null;
}

export interface CoachesKpi {
  roster: { views: number; people: number };
  /** Per coming-soon coach: people who asked in the range, and since the beta began (to its end). */
  notify: Array<{ id: string; name: string; challenge: string; inRange: number; allTime: number }>;
  /** People who opened the finder and who reached a result; per outcome, people in the range. */
  finder: {
    started: number;
    done: number;
    outcomes: Array<{ id: string; label: string; people: number }>;
  };
  /** Home views that showed picks (from chats or the starter), and clicks on them. */
  picks: {
    views: number;
    personal: number;
    clicks: number;
    practiceClicks: number;
    coachClicks: number;
  };
  /** Per practice: people who opened the chat from it, and of them who then started a chat. */
  guide: Array<{ practice: number; name: string; opened: number; started: number }>;
  emptySearches: { home: number; roster: number };
}

const people = (list: Ev[]) => new Set(list.flatMap((e) => (e.who ? [e.who] : []))).size;

export function coachesKpi(events: Ev[], w: { since: number; until: number }): CoachesKpi {
  const inRange = events.filter((e) => e.at >= w.since && e.at < w.until);
  const named = (name: string, list = inRange) => list.filter((e) => e.name === name);
  const toEnd = events.filter((e) => e.at < w.until);

  const asked = (list: Ev[], id: string) =>
    people(named("notify_me", list).filter((e) => coachIdFor(e.detail ?? "") === id));
  const notify = COACHES.filter((c) => !c.live)
    .map((c) => ({
      id: c.id,
      name: c.name,
      challenge: c.challenge,
      inRange: asked(inRange, c.id),
      allTime: asked(toEnd, c.id),
    }))
    .sort((a, b) => b.allTime - a.allTime || b.inRange - a.inRange);

  const done = named("finder_done");
  const outcomes = [
    ...COACHES.map((c) => ({ id: c.id as string, label: `${c.name}, ${c.challenge}` })),
    { id: "none", label: "No coach yet" },
  ].map((o) => ({ ...o, people: people(done.filter((e) => e.detail === o.id)) }));

  const shown = named("picks_shown");
  const clicks = named("pick_clicked");
  const starts = named("chat_started", events);
  const guide = GUIDE_PRACTICES.map((p) => {
    const opens = named("guide_ask").filter((e) => e.detail === String(p.number));
    const followed = opens.filter((o) =>
      starts.some((s) => s.who === o.who && s.at >= o.at && s.at - o.at <= GUIDE_START_MS)
    );
    return { practice: p.number, name: p.name, opened: people(opens), started: people(followed) };
  });
  const empty = named("search_empty");

  return {
    roster: { views: named("coaches_viewed").length, people: people(named("coaches_viewed")) },
    notify,
    finder: { started: people(named("finder_started")), done: people(done), outcomes },
    picks: {
      views: shown.length,
      personal: shown.filter((e) => e.detail === "chats").length,
      clicks: clicks.length,
      practiceClicks: clicks.filter((e) => e.detail?.startsWith("practice-")).length,
      coachClicks: clicks.filter((e) => e.detail?.startsWith("coach-")).length,
    },
    guide,
    emptySearches: {
      home: empty.filter((e) => e.detail === "home").length,
      roster: empty.filter((e) => e.detail === "roster").length,
    },
  };
}
