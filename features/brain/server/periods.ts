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
export function expandRelativePeriods(question: string, now = new Date()): string {
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
  const add = (...parts: string[]) => {
    for (const p of parts) if (p && !hints.includes(p)) hints.push(p);
  };

  // Order matters: "last month" contains "month", so the more specific
  // expressions are tested first and each match is independent.
  if (/\b(this|current) month\b|\bmonth to date\b|\bso far this month\b|\bmtd\b/.test(q)) {
    add(longMonth(monthKey(0)));
  }
  if (/\b(last|previous|prior) month\b/.test(q)) {
    add(longMonth(monthKey(-1)));
  }
  if (/\b(this|current) week\b|\bweek to date\b/.test(q)) {
    add(isoWeek(iso(day(0))));
  }
  if (/\b(last|previous|prior) week\b/.test(q)) {
    add(isoWeek(iso(day(-7))));
  }
  if (/\byesterday\b/.test(q)) {
    add(longDate(iso(day(-1))), iso(day(-1)));
  }
  if (/\btoday\b/.test(q)) {
    add(longDate(iso(day(0))), iso(day(0)));
  }
  if (/\b(this|current) year\b/.test(q)) {
    add(String(now.getUTCFullYear()));
  }
  if (/\b(last|previous|prior) year\b/.test(q)) {
    add(String(now.getUTCFullYear() - 1));
  }
  // "right now" / "at the moment" are asking for the latest period we hold.
  if (/\bright now\b|\bat the moment\b|\bcurrently\b|\blatest\b/.test(q)) {
    add(longMonth(monthKey(0)));
  }

  return hints.length === 0 ? question : `${question} ${hints.join(" ")}`;
}
