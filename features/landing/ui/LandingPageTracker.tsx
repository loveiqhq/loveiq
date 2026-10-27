"use client";

import { useEffect, useRef } from "react";
import {
  consumeLeftInitialGate,
  setLandingVariant,
  trackExperimentExposure,
  trackLandingPageView,
} from "@features/analytics/client";
import {
  LANDING_VARIANT_EXPERIMENT,
  type LandingVariant,
} from "@shared/experiments/landingVariant";

/**
 * Fires `landing_page_view` once per page load (top-of-funnel signal for the
 * Tracking & Pricing CSV) and registers the landing A/B arm:
 *   - `setLandingVariant` → PostHog super-property and GA4 user property, so every
 *     later event (the hero video's included) is split by arm without saying so.
 *   - `trackExperimentExposure` → canonical `experiment_exposure` event for
 *     LANDING_VARIANT_EXPERIMENT (no submission exists yet at landing time).
 *
 * Every landing renders this with the arm it was served: `white_card` /
 * `white_video` in the current test, `white` for crawlers and visitors outside it,
 * `white_prev` for round 2's V1. Required, so no landing can register a default
 * arm it was not served. The ref guards against React strict-mode double-mount in
 * dev so the counts stay accurate. A reader the EUR 1.99 gate sent back here is neither.
 */
const LandingPageTracker = ({ variant }: { variant: LandingVariant }) => {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    // Sent here by the EUR 1.99 gate's "Not ready to unlock yet": a reader who finished the
    // survey is not a landing visit, and takes no arm.
    if (consumeLeftInitialGate()) return;
    trackLandingPageView();
    setLandingVariant(variant);
    trackExperimentExposure({
      experiment: LANDING_VARIANT_EXPERIMENT,
      variant,
      surface: "landing",
    });
  }, [variant]);

  return null;
};

export default LandingPageTracker;
