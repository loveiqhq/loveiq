"use client";

import { useEffect, useState, type FC } from "react";
import Link from "next/link";
import { trackStartSurvey } from "@features/analytics/client";

/**
 * Persistent bottom CTA (Figma node 8947:8713). Slides in once the hero is out
 * of the way so it never competes with the hero's own CTA.
 */
const SHOW_AFTER_PX = 700;

const WStickyBar: FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      // aria-hidden while off-screen so the CTA isn't announced twice to
      // screen readers on page load.
      aria-hidden={!visible}
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-[#e9e6ee] bg-white/95 shadow-[0_-8px_24px_-12px_rgba(20,10,40,0.2)] backdrop-blur transition-transform duration-500 ease-out motion-reduce:transition-none ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="content-shell flex items-center justify-center gap-3 py-3 sm:gap-[18px]">
        {/* Below ~360px the label and the CTA fight for the same row; the CTA
            alone carries the message there. */}
        <p className="hidden whitespace-nowrap text-[12.5px] font-bold text-[#161021] min-[360px]:block sm:text-[13.5px]">
          Your result is waiting.
        </p>
        <Link
          href="/survey"
          tabIndex={visible ? undefined : -1}
          aria-label="Continue free test - sticky bar"
          onClick={() => trackStartSurvey("sticky")}
          className="focus-visible-ring group inline-flex shrink-0 items-center gap-2.5 rounded-full bg-gradient-to-br from-[#fe6839] via-[#bf66d9] via-[43%] to-[#958ef6] px-[17px] py-2.5 text-[15px] font-semibold text-white shadow-[0_10px_26px_-12px_rgba(191,102,217,0.75)] transition duration-300 hover:shadow-[0_14px_30px_-10px_rgba(191,102,217,0.85)] sm:text-[16px]"
        >
          <span>Continue free test</span>
          <svg
            aria-hidden
            className="h-[17px] w-[17px] transition-transform duration-300 motion-safe:group-hover:translate-x-1"
            viewBox="0 0 17 17"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.42"
          >
            <path d="M3.54 8.5h9.92M9.21 12.75 13.46 8.5 9.21 4.25" />
          </svg>
        </Link>
      </div>
    </div>
  );
};

export default WStickyBar;
