import { isoWeek, longDate, longMonth } from "@features/brain/server/ingest/analytics";

/**
 * Rewrite relative time expressions in a question into the ABSOLUTE period names
 * the corpus actually contains, for retrieval only.
 *
 * WHY THIS IS NOT OPTIONAL POLISH. Measured on the real corpus, "how are we doing
 * this month" returned `analytics/monthly:2026-05`, `:2026-07` and `:2026-06` —
 * and NOT `:2026-08`. The strategy lead's central question was answered with
 * three-month-old revenue.
 *
 * The cause is that no word in "how are we doing this month" discriminates between
 * six near-identical monthly chunks: they scored 0.9161 / 0.9133 / 0.9133 / 0.9053
 * …, a total spread of 0.011, which is noise. `brain_search`'s per-bucket cap then
 * truncates at three and the current month loses a coin flip INSIDE SQL, before
 * any application-side balancing can see it. Two aggravating details: the recency
 * tie-break only fires on exact float equality, so it never engages; and
 * `word_similarity` penalises length, so August — the longest body precisely
 * because it carries an honesty caveat about incomplete ad spend — ranked lowest
 * of the six.
 *
 * Naming the period explicitly already worked perfectly ("how did august go" put
 * `monthly:2026-08` at rank 1, score 1.340), so the fix is to say the quiet part
 * out loud rather than to tune the ranker.
 *
 * Applied to the SEARCH STRING ONLY. The question the model is asked keeps the
 * user's own words, because "how are we doing this month" is what they want
 * answered and "August 2026" is merely how the corpus spells it.
 */
/**
 * The period a question is ABOUT, as the last day of it, or null when it names none.
 *
 * Passed to `brain_search` as the point its recency term measures from. The term is a
 * prior about what is probably wanted when the question does not say; once the question
 * DOES say, the prior is simply wrong, and it was measured beating the answer: "how many
 * sessions did google analytics record in june 2026" returned SEPTEMBER at rank 1, and
 * "in march 2026" did not return March in the top 3 at all.
 *
 * Clamped to today, never the future. For a period still running ("this month") the end
 * of it is a date we have no data for, and anchoring there would push the current month
 * DOWN relative to a month that has closed. Clamping keeps today's behaviour exactly.
 *
 * Bare month names are deliberately NOT detected. "may" is a common auxiliary verb and
 * "march" a common noun, so "how may we improve this" would anchor to May and quietly
 * re-rank a question about nothing of the kind. A year makes it unambiguous, and the
 * bare-month case measured fine without an anchor ("how many page views in june" already
 * ranks June first) — so the risky half buys nothing.
 */
export interface PeriodAnchor {
  /** Last day of the period, clamped to today. */
  date: string;
  /**
   * How coarse the period is. `brain_search` uses it to stop a DAY inside the month
   * outranking the month itself: asked "how many sessions in june 2026" the corpus
   * answered with the week of 22-28 June (90 sessions) rather than the month (3,969),
   * which is a wrong number stated confidently. Only 726 chunks carry a grain at all --
   * the analytics, ga4 and gsc series -- so nothing else is affected by it.
   */
  grain: "month" | "day";
}

export function periodAnchor(question: string, now = new Date()): PeriodAnchor | null {
  return detect(question, now).anchor;
}

export function expandRelativePeriods(question: string, now = new Date()): string {
  return detect(question, now).search;
}

function detect(question: string, now: Date): { search: string; anchor: PeriodAnchor | null } {
  const day = (offset: number): Date => {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset)
    );
    return d;
  };
  const iso = (d: Date): string => d.toISOString().slice(0, 10);
  const monthKey = (offset: number): string => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    return d.toISOString().slice(0, 7);
  };

  const hints: string[] = [];
  const q = question.toLowerCase();
  /** Last day of the named period, clamped to today. First match wins. */
  let anchor: PeriodAnchor | null = null;
  const today = iso(day(0));
  const setAnchor = (v: string) => {
    if (anchor !== null) return;
    // A month key ("2026-06") resolves to that month's last day; a full date is itself.
    // The LENGTH is also what tells the two apart, which is why the grain comes from
    // here rather than being passed in at every call site.
    const isMonth = v.length === 7;
    const end = isMonth
      ? iso(new Date(Date.UTC(Number(v.slice(0, 4)), Number(v.slice(5, 7)), 0)))
      : v;
    anchor = { date: end > today ? today : end, grain: isMonth ? "month" : "day" };
  };
  const add = (...parts: string[]) => {
    for (const p of parts) if (p && !hints.includes(p)) hints.push(p);
  };

  // Order matters: "last month" contains "month", so the more specific
  // expressions are tested first and each match is independent.
  if (/\b(this|current) month\b|\bmonth to date\b|\bso far this month\b|\bmtd\b/.test(q)) {
    add(longMonth(monthKey(0)));
    setAnchor(monthKey(0));
  }
  if (/\b(last|previous|prior) month\b/.test(q)) {
    add(longMonth(monthKey(-1)));
    setAnchor(monthKey(-1));
  }
  // The week branches set a hint but NO anchor, deliberately. Their hint is a token
  // nothing else in the corpus carries ("2026-W36"), so they were never decided by the
  // recency prior — every measured failure was at month grain, where a dozen chunks look
  // alike. An anchor here would be extra machinery buying a case that does not misbehave.
  if (/\b(this|current) week\b|\bweek to date\b/.test(q)) {
    add(isoWeek(iso(day(0))));
  }
  if (/\b(last|previous|prior) week\b/.test(q)) {
    add(isoWeek(iso(day(-7))));
  }
  if (/\byesterday\b/.test(q)) {
    add(longDate(iso(day(-1))), iso(day(-1)));
    setAnchor(iso(day(-1)));
  }
  if (/\btoday\b/.test(q)) {
    add(longDate(iso(day(0))), iso(day(0)));
    setAnchor(iso(day(0)));
  }
  if (/\b(this|current) year\b/.test(q)) {
    add(String(now.getUTCFullYear()));
    setAnchor(`${now.getUTCFullYear()}-12`);
  }
  if (/\b(last|previous|prior) year\b/.test(q)) {
    add(String(now.getUTCFullYear() - 1));
    setAnchor(`${now.getUTCFullYear() - 1}-12`);
  }
  // "right now" / "at the moment" are asking for the latest period we hold.
  if (/\bright now\b|\bat the moment\b|\bcurrently\b|\blatest\b/.test(q)) {
    add(longMonth(monthKey(0)));
    setAnchor(monthKey(0));
  }

  // EXPLICIT periods, which the relative branches above cannot see. A four-digit year
  // is required — see the note on bare month names in `periodAnchor`.
  const MONTHS = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const mm = (name: string) => String(MONTHS.indexOf(name) + 1).padStart(2, "0");
  const dd = (n: string) => n.padStart(2, "0");
  // A SINGLE DAY IS TESTED FIRST, and the order is the whole point. "27 june 2026"
  // contains "june 2026", so a month-only detector reads it as a question about the
  // month and then demotes the very day being asked about -- which is exactly what the
  // grain penalty did until a probe caught it.
  const isoDay = /\b(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/.exec(q);
  const dayFirst = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS.join("|")})\\s+(\\d{4})\\b`
  ).exec(q);
  const monthFirst = new RegExp(
    `\\b(${MONTHS.join("|")})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`
  ).exec(q);
  const named = new RegExp(`\\b(${MONTHS.join("|")})\\s+(\\d{4})\\b`).exec(q);
  const isoMonth = /\b(\d{4})-(0[1-9]|1[0-2])\b/.exec(q);

  if (isoDay) {
    setAnchor(`${isoDay[1]}-${isoDay[2]}-${isoDay[3]}`);
  } else if (dayFirst) {
    setAnchor(`${dayFirst[3]}-${mm(dayFirst[2]!)}-${dd(dayFirst[1]!)}`);
  } else if (monthFirst) {
    setAnchor(`${monthFirst[3]}-${mm(monthFirst[1]!)}-${dd(monthFirst[2]!)}`);
  } else if (named) {
    setAnchor(`${named[2]}-${mm(named[1]!)}`);
  } else if (isoMonth) {
    setAnchor(`${isoMonth[1]}-${isoMonth[2]}`);
  }

  return {
    search: hints.length === 0 ? question : `${question} ${hints.join(" ")}`,
    anchor,
  };
}
