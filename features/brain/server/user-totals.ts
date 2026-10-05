import { dimensions as TRAIT_DEFS } from "@/data/scoring-config";
import { surveyQuestions } from "@/data/survey-data";
import { supabaseFetch } from "@features/admin/server/supabase";
import { readAll } from "@features/brain/server/read-all";
import { CAMPAIGN_LABELS } from "@shared/emails/unsubscribe-token";
import { isStaffEmail } from "@shared/env/staff-email";

/**
 * ANONYMOUS TOTALS ABOUT OUR USERS: counts, conversion and revenue by group, never a person.
 *
 * Decided 2026-09-26 (decision:2026-09-26-003b2ee2b7): Jarvis may answer questions about our
 * users as totals, hiding any group smaller than 5, because a count that small can point to
 * someone. "How many women aged 25 to 34 finished the survey", "which archetype pays most".
 *
 * Paid follows the recorded definition (decision:2026-09-19-3dba3f01ef): a succeeded,
 * non-test payment above EUR 0. A EUR 0 coupon unlock is a comp, named beside it and never
 * inside it. Staff submissions are left out, as the admin panel's test flag does.
 *
 * FOUR THINGS TO COUNT, one rule. "people" is who finished and who paid. "traits" is the
 * user graph: the engine's 21 trait values, averaged per group. "emails" is which reminders
 * a group was sent and who unsubscribed, bounced or complained, which is what "what
 * notification who got" can honestly mean without naming anyone. "answers" is how a group
 * answered one question. Every one of them goes through `groupPeople` over the SAME people,
 * so the smallest-group rule and its subtraction guard hide the same groups whichever is
 * asked for: a measure that dropped people before grouping would hide different groups,
 * and subtracting one answer from another would reveal the small one (audit, 2026-09-29).
 *
 * INSIDE A SHOWN GROUP the three new measures go further than `people` does. A count, or a
 * share, is exact only when both it and the rest of the group are MIN_GROUP or more;
 * otherwise it reads "under 5" or "all but under 5", zero included, because "0% chose Yes"
 * in a group of seven is seven people's answer. Trait averages and their middle half need
 * TRAIT_MIN_GROUP people: an average of 100 across five people is five people's answers.
 *
 * BEYOND LOVEIQ. A Person is one finished assessment. The Applied Psychometrics platform's
 * instruments (the Assessment Factory, features/assessments) score to a total and a band;
 * those become one more measure over the same groups, not a second tool.
 */

export const DIMENSIONS = [
  "gender",
  "age",
  "orientation",
  "relationship",
  "country",
  "archetype",
  "month",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/** What to count about each group. */
export const MEASURES = ["people", "traits", "emails", "answers"] as const;
export type Measure = (typeof MEASURES)[number];

/** The engine's 21 traits, each one survey answer, in the scoring config's own words. */
export const TRAITS: ReadonlyArray<{ id: string; name: string }> = TRAIT_DEFS.map((d) => ({
  id: d.id,
  name: d.name,
}));

/** The fewest people any shown number may describe. */
export const MIN_GROUP = 5;
/** The fewest people a trait average, or its middle half, may describe. */
export const TRAIT_MIN_GROUP = 20;

export interface Person {
  /** Who finished, so one person who finished twice is counted once. */
  userId?: string;
  gender: string;
  age: string;
  orientation: string;
  relationship: string;
  country: string;
  archetype: string;
  month: string;
  /** EUR of real sales (succeeded, not a test, above zero). */
  revenue: number;
  sales: number;
  /** Real sales in another currency: counted as sales, left out of the EUR revenue. */
  otherCurrency: number;
  comps: number;
  /** traits: the engine's 21 trait values (0 to 1), from the latest finish. */
  traits?: Record<string, number>;
  /** emails: the reminder stages they were sent. */
  reminders?: string[];
  /** emails: the email they unsubscribed from, when they did. */
  unsubscribedFrom?: string;
  bounced?: boolean;
  complained?: boolean;
  invited?: boolean;
  /** answers: the options they chose for the question asked about, from the latest finish. */
  answer?: string[];
}

interface Row {
  user_id?: string | number | null;
  created_date_time: string;
  /** The answer to the survey's age question: the profile's birthday is never filled. */
  age: Array<{ answer_option: { option_text: string | null } | null }> | null;
  app_user: {
    email: string | null;
    user_profile: {
      gender: string | null;
      sexual_orientation: string | null;
      relationship_status: string | null;
      location_primary: string | null;
    } | null;
  } | null;
  scoring_result: {
    v5_primary_archetype: string | null;
    primary_archetype: string | null;
    uDimensions?: Record<string, unknown> | null;
  } | null;
  report_price_quote?: Array<{ reminders: unknown }> | null;
  answer?: Array<{
    normalized_value: number | string | null;
    answer_option: { option_text: string | null } | null;
    survey_submission_answer_options: Array<{
      answer_option: { option_text: string | null } | null;
    }> | null;
  }> | null;
  personal_report: {
    payment: Array<{
      amount: string | number | null;
      currency: string | null;
      status: string;
      is_test: boolean | null;
    }> | null;
  } | null;
}

const NOT_GIVEN = "not given";
/** One spelling per answer: curly quotes and en dashes ("18–24") as a person would type them. */
const clean = (v: string | null | undefined) =>
  v?.replace(/[‘’]/g, "'").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim() || NOT_GIVEN;

/** "Which age range are you in?", by the survey's own question id, which outlives row ids. */
const AGE_QUESTION = "15003";

/** Who unsubscribed, bounced or complained, and who invited someone, keyed by email. */
export interface MailFacts {
  suppressed: Map<string, { reason: string; campaign: string | null }>;
  /** Emails that sent an invite (invite_event), and user ids that shared a report (report_share). */
  inviters: Set<string>;
  sharers?: Set<string>;
}

export function toPerson(r: Row, mail?: MailFacts): Person | null {
  if (isStaffEmail(r.app_user?.email)) return null;
  const p = r.app_user?.user_profile ?? null;
  let revenue = 0;
  let sales = 0;
  let otherCurrency = 0;
  let comps = 0;
  for (const pay of r.personal_report?.payment ?? []) {
    if (pay.status !== "succeeded" || pay.is_test) continue;
    const amount = Number(pay.amount ?? 0);
    if (amount <= 0) comps += 1;
    else if ((pay.currency ?? "EUR").toUpperCase() === "EUR") {
      sales += 1;
      revenue += amount;
    } else {
      sales += 1;
      otherCurrency += 1;
    }
  }
  return {
    ...(r.user_id != null ? { userId: String(r.user_id) } : {}),
    gender: clean(p?.gender),
    age: clean(r.age?.[0]?.answer_option?.option_text),
    orientation: clean(p?.sexual_orientation),
    relationship: clean(p?.relationship_status),
    country: clean(p?.location_primary),
    archetype: clean(
      r.scoring_result?.v5_primary_archetype ?? r.scoring_result?.primary_archetype ?? "not scored"
    ),
    month: r.created_date_time.slice(0, 7),
    revenue,
    sales,
    otherCurrency,
    comps,
    ...extras(r, mail),
  };
}

/** The measure-specific fields, only for rows that were read with them. */
function extras(r: Row, mail?: MailFacts): Partial<Person> {
  const out: Partial<Person> = {};
  const dims = r.scoring_result?.uDimensions;
  if (dims && typeof dims === "object") {
    const traits: Record<string, number> = {};
    for (const [k, v] of Object.entries(dims)) {
      if (typeof v === "number" && Number.isFinite(v)) traits[k] = v;
    }
    if (Object.keys(traits).length) out.traits = traits;
  }
  if (r.report_price_quote) {
    const stages = r.report_price_quote.flatMap((q) =>
      Array.isArray(q.reminders)
        ? q.reminders.filter((x): x is string => typeof x === "string")
        : []
    );
    out.reminders = [...new Set(stages)];
  }
  if (mail) {
    const email = (r.app_user?.email ?? "").trim().toLowerCase();
    const s = email ? mail.suppressed.get(email) : undefined;
    if (s?.reason === "unsubscribed") out.unsubscribedFrom = s.campaign ?? "not recorded";
    if (s?.reason === "hard_bounce") out.bounced = true;
    if (s?.reason === "complaint") out.complained = true;
    if (
      (email && mail.inviters.has(email)) ||
      (r.user_id != null && mail.sharers?.has(String(r.user_id)))
    ) {
      out.invited = true;
    }
  }
  if (r.answer) {
    // Options only. A free-text "other" (answer_text) is never read, so it cannot be shown.
    const chosen = r.answer.flatMap((a) => [
      ...(a.answer_option?.option_text ? [a.answer_option.option_text] : []),
      ...(a.survey_submission_answer_options ?? []).flatMap((o) =>
        o.answer_option?.option_text ? [o.answer_option.option_text] : []
      ),
      ...(a.normalized_value != null && !a.answer_option ? [String(a.normalized_value)] : []),
    ]);
    if (chosen.length) out.answer = [...new Set(chosen.map((c) => clean(c)))];
  }
  return out;
}

/** A survey question as the answers measure needs it. */
export interface AskedQuestion {
  id: number;
  qid: string;
  type: string;
  question: string;
}

/**
 * The question behind a survey id like "03011", or null when there is none. Throws when the
 * read fails, so an outage is never reported as "there is no such question".
 */
export async function findQuestion(qid: string): Promise<AskedQuestion | null> {
  const res = await supabaseFetch(
    `/rest/v1/survey_question?select=id,frontend_qid,type,question&frontend_qid=eq.${encodeURIComponent(qid)}&limit=1`
  );
  if (!res.ok) throw new Error(`survey_question could not be read: HTTP ${res.status}`);
  const row = (
    (await res.json()) as Array<{
      id?: number;
      frontend_qid?: string;
      type?: string;
      question?: string;
    }>
  )[0];
  return typeof row?.id === "number"
    ? {
        id: row.id,
        qid: row.frontend_qid ?? qid,
        type: row.type ?? "",
        question: row.question ?? "",
      }
    : null;
}

async function loadMailFacts(): Promise<MailFacts | null> {
  const [suppressed, invites, shares] = await Promise.all([
    readAll<{ email: string | null; reason: string | null; source_campaign: string | null }>(
      "/rest/v1/email_suppression?select=email,reason,source_campaign&order=email.asc"
    ),
    readAll<{ referrer_email: string | null }>(
      "/rest/v1/invite_event?select=referrer_email&order=id.asc"
    ),
    readAll<{ shared_by_user_id: string | number | null }>(
      "/rest/v1/report_share?select=shared_by_user_id&order=id.asc"
    ),
  ]);
  if (!suppressed || !invites || !shares) return null;
  return {
    suppressed: new Map(
      suppressed
        .filter((r) => r.email && r.reason)
        .map((r) => [
          r.email!.trim().toLowerCase(),
          { reason: r.reason!, campaign: r.source_campaign },
        ])
    ),
    inviters: new Set(
      invites.map((r) => (r.referrer_email ?? "").trim().toLowerCase()).filter(Boolean)
    ),
    sharers: new Set(
      shares
        .map((r) => (r.shared_by_user_id == null ? "" : String(r.shared_by_user_id)))
        .filter(Boolean)
    ),
  };
}

/** Resend's own counts for the window: every email, not only these people's. */
export interface Deliveries {
  counts: Record<string, number>;
  /** The first day Resend's events were recorded at all (they start 2026-09-14). */
  recordedFrom: string | null;
}

export async function loadDeliveries(since?: string, until?: string): Promise<Deliveries | null> {
  const range =
    (since ? `&received_at=gte.${since}T00:00:00Z` : "") +
    (until ? `&received_at=lt.${nextDay(until)}T00:00:00Z` : "");
  const [rows, first] = await Promise.all([
    readAll<{ event_type: string }>(
      `/rest/v1/resend_webhook_event?select=event_type${range}&order=id.asc`
    ),
    supabaseFetch("/rest/v1/resend_webhook_event?select=received_at&order=received_at.asc&limit=1")
      .then(async (r) => (r.ok ? ((await r.json()) as Array<{ received_at?: string }>) : null))
      .catch(() => null),
  ]);
  if (!rows || !first) return null;
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.event_type] = (counts[r.event_type] ?? 0) + 1;
  return { counts, recordedFrom: first[0]?.received_at?.slice(0, 10) ?? null };
}

export interface LoadOptions {
  measure?: Measure;
  /** answers: the survey_question row id of the question asked about. */
  questionId?: number;
}

/** Everyone who finished the survey in the window, as totals-ready records. Null when unreadable. */
export async function loadPeople(
  since?: string,
  until?: string,
  opts: LoadOptions = {}
): Promise<Person[] | null> {
  const question = await supabaseFetch(
    `/rest/v1/survey_question?select=id&frontend_qid=eq.${AGE_QUESTION}&limit=1`
  );
  const ageId = question.ok
    ? ((await question.json().catch(() => [])) as Array<{ id?: number }>)[0]?.id
    : undefined;
  if (typeof ageId !== "number") return null;
  const range =
    (since ? `&created_date_time=gte.${since}T00:00:00Z` : "") +
    (until ? `&created_date_time=lt.${nextDay(until)}T00:00:00Z` : "");
  const mail = opts.measure === "emails" ? await loadMailFacts() : undefined;
  if (mail === null) return null;
  const traits = opts.measure === "traits" ? ",uDimensions:diagnostics->uDimensions" : "";
  const reminders =
    opts.measure === "emails" ? ",report_price_quote(reminders:metadata->nurtureEmailsSent)" : "";
  const answer =
    opts.measure === "answers" && opts.questionId !== undefined
      ? ",answer:survey_submission_answer(normalized_value,answer_option(option_text)," +
        "survey_submission_answer_options(answer_option(option_text)))"
      : "";
  const rows = await readAll<Row>(
    `/rest/v1/survey_submission?select=user_id,created_date_time,` +
      `age:survey_submission_answer(answer_option(option_text)),` +
      `app_user(email,user_profile(gender,sexual_orientation,relationship_status,location_primary)),` +
      `scoring_result(v5_primary_archetype,primary_archetype${traits}),` +
      `personal_report(payment!fk_payment_personal_report(amount,currency,status,is_test))` +
      `${reminders}${answer}` +
      `&age.survey_question_id=eq.${ageId}` +
      (answer ? `&answer.survey_question_id=eq.${opts.questionId}` : "") +
      `&status=eq.completed${range}&order=id.asc`
  );
  return rows
    ? onePerPerson(rows.map((r) => toPerson(r, mail)).filter((p): p is Person => p !== null))
    : null;
}

/**
 * ONE PERSON, ONE FINISHER. 36 users have finished the survey more than once (one tester
 * 31 times, checked 2026-09-27), so counting submissions let a row read "18 finished" for
 * 2 people, under the floor that is this tool's whole promise. Merged per user, in the
 * order the rows arrive (oldest first): the first finish sets the month, the latest sets
 * the answers and the archetype, and payments on any of their reports add up.
 */
export function onePerPerson(people: Person[]): Person[] {
  const byUser = new Map<string, Person>();
  const out: Person[] = [];
  for (const p of people) {
    const seen = p.userId ? byUser.get(p.userId) : undefined;
    if (!seen) {
      const copy = { ...p };
      if (p.userId) byUser.set(p.userId, copy);
      out.push(copy);
      continue;
    }
    // The archetype they paid under stays with their sale: a later unpaid retake that scored
    // differently must not move the revenue to another archetype. That finish's traits and
    // answers stay with it, so a group's profile is the profile of the people filed in it.
    const keepSeen = !(p.sales > 0 || seen.sales === 0);
    Object.assign(seen, {
      gender: p.gender,
      age: p.age,
      orientation: p.orientation,
      relationship: p.relationship,
      country: p.country,
      archetype: keepSeen ? seen.archetype : p.archetype,
      revenue: seen.revenue + p.revenue,
      sales: seen.sales + p.sales,
      otherCurrency: seen.otherCurrency + p.otherCurrency,
      comps: seen.comps + p.comps,
      // What happened to them by email is everything, across every finish.
      traits: keepSeen ? seen.traits : (p.traits ?? seen.traits),
      answer: keepSeen ? seen.answer : (p.answer ?? seen.answer),
      reminders:
        p.reminders || seen.reminders
          ? [...new Set([...(seen.reminders ?? []), ...(p.reminders ?? [])])]
          : undefined,
      unsubscribedFrom: p.unsubscribedFrom ?? seen.unsubscribedFrom,
      bounced: p.bounced || seen.bounced || undefined,
      complained: p.complained || seen.complained || undefined,
      invited: p.invited || seen.invited || undefined,
    });
  }
  return out;
}

const nextDay = (day: string) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

const n = (v: number) => v.toLocaleString("en-US");
const eur = (v: number) =>
  `EUR ${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface TotalsRequest {
  groupBy: Dimension[];
  filter: Partial<Record<Dimension, string>>;
  since?: string;
  until?: string;
}

interface Grouped {
  matches: Person[];
  scope: string;
  shown: Array<[string, Person[]]>;
  /** People in groups too small to show; never how many groups. */
  hiddenPeople: number;
}

/**
 * The one privacy rule, for every measure. No shown group, and no hidden remainder, is
 * fewer than MIN_GROUP people: a smaller group is hidden, and while the hidden groups add
 * up to fewer than MIN_GROUP the smallest shown group is hidden too, so subtracting the
 * shown rows from the total cannot reveal a small group. How many groups are hidden is
 * never said: "2 more people, in 2 groups" was two groups of one. Returns the refusal text
 * when fewer than MIN_GROUP people match at all.
 *
 * What this does NOT promise: for `people`, how many paid inside a shown group is shown as it
 * is (the other measures hide small counts inside a group: see `cell`), and each answer is
 * protected on its own, so two answers (a day apart, one filter narrower) can still be
 * subtracted. The tool description says so.
 */
export function groupPeople(req: TotalsRequest, people: Person[], who: string): Grouped | string {
  // Cleaned like the stored values, so "25–34" as the survey writes it matches "25-34".
  const matches = people.filter((p) =>
    Object.entries(req.filter).every(
      ([k, v]) => p[k as Dimension].toLowerCase() === clean(String(v)).toLowerCase()
    )
  );
  const scope =
    (Object.keys(req.filter).length
      ? ` where ${Object.entries(req.filter)
          .map(([k, v]) => `${k} is ${v}`)
          .join(" and ")}`
      : "") +
    (req.since || req.until
      ? `, ${req.since ?? "the start"} to ${req.until ?? "today"}`
      : ", all time");
  if (matches.length < MIN_GROUP) {
    return (
      `Fewer than ${MIN_GROUP} people ${who}${scope}, so nothing is shown: a ` +
      `number that small can point to a person.`
    );
  }
  if (!req.groupBy.length) return { matches, scope, shown: [], hiddenPeople: 0 };
  const groups = new Map<string, Person[]>();
  for (const p of matches) {
    const key = req.groupBy.map((d) => p[d]).join(" · ");
    const group = groups.get(key);
    if (group) group.push(p);
    else groups.set(key, [p]);
  }
  const ordered = [...groups].sort((a, b) =>
    req.groupBy.length === 1 && req.groupBy[0] === "month"
      ? a[0].localeCompare(b[0])
      : b[1].length - a[1].length || a[0].localeCompare(b[0])
  );
  let shown = ordered.filter(([, ps]) => ps.length >= MIN_GROUP);
  let hidden = ordered.filter(([, ps]) => ps.length < MIN_GROUP);
  const hiddenCount = () => hidden.reduce((s, [, ps]) => s + ps.length, 0);
  while (hiddenCount() > 0 && hiddenCount() < MIN_GROUP && shown.length > 0) {
    const smallest = shown.reduce((a, b) => (b[1].length < a[1].length ? b : a));
    shown = shown.filter((g) => g !== smallest);
    hidden = [...hidden, smallest];
  }
  return { matches, scope, shown, hiddenPeople: hiddenCount() };
}

const hiddenLine = (g: Grouped) =>
  g.hiddenPeople
    ? [`- ${n(g.hiddenPeople)} more people, in groups too small to show on their own.`]
    : [];

/** The totals as text: who finished, who paid, what they paid. */
export function renderTotals(req: TotalsRequest, people: Person[]): string {
  const g = groupPeople(req, people, "finished the survey");
  if (typeof g === "string") return g;

  const line = (label: string, ps: Person[]) => {
    const eurSales = ps.reduce((s, p) => s + p.sales - p.otherCurrency, 0);
    const buyers = ps.filter((p) => p.sales > 0).length;
    const revenue = ps.reduce((s, p) => s + p.revenue, 0);
    return (
      `- ${label}: ${n(ps.length)} finished · ${n(buyers)} paid ` +
      `(${((buyers / ps.length) * 100).toFixed(1)}%)` +
      (eurSales ? ` · ${eur(revenue)}, ${eur(revenue / eurSales)} a sale` : "")
    );
  };

  const out = [
    `Survey finishers${g.scope}. Staff submissions are left out.`,
    line("All", g.matches),
  ];
  if (req.groupBy.length) {
    out.push(
      "",
      `By ${req.groupBy.join(" and ")}:`,
      ...g.shown.map(([k, ps]) => line(k, ps)),
      ...hiddenLine(g)
    );
  }
  const comps = g.matches.reduce((s, p) => s + p.comps, 0);
  const other = g.matches.reduce((s, p) => s + p.otherCurrency, 0);
  out.push(
    "",
    `Paid means a succeeded payment above EUR 0 that is not a test` +
      (comps
        ? `; ${n(comps)} free ${comps === 1 ? "unlock" : "unlocks"} with a coupon ` +
          `${comps === 1 ? "is" : "are"} not counted as paid.`
        : ".") +
      ` A finisher is counted once however many times they paid.` +
      (other
        ? ` ${n(other)} ${other === 1 ? "sale" : "sales"} in other currencies ${other === 1 ? "is" : "are"} ` +
          `counted as paid but not in the EUR revenue.`
        : "")
  );
  return out.join("\n");
}

const pct = (part: number, whole: number) => `${whole ? Math.round((part / whole) * 100) : 0}%`;
const score = (v: number) => Math.round(v * 100);

/**
 * A count inside a shown group of `group` people: exact only when both it and the rest of
 * the group are MIN_GROUP or more. Zero is hidden too: "nobody chose Yes" is everyone's answer.
 */
export function cell(count: number, group: number, show: (c: number) => string = n): string {
  if (count < MIN_GROUP) return "under 5";
  if (group - count < MIN_GROUP) return "all but under 5";
  return show(count);
}

/** Each trait's average over the people who have it, for traits TRAIT_MIN_GROUP people have. */
function traitMeans(ps: Person[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of TRAITS) {
    const vs = ps.map((p) => p.traits?.[t.id]).filter((v): v is number => typeof v === "number");
    if (vs.length >= TRAIT_MIN_GROUP) out.set(t.id, vs.reduce((a, b) => a + b, 0) / vs.length);
  }
  return out;
}

export function quartiles(values: number[]): [number, number] {
  const v = [...values].sort((a, b) => a - b);
  const at = (q: number) => {
    const i = (v.length - 1) * q;
    const lo = Math.floor(i);
    return v[lo]! + (v[Math.ceil(i)]! - v[lo]!) * (i - lo);
  };
  return [at(0.25), at(0.75)];
}

const scoredOf = (ps: Person[]) => ps.filter((p) => p.traits);

/**
 * The user graph: each trait's average, 0 to 100. Alone, every trait with its middle half;
 * by group, each group's three traits furthest above and below everyone's average, which is
 * what tells two groups apart. Groups are everyone's groups (as `people` forms them); a
 * group with fewer than TRAIT_MIN_GROUP scored reports shows no averages.
 */
export function renderTraits(req: TotalsRequest, people: Person[]): string {
  const g = groupPeople(req, people, "finished the survey");
  if (typeof g === "string") return g;
  const all = scoredOf(g.matches);
  if (all.length < TRAIT_MIN_GROUP) {
    return (
      `Fewer than ${TRAIT_MIN_GROUP} people with a scored report${g.scope}, so no trait ` +
      `averages are shown: an average of so few can say what each of them answered.`
    );
  }
  const name = new Map(TRAITS.map((t) => [t.id, t.name]));
  const everyone = traitMeans(all);
  const out = [
    `Trait profile of survey finishers${g.scope}: ${n(all.length)} people with a scored report. ` +
      `Staff are left out.`,
    "Each trait is one survey answer on the scoring engine's 0 to 100 scale: most are a 1-to-7 answer, " +
      "where 0 is the lowest answer and 100 the highest.",
  ];
  if (!req.groupBy.length) {
    out.push("");
    for (const [id, mean] of [...everyone].sort((a, b) => b[1] - a[1])) {
      const vs = all.map((p) => p.traits?.[id]).filter((v): v is number => typeof v === "number");
      const [lo, hi] = quartiles(vs);
      out.push(
        `- ${name.get(id) ?? id}: ${score(mean)} (middle half ${score(lo)} to ${score(hi)})`
      );
    }
    return out.join("\n");
  }
  // Everyone's average and the groups' averages, with their counts, give the average of
  // whoever is left over. So the scored people outside the averaged groups must be none, or
  // TRAIT_MIN_GROUP or more: while they are fewer, the smallest averaged group is withheld too.
  let averaged = g.shown.filter(([, ps]) => scoredOf(ps).length >= TRAIT_MIN_GROUP);
  const leftOver = () => all.length - averaged.reduce((s, [, ps]) => s + scoredOf(ps).length, 0);
  while (averaged.length && leftOver() > 0 && leftOver() < TRAIT_MIN_GROUP) {
    const smallest = averaged.reduce((a, b) =>
      scoredOf(b[1]).length < scoredOf(a[1]).length ? b : a
    );
    averaged = averaged.filter((x) => x !== smallest);
  }
  out.push("", `By ${req.groupBy.join(" and ")}, against everyone's average:`);
  for (const [label, ps] of g.shown) {
    const scored = scoredOf(ps);
    if (scored.length < TRAIT_MIN_GROUP) {
      out.push(`- ${label}: fewer than ${TRAIT_MIN_GROUP} scored reports, so no averages.`);
      continue;
    }
    if (!averaged.some(([k]) => k === label)) {
      out.push(
        `- ${label}: averages withheld, so a smaller group cannot be worked out from the rest.`
      );
      continue;
    }
    const deltas = [...traitMeans(scored)]
      .map(([id, mean]) => ({ id, mean, d: mean - (everyone.get(id) ?? mean) }))
      .sort((a, b) => b.d - a.d);
    const fmt = (x: { id: string; mean: number; d: number }) =>
      `${name.get(x.id) ?? x.id} ${score(x.mean)} (${x.d >= 0 ? "+" : ""}${score(x.d)})`;
    out.push(
      `- ${label} (${n(scored.length)} people): most above: ${deltas.slice(0, 3).map(fmt).join(", ")}; ` +
        `most below: ${deltas.slice(-3).reverse().map(fmt).join(", ")}`
    );
  }
  out.push(...hiddenLine(g));
  return out.join("\n");
}

/** An email campaign by its label, or "another email" for one that is not ours. */
function campaignName(slug: string): string {
  return CAMPAIGN_LABELS[slug] ?? "another email";
}

/**
 * Emails, as far as they are logged per person: the report reminders recorded for each
 * person, and whether they unsubscribed (and from which email), bounced, complained or
 * invited someone. The rest is Resend's count for the dates, which no person is tied to.
 */
export function renderEmails(
  req: TotalsRequest,
  people: Person[],
  deliveries: Deliveries | null
): string {
  const g = groupPeople(req, people, "finished the survey");
  if (typeof g === "string") return g;
  const line = (label: string, ps: Person[]) => {
    const size = ps.length;
    const stages = new Map<string, number>();
    for (const p of ps)
      for (const st of p.reminders ?? []) stages.set(st, (stages.get(st) ?? 0) + 1);
    const unsub = ps.filter((p) => p.unsubscribedFrom);
    const from = new Map<string, number>();
    for (const p of unsub) {
      const k = campaignName(p.unsubscribedFrom!);
      from.set(k, (from.get(k) ?? 0) + 1);
    }
    const top = [...from].sort((a, b) => b[1] - a[1])[0];
    const reminders = [...stages]
      .sort((a, b) => b[1] - a[1])
      .map(([st, c]) => `${campaignName(st)} ${cell(c, size)}`);
    return (
      `- ${label}: ${n(size)} finished · report reminders recorded: ${reminders.length ? reminders.join(", ") : "none"}` +
      ` · unsubscribed ${cell(unsub.length, size, (c) => `${n(c)} (${pct(c, size)})`)}` +
      (top && top[1] >= MIN_GROUP ? `, most from "${top[0]}"` : "") +
      ` · bounced ${cell(ps.filter((p) => p.bounced).length, size)}` +
      ` · complained ${cell(ps.filter((p) => p.complained).length, size)}` +
      ` · invited or shared ${cell(ps.filter((p) => p.invited).length, size)}`
    );
  };
  // Grouped, the All line is only its size: its exact counts minus the groups' would give back
  // the hidden ones.
  const out = [
    `Emails to survey finishers${g.scope}. Staff are left out.`,
    req.groupBy.length ? `- All: ${n(g.matches.length)} finished` : line("All", g.matches),
  ];
  if (req.groupBy.length) {
    out.push(
      "",
      `By ${req.groupBy.join(" and ")}:`,
      ...g.shown.map(([k, ps]) => line(k, ps)),
      ...hiddenLine(g)
    );
  }
  out.push(
    "",
    "A report reminder is recorded when the reminder job picks the person, before it sends, so " +
      "one whose send failed still counts. The report-ready email, chapter nudges and paused-" +
      "survey emails are not logged per person. The unsubscribe list keeps one reason per " +
      "address, the latest: someone who unsubscribed and later complained counts as complained."
  );
  out.push(resendLine(req, deliveries));
  return out.join("\n");
}

function resendLine(req: TotalsRequest, d: Deliveries | null): string {
  if (!d) return "Resend's own counts could not be read right now.";
  if (!d.recordedFrom) return "Resend has recorded no email events yet.";
  if (req.until && req.until < d.recordedFrom) {
    return `Resend's own counts start on ${d.recordedFrom}, after these dates, so there are none to show.`;
  }
  const k = (t: string) => n(d.counts[t] ?? 0);
  const from = !req.since || req.since < d.recordedFrom ? d.recordedFrom : req.since;
  return (
    `Resend's own count, ${from} to ${req.until ?? "today"}` +
    (from !== req.since ? ` (its record starts on ${d.recordedFrom})` : "") +
    `, every email and not only these people: ${k("email.sent")} sent, ${k("email.delivered")} ` +
    `delivered, ${k("email.clicked")} clicked, ${k("email.bounced")} bounced, ` +
    `${k("email.complained")} complained.`
  );
}

/**
 * How a group answered one question: the share choosing each option. Groups are everyone's
 * groups; inside one, a share is exact only when both the people who chose the option and
 * the people who did not are five or more (`cell`).
 */
export function renderAnswers(req: TotalsRequest, people: Person[], q: AskedQuestion): string {
  const g = groupPeople(req, people, "finished the survey");
  if (typeof g === "string") return g;
  const answered = (ps: Person[]) => ps.filter((p) => p.answer?.length);
  if (!answered(g.matches).length) {
    return (
      `${q.qid}'s answers are stored as written text, not as options people picked, so they are ` +
      `not summarised here. Written text is never read.` +
      (q.qid === COUNTRY_QUESTION ? " For countries, group by country instead." : "")
    );
  }
  const multiple = q.type === "multiple";
  // Every option, chosen or not: an option missing from a row would say nobody chose it.
  const universe = optionsOf(q, answered(g.matches));
  const line = (label: string, ps: Person[]) => {
    const a = answered(ps);
    if (a.length < MIN_GROUP) return `- ${label}: too few picked an option to show.`;
    const counts = new Map<string, number>(universe.map((o) => [o, 0]));
    for (const p of a) for (const o of p.answer ?? []) counts.set(o, (counts.get(o) ?? 0) + 1);
    const ordered =
      q.type === "scale"
        ? [...counts].sort((x, y) => Number(x[0]) - Number(y[0]))
        : [...counts].sort((x, y) => y[1] - x[1]);
    const shown = ordered.map(([o, c]) => ({
      o,
      c,
      text: cell(c, a.length, (x) => pct(x, a.length)),
    }));
    // One answer per person, so a row's counts add up to how many answered: one hidden cell
    // is the total minus the others. Hide the smallest shown one with it.
    const hidden = shown.filter((x) => x.text.startsWith("under") || x.text.startsWith("all but"));
    if (!multiple && hidden.length === 1) {
      const exact = shown.filter((x) => !hidden.includes(x));
      const smallest = exact.reduce<(typeof exact)[number] | undefined>(
        (m, x) => (!m || x.c < m.c ? x : m),
        undefined
      );
      if (smallest) smallest.text = "hidden with it";
    }
    const who = cell(a.length, ps.length, (c) =>
      c === ps.length ? n(c) : `${n(c)} of ${n(ps.length)}`
    );
    return (
      `- ${label} (${a.length === ps.length ? n(a.length) : who} answered): ` +
      shown.map((x) => `${x.o} ${x.text}`).join(" · ")
    );
  };
  const out = [
    `Answers to ${q.qid}, "${q.question}", survey finishers${g.scope}. Staff are left out.` +
      (multiple ? " People could choose more than one, so shares add up to more than 100%." : "") +
      (q.type === "scale" ? " 1 to 7, where 1 is the lowest." : "") +
      ' An option chosen by fewer than 5, or by all but fewer than 5, reads "under 5" or "all but under 5".',
    // Grouped, the All line is only its size: its counts minus the groups' would give back
    // the hidden cells.
    req.groupBy.length
      ? `- All: ${n(answered(g.matches).length)} answered`
      : line("All", g.matches),
  ];
  if (req.groupBy.length) {
    out.push(
      "",
      `By ${req.groupBy.join(" and ")}:`,
      ...g.shown.map(([k, ps]) => line(k, ps)),
      ...hiddenLine(g)
    );
  }
  out.push("", "Written-in answers are never read or shown, only the options people picked.");
  return out.join("\n");
}

/** Which country do you live in? Stored as text, and already a way to group (`country`). */
const COUNTRY_QUESTION = "15001";

/**
 * The options a question offers, in the survey's own words, plus any the answers carry that
 * the survey file no longer does (options were relabelled in production by hand). A scale
 * question's options are 1 to 7.
 */
function optionsOf(q: AskedQuestion, answered: Person[]): string[] {
  const listed =
    q.type === "scale"
      ? ["1", "2", "3", "4", "5", "6", "7"]
      : (surveyQuestions.find((x) => x.qId === q.qid)?.options ?? []).map((o) => clean(o));
  const seen = answered.flatMap((p) => p.answer ?? []);
  return [...new Set([...listed, ...seen])];
}
