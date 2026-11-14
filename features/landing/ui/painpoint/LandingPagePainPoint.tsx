import type { FC } from "react";
import type { LandingVariant } from "@shared/experiments/landingVariant";
import ScrollAnimator from "../ScrollAnimator";
import LandingPageTracker from "../LandingPageTracker";
import LandingSectionsSeen from "../LandingSectionsSeen";
import WNavSection from "../white/WNavSection";
import PHero from "./PHero";
import PTrustBand from "./PTrustBand";
import PHowItWorks from "./PHowItWorks";
import PPainPoints from "./PPainPoints";
import PPromise from "./PPromise";
import PWords from "./PWords";

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
    // The board's root: 16px Manrope on a 25.6px line, which every line without its own
    // height inherits (the hero's button and scale labels among them).
    <main
      id="main-content"
      className="pp-root relative bg-white text-[16px] leading-[25.6px] text-[#161021]"
    >
      {/* The global body background is dark (var(--color-bg)); paint the page white so
          mobile overscroll never shows it. Server-rendered, so no flash. */}
      <style dangerouslySetInnerHTML={{ __html: "html,body{background:#ffffff;}" }} />
      <ScrollAnimator />
      <LandingPageTracker variant={variant} />
      <LandingSectionsSeen />
      <WNavSection
        appearance="painpoint"
        shellClassName="mx-auto w-[calc(100%-32px)] max-w-[1200px] lg:w-[calc(100%-48px)]"
      />
      {/* The bar is fixed, 64px plus its 1px rule: the page starts under it. */}
      <div className="pt-[65px]">
        <PHero />
        <PTrustBand />
        <PHowItWorks />
        <PPainPoints />
        <PPromise />
        <PWords />
      </div>
    </main>
  );
};

export default LandingPagePainPoint;
