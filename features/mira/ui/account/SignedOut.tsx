"use client";

import { SIGNED_OUT, signInHref } from "../api";

/**
 * The one answer to a lost sign-in on a signed-in page (round-2 HAB-16): what happened and a way
 * back in that returns to this page, shown in place of what can no longer be read or saved. A page
 * shows it once `useSignedOut()` (ui/api.ts) hears a 401 from any Mira route.
 */
export function SignedOutNotice() {
  return (
    <div role="alert" className="mt-8 rounded-3xl border border-ap-line p-5">
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
