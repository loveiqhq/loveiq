"use client";

import { useEffect, useRef } from "react";
import { SIGNED_OUT, SIGNED_OUT_EVENT, signInHref } from "../api";

/** The notice's id: what a page focuses when a sheet over it closes after the sign-in went. */
export const SIGNED_OUT_ID = "mira-signed-out";

/**
 * What had the focus when a Mira route last answered 401: heard as it is told, before the page
 * swaps its content for the notice.
 */
let focusedAtSignOut: Element | null = null;
if (typeof window !== "undefined") {
  window.addEventListener(SIGNED_OUT_EVENT, () => {
    focusedAtSignOut = document.activeElement;
  });
}

/**
 * The one answer to a lost sign-in on a signed-in page (round-2 HAB-16): what happened and a way
 * back in that returns to this page, shown in place of what can no longer be read or saved. A page
 * shows it once `useSignedOut()` (ui/api.ts) hears a 401 from any Mira route.
 *
 * When it replaced the control that had the focus (a switch, Add goal, Notify me, Book, "Show
 * older sessions"), the focus comes here rather than falling to the page, so the next Tab is
 * "Sign in again" (round 4: R4-CORE-7, R4-UXA-1, R4-HABITS-3). A 401 as the page loads has no
 * focus to lose (the page had it), and a focus that is still somewhere stays there.
 */
export function SignedOutNotice() {
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const now = document.activeElement;
    if (now && now !== document.body) return;
    const had = focusedAtSignOut;
    if (had && had !== document.body && !had.isConnected) box.current?.focus();
  }, []);
  return (
    <div
      ref={box}
      id={SIGNED_OUT_ID}
      role="alert"
      tabIndex={-1}
      className="mt-8 rounded-3xl border border-ap-line p-5 outline-none"
    >
      <p className="text-[15px] font-semibold">You were signed out.</p>
      <p className="mt-1 text-[14px] text-ap-body">
        Sign in again to go on. You&apos;ll come straight back here.
      </p>
      <a
        href={signInHref()}
        className="mt-4 inline-flex min-h-[48px] items-center justify-center rounded-full bg-ap-ink px-6 text-[15px] font-bold text-white transition-[transform,background-color] hover:bg-ap-ink/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ap-purple active:scale-[0.98]"
      >
        Sign in again
      </a>
    </div>
  );
}

/**
 * The way back in beside a save's own error line (round-3 R3-ACCT-3): " Sign in again", back to
 * this page and section, when that error is the lost sign-in (every 401 comes back as SIGNED_OUT,
 * ui/api.ts); nothing for any other error.
 */
export function SignInAgain({ error }: { error: string | null }) {
  if (error !== SIGNED_OUT) return null;
  return (
    <>
      {" "}
      <a href={signInHref()} className="font-semibold underline">
        Sign in again
      </a>
    </>
  );
}
