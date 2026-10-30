import type { FC } from "react";
import { PTS_GUARANTEE } from "./payToStartContent";
import { ShieldIcon } from "./ptsIcons";

/**
 * Landing V2's guarantee box under the desktop's price card (Mark, final 30.10, his board
 * "Guarantee box · G1 Compact strip": closer to the price, larger). The phone has the
 * guarantee in the price band and the Why cards instead.
 */
export const PtsGuarantee: FC = () => (
  <section
    aria-labelledby="pts-guarantee"
    className="mt-4 flex items-center gap-4 rounded-[22px] border-[1.5px] border-[#bfe3cf] bg-[#f2faf5] px-[22px] py-6 font-sans shadow-[0_22px_54px_-24px_rgba(31,107,74,0.35)]"
  >
    <span
      aria-hidden
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#1f6b4a]"
    >
      <ShieldIcon color="#ffffff" className="h-7 w-7" />
    </span>
    <div className="flex flex-col gap-[5px]">
      <h3
        id="pts-guarantee"
        className="m-0 text-[18px] font-extrabold leading-[23px] text-[#161021]"
      >
        {PTS_GUARANTEE.title}
      </h3>
      <p className="m-0 text-[14px] leading-5 text-[#3f3a4d]">
        {PTS_GUARANTEE.body}
        <strong className="text-[#1f6b4a]">{PTS_GUARANTEE.strong}</strong>
      </p>
    </div>
  </section>
);
