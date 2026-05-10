"use client";

import { useEffect, useRef } from "react";
import { trackLandingPageView } from "@/lib/analytics";

/**
 * Fires `landing_page_view` to GA4 once per page load. Top-of-funnel signal
 * for the Tracking & Pricing CSV. The ref guards against React strict-mode
 * double-mount in dev so the count is accurate.
 */
const LandingPageTracker = () => {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    trackLandingPageView();
  }, []);

  return null;
};

export default LandingPageTracker;
