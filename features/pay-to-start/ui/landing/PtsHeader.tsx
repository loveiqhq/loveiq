"use client";

import type { FC } from "react";
import WNavSection, { type WNavItem } from "@features/landing/ui/white/WNavSection";
import { trackPtsNavClick, type PtsNavTarget } from "../analytics";

const TARGETS: Record<WNavItem, PtsNavTarget> = {
  logo: "logo",
  home: "home",
  about: "about",
  glossary: "glossary",
  trust_center: "trust_center",
  cta: "price",
};

/**
 * The LoveIQ site's own header (WNavSection): its logo, Home · About us · Glossary · Trust
 * Center, and "Start test now". Marcus, 18.10: the LoveIQ logo in place of Facets "for now
 * and until we are ready with the new brand", and the site's header sections, which the
 * Figma frames left out.
 *
 * Its button scrolls to the price (`#price`, PtsOnePrice) instead of starting the free
 * survey (Fatih, 19.10), and a press is counted as `pts_nav_click`, never as the landing
 * test's `cta_click`. The bar spans the page's own grid, so the logo lines up with the
 * breadcrumb and the hero.
 */
export const PtsHeader: FC = () => (
  <WNavSection
    cta={{ href: "#price" }}
    onNavigate={(item, place) => trackPtsNavClick({ target: TARGETS[item], place })}
    shellClassName="mx-auto w-full max-w-[1288px] px-4 sm:px-6"
  />
);
