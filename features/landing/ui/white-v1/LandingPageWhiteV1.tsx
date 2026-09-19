import type { FC } from "react";
import dynamic from "next/dynamic";
import ScrollAnimator from "../ScrollAnimator";
import LandingPageTracker from "../LandingPageTracker";
import WNavSection from "../white/WNavSection";
import WHowItWorks from "../white/WHowItWorks";
import WTestimonials from "../white/WTestimonials";
import WProblemValue from "../white/WProblemValue";
import WArchetypes from "../white/WArchetypes";
import WInlineCTA from "../white/WInlineCTA";
import WTrustRow from "../white/WTrustRow";
import WReportPreview from "../white/WReportPreview";
import WAcademicBoard from "../white/WAcademicBoard";
import WPerfectFor from "../white/WPerfectFor";
import WGlossary from "../white/WGlossary";
import WHero from "./WHero";
import WArchetypeCards from "./WArchetypeCards";

// Bottom-of-fold sections are code-split (SSR stays on) to keep initial client
// JS small — same treatment the current arm gives them.
const WFAQ = dynamic(() => import("./WFAQ"));
const WCTA = dynamic(() => import("./WCTA"));
const WFooterSection = dynamic(() => import("../white/WFooterSection"));

/**
 * The white landing as it stood before the 2026-08-10 rebuild (Figma 7828-9330),
 * brought back as the second arm of a 50/50 A/B against the current one — see
 * shared/experiments/landingVariant.ts. Served at `/` when the `__liq_lv` cookie
 * says `white_prev`; `proxy.ts` resolves the arm and `app/page.tsx` picks the
 * component.
 *
 * WHAT LIVES HERE AND WHAT IS SHARED
 * Only the four sections the rebuild redesigned are pinned in this folder — the
 * hero, the archetype carousel, the FAQ and the closing CTA. The other eleven are
 * imported from `../white/`, because the rebuild either left them untouched or
 * only fixed them (a nav label, an aria-label), and a fix belongs in both arms.
 * The one deliberate carry-over inside a pinned file is the carousel's 24px dot
 * tap target, for the same reason.
 *
 * `ArchetypeCard` is called without a `variant`, which is its dark theme — the
 * single style it had before the rebuild split it in two, so the cards render
 * exactly as they did on this page.
 */
const LandingPageWhiteV1: FC = () => {
  return (
    <main id="main-content" className="relative bg-white text-gray-900">
      {/* The global body background is dark (var(--color-bg)); on a white landing
          that shows through on mobile overscroll bounce, so paint the page surface
          white. Server-rendered, so there is no flash. */}
      <style dangerouslySetInnerHTML={{ __html: "html,body{background:#ffffff;}" }} />
      <ScrollAnimator />
      <LandingPageTracker variant="white_prev" />
      <WNavSection />
      <WHero />
      <WHowItWorks />
      <WTestimonials />
      <WProblemValue />
      <WArchetypes />
      <WInlineCTA />
      <WArchetypeCards />
      <WTrustRow />
      <WReportPreview />
      <WAcademicBoard />
      <WPerfectFor />
      <WGlossary />
      <WFAQ />
      <WCTA />
      <WFooterSection />
    </main>
  );
};

export default LandingPageWhiteV1;
