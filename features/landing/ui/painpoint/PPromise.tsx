import type { CSSProperties, FC } from "react";
import RingIconTile from "../RingIconTile";
import { PROMISE } from "./painPointContent";
import { PP_ACCENT, PP_CARD, PP_H2, PP_INNER } from "./ppStyles";

/**
 * What changes (board "Promise of change"), as four tiles since v2: Mark (12 Nov), "this reads
 * as a step by step instructions, which it isn't… maybe use 4 tiles next to each other and use
 * an icon for each". Four across from lg, two by two from md, one column on a phone. Each tile
 * keeps the old habit struck through (Marcus: "keep the crossed out part") above what replaces
 * it, led by its ring icon.
 *
 * Hana's board plays each tile as it comes into view: the line crosses the old habit out, then
 * the new line pops in. Every tile is its own trigger; where tiles share a row they cascade,
 * 0.7s apart (`--pp-k`, set per breakpoint in globals.css), and on a phone each plays as it
 * arrives. The struck text keeps its colour (Hana's board greys it to #9c95a3, 2.9:1 on white;
 * #6b6678 holds 4.5:1).
 */
const PPromise: FC = () => (
  <section data-landing-section="promise" className="px-4 py-16 lg:px-6 lg:py-24">
    <div className={`${PP_INNER} flex flex-col gap-10`}>
      <div className="flex max-w-[760px] flex-col gap-[18px]">
        <h2 className={PP_H2}>
          {PROMISE.titleLead}
          <span className={PP_ACCENT}>{PROMISE.titleAccent}</span>
          {PROMISE.titleTail}
        </h2>
        <p className="m-0 text-[16px] leading-[26px] text-[#3f3a4d] lg:text-[18px] lg:leading-[29px]">
          {PROMISE.body}
        </p>
      </div>
      <ul className="m-0 grid list-none gap-5 p-0 md:grid-cols-2 lg:grid-cols-4">
        {PROMISE.rows.map((row, i) => (
          <li
            key={row.before}
            data-reveal
            style={{ "--pp-k2": i % 2, "--pp-k4": i } as CSSProperties}
            className={`${PP_CARD} pp-change flex flex-col gap-4 p-6`}
          >
            <RingIconTile icon={row.icon} />
            {/* Plain text, not a flex row: the struck habit stays inline, so its drawn line
                slices across every line it wraps onto (as a flex item it became a block and the
                line ran under its first line). The arrow follows the last word. */}
            <p className="m-0 text-[14px] leading-5 text-[#6b6678]">
              <s className="pp-strike">{row.before}</s>{" "}
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                stroke="#bf66d9"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="inline-block h-[14px] w-[14px] align-[-2px]"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </p>
            <p className="pp-pop m-0 font-serif text-[19px] font-medium leading-[27px] text-[#161021] lg:text-[20px] lg:leading-[28px]">
              {row.after}
            </p>
          </li>
        ))}
      </ul>
    </div>
  </section>
);

export default PPromise;
