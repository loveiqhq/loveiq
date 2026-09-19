import type { FC } from "react";
import dynamic from "next/dynamic";
import ScrollAnimator from "../ScrollAnimator";
import LandingPageTracker from "../LandingPageTracker";
import WNavSection from "./WNavSection";
import WHero from "./WHero";
import WTrustStrip from "./WTrustStrip";
import WDiscover from "./WDiscover";
import WVocab from "./WVocab";
import WFindOut from "./WFindOut";
import WWowStats from "./WWowStats";
import WResultTeaser from "./WResultTeaser";
import WArchetypeCards from "./WArchetypeCards";
import WTestimonials from "./WTestimonials";
import WFoundation from "./WFoundation";

// Bottom-of-fold sections are code-split (SSR stays on) to keep initial client
// JS small.
const WFAQ = dynamic(() => import("./WFAQ"));
const WCTA = dynamic(() => import("./WCTA"));
const WFooterSection = dynamic(() => import("./WFooterSection"));
const WStickyBar = dynamic(() => import("./WStickyBar"));

/**
 * The live landing page (Figma node 8947-7360, "Landing E — workshop build").
 * Served at `/` to 100% of visitors — the dark A/B arm was retired 2026-06-19.
 *
 * Section order mirrors the Figma frame top to bottom. Sections the mock marks
 * "(live)" — nav, archetypes, field reports, FAQ, footer — are the existing
 * components, reused unchanged.
 */
const LandingPageWhite: FC = () => {
  return (
    <main id="main-content" className="relative bg-white text-gray-900">
      {/* The global body background is dark (var(--color-bg)). That shows
          through on mobile overscroll bounce, so paint the page surface white.
          Server-rendered → no flash. */}
      <style dangerouslySetInnerHTML={{ __html: "html,body{background:#ffffff;}" }} />
      <ScrollAnimator />
      <LandingPageTracker variant="white" />
      <WNavSection />
      <WHero />
      <WTrustStrip />
      <WDiscover />
      <WVocab />
      <WFindOut />
      <WWowStats />
      <WResultTeaser />
      <WArchetypeCards />
      <WTestimonials />
      <WFoundation />
      {/* Email-capture band ("Not in the mood right now?") is parked, not
          deleted — the component, POST /api/test-link and its tests all still
          work. Re-import WCapBand and drop it back here to switch it on. */}
      <WFAQ />
      <WCTA />
      <WFooterSection />
      {/* Keeps the last row of the footer clear of the sticky bar. */}
      <div aria-hidden className="h-[68px]" />
      <WStickyBar />
    </main>
  );
};

export default LandingPageWhite;
