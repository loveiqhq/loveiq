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
import PStats from "./PStats";
import WArchetypeCards from "../white/WArchetypeCards";
import WTestimonials from "../white/WTestimonials";
import WFoundation from "../white/WFoundation";
import PFaq from "./PFaq";
import { PP_REUSED_H2, PP_REUSED_SHELL, PP_TYPE } from "./ppStyles";

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
    // gray-900 text, as on the video page, for the live sections reused here; the page's
    // own sections take the board's root type (PP_TYPE).
    <main id="main-content" className="pp-root relative bg-white text-gray-900">
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
        <div className={PP_TYPE}>
          <PHero />
          <PTrustBand />
          <PHowItWorks />
          <PPainPoints />
          <PPromise />
          <PWords />
          <PStats />
        </div>
        {/* The live sections at the board's scale: its headings (46px from lg, 32px on a
            phone), its section padding and container, and its review row inset. Their insides
            stay the live ones, so the gliding rows and the phone cards are today's. */}
        <WArchetypeCards
          sectionClassName="overflow-hidden bg-white py-24"
          headingClassName={PP_REUSED_H2}
        />
        <WTestimonials
          sectionClassName="overflow-hidden bg-white py-24"
          shellClassName={PP_REUSED_SHELL}
          rowClassName="pb-6 pl-0 pr-[29px] pt-2"
        />
        <WFoundation
          sectionClassName="bg-white py-[84px]"
          shellClassName={PP_REUSED_SHELL}
          headingClassName={`animate-on-scroll stagger-1 ${PP_REUSED_H2} [text-wrap:balance]`}
        />
        <div className={PP_TYPE}>
          <PFaq />
        </div>
      </div>
    </main>
  );
};

export default LandingPagePainPoint;
