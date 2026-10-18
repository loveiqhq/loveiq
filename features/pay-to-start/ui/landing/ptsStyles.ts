/**
 * The class strings the pay-to-start page repeats, measured off Figma 1706:1699 (desktop,
 * 1440) and 1706:2034 (phone, 390). Written out in full so Tailwind finds them.
 */

/**
 * The buttons' gradient as Figma renders it. Figma pins the stops to handles at 14.6 % and
 * 85.4 % of the box's diagonal, so the ends are solid; the landing's 0-100 % version
 * spreads them to the corners.
 */
export const PTS_CTA_GRADIENT =
  "bg-[linear-gradient(to_bottom_right,#fe6839_14.6%,#bf66d9_45.1%,#958ef6_85.4%)]";

/** Every section: its heading sits 56 below the section's top; sections have no bottom padding. */
export const PTS_SECTION = "scroll-mt-6 pt-14";

/** Section headings: Lora 500, 34/40.8 (26/31.2 on a phone), -0.3 tracking. */
export const PTS_H2 =
  "font-serif text-[26px] font-medium leading-[31.2px] tracking-[-0.3px] text-[#161021] sm:text-[34px] sm:leading-[40.8px]";

/** The paragraph under a section heading: 10 below it, 682 wide at most. */
export const PTS_LEAD = "mt-2.5 max-w-[682px] font-sans text-[16px] leading-[25px] text-[#3f3a4d]";

/** The numbers on the cards and lists ("01"): Lora italic 14, violet. */
export const PTS_NUMBER =
  "font-serif text-[14px] italic leading-[17.92px] tracking-[0.6px] text-[#6d28d9]";

/** The white cards with a hairline border. */
export const PTS_CARD = "rounded-[20px] border border-[#e9e6ee] bg-white";
