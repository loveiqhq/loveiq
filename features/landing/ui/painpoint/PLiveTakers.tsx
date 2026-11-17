"use client";

import type { FC } from "react";
import { useLiveTakers } from "@features/landing/logic/liveTakers";
import { HERO } from "./painPointContent";

/** "N people are taking the test right now", with the board's softly pulsing dot. */
const PLiveTakers: FC = () => {
  const takers = useLiveTakers();
  return (
    <div className="mt-1 flex items-center justify-center gap-[10px] text-[14px] leading-[22px] text-[#6b6678] lg:justify-start lg:text-[15px]">
      <span
        aria-hidden
        className="pp-live h-[10px] w-[10px] flex-none rounded-full bg-[#e07a5f] shadow-[0_0_0_4px_rgba(224,122,95,0.15)]"
      />
      <span>
        <strong className="font-bold text-[#161021]">{takers}</strong> {HERO.liveTail}
      </span>
    </div>
  );
};

export default PLiveTakers;
