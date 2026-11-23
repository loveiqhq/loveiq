"use client";

import type { FC } from "react";
import { useTrackPosition } from "./usePainTrack";

/** Below lg: one dot per pattern, the one in view drawn long (the pay-to-start pages' dots). */
const PPainPointDots: FC<{ trackId: string; count: number }> = ({ trackId, count }) => {
  const { active } = useTrackPosition(trackId);
  return (
    <div aria-hidden className="flex items-center justify-center gap-1.5 lg:hidden">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={`block h-1.5 rounded-full transition-[width] duration-200 motion-reduce:transition-none ${
            i === active
              ? "w-[22px] bg-[linear-gradient(90deg,#fe6839,#bf66d9)]"
              : "w-1.5 bg-[#ddd4ee]"
          }`}
        />
      ))}
    </div>
  );
};

export default PPainPointDots;
