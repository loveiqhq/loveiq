import type { FC } from "react";

/**
 * The video page's dot matrix (public/images/white/wowstats/dots.svg, the designer's export
 * for 47%), drawn for any share: 100 dots, 20 to a row in 5 rows, 13px apart, the first `lit`
 * in the brand sweep and the rest grey. Each lit dot carries the whole sweep across itself, as
 * the export draws them: one gradient in the default bounding-box units does that for every
 * dot. Landing page v2's numbers (Fatih, 23 Nov: a dot grid per number).
 */
const COLS = 20;
const DOTS = 100;

const PStatDots: FC<{
  /** How many of the 100 dots are lit: the share itself. */
  lit: number;
  /** The gradient's id, unique on the page. */
  id: string;
}> = ({ lit, id }) => (
  <svg data-dots viewBox="0 0 282 110" fill="none" aria-hidden className="h-full w-full">
    <defs>
      <linearGradient id={id}>
        <stop stopColor="#FE6839" />
        <stop offset="0.5" stopColor="#BF66D9" />
        <stop offset="1" stopColor="#958EF6" />
      </linearGradient>
    </defs>
    {Array.from({ length: DOTS }, (_, i) => {
      const on = i < lit;
      return (
        <circle
          key={i}
          data-lit={on || undefined}
          cx={17.5 + 13 * (i % COLS)}
          cy={29 + 13 * Math.floor(i / COLS)}
          r={4}
          fill={on ? `url(#${id})` : "#D8D5DE"}
          fillOpacity={on ? undefined : 0.85}
        />
      );
    })}
  </svg>
);

export default PStatDots;
