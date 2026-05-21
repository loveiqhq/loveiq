import type { FC } from "react";
import dynamic from "next/dynamic";
import ScrollAnimator from "./ScrollAnimator";
import LandingPageTracker from "./LandingPageTracker";
import NavSection from "./NavSection";
import S01Hero from "./S01Hero";
import S02HowItWorks from "./S02HowItWorks";
import S03PerfectFor from "./S03PerfectFor";
import S05ValueFeatures from "./S05ValueFeatures";
import S06Archetypes from "./S06Archetypes";
import S07Language from "./S07Language";
import S07SampleProfile from "./S07SampleProfile";
import S08AcademicBoard from "./S08AcademicBoard";
import S09Report from "./S09Report";
import S10Pillars from "./S10Pillars";
import S12WhyWeCreated from "./S12WhyWeCreated";
import S15Testimonials from "./S15Testimonials";

// Bottom-of-fold sections are code-split via next/dynamic to reduce the
// initial client JS for the landing route. SSR stays on (default behavior
// in App Router server components) so SEO and first paint are unchanged —
// only the client hydration chunks for these three sections move off the
// critical path.
const S13FAQ = dynamic(() => import("./S13FAQ"));
const S14CTA = dynamic(() => import("./S14CTA"));
const FooterSection = dynamic(() => import("./FooterSection"));

const LandingPage: FC = () => {
  return (
    <main id="main-content" className="relative bg-page text-text-primary">
      <ScrollAnimator />
      <LandingPageTracker />
      <NavSection />
      <S01Hero />
      <S05ValueFeatures />
      <S15Testimonials />
      <S12WhyWeCreated />
      <S06Archetypes />
      <S10Pillars />
      <div id="about">
        <S02HowItWorks />
      </div>
      <div id="glossary">
        <S07Language />
      </div>
      <S09Report />
      <S03PerfectFor />
      <S08AcademicBoard />
      <S07SampleProfile />
      <S13FAQ />
      <S14CTA />
      <FooterSection />
    </main>
  );
};

export default LandingPage;
