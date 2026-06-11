"use client";

import { useEffect, useRef } from "react";
import {
  setLandingVariant,
  trackExperimentExposure,
  trackLandingPageView,
} from "@features/analytics/client";
import {
  LANDING_VARIANT_EXPERIMENT,
  type LandingVariant,
} from "@shared/experiments/landingVariant";

/**
 * Fires `landing_page_view` to GA4 once per page load (top-of-funnel signal for
 * the Tracking & Pricing CSV) and registers the white-landing A/B arm:
 *   - `setLandingVariant` → GA4 user property so every event is segmentable.
 *   - `trackExperimentExposure` → canonical `experiment_exposure` event for the
 *     `landing-white-ab` experiment (GA4-only at landing time — no submission yet).
 *
 * Both the dark (`control`) and white (`white`) orchestrators render this with
 * their variant. The ref guards against React strict-mode double-mount in dev
 * so the counts stay accurate.
 */
const LandingPageTracker = ({ variant = "control" }: { variant?: LandingVariant }) => {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
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
