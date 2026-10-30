import type { FC } from "react";
import { PTS_FAQ, PTS_FOOTER, type PtsOfferCopy } from "./payToStartContent";
import { PtsCtaButton, PtsCtaStatus } from "./PtsCheckout";
import { ShieldIcon, Stars } from "./ptsIcons";
import { PTS_H2, PTS_REVEAL, PTS_SECTION, ptsRevealItem } from "./ptsStyles";

/**
 * The questions (1706:1951), the closing call (1706:2019) and the footer (1706:2030).
 */

/**
 * The questions, in Landing V2's look (Mark, final 30.10: the home page's numbered list under
 * "The questions people actually ask."), holding this page's own answers about paying first and
 * refunds, and the disclaimer (Fatih, 30.10). Native <details>, every one folded at first
 * (Marcus, 20.10: "Collapse the FAQ by default"): a question opens its answer, and the answers
 * are in the page for search engines and readers alike. The answers are the offer's.
 */
export const PtsFaq: FC<{ items: PtsOfferCopy["faqItems"] }> = ({ items }) => (
  <section aria-labelledby="pts-faq" className={PTS_SECTION}>
    <h2
      id="pts-faq"
      className={`text-center font-serif text-3xl font-medium leading-tight text-[#161021] sm:text-[44px] ${PTS_REVEAL}`}
    >
      {PTS_FAQ.title.lead}
      <br />
      <span className="text-[#c2410c]">{PTS_FAQ.title.emph}</span>
    </h2>
    <div className="mx-auto mt-10 max-w-3xl border-t border-black/[0.08]">
      {items.map((item, i) => (
        <details
          key={item.question}
          className={`group border-b border-black/[0.08] ${ptsRevealItem(i, 3)}`}
        >
          <summary className="focus-visible-ring flex cursor-pointer list-none items-center justify-between gap-4 rounded-sm py-5 text-left [&::-webkit-details-marker]:hidden">
            <span className="flex items-baseline gap-4">
              <span aria-hidden className="font-serif text-sm text-[#6f6a7a]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="font-serif text-lg font-medium text-[#161021]">{item.question}</span>
            </span>
            <svg
              aria-hidden
              viewBox="0 0 20 20"
              className="h-5 w-5 shrink-0 text-[#6f6a7a] transition-transform duration-300 group-open:rotate-180"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m5 7.5 5 5 5-5" />
            </svg>
          </summary>
          <p className="pb-5 pl-9 font-sans text-[15px] leading-relaxed text-[#6b6678]">
            {item.answer}
          </p>
        </details>
      ))}
    </div>
    <div
      className={`mx-auto mt-6 flex max-w-3xl items-start gap-3.5 rounded-[18px] bg-[#f5f6f8] py-[18px] pl-[22px] pr-5 ${PTS_REVEAL}`}
    >
      <ShieldIcon check={false} color="#2E7D5B" className="h-5 w-5" />
      <p className="font-sans text-[13.5px] leading-[21px] text-[#3f3a4d]">
        {PTS_FAQ.disclaimerBefore}
        <strong className="font-bold text-[#161021]">{PTS_FAQ.disclaimerBold}</strong>
        {PTS_FAQ.disclaimerAfter}
      </p>
    </div>
  </section>
);

/**
 * The closing band across the whole page width; the phone frame shortens its button. Its
 * words fly in; the button and its status line never wait on a reveal. The words are the
 * offer's (PtsOfferCopy).
 */
export const PtsFinalCta: FC<{ price: string; copy: PtsOfferCopy["finalCta"] }> = ({
  price,
  copy,
}) => (
  <section
    aria-labelledby="pts-final"
    className="mt-16 rounded-[32px] border border-[#f0eef4] bg-[#faf7ff] px-5 py-10 text-center sm:px-10 sm:py-[52px]"
  >
    <div className={`flex justify-center ${PTS_REVEAL}`}>
      <Stars size={16} spacing={3} />
    </div>
    <h2
      id="pts-final"
      className={`${PTS_REVEAL} stagger-1 mt-3 font-serif text-[30px] font-medium leading-[33.6px] tracking-[-0.4px] text-[#161021] sm:text-[42px] sm:leading-[47px] sm:tracking-[-0.6px]`}
    >
      {copy.title}
    </h2>
    <p
      className={`${PTS_REVEAL} stagger-2 mt-3 font-sans text-[16px] leading-[21.86px] text-[#6b6678]`}
    >
      {copy.leadBefore}
      {copy.leadPrice && <span className="whitespace-nowrap">{copy.leadPrice(price)}</span>}
    </p>
    <div className="mt-5 flex flex-col items-center">
      <PtsCtaButton
        location="final_cta"
        className="h-[54px] rounded-[27px] pl-7 pr-[25px] text-[17px]"
      >
        <span className="sm:hidden">{copy.ctaShort(price)}</span>
        <span className="hidden sm:inline">{copy.cta(price)}</span>
      </PtsCtaButton>
      <PtsCtaStatus location="final_cta" className="mt-2" />
    </div>
    <ul
      className={`mt-[18px] flex flex-wrap justify-center gap-x-6 gap-y-1.5 font-sans text-[13px] leading-[17.76px] text-[#6b6678] ${PTS_REVEAL}`}
    >
      {copy.badges.map((badge) => (
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
