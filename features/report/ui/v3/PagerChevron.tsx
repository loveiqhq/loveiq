import type { FC } from "react";

/**
 * 304:263's 15px chevron, stroke 3, turned to point back or on: the arrow in V4's
 * desktop pagers, the science gallery's (V3Methodology) and the archetype deck's
 * (V3DimensionDeck).
 */
const PagerChevron: FC<{ back?: boolean }> = ({ back = false }) => (
  <svg viewBox="0 0 15 15" fill="none" aria-hidden="true">
    <path
      d={
        back
          ? "M9.375 3.28125L5.15625 7.5L9.375 11.7188"
          : "M5.625 3.28125L9.84375 7.5L5.625 11.7188"
      }
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default PagerChevron;
