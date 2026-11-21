/**
 * Mira's coaches (22 Nov 2026, Mark's boards "Coaches", "Home" and "ReportEmbed"): the roster at
 * /mira/coaches, "Find my challenge", Home's "Picked for you", "Your coaches" and search, and the
 * guide's "Ask Mira about this". Pure data and pure functions, read by the pages, the API routes
 * and AP › Mira alike.
 *
 * Mira is the only live coach. The other five are honest "coming soon" cards: they never answer,
 * and nothing here opens a chat as them (the system prompt's hand-overs say the same of Jonas and
 * Ana). Their names, challenges and mottos are the board's; no photos, papers or reviews are
 * invented for them.
 */
import { GUIDE, GUIDE_PRACTICES, type GuidePractice } from "./guide";

export type CoachId = "mira" | "jonas" | "elif" | "ana" | "theo" | "lena";
export type AreaId = "body" | "desire" | "pleasure" | "talk" | "rel";

export type Coach = {
  id: CoachId;
  name: string;
  challenge: string;
  area: AreaId;
  desc: string;
  motto: string;
  live: boolean;
  /** Words people use for this challenge, for search (never shown). */
  keys: string;
};

export const AREAS: Array<[AreaId, string]> = [
  ["body", "Body & self"],
  ["desire", "Desire"],
  ["pleasure", "Pleasure & arousal"],
  ["talk", "Communication"],
  ["rel", "Relationship"],
];

export const COACHES: Coach[] = [
  {
    id: "mira",
    name: "Mira",
    challenge: "Body confidence",
    area: "body",
    desc: "Feeling watched, judged or self-conscious about your body during sex.",
    motto: "We start with what you feel, not how you look.",
    live: true,
    keys: "body image confidence lights off looks self-conscious watched judged naked nude mirror compliments weight clothes summer compare comparing ex pregnancy baby changes hiding hide insecure ugly spectatoring",
  },
  {
    id: "jonas",
    name: "Jonas",
    challenge: "Libido challenges",
    area: "desire",
    desc: "Low desire, no desire, or wanting sex far less (or more) than before.",
    motto: "Desire has a logic. Let’s find yours.",
    live: false,
    keys: "libido low desire sex drive not in the mood tired",
  },
  {
    id: "elif",
    name: "Elif",
    challenge: "Mismatched desire",
    area: "desire",
    desc: "When one of you wants more, and it’s turning into pressure or distance.",
    motto: "A gap in desire is a pattern, not a verdict.",
    live: false,
    keys: "mismatch different partner pressure rejection rejected how often frequency",
  },
  {
    id: "ana",
    name: "Ana",
    challenge: "Saying what you want",
    area: "talk",
    desc: "Finding words for wishes, limits and fantasies without it getting awkward.",
    motto: "Let’s find words you’d actually say out loud.",
    live: false,
    keys: "talk ask tell fantasy fantasies boundaries limits awkward communication",
  },
  {
    id: "theo",
    name: "Theo",
    challenge: "Desire in long relationships",
    area: "rel",
    desc: "When familiarity has made sex predictable, rare or routine.",
    motto: "Familiar doesn’t have to mean flat.",
    live: false,
    keys: "long-term routine boring married marriage spark novelty years",
  },
  {
    id: "lena",
    name: "Lena",
    challenge: "Arousal & orgasm",
    area: "pleasure",
    desc: "Struggling to get aroused, stay present or reach orgasm.",
    motto: "Pleasure is learnable, at your own pace.",
    live: false,
    keys: "aroused orgasm climax turned on wet erection",
  },
];

/**
 * Mira's trained-on line, the same claim as the chat's welcome (features/mira/ui/MiraChat.tsx);
 * only Mira has one.
 */
export const MIRA_TRAINED_ON = {
  papers: "100+ scientific papers",
  words: "100M+ words",
  rest: "of research on body confidence",
};

export const coachById = (id: CoachId): Coach => COACHES.find((c) => c.id === id)!;

/**
 * The coach a "Notify me" (or a finder outcome) names: its id, or its challenge as Home sent it
 * before 22 Nov 2026 ("Libido challenges", "Saying what you want"). One data model: notify_me
 * with the coach's id. Null for anything else.
 */
export function coachIdFor(value: string): CoachId | null {
  return COACHES.find((c) => c.id === value || c.challenge === value)?.id ?? null;
}

// --- Search -----------------------------------------------------------------------------------

/** Lower case, no accents, no apostrophes ("can’t" is "cant"). */
const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[’']/g, "");

/** Words that say nothing about the challenge ("I can’t say what I want" is "say", "want"). */
const STOP = new Set(
  "i im me my a an the to and or of in on it is be with for about at so too very can cant dont do what how when feel really just get that this no not".split(
    " "
  )
);

/** The query's words that carry meaning, or all of them when none does. */
function words(query: string): string[] {
  const all = fold(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const meaningful = all.filter((w) => !STOP.has(w));
  return meaningful.length ? meaningful : all;
}

/** Every word somewhere in the text (prefixes count: "orgas" finds "orgasm"). */
const found = (text: string, ws: string[]) => {
  const t = fold(text);
  return ws.every((w) => t.includes(w));
};

const areaLabel = (a: AreaId) => AREAS.find(([id]) => id === a)![1];
const coachText = (c: Coach) => `${c.name} ${c.challenge} ${c.desc} ${areaLabel(c.area)} ${c.keys}`;

/** The roster's search and area filter; an empty query keeps every coach of the area. */
export function searchCoaches(query: string, area: AreaId | "all"): Coach[] {
  const ws = words(query);
  return COACHES.filter((c) => (area === "all" || c.area === area) && found(coachText(c), ws));
}

export type SearchHit = {
  id: string;
  kind: "Coach" | "Practice" | "Guide" | "Your chat";
  title: string;
  /** The line under the title, as shown: what it is, and its status, length or day. */
  meta: string;
  href: string;
};

/** A chat's day as Home writes it: Today, Yesterday, 3 days ago, then the date. */
function day(iso: string, now: number): string {
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
  return days <= 0
    ? "Today"
    : days === 1
      ? "Yesterday"
      : days < 7
        ? `${days} days ago`
        : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

type ChatTitle = { id: string; title: string; updated_at: string };

const STAGE_OF = new Map(
  GUIDE.sections.flatMap((s) =>
    (s.stages ?? []).flatMap((st) => st.practices.map((p) => [p.number, st.title] as const))
  )
);

/**
 * Home's search, in the browser over what the page already has: the coaches, the guide's
 * practices and chapters, and the person's own chat titles. Nothing typed leaves the page.
 */
export function searchHome(query: string, chats: ChatTitle[], now = Date.now()): SearchHit[] {
  const ws = words(query);
  if (!ws.length) return [];
  const coaches = COACHES.filter((c) => found(coachText(c), ws)).map((c): SearchHit => ({
    id: `coach-${c.id}`,
    kind: "Coach",
    title: `${c.name}, ${c.challenge.toLowerCase()}`,
    meta: c.live ? "Coach · Here now" : "Coach · Coming soon",
    href: c.live ? "/mira" : `/mira/coaches#coach-${c.id}`,
  }));
  const practices = GUIDE_PRACTICES.filter((p) =>
    found(`practice ${p.number} ${p.name} ${p.bestFor} ${STAGE_OF.get(p.number)}`, ws)
  ).map((p): SearchHit => ({
    id: `practice-${p.number}`,
    kind: "Practice",
    title: p.name,
    meta: `Practice ${p.number} · ${p.time}`,
    href: `/mira/guide#practice-${p.number}`,
  }));
  const chapters = GUIDE.sections
    .filter((s) => found([s.title, ...s.parts.map((p) => p.heading ?? "")].join(" "), ws))
    .map((s): SearchHit => ({
      id: `guide-${s.id}`,
      kind: "Guide",
      title: s.title,
      meta: "From the guide",
      href: `/mira/guide#${s.id}`,
    }));
  const mine = chats
    .filter((c) => found(c.title, ws))
    .map((c): SearchHit => ({
      id: `chat-${c.id}`,
      kind: "Your chat",
      title: c.title,
      meta: `Your chat · ${day(c.updated_at, now)}`,
      href: `/mira?chat=${c.id}`,
    }));
  return [
    ...coaches.slice(0, 6),
    ...practices.slice(0, 4),
    ...chapters.slice(0, 3),
    ...mine.slice(0, 5),
  ];
}

// --- Find my challenge -------------------------------------------------------------------------

export type FinderOutcome = CoachId | "none";
export type FinderStep = {
  question: string;
  options: Array<{ label: string; to: FinderOutcome | "desire" }>;
};

/** Two taps at most, in plain words, from "what would help" to a coach (or to none yet). */
export const FINDER: { start: FinderStep; desire: FinderStep } = {
  start: {
    question: "What would you most like help with?",
    options: [
      { label: "How I feel about my body", to: "mira" },
      { label: "How much I want sex", to: "desire" },
      { label: "Getting aroused or reaching orgasm", to: "lena" },
      { label: "Saying what I want, or don’t want", to: "ana" },
      { label: "Something else", to: "none" },
    ],
  },
  desire: {
    question: "Which sounds closer?",
    options: [
      { label: "My desire is low, or it has changed", to: "jonas" },
      { label: "One of us wants sex more than the other", to: "elif" },
      { label: "Sex has become routine with a long-term partner", to: "theo" },
    ],
  },
};

// --- Picked for you and Your coaches ------------------------------------------------------------

/**
 * What a chat's topic (mira-config.json `topics`, the [[TOPIC:id]] marker) points to: the guide's
 * practices by Mira's own answer logic (system-prompt.ts, Sanjin's config: "a body part they want
 * to hide · 3 and 4", "comparing … mostly in bed → 4 and 3", "always · 1 and 2", "illness or
 * surgery · 3, 4"), and a coming-soon coach where one fits. `about` is how the reason line names
 * the topic: its label in the person's terms, never their words, and, like the guide, never
 * weight or shape.
 */
const TOPIC_PICKS: Record<string, { about: string; practices: [number, number]; coach?: CoachId }> =
  {
    hiding: { about: "hiding your body during intimacy", practices: [3, 4], coach: "ana" },
    comparing: { about: "comparing yourself to others", practices: [4, 3] },
    causes: { about: "where these feelings come from", practices: [1, 2] },
    compliments: { about: "not believing compliments", practices: [4, 3] },
    clothes: { about: "clothes and being seen", practices: [1, 2] },
    weight: { about: "worries about your body", practices: [3, 4] },
    changes: { about: "changes after pregnancy or illness", practices: [3, 4] },
  };

const because = (topic: string) => `Because you talked about ${TOPIC_PICKS[topic]!.about}`;

export type Pick =
  | { id: string; kind: "practice"; practice: GuidePractice; reason: string; href: string }
  | { id: string; kind: "coach"; coach: Coach; reason: string; href: string };

const practicePick = (n: number, reason: string): Pick => ({
  id: `practice-${n}`,
  kind: "practice",
  practice: GUIDE_PRACTICES.find((p) => p.number === n)!,
  reason,
  href: `/mira/guide#practice-${n}`,
});

/**
 * "Picked for you": two practices from the person's topics (newest first, one from each before a
 * second from any), and a coming-soon coach where a topic has one; three at most. With no topic
 * known, the guide's first practice (`personal` false).
 */
export function picksFor(topics: string[]): { picks: Pick[]; personal: boolean } {
  const known = topics.filter((t) => t in TOPIC_PICKS);
  const picks: Pick[] = [];
  for (const rank of [0, 1]) {
    for (const t of known) {
      const n = TOPIC_PICKS[t]!.practices[rank]!;
      if (picks.length < 2 && !picks.some((p) => p.id === `practice-${n}`)) {
        picks.push(practicePick(n, because(t)));
      }
    }
  }
  if (!picks.length) return { picks: [practicePick(1, "A good first step")], personal: false };
  const withCoach = known.find((t) => TOPIC_PICKS[t]!.coach);
  if (withCoach) {
    const coach = coachById(TOPIC_PICKS[withCoach]!.coach!);
    picks.push({
      id: `coach-${coach.id}`,
      kind: "coach",
      coach,
      reason: because(withCoach),
      href: `/mira/coaches#coach-${coach.id}`,
    });
  }
  return { picks, personal: true };
}

/**
 * "Your coaches", beside Mira: two coming-soon coaches. First those the person asked to hear about,
 * then one their topics point to, then Jonas and Ana, the two Mira hands over to (system prompt).
 */
export function suggestedCoaches(
  topics: string[],
  notified: CoachId[]
): Array<{ coach: Coach; reason: string; personal: boolean }> {
  const out: Array<{ coach: Coach; reason: string; personal: boolean }> = [];
  const add = (id: CoachId | undefined, reason: (c: Coach) => string, personal: boolean) => {
    const coach = id ? COACHES.find((c) => c.id === id) : undefined;
    if (!coach || coach.live || out.length >= 2 || out.some((s) => s.coach.id === id)) return;
    out.push({ coach, reason: reason(coach), personal });
  };
  for (const id of notified) add(id, (c) => `You asked to hear when ${c.name} is here`, true);
  for (const t of topics) {
    if (t in TOPIC_PICKS) add(TOPIC_PICKS[t]!.coach, () => because(t), true);
  }
  for (const id of ["jonas", "ana"] as const) add(id, (c) => c.desc, false);
  return out;
}

// --- The guide's "Ask Mira about this" ----------------------------------------------------------

/** The message the chat opens with (prefilled, never sent for the person), or null. */
export function guideStarter(practice: number): string | null {
  const p = GUIDE_PRACTICES.find((x) => x.number === practice);
  return p ? `Can you help me with practice ${p.number} from the guide, “${p.name}”?` : null;
}

// --- KPI events (AP › Mira, "Coaches & picks") --------------------------------------------------

/** The events the browser sends for this feature, besides notify_me. */
export const COACH_EVENTS = [
  "coaches_viewed",
  "finder_started",
  "finder_done",
  "picks_shown",
  "pick_clicked",
  "guide_ask",
  "search_empty",
] as const;
export type CoachEvent = (typeof COACH_EVENTS)[number];

const PICK = /^(practice-[1-7]|coach-(mira|jonas|elif|ana|theo|lena))$/;

/**
 * An event's props from the one detail the browser may send: ids and numbers only, so no words
 * can reach the log. Null when the detail doesn't fit the event.
 */
export function coachEventProps(
  name: CoachEvent,
  detail?: string
): Record<string, string | number> | null {
  const d = detail ?? "";
  switch (name) {
    case "coaches_viewed":
    case "finder_started":
      return detail === undefined ? {} : null;
    case "finder_done":
      return d === "none" || coachIdFor(d) === d ? { coach: d } : null;
    case "picks_shown":
      return d === "chats" || d === "start" ? { basis: d } : null;
    case "pick_clicked":
      return PICK.test(d) ? { pick: d } : null;
    case "guide_ask":
      return guideStarter(Number(d)) && /^[1-7]$/.test(d) ? { practice: Number(d) } : null;
    case "search_empty":
      return d === "home" || d === "roster" ? { where: d } : null;
  }
}
