import type { FC } from "react";

/**
 * The page's small drawings, from the Figma frames' SVG exports (1706:2007 check,
 * 1706:2002 shield, 1706:1984 disclaimer shield).
 *
 * Figma sets "→" and "★" as Manrope text, but the Manrope files the site serves (latin,
 * latin-ext) have neither glyph (U+2192, U+2605), so a browser would draw them in whatever
 * symbol font the system has. They are drawn here instead, at the glyph's measured size.
 */

/** Figma's 16 px check, stroke #795FC8. */
export const CheckIcon: FC<{ className?: string }> = ({ className = "" }) => (
  <svg
    aria-hidden
    viewBox="0 0 16 16"
    fill="none"
    className={`h-4 w-4 shrink-0 ${className}`}
    stroke="#795FC8"
    strokeWidth="1.33333"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3.3335 7.99935L6.3335 10.9993L12.6668 4.66602" />
  </svg>
);

/**
 * The shield, drawn on a 20 px grid at 1.5 px so it keeps Figma's weight at both sizes it
 * is used at (20 px, and 15 px with a 1.125 px line). `check` adds the tick inside.
 */
export const ShieldIcon: FC<{ className?: string; check?: boolean; color: string }> = ({
  className = "",
  check = true,
  color,
}) => (
  <svg
    aria-hidden
    viewBox="0 0 20 20"
    fill="none"
    className={`shrink-0 ${className}`}
    stroke={color}
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10 2.5L15.8333 5V9.16667C15.8333 12.9167 13.3333 16.0833 10 17.5C6.66667 16.0833 4.16667 12.9167 4.16667 9.16667V5L10 2.5Z" />
    {check && <path d="M7.5 10L9.16667 11.6667L12.5 8.33333" />}
  </svg>
);

/**
 * Manrope SemiBold's arrow as Figma draws it after each button label: 0.73 em wide,
 * 0.48 em tall, sitting a hair below the middle of the line.
 */
export const ArrowGlyph: FC = () => (
  <svg
    aria-hidden
    viewBox="0 0 12.4 8.1"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.55"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="ml-[0.14em] mr-[0.19em] h-[0.48em] w-[0.73em] shrink-0 translate-y-[0.06em] transition-transform duration-200 motion-safe:group-hover:translate-x-0.5"
  >
    <path d="M0.8 4.05H11.6M8.2 0.75L11.6 4.05L8.2 7.35" />
  </svg>
);

/** In the arrow's place while the button's request runs. */
export const Spinner: FC = () => (
  <span
    aria-hidden
    className="ml-[0.14em] mr-[0.19em] inline-block h-[0.85em] w-[0.85em] shrink-0 rounded-full border-2 border-white/40 border-t-white motion-safe:animate-spin"
  />
);

const STAR_PATH =
  "M12 1L14.469 8.602L22.462 8.601L15.994 13.298L18.466 20.899L12 16.2L5.534 20.899L8.006 13.298L1.538 8.601L9.531 8.602Z";

/**
 * Five solid stars, #FE6839. `size` is the font size Figma sets them in (14 or 16) and
 * `spacing` its letter spacing: measured off Figma's render, each glyph is 0.8 em wide on a
 * 0.975 em advance, so stars sit 0.175 em + the spacing apart.
 */
export const Stars: FC<{ size: 14 | 16; spacing: number; className?: string }> = ({
  size,
  spacing,
  className = "",
}) => (
  <span
    aria-hidden
    // The line Figma's text row takes (Manrope's 1.366 em), so a row of stars on its own
    // is as tall as the text it stands in for.
    style={{ height: size * 1.366 }}
    className={`inline-flex shrink-0 items-center ${className}`}
  >
    {[0, 1, 2, 3, 4].map((i) => (
      <svg
        key={i}
        viewBox="1.5 1 21 20"
        fill="#FE6839"
        style={{
          width: size * 0.8,
          height: size * 0.76,
          marginRight: i < 4 ? spacing + size * 0.175 : 0,
        }}
      >
        <path d={STAR_PATH} />
      </svg>
    ))}
  </span>
);
