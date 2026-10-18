"use client";

import { useEffect, useState, useSyncExternalStore, type FC } from "react";
import {
  registerPayToStartVisit,
  trackPtsCheckoutCancelled,
  trackPtsLandingViewed,
} from "../analytics";
import { PTS_NOTICES } from "./payToStartContent";
import { usePtsCheckout } from "./PtsCheckout";

/**
 * The page's one moment of state on arrival: back from Stripe without paying
 * (`?checkout=cancelled`, the session's cancel_url), or sent here by the email's continue
 * link when it could not open the survey (`?continue=invalid|refunded|unpaid|used|error`).
 *
 * Read once from the address the page loaded at, then removed from the address bar, so a
 * reload or a copied link does not repeat it. Also where the visit is counted, once per
 * page load.
 */

type Notice = { tone: "info" | "warning"; text: string; key: string };

function noticeFor(params: URLSearchParams): Notice | null {
  if (params.get("checkout") === "cancelled") {
    return { tone: "info", text: PTS_NOTICES.cancelled, key: "checkout_cancelled" };
  }
  switch (params.get("continue")) {
    case "invalid":
      return { tone: "warning", text: PTS_NOTICES.continueInvalid, key: "continue_invalid" };
    case "refunded":
      return { tone: "warning", text: PTS_NOTICES.continueRefunded, key: "continue_refunded" };
    case "unpaid":
      return { tone: "warning", text: PTS_NOTICES.continueUnpaid, key: "continue_unpaid" };
    case "used":
      return { tone: "info", text: PTS_NOTICES.continueUsed, key: "continue_used" };
    case "error":
      return { tone: "warning", text: PTS_NOTICES.continueError, key: "continue_error" };
    default:
      return null;
  }
}

// The address as the page loaded, read once: the effect below rewrites it.
let arrival: { notice: Notice | null } | undefined;
const readArrivalNotice = (): Notice | null => {
  arrival ??= { notice: noticeFor(new URLSearchParams(window.location.search)) };
  return arrival.notice;
};
const noNoticeOnServer = (): Notice | null => null;
const subscribeToNothing = () => () => {};

/** For tests: forget the address this page loaded at. */
export const __resetArrivalNoticeForTests = () => {
  arrival = undefined;
};

export const PtsNotice: FC = () => {
  const { offer, priceCents } = usePtsCheckout();
  const notice = useSyncExternalStore(subscribeToNothing, readArrivalNotice, noNoticeOnServer);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const found = readArrivalNotice();
    registerPayToStartVisit(offer, priceCents);
    trackPtsLandingViewed({ priceCents, notice: found?.key ?? null });
    if (!found) return;
    if (found.key === "checkout_cancelled") trackPtsCheckoutCancelled();
    const url = new URL(window.location.href);
    url.searchParams.delete("checkout");
    url.searchParams.delete("continue");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`
    );
    // Once per page load: the price and offer never change under a rendered page.
  }, [offer, priceCents]);

  if (!notice || dismissed) return null;
  return (
    <div
      role="status"
      className={`mb-4 flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 font-sans text-[14px] leading-[21px] ${
        notice.tone === "info"
          ? "border-[#e9e6ee] bg-[#faf7ff] text-[#3f3a4d]"
          : "border-[#f3d9c9] bg-[#fff7f2] text-[#6b4a3a]"
      }`}
    >
      <p>{notice.text}</p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="focus-visible-ring -m-1 shrink-0 rounded-full p-1 text-[#6b6678] transition-colors hover:text-[#161021]"
      >
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  );
};
