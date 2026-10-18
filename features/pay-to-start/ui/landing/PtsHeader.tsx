import type { FC } from "react";
import { PTS_BREADCRUMB, PTS_HEADER } from "./payToStartContent";

/**
 * The page's own header (Figma 1706:1701, phone 1706:2036): the Facets wordmark and
 * nothing else. The phone frame's "Log in" is left out, there being nothing to log in to
 * (Fatih, 18.10), and the wordmark is not a link: Facets has no home page yet.
 */
export const PtsHeader: FC = () => (
  <header className="border-b border-[#e9e6ee] bg-white">
    <div className="mx-auto flex h-[70px] max-w-[1288px] items-center px-6">
      <p aria-label={`${PTS_HEADER.wordmark}, by Applied Psychometrics`}>
        <span
          aria-hidden
          className="block font-serif text-[28px] font-normal leading-[28px] tracking-[-0.4px] text-[#161021]"
        >
          {PTS_HEADER.wordmark}
        </span>
        <span
          aria-hidden
          className="mt-1 block font-sans text-[9px] font-bold leading-[9px] tracking-[0.9px] text-[#6b6678]"
        >
          {PTS_HEADER.byline}
        </span>
      </p>
    </div>
  </header>
);

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
