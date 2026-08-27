import posthog from "posthog-js";
import { isProductionSite } from "@shared/env/is-non-prod-deploy";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

/**
 * Which environment produced the event: "production" | "staging" | "development".
 *
 * Production is delegated to `isProductionSite()` so the two gates can never
 * disagree about what production is — that helper is also what decides whether GA4
 * / Google Ads / Clarity load at all. Only the staging-vs-laptop split is local,
 * because that helper answers one bit and this needs three values.
 */
function resolveDeployEnv(): "production" | "staging" | "development" {
  if (isProductionSite()) return "production";
  if (process.env.NODE_ENV !== "production") return "development";
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").toLowerCase();
  if (siteUrl.includes("staging.") || siteUrl.includes(".vercel.app")) return "staging";
  return "development";
}

if (!projectToken || !host) {
  if (process.env.NODE_ENV !== "production") {
    const missingVariable = !projectToken
      ? "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN"
      : "NEXT_PUBLIC_POSTHOG_HOST";
    console.error(
      `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`
    );
  }
} else {
  posthog.init(projectToken, {
    api_host: host,
    defaults: "2026-01-30",
    capture_exceptions: true,
    debug: process.env.NODE_ENV === "development",
    /**
     * Do not ship the surveys bundle. PostHog loads `surveys.js` (26 KiB, measured in
     * a PageSpeed run on 2026-08-28 as part of 560 KiB of unused JavaScript on the
     * landing page) whether or not the product is in use — and it is not:
     * `surveys_opt_in` and `survey_config` are both null on project 244778, and the
     * only survey this company runs is its own, at /survey. Nothing to render, so
     * nothing to download.
     *
     * Safe to flip back by deleting this line if PostHog Surveys is ever adopted.
     */
    disable_surveys: true,
    /**
     * `deploy_env` as a super property, so it rides on every subsequent event.
     *
     * PostHog stays switched ON off production — unlike GA4 / Google Ads / Clarity,
     * which app/layout.tsx now refuses to load there — because it is the tool used
     * to debug staging and local dev, and turning it off would remove the only
     * replay and error trail those environments have. So the traffic is labelled
     * rather than excluded, and "deploy_env = production" is one filter away.
     * Measured before this: 35,671 production events against 66 from localhost:3000
     * over 30 days and nothing at all from staging — labelling, not a big cleanup.
     *
     * Registered in `loaded` rather than after `init()` on purpose. posthog-js runs
     * this callback and THEN captures the session's first `$pageview`, so doing it
     * here is what stops that first event — the one every session has — from being
     * the single event with no environment on it.
     *
     * Super properties attach to events, not to the person record: filtering
     * PERSONS by environment is not what this gives you.
     */
    loaded: (ph) => ph.register({ deploy_env: resolveDeployEnv() }),
  });
}
