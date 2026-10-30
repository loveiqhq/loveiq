import type { FC } from "react";
import Image from "next/image";
import { REPORT_V4_NAV_PARTS } from "@features/report/ui/v3/reportV3Nav";
import { PTS_ONE_PRICE, type PtsOfferCopy } from "./payToStartContent";
import { PtsCtaButton, PtsCtaStatus } from "./PtsCheckout";
import { CheckIcon, ShieldIcon } from "./ptsIcons";
import { PTS_H2, PTS_REVEAL, PTS_SECTION } from "./ptsStyles";

/**
 * Two of the places the page sells from: the "One price" section in the column and the
 * card beside the column on a desktop (the third, the bar pinned to the bottom of smaller
 * screens, is PtsStickyBar). Every button is the same checkout (PtsCheckout.tsx).
 */

/** Figma's wallet badges (1706:1996-2001), exported as drawn. */
const WALLETS = [
  { src: "/pay-to-start/wallet-applepay.f52caee3.svg", alt: "Apple Pay", width: 54 },
  { src: "/pay-to-start/wallet-link.9de76b33.svg", alt: "Link", width: 50 },
  { src: "/pay-to-start/wallet-amazonpay.03a37f03.svg", alt: "Amazon Pay", width: 72 },
] as const;

/** V2's gradient over a run of a heading: the plan picker's (103deg, orange to periwinkle). */
const PICKER_GRADIENT_TEXT =
  "bg-[linear-gradient(103deg,#ff6a3a_0%,#cf5afb_52%,#7d88ff_100%)] bg-clip-text italic text-transparent [-webkit-text-fill-color:transparent]";

/** The live chapter menu as a card, every chapter listed (V2's "All chapters … fully unlocked"). */
const ChapterListCard: FC = () => (
  <div className="w-[260px] rounded-[18px] border-[1.5px] border-[#e6dcfa] bg-white px-2.5 pb-2.5 pt-2 font-sans shadow-[0_22px_54px_-20px_rgba(103,60,120,0.3)]">
    {REPORT_V4_NAV_PARTS.map((part) => (
      <div key={part.part}>
        <p className="px-1.5 pb-1.5 pt-[11px] text-[10px] font-bold uppercase leading-[13px] tracking-[0.1em] text-[#b8405e]">
          {part.part} · {part.label}
        </p>
        <ul>
          {part.items.map((item) => (
            <li
              key={item.id}
              className="my-[3px] flex h-7 items-center rounded-lg pl-3 pr-2 text-[12px] font-medium text-[#161021]"
            >
              {item.label}
            </li>
          ))}
        </ul>
      </div>
    ))}
  </div>
);

/**
 * Landing V2's "One price. Every chapter unlocked." (Mark, final 30.10), `#price`, the full
 * offer's page only: the plan picker's card, with the price, the button, the guarantee and what
 * is included, beside the whole chapter menu. `#price` is where the header's "Start test now"
 * takes the visitor. Only the headings fly in: a price and a button never wait on a reveal.
 */
export const PtsOnePrice: FC<{ price: string }> = ({ price }) => (
  <section id="price" aria-labelledby="pts-one-price" className={PTS_SECTION}>
    <h2
      id="pts-one-price"
      className={`m-0 text-center font-serif text-[38px] font-normal leading-[44px] tracking-[-0.01em] text-[#161021] ${PTS_REVEAL}`}
    >
      {PTS_ONE_PRICE.title.lead}{" "}
      <em className={PICKER_GRADIENT_TEXT}>{PTS_ONE_PRICE.title.emph}</em>
    </h2>
    <div className="mt-12 flex flex-col items-center gap-14 md:flex-row md:items-start md:justify-center">
      <div className="flex w-full max-w-[400px] flex-col items-center">
        <article className="relative flex w-full flex-col gap-4 rounded-[20px] border-[1.5px] border-[rgba(139,92,246,0.55)] bg-[rgba(85,101,247,0.06)] px-6 pb-[26px] pt-[34px] text-[#17121f]">
          <span className="absolute left-1/2 top-[-12px] -translate-x-1/2 whitespace-nowrap rounded-full bg-[linear-gradient(180deg,#6d6ffb_0%,#5a5cf0_100%)] px-3 py-[5px] font-sans text-[12px] font-extrabold leading-[14px] text-white shadow-[0_4px_10px_rgba(255,106,61,0.3)]">
            {PTS_ONE_PRICE.badge}
          </span>
          <div className="flex flex-col gap-1.5">
            <h3 className="m-0 font-serif text-[24px] font-normal leading-[1.28]">
              <span className="font-semibold text-[#5558f0]">{PTS_ONE_PRICE.cardTitle.strong}</span>{" "}
              {PTS_ONE_PRICE.cardTitle.rest}
            </h3>
            <p className="m-0 font-sans text-[13.5px] leading-[1.35]">
              {PTS_ONE_PRICE.covers}
              <strong>{PTS_ONE_PRICE.coversStrong}</strong>
            </p>
          </div>
          <p className="m-0 flex items-baseline gap-1.5">
            <span className="font-serif text-[36px] font-semibold leading-[1.2]">{price}</span>
            <span className="font-sans text-[12px] font-bold">{PTS_ONE_PRICE.terms}</span>
          </p>
          <div>
            <PtsCtaButton
              location="one_price"
              gradientClass="bg-[linear-gradient(90deg,#fe6839_0%,#a78bfa_100%)]"
              glow={false}
              className="h-12 w-full rounded-full text-[18px] font-extrabold"
            >
              {PTS_ONE_PRICE.cta}
            </PtsCtaButton>
            <PtsCtaStatus location="one_price" className="mt-2 text-center" />
          </div>
          <div className="flex flex-col gap-2.5">
            <p className="m-0 flex items-center gap-1.5 font-sans text-[15px] font-extrabold leading-[18px] text-[#00803f]">
              <ShieldIcon color="#00803f" className="h-4 w-4" />
              {PTS_ONE_PRICE.guarantee}
            </p>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {PTS_ONE_PRICE.includes.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-2 font-sans text-[13px] leading-[18px] text-[#4b5563]"
                >
                  <CheckIcon />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </article>
        <div className="mt-[22px] flex flex-col items-center gap-2.5">
          <p className="m-0 font-sans text-[11px] font-semibold tracking-[0.08em] text-[#6b7280]">
            {PTS_ONE_PRICE.secure}
          </p>
          <div className="flex items-center gap-2">
            {WALLETS.map((w) => (
              <Image key={w.alt} src={w.src} alt={w.alt} width={w.width} height={28} unoptimized />
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center gap-4">
        <h3 className="m-0 text-center font-serif text-[24px] font-normal leading-[30px] text-[#161021]">
          <em className={PICKER_GRADIENT_TEXT}>{PTS_ONE_PRICE.chapters.emph}</em>
          {PTS_ONE_PRICE.chapters.rest}
          <br />
          {PTS_ONE_PRICE.chapters.second}
        </h3>
        <ChapterListCard />
      </div>
    </div>
  </section>
);

/**
 * 1706:1988: the card beside the column on a desktop, 342 wide. It stays in view while the
 * column scrolls (sticky): Figma draws it at the top only, the scroll is extrapolated. The
 * initial report's page also draws it in the column, under the film (1733:5753). Its words
 * are the offer's (PtsOfferCopy).
 */
export const PtsPriceCard: FC<{ price: string; copy: PtsOfferCopy["priceCard"] }> = ({
  price,
  copy,
}) => (
  <div className="overflow-hidden rounded-[22px] border border-[#e9e6ee] bg-white shadow-[0_22px_54px_-20px_rgba(103,60,120,0.30)]">
    <div className="px-6 pb-6 pt-[24.5px]">
      <p className="font-sans text-[12px] font-bold leading-[16.39px] tracking-[1px] text-[#561dbd]">
        {copy.eyebrow}
      </p>
      <p className="mt-3 flex items-baseline gap-[7px]">
        <span className="font-serif text-[44px] font-medium leading-[56.32px] text-[#161021]">
          {price}
        </span>
        <span className="font-sans text-[14px] leading-[19.12px] text-[#6b6678]">{copy.per}</span>
      </p>
      <PtsCtaButton
        location="price_card"
        className="mt-3 h-[54px] w-full rounded-[27px] px-5 text-[17px]"
      >
        {copy.cta}
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
        {copy.guarantee}
      </p>
    </div>
    <ul className="space-y-[9px] border-t border-[#e9e6ee] bg-[#faf9fc] px-6 pb-[22px] pt-[18px]">
      {copy.includes.map((item) => (
        <li key={item} className="flex items-start gap-2.5">
          <CheckIcon className="mt-[3px]" />
          <span className="font-sans text-[13.5px] leading-5 text-[#3f3a4d]">{item}</span>
        </li>
      ))}
    </ul>
  </div>
);
