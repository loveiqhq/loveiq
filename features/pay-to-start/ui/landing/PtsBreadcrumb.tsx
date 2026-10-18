import type { FC } from "react";
import { PTS_BREADCRUMB } from "./payToStartContent";

/**
 * "Assessments › Sexuality › What’s my sexual archetype?" (1706:1706). Figma underlines the
 * first two as links; the pages they would open do not exist, so they are plain text
 * (Fatih, 18.10). On a phone the last crumb wraps to its own line, as drawn.
 */
export const PtsBreadcrumb: FC = () => {
  const [first, second, current] = PTS_BREADCRUMB;
  return (
    <nav aria-label="Breadcrumb" className="pb-[18px] pt-4">
      <ol className="flex flex-wrap items-center gap-2 font-sans text-[13px] leading-[17.76px] text-[#6b6678]">
        <li>{first}</li>
        <li aria-hidden>›</li>
        <li>{second}</li>
        <li aria-hidden>›</li>
        <li aria-current="page" className="font-semibold text-[#161021]">
          {current}
        </li>
      </ol>
    </nav>
  );
};
