import type { FC } from "react";
import dynamic from "next/dynamic";
import ScrollAnimator from "../ScrollAnimator";
import LandingPageTracker from "../LandingPageTracker";
import WNavSection from "./WNavSection";
import WHero from "./WHero";
import WHowItWorks from "./WHowItWorks";
import WTestimonials from "./WTestimonials";
import WProblemValue from "./WProblemValue";
import WArchetypes from "./WArchetypes";
import WInlineCTA from "./WInlineCTA";
import WArchetypeCards from "./WArchetypeCards";
import WAcademicBoard from "./WAcademicBoard";
import WPerfectFor from "./WPerfectFor";
import WPricing from "./WPricing";
import WGlossary from "./WGlossary";

// Bottom-of-fold sections are code-split (SSR stays on) to keep initial client
// JS small — mirrors the dark LandingPage.
const WFAQ = dynamic(() => import("./WFAQ"));
const WCTA = dynamic(() => import("./WCTA"));
const WFooterSection = dynamic(() => import("./WFooterSection"));

/**
 * White A/B variant of the landing page (Figma node 7828-9330). Served at `/`
 * to ~50% of visitors via the `__liq_lv` cookie (see shared/experiments/
 * landingVariant.ts). Reuses the same data + shared infra as the dark page; the
 * funnel CTA still points at /survey and the analytics variant is auto-stamped.
 */
const LandingPageWhite: FC = () => {
  return (
    <main id="main-content" className="relative bg-white text-gray-900">
      {/* The global body background is dark (var(--color-bg)). On the white arm
          that shows through on mobile overscroll bounce, so paint the page
          surface white for this variant only. Server-rendered → no flash, and
          absent entirely on the dark arm. */}
      <style dangerouslySetInnerHTML={{ __html: "html,body{background:#ffffff;}" }} />
      <ScrollAnimator />
      <LandingPageTracker variant="white" />
      <WNavSection />
      <WHero />
      <WHowItWorks />
      <WTestimonials />
      <WProblemValue />
      <WArchetypes />
      <WInlineCTA />
      <WArchetypeCards />
      <WAcademicBoard />
      <WPerfectFor />
      <WPricing />
      <WGlossary />
      <WFAQ />
      <WCTA />
      <WFooterSection />
    </main>
  );
};

export default LandingPageWhite;
