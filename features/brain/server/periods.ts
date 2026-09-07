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
export function periodAnchor(question: string, now = new Date()): string | null {
  return detect(question, now).anchor;
}

export function expandRelativePeriods(question: string, now = new Date()): string {
  return detect(question, now).search;
}

function detect(question: string, now: Date): { search: string; anchor: string | null } {
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
  let anchor: string | null = null;
  const today = iso(day(0));
  const setAnchor = (v: string) => {
    if (anchor !== null) return;
    // A month key ("2026-06") resolves to that month's last day; a full date is itself.
    const end =
      v.length === 7 ? iso(new Date(Date.UTC(Number(v.slice(0, 4)), Number(v.slice(5, 7)), 0))) : v;
    anchor = end > today ? today : end;
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
  const named = new RegExp(`\\b(${MONTHS.join("|")})\\s+(\\d{4})\\b`).exec(q);
  if (named) {
    setAnchor(`${named[2]}-${String(MONTHS.indexOf(named[1]!) + 1).padStart(2, "0")}`);
  } else {
    const iso = /\b(\d{4})-(0[1-9]|1[0-2])\b/.exec(q);
    if (iso) setAnchor(`${iso[1]}-${iso[2]}`);
  }

  return {
    search: hints.length === 0 ? question : `${question} ${hints.join(" ")}`,
    anchor,
  };
}
