import type { FC } from "react";
import ScrollAnimator from "@features/landing/ui/ScrollAnimator";
import { formatOfferPrice, type PayToStartOfferId } from "@features/pay-to-start/logic/offer";
import { PtsCheckoutProvider } from "./PtsCheckout";
import { PtsBreadcrumb } from "./PtsBreadcrumb";
import { PtsFaq, PtsFinalCta, PtsFooter } from "./PtsClosing";
import { PtsHeader } from "./PtsHeader";
import { PtsHero } from "./PtsHero";
import { PtsNotice } from "./PtsNotice";
import { PTS_OFFER_COPY } from "./payToStartContent";
import { PtsOnePrice, PtsPriceCard } from "./PtsPricing";
import "./payToStart.css";
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
 * Full Payments", desktop 1706:1699, phone 1706:2034; the initial report's "Pre-Payments",
 * 1733:4089 and 1733:4424), under the LoveIQ site's own header (PtsHeader, Marcus 18.10) and
 * with its own footer. No button on it starts the free survey; the header's links lead to
 * the site's pages, where one does. Where the two offers' pages differ, the words are the
 * offer's (PTS_OFFER_COPY).
 *
 * From 1280 wide it is Figma's desktop: an 850 column and the 342 price card beside it,
 * which stays in view. Narrower, the column stands alone (850 at most) and the price is
 * pinned to the bottom, as on the phone. The tablet widths between are extrapolated. The
 * initial report's page has no "One price" band: below 1280 its card sits in the column,
 * under the film, as its phone frame draws it.
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
  const copy = PTS_OFFER_COPY[offer];
  const card = <PtsPriceCard price={price} copy={copy.priceCard} />;
  const sections = (
    <>
      <PtsFindOut />
      <PtsInsideReport lead={copy.insideLead(price)} />
      <PtsPersonalities />
      <PtsHowItWorks price={price} steps={copy.steps} />
      <PtsTestimonials />
      <PtsResearch />
      {copy.onePrice && <PtsOnePrice price={price} />}
      <PtsFaq items={copy.faqItems} />
    </>
  );
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
          {copy.onePrice ? (
            <div className="xl:flex xl:items-start xl:gap-12">
              <div className="mx-auto w-full max-w-[850px] xl:mx-0 xl:min-w-0 xl:flex-1">
                <PtsHero />
                {sections}
              </div>
              <aside
                aria-label="Price"
                className="hidden xl:sticky xl:top-[88px] xl:block xl:w-[342px] xl:shrink-0"
              >
                {card}
              </aside>
            </div>
          ) : (
            // One card at every width, so the header's `#price` always finds it: under the
            // film in the column below 1280, beside the column from 1280, where it spans the
            // hero's row and the sections' and stays in view as they scroll.
            <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_342px] xl:items-start xl:gap-x-12">
              <div className="mx-auto w-full max-w-[850px] xl:col-start-1 xl:mx-0 xl:[grid-row:1]">
                <PtsHero />
              </div>
              <aside
                id="price"
                aria-label="Price"
                className="mx-auto mt-5 w-full max-w-[420px] scroll-mt-20 xl:sticky xl:top-[88px] xl:col-start-2 xl:mx-0 xl:mt-0 xl:max-w-none xl:[grid-row:1/span_2]"
              >
                {card}
              </aside>
              <div className="mx-auto w-full max-w-[850px] xl:col-start-1 xl:mx-0 xl:[grid-row:2]">
                {sections}
              </div>
            </div>
          )}
          <PtsFinalCta price={price} copy={copy.finalCta} />
        </main>
        <PtsFooter />
        <PtsStickyBar label={copy.stickyLabel} cta={copy.stickyCta} />
      </div>
    </PtsCheckoutProvider>
  );
};
