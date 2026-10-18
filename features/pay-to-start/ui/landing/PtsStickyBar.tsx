"use client";

import type { FC } from "react";
import { PTS_NOTICES, PTS_STICKY_BAR } from "./payToStartContent";
import { PtsCtaButton, usePtsCheckout } from "./PtsCheckout";

/**
 * 1706:2339: the price and the button pinned to the bottom of any screen narrower than the
 * desktop layout (Marcus on the frame, 14.10: "Sticky"). Shown from the first paint: on a
 * phone the hero has no button, so this is the only one above the fold.
 *
 * It steps up over the cookie banner (--liq-consent-h, shared/ui/ConsentBannerOffset.tsx)
 * and clears the home indicator. A failed click says why in a line above the row: the
 * row itself has no room for a sentence on a 360-wide phone.
 */
export const PtsStickyBar: FC = () => {
  const { price, state } = usePtsCheckout();
  const failed = state.status === "failed" && state.location === "sticky_bar" ? state : null;
  const starting = state.status === "starting" && state.location === "sticky_bar";
  return (
    <div
      data-testid="pts-sticky-bar"
      className="fixed inset-x-0 bottom-[var(--liq-consent-h,0px)] z-30 border-t border-[#e9e6ee] bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_-20px_rgba(22,16,33,0.4)] xl:hidden"
    >
      {failed && (
        <p
          role="alert"
          className="mx-auto max-w-[850px] px-4 pt-2.5 font-sans text-[13px] leading-[18px] text-[#a62700] sm:px-6"
        >
          {failed.message}
        </p>
      )}
      <p role="status" className="sr-only">
        {starting ? PTS_NOTICES.checkoutStarting : ""}
      </p>
      <div className="mx-auto flex h-[74px] max-w-[850px] items-center justify-between gap-3 px-4 sm:px-6">
        <div className="min-w-0">
          <p className="font-serif text-[22px] font-medium leading-[28.16px] text-[#161021]">
            {price}
          </p>
          <p className="mt-[4.5px] truncate font-sans text-[12px] leading-[16.39px] text-[#6b6678]">
            {PTS_STICKY_BAR.label}
          </p>
        </div>
        <PtsCtaButton
          location="sticky_bar"
          glow={false}
          className="h-12 shrink-0 rounded-3xl px-[17px] text-[15px]"
        >
          {PTS_STICKY_BAR.cta}
        </PtsCtaButton>
      </div>
    </div>
  );
};
