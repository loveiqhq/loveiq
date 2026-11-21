"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { PrimaryButton } from "../MiraShell";
import { miraApi } from "../api";
import { addPasskey, markOffered, unlockName } from "./passkeys";

/**
 * "Use Face ID next time?", once per browser, right after a code sign-in on a device that can make
 * a passkey (SignUpFlow). The wording follows the device: Face ID, Touch ID, Windows Hello, a
 * fingerprint. One tap adds the passkey; "Not now" goes on.
 */
export function PasskeyOffer({
  headingRef,
  onDone,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  onDone: () => void;
}) {
  const [name] = useState(() => unlockName(navigator.userAgent, navigator.maxTouchPoints));
  const [state, setState] = useState<"ask" | "busy" | "done">("ask");
  const [error, setError] = useState<string | null>(null);
  const next = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    markOffered();
    void miraApi("/api/mira/event", { body: { type: "track", name: "passkey_offer_shown" } });
  }, []);
  useEffect(() => {
    if (state === "done") next.current?.focus();
  }, [state]);

  async function add() {
    setState("busy");
    setError(null);
    const res = await addPasskey("offer");
    if (res.ok) return setState("done");
    setState("ask");
    // Closed the sheet: no message, the choice stays open.
    if (res.error) setError(res.error);
  }

  return (
    <div className="flex flex-col gap-5">
      <FaceMark done={state === "done"} />
      <div>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="font-serif text-[34px] font-medium leading-tight outline-none"
        >
          {state === "done" ? "You're all set" : `Use ${name} next time?`}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ap-body" aria-live="polite">
          {state === "done"
            ? `Next time, just sign in with ${name}. No code needed.`
            : `Skip the code next time and sign in with ${name}. Your face or fingerprint stays on your device; Mira never sees it.`}
        </p>
      </div>
      {state === "done" ? (
        <button
          ref={next}
          type="button"
          onClick={onDone}
          className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-ap-ink px-6 text-[15px] font-bold text-white transition-[transform,background-color] hover:bg-[#2b2338] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ap-purple active:scale-[0.98]"
        >
          Continue
        </button>
      ) : (
        <>
          <PrimaryButton onClick={add} disabled={state === "busy"}>
            {state === "busy" ? "Waiting for your device…" : `Use ${name}`}
          </PrimaryButton>
          <button
            type="button"
            onClick={onDone}
            disabled={state === "busy"}
            className="min-h-[44px] text-[14px] text-ap-muted underline disabled:opacity-50"
          >
            Not now
          </button>
          <p className="text-[13px] leading-relaxed text-ap-muted">
            You can add or remove passkeys anytime in Settings.
          </p>
        </>
      )}
      {error ? (
        <p role="alert" className="text-[14px] text-ap-bad-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A quiet face-scan mark: a line sweeps while it asks, then a check. Still without motion. */
function FaceMark({ done }: { done: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-[20px] bg-ap-lilac text-ap-plum motion-safe:animate-mira-pop"
    >
      <svg
        width="34"
        height="34"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
        {done ? (
          <path d="m8.5 12.5 2.5 2.5 4.5-5" />
        ) : (
          <>
            <path d="M9 9.5v1M15 9.5v1M12 9.5v3.5h-1" />
            <path d="M9.5 15.5a3.5 3.5 0 0 0 5 0" />
          </>
        )}
      </svg>
      {done ? null : (
        <span className="pointer-events-none absolute inset-x-2 top-0 h-px bg-ap-purple/70 opacity-0 motion-safe:animate-mira-scan motion-reduce:hidden" />
      )}
    </div>
  );
}
