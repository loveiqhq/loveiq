"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LegalLinks, PrimaryButton, Wordmark } from "../MiraShell";
import { miraApi } from "../api";

/**
 * The page behind the journal reminder email's "Stop these reminders" link. The signed token in the
 * link stands for the person, so no sign-in is needed; one button stops the reminder (a link that
 * only opens the page changes nothing, as mail scanners open links).
 */
export function ReminderStop({ token, valid }: { token: string; valid: boolean }) {
  const [screen, setScreen] = useState<"ask" | "stopped" | "invalid">(valid ? "ask" : "invalid");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // The new screen's heading takes focus, so a screen reader announces the change.
  useEffect(() => {
    if (screen === "stopped") heading.current?.focus();
  }, [screen]);

  async function stop() {
    setBusy(true);
    setError(null);
    const res = await miraApi(`/api/mira/journal/reminder?t=${encodeURIComponent(token)}`, {
      method: "POST",
    });
    setBusy(false);
    if (res.ok) setScreen("stopped");
    else if (res.status === 403) setScreen("invalid");
    else setError("That didn’t go through. Please try again.");
  }

  const title =
    screen === "ask"
      ? "Stop your daily check-in reminder?"
      : screen === "stopped"
        ? "Reminders are off."
        : "This link doesn’t work.";

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-ap-ink">
      <header className="flex h-[60px] items-center justify-between border-b border-ap-line px-5">
        <Wordmark />
        <span className="text-[12px] font-semibold text-ap-muted">Email preferences</span>
      </header>
      <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-4 px-5 pb-10 pt-8">
        <h1
          ref={heading}
          tabIndex={-1}
          className="font-serif text-[30px] font-medium leading-tight outline-none"
        >
          {title}
        </h1>
        {screen === "ask" ? (
          <>
            <p className="text-[15px] leading-relaxed text-ap-body">
              You’ll stop getting the daily email that reminds you to check in. Your journal stays
              as it is, and you can turn the reminder back on in it any time.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <PrimaryButton onClick={stop} disabled={busy}>
                {busy ? "Stopping…" : "Stop reminders"}
              </PrimaryButton>
              <Link
                href="/mira/journal"
                className="inline-flex min-h-[44px] items-center text-[15px] font-semibold text-[#561dbd] underline-offset-4 hover:underline"
              >
                Keep them
              </Link>
            </div>
            {error ? (
              <p role="alert" className="text-[14px] text-ap-bad-ink">
                {error}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <p role="status" className="text-[15px] leading-relaxed text-ap-body">
              {screen === "stopped"
                ? "You won’t get the check-in reminder any more. Your journal and Mira’s other emails stay as they are."
                : "It may be incomplete. You can switch the reminder off in your journal, under Daily journal."}
            </p>
            <Link
              href="/mira/journal"
              className="inline-flex min-h-[44px] w-fit items-center text-[15px] font-semibold text-[#561dbd] underline-offset-4 hover:underline"
            >
              Open your journal
            </Link>
          </>
        )}
      </main>
      <footer className="mx-auto w-full max-w-[480px] px-5 pb-8">
        <LegalLinks />
      </footer>
    </div>
  );
}
