import type { FC, ReactNode } from "react";
import { TRUST_BAND } from "./painPointContent";

/** The ringed icon tile of the design system (2px gradient edge on a pale fill), 26px. */
const RING =
  "box-border flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border-[1.5px] border-solid border-transparent text-[#3a2a55] [background:linear-gradient(#fcf9ff,#fcf9ff)_padding-box,linear-gradient(135deg,#fe6839_0%,#bf66d9_50%,#958ef6_100%)_border-box]";

const ICONS: Record<(typeof TRUST_BAND.items)[number]["icon"], ReactNode> = {
  people: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  book: (
    <>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </>
  ),
  lock: (
    <>
      <rect width="18" height="11" x="3" y="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
};

/**
 * The band under the hero (board "Why people trust LoveIQ"): a warm-to-violet wash with three
 * reasons, in a row from lg and stacked on a phone.
 */
const PTrustBand: FC = () => (
  <section
    aria-label={TRUST_BAND.label}
    data-landing-section="trust_band"
    className="border-y border-[#f1e6f6] bg-[linear-gradient(90deg,#fff5f0_0%,#f8f0fc_50%,#f2f1ff_100%)] px-4 py-[18px] lg:px-6 lg:py-4"
  >
    <ul className="m-0 mx-auto flex max-w-[1180px] list-none flex-col items-start gap-3 p-0 lg:flex-row lg:flex-wrap lg:items-center lg:justify-center lg:gap-x-10 lg:gap-y-3">
      {TRUST_BAND.items.map((item) => (
        <li key={item.icon} className="flex items-center gap-[10px]">
          <span aria-hidden className={RING}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="block h-[14px] w-[14px]"
            >
              {ICONS[item.icon]}
            </svg>
          </span>
          <span className="text-[15px] leading-5 text-[#161021]">
            {item.strongFirst ? (
              <>
                <strong className="font-bold">{item.strong}</strong>{" "}
                <span className="text-[#6b6678]">{item.muted}</span>
              </>
            ) : (
              <>
                <span className="text-[#6b6678]">{item.muted}</span>{" "}
                <strong className="font-bold">{item.strong}</strong>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  </section>
);

export default PTrustBand;
