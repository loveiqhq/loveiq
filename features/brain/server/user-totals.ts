import { supabaseFetch } from "@features/admin/server/supabase";
import { readAll } from "@features/brain/server/read-all";
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

/** The fewest people any shown number may describe. */
export const MIN_GROUP = 5;

export interface Person {
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
}

interface Row {
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
  scoring_result: { v5_primary_archetype: string | null; primary_archetype: string | null } | null;
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

export function toPerson(r: Row): Person | null {
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
  };
}

/** Everyone who finished the survey in the window, as totals-ready records. Null when unreadable. */
export async function loadPeople(since?: string, until?: string): Promise<Person[] | null> {
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
  const rows = await readAll<Row>(
    `/rest/v1/survey_submission?select=created_date_time,` +
      `age:survey_submission_answer(answer_option(option_text)),` +
      `app_user(email,user_profile(gender,sexual_orientation,relationship_status,location_primary)),` +
      `scoring_result(v5_primary_archetype,primary_archetype),` +
      `personal_report(payment!fk_payment_personal_report(amount,currency,status,is_test))` +
      `&age.survey_question_id=eq.${ageId}&status=eq.completed${range}&order=id.asc`
  );
  return rows ? rows.map(toPerson).filter((p): p is Person => p !== null) : null;
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

/**
 * The totals as text. Every number shown describes at least MIN_GROUP people: a smaller
 * group is hidden, and when exactly one group would be hidden the next-smallest goes with
 * it, so no hidden group's size can be worked out by subtracting the shown ones from the
 * total.
 */
export function renderTotals(req: TotalsRequest, people: Person[]): string {
  const matches = people.filter((p) =>
    Object.entries(req.filter).every(
      ([k, v]) => p[k as Dimension].toLowerCase() === String(v).trim().toLowerCase()
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
      `Fewer than ${MIN_GROUP} people finished the survey${scope}, so nothing is shown: a ` +
      `number that small can point to a person.`
    );
  }

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

  const out = [`Survey finishers${scope}. Staff submissions are left out.`, line("All", matches)];
  if (req.groupBy.length) {
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
    if (hidden.length === 1 && shown.length > 0) {
      const smallest = shown.reduce((a, b) => (b[1].length < a[1].length ? b : a));
      shown = shown.filter((g) => g !== smallest);
      hidden = [...hidden, smallest];
    }
    out.push("", `By ${req.groupBy.join(" and ")}:`, ...shown.map(([k, ps]) => line(k, ps)));
    if (hidden.length) {
      const count = hidden.reduce((s, [, ps]) => s + ps.length, 0);
      out.push(
        `- ${n(count)} more people, in ${hidden.length} groups too small to show on their own.`
      );
    }
  }
  const comps = matches.reduce((s, p) => s + p.comps, 0);
  const other = matches.reduce((s, p) => s + p.otherCurrency, 0);
  out.push(
    "",
    `Paid means a succeeded payment above EUR 0 that is not a test` +
      (comps
        ? `; ${n(comps)} free ${comps === 1 ? "unlock" : "unlocks"} with a coupon ` +
          `${comps === 1 ? "is" : "are"} not counted as paid.`
        : ".") +
      ` A finisher is counted once however many times they paid.` +
      (other
        ? ` ${n(other)} sales in other currencies are counted as paid but not in the EUR revenue.`
        : "")
  );
  return out.join("\n");
}
