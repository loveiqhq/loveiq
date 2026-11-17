/**
 * The new landing page's recurring dress, from the final boards (Hero 3, desktop 1440 and
 * phone 390). Desktop values apply from lg; below lg the phone board's.
 */

/**
 * The board's root type: 16px on a 25.6px line in #161021, which every line without its
 * own height inherits (the hero's button and scale labels among them). Only the page's own
 * sections take it; the live sections it reuses keep the site's relative 1.5 line.
 */
export const PP_TYPE = "text-[16px] leading-[25.6px] text-[#161021]";

/** Section headings: Lora 500, 32px on a 1.2 line on a phone, 46px on 1.18 from lg. */
export const PP_H2 =
  "m-0 font-serif text-[32px] font-medium leading-[1.2] tracking-[-0.01em] text-[#161021] [text-wrap:balance] lg:text-[46px] lg:leading-[1.18]";

/** The board's headings on the live sections it reuses (the research one adds a balanced wrap). */
export const PP_REUSED_H2 =
  "font-serif text-[32px] font-medium leading-[1.2] tracking-[-0.01em] text-[#161021] lg:text-[46px] lg:leading-[1.18]";

/**
 * The board's container on those sections: min(1200px, 100% - 48px) at every width, where
 * the site's .content-shell is 100% - 2.5rem (8px wider on a phone, the same from 1248px).
 */
export const PP_REUSED_SHELL = "mx-auto w-[calc(100%-48px)] max-w-[1200px]";

/**
 * The board's focus ring: a 2px #795fc8 outline, 2px off, for the keyboard only. Here, not in
 * PCta.tsx: a server component that imports a value from a "use client" module gets a client
 * reference, not the string (tests/painPointRscBoundary.test.ts).
 */
export const PP_FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#795fc8]";

/** The brand gradient as text (the board's highlighted words and numbers). */
export const PP_ACCENT =
  "bg-[linear-gradient(135deg,#fe6839_0%,#bf66d9_43%,#958ef6_100%)] bg-clip-text text-transparent";

/** The board's resting card and its lift under a mouse ("lq-card"). */
export const PP_CARD =
  "rounded-[20px] border border-solid border-[#e9e6ee] bg-white shadow-[0_2px_5px_rgba(20,15,33,0.05)] transition-[transform,box-shadow] duration-[350ms] ease-[cubic-bezier(.16,1,.3,1)] hover:shadow-[0_10px_28px_-14px_rgba(20,15,33,0.25)] motion-safe:hover:-translate-y-1 motion-reduce:transition-none";

/** Section padding: 64px and 16px sides on a phone; the desktop values vary per section. */
export const PP_INNER = "mx-auto max-w-[1180px]";
