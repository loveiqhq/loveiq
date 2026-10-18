import type { FC } from "react";
import ScrollAnimator from "@features/landing/ui/ScrollAnimator";
import { formatOfferPrice, type PayToStartOfferId } from "@features/pay-to-start/logic/offer";
import { PtsCheckoutProvider } from "./PtsCheckout";
import { PtsBreadcrumb } from "./PtsBreadcrumb";
import { PtsFaq, PtsFinalCta, PtsFooter } from "./PtsClosing";
import { PtsHeader } from "./PtsHeader";
import { PtsHero } from "./PtsHero";
import { PtsNotice } from "./PtsNotice";
import { PtsOnePrice, PtsPriceCard } from "./PtsPricing";
import {
  PtsFindOut,
  PtsHowItWorks,
  PtsInsideReport,
  PtsPersonalities,
  PtsResearch,
  PtsTestimonials,
} from "./PtsSections";
import { PtsStickyBar } from "./PtsStickyBar";

/**
 * The assessment page a visitor pays on before the survey (Figma Report-3.0 "Pay to start >
 * Full Payments", desktop 1706:1699, phone 1706:2034), under the LoveIQ site's own header
 * (PtsHeader, Marcus 18.10) and with its own footer. No button on it starts the free survey;
 * the header's links lead to the site's pages, where one does.
 *
 * From 1280 wide it is Figma's desktop: an 850 column and the 342 price card beside it,
 * which stays in view. Narrower, the column stands alone (850 at most) and the price is
 * pinned to the bottom, as on the phone. The tablet widths between are extrapolated.
 *
 * The header is fixed and 64 tall: the page starts below it, and the card stays 24 under it.
 *
 * Its content flies in as the landing's does (Marcus, 18.10): ScrollAnimator reveals each
 * `.animate-on-scroll` once it is in view, and `pts-page` scopes this page's reduced-motion
 * rule (app/globals.css).
 *
 * `priceCents` is the server's price (PAY_TO_START_PRICE_CENTS); every price on the page
 * is printed from it.
 */
export const PayToStartLanding: FC<{ offer: PayToStartOfferId; priceCents: number }> = ({
  offer,
  priceCents,
}) => {
  const price = formatOfferPrice(priceCents);
  return (
    <PtsCheckoutProvider offer={offer} priceCents={priceCents} price={price}>
      <div className="pts-page min-h-screen bg-white pt-16 font-sans text-[#161021]">
        <ScrollAnimator />
        {/* The global body is dark (var(--color-bg)) and shows through an overscroll
            bounce, so the page paints it white, as the landing does: as a plain text
            child, since CI's security check allows raw HTML injection in named files only. */}
        <style>{"html,body{background:#ffffff;}"}</style>
        <PtsHeader />
        <main id="main-content" className="mx-auto w-full max-w-[1288px] px-4 pb-24 sm:px-6">
          <PtsBreadcrumb />
          <PtsNotice />
          <div className="xl:flex xl:items-start xl:gap-12">
            <div className="mx-auto w-full max-w-[850px] xl:mx-0 xl:min-w-0 xl:flex-1">
              <PtsHero />
              <PtsFindOut />
              <PtsInsideReport price={price} />
              <PtsPersonalities />
              <PtsHowItWorks price={price} />
              <PtsTestimonials />
              <PtsResearch />
              <PtsOnePrice price={price} />
              <PtsFaq />
            </div>
            <aside
              aria-label="Price"
              className="hidden xl:sticky xl:top-[88px] xl:block xl:w-[342px] xl:shrink-0"
            >
              <PtsPriceCard price={price} />
            </aside>
          </div>
          <PtsFinalCta price={price} />
        </main>
        <PtsFooter />
        <PtsStickyBar />
      </div>
    </PtsCheckoutProvider>
  );
};
