import type { FC } from "react";
import Image from "next/image";
import { PTS_ONE_PRICE, PTS_PRICE_CARD } from "./payToStartContent";
import { PtsCtaButton, PtsCtaStatus } from "./PtsCheckout";
import { CheckIcon, ShieldIcon } from "./ptsIcons";
import { PTS_H2, PTS_SECTION } from "./ptsStyles";

/**
 * Two of the places the page sells from: the "One price" section in the column and the
 * card beside the column on a desktop (the third, the bar pinned to the bottom of smaller
 * screens, is PtsStickyBar). Every button is the same checkout (PtsCheckout.tsx).
 */

/**
 * 1706:1918: the band with the price and the button, what is included, the guarantee.
 * `#price` is where the header's "Start test now" takes the visitor, at every width.
 */
export const PtsOnePrice: FC<{ price: string }> = ({ price }) => (
  <section id="price" aria-labelledby="pts-one-price" className={PTS_SECTION}>
    <h2 id="pts-one-price" className={PTS_H2}>
      {PTS_ONE_PRICE.title}
    </h2>
    <div className="mt-[26px] overflow-hidden rounded-[20px] border border-[#e9e6ee] bg-white">
      <div className="flex flex-col items-start gap-5 bg-[#faf7ff] px-7 py-[26px] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-serif text-[40px] font-medium leading-[51.2px] text-[#161021]">
            {price}
          </p>
          <p className="font-sans text-[14px] leading-[19.12px] text-[#6b6678]">
            {PTS_ONE_PRICE.terms}
          </p>
        </div>
        <div className="flex flex-col items-start sm:items-end">
          <PtsCtaButton location="one_price" className="h-[52px] rounded-[26px] px-6 text-[16px]">
            {PTS_ONE_PRICE.cta}
          </PtsCtaButton>
          <PtsCtaStatus location="one_price" className="mt-2 max-w-[300px] sm:text-right" />
        </div>
      </div>
      <ul className="grid gap-x-[26px] gap-y-2.5 px-7 py-[22px] sm:grid-cols-2">
        {PTS_ONE_PRICE.includes.map((item) => (
          <li key={item} className="flex items-start gap-2.5">
            <CheckIcon className="mt-[3.5px]" />
            <span className="font-sans text-[15px] leading-[23px] text-[#3f3a4d]">{item}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-start gap-3 border-t border-[#e9e6ee] bg-[#f3fbf6] px-7 py-[18px]">
        <ShieldIcon color="#1F6B4A" className="mt-px h-5 w-5" />
        <p className="font-sans text-[14.5px] leading-[22px] text-[#1f4d39]">
          <strong className="font-bold">{PTS_ONE_PRICE.guaranteeLead}</strong>
          {PTS_ONE_PRICE.guaranteeRest}
        </p>
      </div>
    </div>
  </section>
);

/** Figma's wallet badges (1706:1996-2001), exported as drawn. */
const WALLETS = [
  { src: "/pay-to-start/wallet-applepay.f52caee3.svg", alt: "Apple Pay", width: 54 },
  { src: "/pay-to-start/wallet-link.9de76b33.svg", alt: "Link", width: 50 },
  { src: "/pay-to-start/wallet-amazonpay.03a37f03.svg", alt: "Amazon Pay", width: 72 },
] as const;

/**
 * 1706:1988: the card beside the column on a desktop, 342 wide. It stays in view while the
 * column scrolls (sticky): Figma draws it at the top only, the scroll is extrapolated.
 */
export const PtsPriceCard: FC<{ price: string }> = ({ price }) => (
  <div className="overflow-hidden rounded-[22px] border border-[#e9e6ee] bg-white shadow-[0_22px_54px_-20px_rgba(103,60,120,0.30)]">
    <div className="px-6 pb-6 pt-[24.5px]">
      <p className="font-sans text-[12px] font-bold leading-[16.39px] tracking-[1px] text-[#561dbd]">
        {PTS_PRICE_CARD.eyebrow}
      </p>
      <p className="mt-3 flex items-baseline gap-[7px]">
        <span className="font-serif text-[44px] font-medium leading-[56.32px] text-[#161021]">
          {price}
        </span>
        <span className="font-sans text-[14px] leading-[19.12px] text-[#6b6678]">
          {PTS_PRICE_CARD.per}
        </span>
      </p>
      <PtsCtaButton
        location="price_card"
        className="mt-3 h-[54px] w-full rounded-[27px] px-5 text-[17px]"
      >
        {PTS_PRICE_CARD.cta}
      </PtsCtaButton>
      <PtsCtaStatus location="price_card" className="mt-2 text-center" />
      <ul aria-label="Wallets" className="mt-3 flex items-center justify-center gap-[7.5px]">
        {WALLETS.map((wallet) => (
          <li key={wallet.alt}>
            <Image
              src={wallet.src}
              alt={wallet.alt}
              width={wallet.width}
              height={28}
              unoptimized
              className="block h-7 w-auto"
            />
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-center justify-center gap-1.5 font-sans text-[12.5px] font-semibold leading-[17.08px] text-[#1f6b4a]">
        <ShieldIcon color="#1F6B4A" className="h-[15px] w-[15px]" />
        {PTS_PRICE_CARD.guarantee}
      </p>
    </div>
    <ul className="space-y-[9px] border-t border-[#e9e6ee] bg-[#faf9fc] px-6 pb-[22px] pt-[18px]">
      {PTS_PRICE_CARD.includes.map((item) => (
        <li key={item} className="flex items-start gap-2.5">
          <CheckIcon className="mt-[3px]" />
          <span className="font-sans text-[13.5px] leading-5 text-[#3f3a4d]">{item}</span>
        </li>
      ))}
    </ul>
  </div>
);
