import type { FC } from "react";
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
import S13FAQ from "./S13FAQ";
import S14CTA from "./S14CTA";
import FooterSection from "./FooterSection";

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
