import type { FC, ReactNode } from "react";

/**
 * The exit pages' line icons, as the canvas draws them (24-unit boxes, round caps and joins).
 * Every one is decoration beside words that say the same, so all are hidden from readers.
 */
const Line: FC<{ size: number; width: number; children: ReactNode; className?: string }> = ({
  size,
  width,
  children,
  className,
}) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={width}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);

/** The header's way back. */
export const ChevronLeftIcon: FC = () => (
  <Line size={22} width={1.8}>
    <path d="M15 18l-6-6 6-6" />
  </Line>
);

/** A shield with a tick: the guarantee (26 in its disc, 18 in the offer's row). */
export const ShieldIcon: FC<{ size?: number; width?: number }> = ({ size = 26, width = 1.8 }) => (
  <Line size={size} width={width}>
    <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />
    <path d="M9 12l2 2 4-4" />
  </Line>
);

/** The guarantee's chips' tick, and the thank-you's. */
export const TickIcon: FC<{ size?: number; width?: number }> = ({ size = 15, width = 2.6 }) => (
  <Line size={size} width={width}>
    <path d="M5 12l4 4 10-10" />
  </Line>
);

/** The offer's lines: the canvas's own green, not the text colour. */
export const OfferTickIcon: FC = () => (
  <svg
    className="pge-offer__check"
    width={18}
    height={18}
    viewBox="0 0 24 24"
    fill="none"
    stroke="#2e9e5b"
    strokeWidth={2.2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M5 12l4 4 10-10" />
  </svg>
);

/** "Stop guessing.": a pulse. */
export const PulseIcon: FC = () => (
  <Line size={18} width={1.8}>
    <path d="M5 12h4l2-5 2 10 2-5h4" />
  </Line>
);

/** "Find the words.": a speech bubble. */
export const BubbleIcon: FC = () => (
  <Line size={18} width={1.8}>
    <path d="M4 6h16v10H8l-4 4V6z" />
  </Line>
);

/** "Keep desire alive.": two rings. */
export const RingsIcon: FC = () => (
  <Line size={18} width={1.8}>
    <circle cx="9" cy="12" r="5" />
    <circle cx="15" cy="12" r="5" />
  </Line>
);

/** The offer button's arrow. */
export const ArrowRightIcon: FC = () => (
  <Line size={20} width={2}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Line>
);
