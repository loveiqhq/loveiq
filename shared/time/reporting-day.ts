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
