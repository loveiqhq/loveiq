import type { FC } from "react";
import type { LandingVariant } from "@shared/experiments/landingVariant";
import ScrollAnimator from "../ScrollAnimator";
import LandingPageTracker from "../LandingPageTracker";
import LandingSectionsSeen from "../LandingSectionsSeen";
import WNavSection from "../white/WNavSection";

/**
 * Round 4's arm B (`pain_point`): Marcus's new landing page, "LoveIQ landing page ·
 * pain-point version" (Claude Design, final boards "Desktop · Hero 3" at 1440 and
 * "Mobile · Hero 3" at 390, reviewed by Hana). It runs 50/50 against the video page
 * (`video`, features/landing/ui/white/LandingPageWhite.tsx); see
 * shared/experiments/landingVariant.ts.
 *
 * Its sections live in this folder. Where the design reuses a live section (archetypes,
 * reviews, research) it renders the live component with the design's sizes, so a fix
 * there reaches both arms.
 */
const LandingPagePainPoint: FC<{ variant: LandingVariant }> = ({ variant }) => {
  return (
    <main id="main-content" className="pp-root relative bg-white text-[#161021]">
      {/* The global body background is dark (var(--color-bg)); paint the page white so
          mobile overscroll never shows it. Server-rendered, so no flash. */}
      <style dangerouslySetInnerHTML={{ __html: "html,body{background:#ffffff;}" }} />
      <ScrollAnimator />
      <LandingPageTracker variant={variant} />
      <LandingSectionsSeen />
      <WNavSection />
    </main>
  );
};

export default LandingPagePainPoint;
