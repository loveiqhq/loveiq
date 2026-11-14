import type { FC } from "react";
import { PROMISE } from "./painPointContent";
import { PP_ACCENT, PP_H2, PP_INNER } from "./ppStyles";

/**
 * What changes (board "Promise of change"): the heading and its line on the left, and four
 * old habits struck through, each with what replaces it, on the right (below on a phone).
 */
const PPromise: FC = () => (
  <section data-landing-section="promise" className="px-4 py-16 lg:px-6 lg:py-24">
    <div className={`${PP_INNER} flex flex-wrap gap-8 lg:gap-14`}>
      <div className="flex min-w-0 flex-[1_1_min(100%,360px)] flex-col gap-[18px]">
        <h2 className={PP_H2}>
          {PROMISE.titleLead}
          <span className={PP_ACCENT}>{PROMISE.titleAccent}</span>
          {PROMISE.titleTail}
        </h2>
        <p className="m-0 text-[16px] leading-[26px] text-[#3f3a4d] lg:text-[18px] lg:leading-[29px]">
          {PROMISE.body}
        </p>
      </div>
      <div className="flex min-w-0 flex-[1.4_1_min(100%,520px)] flex-col">
        {PROMISE.rows.map((row, i) => (
          <div
            key={row.before}
            className={`py-[22px] ${i < PROMISE.rows.length - 1 ? "border-b border-solid border-[#e9e6ee]" : ""}`}
          >
            <div className="flex flex-col gap-1.5">
              <p className="m-0 flex items-center gap-2 text-[14px] leading-5 text-[#6b6678]">
                <s>{row.before}</s>
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#bf66d9"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-[14px] w-[14px] flex-none"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </p>
              <p className="m-0 font-serif text-[19px] font-medium leading-[27px] text-[#161021] lg:text-[22px] lg:leading-[30px]">
                {row.after}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default PPromise;
