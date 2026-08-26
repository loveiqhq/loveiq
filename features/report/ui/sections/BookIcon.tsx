import type { FC } from "react";

/**
 * The book glyph on every "Key Concepts" pill and every expander summary.
 *
 * Fourteen sections still declare this locally; this module exists for
 * {@link ./LearnPill} and for the sections whose only copy of it became dead
 * when the pill moved out of them. Same path data, so the two are the same mark.
 */
const BookIcon: FC = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15.5H5.5A1.5 1.5 0 0 1 4 18V5.5Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15.5h5.5A1.5 1.5 0 0 0 20 18V5.5Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

export default BookIcon;
