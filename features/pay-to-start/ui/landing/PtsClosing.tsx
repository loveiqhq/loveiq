import type { FC } from "react";
import { PTS_FAQ, PTS_FINAL_CTA, PTS_FOOTER } from "./payToStartContent";
import { PtsCtaButton, PtsCtaStatus } from "./PtsCheckout";
import { ShieldIcon, Stars } from "./ptsIcons";
import { PTS_H2, PTS_SECTION } from "./ptsStyles";

/**
 * The questions (1706:1951), the closing call (1706:2019) and the footer (1706:2030).
 */

/**
 * Six answers, all drawn open with a "−". Native <details>: each can be folded away, and
 * the answers are in the page for search engines and readers alike.
 */
export const PtsFaq: FC = () => (
  <section aria-labelledby="pts-faq" className={PTS_SECTION}>
    <h2 id="pts-faq" className={PTS_H2}>
      {PTS_FAQ.title}
    </h2>
    <div className="mt-[26px] border-t border-[#e9e6ee]">
      {PTS_FAQ.items.map((item) => (
        <details key={item.question} open className="group border-b border-[#e9e6ee]">
          <summary className="focus-visible-ring flex cursor-pointer list-none items-center justify-between gap-4 rounded-sm px-1 py-[22px] [&::-webkit-details-marker]:hidden">
            <span className="font-sans text-[16px] font-bold leading-[21.86px] text-[#161021]">
              {item.question}
            </span>
            <span
              aria-hidden
              className="w-4 shrink-0 text-center font-sans text-[22px] font-normal leading-[22px] text-[#795fc8]"
            >
              <span className="group-open:hidden">+</span>
              <span className="hidden group-open:inline">−</span>
            </span>
          </summary>
          <p className="max-w-[640px] px-1 pb-[18px] font-sans text-[15px] leading-6 text-[#3f3a4d]">
            {item.answer}
          </p>
        </details>
      ))}
    </div>
    <div className="mt-6 flex items-start gap-3.5 rounded-[18px] bg-[#f5f6f8] py-[18px] pl-[22px] pr-5">
      <ShieldIcon check={false} color="#2E7D5B" className="h-5 w-5" />
      <p className="font-sans text-[13.5px] leading-[21px] text-[#3f3a4d]">
        {PTS_FAQ.disclaimerBefore}
        <strong className="font-bold text-[#161021]">{PTS_FAQ.disclaimerBold}</strong>
        {PTS_FAQ.disclaimerAfter}
      </p>
    </div>
  </section>
);

/** The closing band across the whole page width; the phone frame shortens its button. */
export const PtsFinalCta: FC<{ price: string }> = ({ price }) => (
  <section
    aria-labelledby="pts-final"
    className="mt-16 rounded-[32px] border border-[#f0eef4] bg-[#faf7ff] px-5 py-10 text-center sm:px-10 sm:py-[52px]"
  >
    <div className="flex justify-center">
      <Stars size={16} spacing={3} />
    </div>
    <h2
      id="pts-final"
      className="mt-3 font-serif text-[30px] font-medium leading-[33.6px] tracking-[-0.4px] text-[#161021] sm:text-[42px] sm:leading-[47px] sm:tracking-[-0.6px]"
    >
      {PTS_FINAL_CTA.title}
    </h2>
    <p className="mt-3 font-sans text-[16px] leading-[21.86px] text-[#6b6678]">
      {PTS_FINAL_CTA.leadBefore}
      <span className="whitespace-nowrap">{PTS_FINAL_CTA.leadPrice(price)}</span>
    </p>
    <div className="mt-5 flex flex-col items-center">
      <PtsCtaButton
        location="final_cta"
        className="h-[54px] rounded-[27px] pl-7 pr-[25px] text-[17px]"
      >
        <span className="sm:hidden">{PTS_FINAL_CTA.ctaShort(price)}</span>
        <span className="hidden sm:inline">{PTS_FINAL_CTA.cta(price)}</span>
      </PtsCtaButton>
      <PtsCtaStatus location="final_cta" className="mt-2" />
    </div>
    <ul className="mt-[18px] flex flex-wrap justify-center gap-x-6 gap-y-1.5 font-sans text-[13px] leading-[17.76px] text-[#6b6678]">
      {PTS_FINAL_CTA.badges.map((badge) => (
        <li key={badge}>{badge}</li>
      ))}
    </ul>
  </section>
);

/**
 * Figma's two lines, and under them the legal pages a shop has to link (not drawn). The
 * bottom padding is Figma's: on screens with the pinned bar it keeps the last line clear.
 */
export const PtsFooter: FC = () => (
  <footer className="border-t border-[#e9e6ee] bg-[#f5f6f8]">
    <div className="mx-auto max-w-[1288px] px-6 pb-[calc(94px+env(safe-area-inset-bottom))] pt-[22px] font-sans text-[13px] leading-[17.76px] text-[#6b6678] xl:pb-16">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:gap-6">
        <p>{PTS_FOOTER.company}</p>
        <p>{PTS_FOOTER.disclaimer}</p>
      </div>
      <nav aria-label="Legal" className="mt-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
          {PTS_FOOTER.links.map((link) => (
            <li key={link.href}>
              {/* A plain link: the legal pages are the LoveIQ site, loaded fresh, and the
                  way back restores this page as it was. */}
              <a
                href={link.href}
                className="focus-visible-ring rounded-sm underline decoration-[#6b6678]/40 underline-offset-2 transition-colors hover:text-[#161021] hover:decoration-[#161021]/60"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  </footer>
);
