/**
 * The calendar day a metric belongs to, in the timezone the business reports in.
 *
 * Why this exists: on 2026-08-28 a comparison of GA4 against our own visitor
 * counter produced ratios of 20%, 45%, 74%, 89% and **135%** across five
 * consecutive days. 135% is impossible — our counter is written server-side and is
 * consent-independent, so it is a strict superset of anything GA4 can see. The
 * cause was not measurement loss but day boundaries: the GA4 property reports in
 * `Europe/Berlin` (checked via the Admin API) while `funnel_event.day` was
 * `new Date().toISOString().slice(0, 10)`, i.e. UTC. In August that is a two-hour
 * offset, so every visit between 22:00 and 24:00 UTC was filed a day earlier than
 * GA4 filed it, and any day-by-day comparison was meaningless.
 *
 * Berlin rather than UTC because that is what GA4 already uses and what the
 * company actually thinks in — a German entity billing in EUR.
 *
 * Intl, not a fixed offset: Berlin is UTC+1 in winter and UTC+2 in summer, so
 * arithmetic would be wrong for half the year and subtly wrong on the two
 * changeover nights. `formatToParts` rather than a locale that happens to emit
 * ISO order, so the output does not depend on locale data.
 */
export const REPORTING_TIME_ZONE = "Europe/Berlin";

export function reportingDay(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORTING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  const [year, month, day] = [get("year"), get("month"), get("day")];

  // If the runtime ships without full ICU, `timeZone` is ignored rather than
  // throwing, and the parts come back as UTC. Falling back explicitly keeps the
  // shape valid (callers write it to a DATE column) instead of emitting
  // "undefined-undefined-undefined".
  if (!year || !month || !day) return now.toISOString().slice(0, 10);

  return `${year}-${month}-${day}`;
}

/**
 * The hour of day (0-23) in the reporting timezone.
 *
 * For "post this once a day, at a time the team is awake". `getUTCHours()` looks
 * equivalent and is not: Berlin is UTC+1 in winter and UTC+2 in summer, so a
 * fixed UTC hour drifts by one across the changeover — a 09:00 digest quietly
 * becomes an 08:00 digest at the end of October. Pair it with `reportingDay()`
 * so the "once per day" claim and the hour agree about which day it is.
 */
export function reportingHour(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORTING_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const hour = parts.find((p) => p.type === "hour")?.value;
  // Same ICU-less fallback as reportingDay: a wrong-but-valid hour beats NaN.
  return hour === undefined ? now.getUTCHours() : Number(hour);
}

/**
 * The instant a reporting day begins, as a UTC `Date`.
 *
 * `new Date("2026-09-14T00:00:00Z")` is 02:00 in Berlin, not midnight, so a
 * window built that way clips two hours off one end of the day and adds two to
 * the other. The offset cannot be hardcoded either: Berlin is UTC+1 for part of
 * the year and UTC+2 for the rest.
 *
 * So: guess UTC midnight, ask the zone what local time that instant actually
 * is, and shift by the difference.
 *
 * One pass is enough. A second pass re-evaluating the offset at the corrected
 * instant was written for the DST changeover days and then measured: across
 * every day from 2024 to 2030 it never once returned a different answer, so it
 * was deleted rather than kept as a branch no test could reach. Berlin's
 * transitions happen at 02:00/03:00 local, never close enough to midnight to
 * make the guess land on the far side of one.
 */
export function reportingDayStart(day: string): Date {
  const guess = new Date(`${day}T00:00:00Z`);
  return new Date(guess.getTime() - zoneOffsetMs(guess));
}

/** How far ahead of UTC the reporting zone is, at a given instant. */
function zoneOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORTING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    // h23, never hour12:false — with en-US the latter reports midnight as hour
    // 24, and which you get depends on the ICU build the runtime shipped with.
    hourCycle: "h23",
  }).formatToParts(at);

  const n = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);

  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  // Without full ICU the zone is ignored and the parts come back as UTC, which
  // yields 0 — the same answer as "no offset", so the caller degrades to UTC
  // rather than producing a nonsense instant.
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}
