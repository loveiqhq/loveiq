import type { FC } from "react";

/**
 * The ✳ that closes a chapter, above its italic line and short rule.
 *
 * Figma draws this as a 13x13 six-point STAR VECTOR filled #795FC8 (node
 * 8480:16000). Ours was the text character U+2735 in eight sections, in three
 * different colours — `rgba(157,138,215,0.85)` in six of them (≈#a793d9 on white,
 * visibly paler than the design), `#6b5b95` in Growth (darker and desaturated) and
 * the right #795fc8 in only Initiation.
 *
 * It is a vector here rather than a glyph for a second reason: no font in the
 * report ships U+2735, so the browser substituted whatever system font had it —
 * a different shape and a different stroke weight on macOS, Windows and Android,
 * which is also why its apparent brightness drifted.
 *
 * Path copied from the design's own export, so the six points and their proportions
 * are the designer's, not an approximation.
 */
const VerdictStar: FC = () => (
  <svg
    className="report-verdict-star"
    viewBox="0 0 13 13"
    width="13"
    height="13"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M6.5 0L7.61935 3.79765L11.0962 1.90381L9.20235 5.38065L13 6.5L9.20235 7.61935L11.0962 11.0962L7.61935 9.20235L6.5 13L5.38065 9.20235L1.90381 11.0962L3.79765 7.61935L0 6.5L3.79765 5.38065L1.90381 1.90381L5.38065 3.79765L6.5 0Z"
      fill="#795FC8"
    />
  </svg>
);

export default VerdictStar;
