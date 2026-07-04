"use client";

import type { FC } from "react";
import { useEffect } from "react";
import WNavSection from "@features/landing/ui/white/WNavSection";
import HeroSection from "./HeroSection";
import ChallengeVisionSection from "./ChallengeVisionSection";
import SolutionSection from "./SolutionSection";
import ProcessSection from "./ProcessSection";
import TeamSection from "./TeamSection";
import ContactSection from "./ContactSection";
import WFooterSection from "@features/landing/ui/white/WFooterSection";

const AboutPage: FC = () => {
  // Scroll reveal animation observer
  useEffect(() => {
    if (typeof window === "undefined") return;

    const observerOptions = {
      root: null,
      rootMargin: "0px",
      threshold: 0.1,
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    document.querySelectorAll(".reveal-on-scroll").forEach((element) => {
      observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <main id="main-content" className="relative bg-white text-gray-900">
      <style>{"html,body{background:#ffffff;}"}</style>
      <WNavSection />
      <HeroSection />
      <div className="space-y-16 md:space-y-20">
        <ChallengeVisionSection />
        <SolutionSection />
        <ProcessSection />
        <TeamSection />
        <ContactSection />
      </div>
      <WFooterSection />
    </main>
  );
};

export default AboutPage;
