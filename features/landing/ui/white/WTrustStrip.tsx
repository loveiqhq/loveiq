import type { FC, ReactNode } from "react";

/**
 * Thin reassurance strip under the hero (Figma node 8947:7469). Four hairline
 * claims separated by middots; wraps to a two-line grid on small screens rather
 * than scrolling horizontally.
 */

const items: { icon: ReactNode; label: string }[] = [
  {
    label: "Anonymous by default",
    icon: (
      <>
        <path d="M11.25 6.25H3.75C3.06 6.25 2.5 6.81 2.5 7.5v4.375c0 .69.56 1.25 1.25 1.25h7.5c.69 0 1.25-.56 1.25-1.25V7.5c0-.69-.56-1.25-1.25-1.25Z" />
        <path d="M5 6.25V4.375a2.5 2.5 0 0 1 5 0V6.25" />
      </>
    ),
  },
  {
    label: "Science-backed, not a horoscope",
    icon: <path d="M8.125 1.25 2.5 8.75h4.375l-.625 5 5.625-7.5H7.5l.625-5Z" />,
  },
  {
    label: "TLS 1.3 Encryption",
    icon: (
      <>
        <path d="M11.25 6.875H3.75c-.69 0-1.25.56-1.25 1.25v4.375c0 .69.56 1.25 1.25 1.25h7.5c.69 0 1.25-.56 1.25-1.25V8.125c0-.69-.56-1.25-1.25-1.25Z" />
        <path d="M5 6.875V4.688a2.5 2.5 0 0 1 5 0v2.187" />
      </>
    ),
  },
  {
    label: "About 9 minutes",
    icon: (
      <>
        <path d="M7.5 13.125a5.625 5.625 0 1 0 0-11.25 5.625 5.625 0 0 0 0 11.25Z" />
        <path d="M7.5 4.375V7.5l1.875 1.25" />
      </>
    ),
  },
];

const WTrustStrip: FC = () => (
  <div className="border-y border-[#efedf3] bg-[#f5f4f8]">
    <div className="content-shell flex flex-wrap items-center justify-center gap-x-4 gap-y-2.5 py-[15px] sm:gap-x-5">
      {items.map((it, i) => (
        <div key={it.label} className="flex items-center gap-4 sm:gap-5">
          {i > 0 && (
            <span aria-hidden className="hidden text-[13.5px] text-[#6f6a7a]/50 sm:inline">
              ·
            </span>
          )}
          <span className="flex items-center gap-2">
            <svg
              aria-hidden
              className="h-[15px] w-[15px] shrink-0"
              viewBox="0 0 15 15"
              fill="none"
              stroke="#fe6839"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {it.icon}
            </svg>
            <span className="text-[12.5px] font-semibold text-[#3a3444] sm:text-[13.5px]">
              {it.label}
            </span>
          </span>
        </div>
      ))}
    </div>
  </div>
);

export default WTrustStrip;
