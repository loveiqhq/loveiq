/**
 * Landing-page variant.
 *
 * ROUND 1 (concluded 2026-06-19): dark landing ("control") vs the white redesign
 * ("white"), 50/50. White won on visitor->survey (~7.9% vs ~4.9%), the dark
 * landing was retired and white served 100% of traffic. `"control"` is retained
 * below because historical analytics / Stripe metadata rows still carry it; no
 * new traffic is ever tagged with it.
 *
 * ROUND 2 (2026-08-21 to 2026-09-19): the white landing rebuilt to the "Landing E"
 * frame on 2026-08-10 (question 1 in the hero, new hero, trust strip, find-out
 * block, sticky CTA) against the white landing that preceded it:
 *   - `"white"`      — the rebuild, "Landing Page V2", features/landing/ui/white/
 *   - `"white_prev"` — the one before it, "V1", features/landing/ui/white-v1/
 * Settled on V2 (see proxy.ts). Both values stay valid because stored rows carry
 * them; neither is assigned to a visitor any more.
 *
 * ROUND 3 (from LANDING_HERO_VIDEO_LAUNCH_DAY): the V2 page with two different
 * heroes, 50/50 (decided at the 2026-10-06 sync; Figma Report-3.0 `1503:1341`):
 *   - `"white_card"`  — arm A, question 1 in the hero: V2 exactly as it was
 *   - `"white_video"` — arm B, the presenter video in that slot instead (V3)
 * New values rather than `"white"` for arm A. Every visitor since 2026-09-19 holds
 * a one-year `white` cookie and a live arm's cookie is sticky, so reusing `white`
 * would have kept every returning visitor in arm A and only new visitors could
 * reach B. New values re-roll those cookies, and keep round 2's rows from pooling
 * into round 3's (Pricing 3.0 took new letters, A3/B3, for the same reason).
 * Its readouts restarted on LANDING_HERO_RESTART_DAY, when the phone hero was condensed so
 * the slot is on the first screen and the page took the 12.10 copy (both arms, same arms
 * and cookies). Closed at the 2026-11-10 sync: the video stays (registry #6 ends on
 * LANDING_HERO_LAST_DAY).
 *
 * ROUND 4 (from the 2026-11-16 release; Marcus, #all-loveiq 2026-11-12, "it will replace
 * the version without the video and run against the current video version 50/50"):
 *   - `"video"`      — arm A, the control: round 3's video page exactly (V3)
 *   - `"pain_point"` — arm B, Marcus's new page (Claude Design "LoveIQ landing page ·
 *     pain-point version", board Hero 3; features/landing/ui/painpoint/)
 * Two new values again, for round 3's reason: a live arm's cookie is sticky, so keeping
 * `white_video` live would have parked every returning round-3 video visitor in arm A.
 * New values re-roll every round-3 cookie and keep round 3's rows apart from round 4's.
 * Crawlers now get `white_video` (the video page, no longer an arm): the card page is
 * nobody's page any more, and the index should show what half of all visitors see.
 * A against B ran from LANDING_PAIN_POINT_START_DAY to LANDING_PAIN_POINT_LAST_DAY.
 *
 * ROUND 4, VERSION C (LoveIQ Sync 2026-11-24): B's hero question, "Right now, I feel
 * satisfied with my sex life." (Q01002), loses more people than any other, so Mark and
 * Marcus swapped it for Q10003, "I'm comfortable expressing what turns me on." (almost no
 * drop-off, a short median time; Mark's DM of the same morning names the id). It is asked
 * where B asks its question, and the privacy line moves under the film (Marcus, 24 Nov). It
 * runs as a new version rather than a change to B, so B's numbers stay as they were (Mark):
 *   - `"video"`        — arm A, the control, unchanged
 *   - `"pain_point_c"` — arm C, the pain-point page asking Q10003, privacy line under the film
 * `"pain_point"` (B) is paused: never assigned any more, its cookie re-rolled like an
 * earlier round's, and still rendered for `?variant=pain_point`. The experiment id stays
 * the same, as A does. C's readouts start at LANDING_TEST_START_DAY.
 *
 * The variant flows through the funnel for attribution:
 *   - `LandingPageTracker` sets it as a GA4 user property and PostHog
 *     super-property, and fires `experiment_exposure` for LANDING_VARIANT_EXPERIMENT.
 *   - `persistAnalyticsEvent` (features/analytics/client.ts) auto-stamps
 *     `landing_variant` (read from this cookie) onto every durable event.
 *   - `/api/survey` and `/api/survey-partial` read the cookie server-side and pack
 *     it into the `utm_tracker` JSON (shared/experiments/stampArm.ts) — the source
 *     of truth the readouts group by; `funnel_event.landing_variant` gets it too.
 *   - `/api/stripe/checkout-session` stamps it into Stripe session metadata.
 */

const isProduction = process.env.NODE_ENV === "production";

export type LandingVariant =
  | "control"
  | "white"
  | "white_prev"
  | "white_card"
  | "white_video"
  | "video"
  | "pain_point"
  | "pain_point_c";

/**
 * Bumped every round so GA4 and PostHog keep the tests apart: `landing-white-ab` is
 * round 1 (dark vs white), `landing-white-rebuild-ab` round 2 (V2 vs V1),
 * `landing-hero-video-ab` round 3 (question card vs video), `landing-pain-point-ab`
 * round 4 (video page vs the new pain-point page).
 */
export const LANDING_VARIANT_EXPERIMENT = "landing-pain-point-ab";

/**
 * The day round 3 started assigning arms on production (Berlin day). Its readouts
 * start here: the axis trend and the conversion digest cut the landing comparison at
 * this day, so a window that reaches back before it is never read as days of a test
 * that was not running. Staging ran it from 2026-10-06. If the release lands on a
 * later day than this, move it to that day: a day too early only shows as an empty
 * first day, but a day too late would drop real data from the readouts.
 */
export const LANDING_HERO_VIDEO_LAUNCH_DAY = "2026-10-07";

/**
 * Round 3's restart, registry #6's first day: the first whole Berlin day after the phone hero
 * was condensed (PR #573, live 2026-10-13 19:05 Berlin; Figma Report-3.0 `1604:5505`). The
 * readouts that show round 3 count its second run from here.
 */
export const LANDING_HERO_RESTART_DAY = "2026-10-14";

/**
 * Round 3's last day in the registry (#6 runs 2026-10-14 to 2026-11-11). The 2026-11-10 sync
 * kept the video; its arms were still served until round 4's release, outside any test.
 */
export const LANDING_HERO_LAST_DAY = "2026-11-11";

/**
 * Round 4's first whole (Berlin) reporting day, registry #10's start: the video page (A)
 * against the pain-point page (B), released on Tue 2026-11-17.
 */
export const LANDING_PAIN_POINT_START_DAY = "2026-11-18";

/**
 * B's last day in the readouts: the day before version C's first whole day. B is paused
 * there, so A against B is read from LANDING_PAIN_POINT_START_DAY to this day, and never
 * moves again. Move it with LANDING_TEST_START_DAY if C's release slips.
 */
export const LANDING_PAIN_POINT_LAST_DAY = "2026-11-24";

/**
 * The first whole (Berlin) reporting day of the CURRENT landing comparison, where its
 * readouts start: version C (the pain-point page asking Q10003) against the
 * video page. A against B kept its own days (LANDING_PAIN_POINT_START_DAY to
 * LANDING_PAIN_POINT_LAST_DAY); round 3's restart is LANDING_HERO_RESTART_DAY.
 * The axis trend and the conversion digest's landing blocks and verdict start here, and
 * the /admin readout at LANDING_TEST_START_AT. The brain's experiments tool reads a test
 * from its registry entry's own start date. Set for a production deploy on Tue 2026-11-24:
 * if the release reaches production later, move this to the first whole day after its
 * deploy, with the moment below and LANDING_PAIN_POINT_LAST_DAY.
 */
export const LANDING_TEST_START_DAY = "2026-11-25";

/**
 * The /admin readout's cut: the start of LANDING_TEST_START_DAY in Berlin (CET, UTC+1, in
 * November). Not the deploy's own moment, which is not known when this is written: a cut a
 * few hours late loses a few hours of readers, a cut too early would count B's.
 */
export const LANDING_TEST_START_AT = "2026-11-24T23:00:00Z";

/**
 * Sticky assignment cookie. `__Host-` prefix in production (requires Secure +
 * Path=/ + no Domain — all satisfied below). Plain name in dev so it works over
 * http://localhost. Mirrors the CSRF / visitor-id cookie naming in `proxy.ts`.
 */
export const LANDING_VARIANT_COOKIE = isProduction ? "__Host-liq_lv" : "__liq_lv";

/**
 * Request header `proxy.ts` sets so `app/page.tsx` renders the correct arm on
 * the same request that mints the cookie (see module doc above).
 */
export const LANDING_VARIANT_HEADER = "x-landing-variant";

/** Type guard for a raw cookie/header/string value. */
export function isLandingVariant(value: string | null | undefined): value is LandingVariant {
  return (
    value === "control" ||
    value === "white" ||
    value === "white_prev" ||
    value === "white_card" ||
    value === "white_video" ||
    value === "video" ||
    value === "pain_point" ||
    value === "pain_point_c"
  );
}

/**
 * The two arms currently in the test, in reading order (A, then C). `pain_point` (B, paused
 * on 2026-11-24), `control`, `white`, `white_prev`, `white_card` and `white_video` are
 * history: valid on stored rows and for `?variant=`, never assigned.
 */
export const LANDING_VARIANT_ARMS = [
  "video",
  "pain_point_c",
] as const satisfies readonly LandingVariant[];

export type LiveLandingArm = (typeof LANDING_VARIANT_ARMS)[number];

/** True only for an arm the current test assigns — not for a valid but retired value. */
export function isLiveLandingArm(value: string | null | undefined): value is LiveLandingArm {
  return value === "video" || value === "pain_point_c";
}

/**
 * Normalize any raw value to a variant. Defaults to `"white"`: it renders the question-card
 * page, and it is NOT a live arm, so an absent or unrecognised value is never credited to
 * either side of the test. Defaulting to a live arm would hand every buyer without a cookie
 * (checkout-session's Stripe metadata) to that arm.
 */
export function normalizeLandingVariant(value: string | null | undefined): LandingVariant {
  return isLandingVariant(value) ? value : "white";
}
