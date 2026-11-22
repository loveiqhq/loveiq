"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { EmailLinkPage, HEADING, LINK, LinkDoesNotWork } from "../EmailLinkPage";
import { PrimaryButton } from "../MiraShell";
import { miraApi } from "../api";

/**
 * The page behind the journal reminder email's "Stop these reminders" link. The signed token in the
 * link stands for the person, so no sign-in is needed; one button stops the reminder (a link that
 * only opens the page changes nothing, as mail scanners open links). `already`: what the page
 * found when it opened (the reminder off, or no account), so a link opened again says so instead
 * of offering to stop what is stopped, as the weekly session's stop page does (CHAT-23).
 */
export function ReminderStop({
  token,
  valid,
  already,
}: {
  token: string;
  valid: boolean;
  already?: "done" | "none";
}) {
  const [screen, setScreen] = useState<"ask" | "done" | "none" | "invalid">(
    valid ? (already ?? "ask") : "invalid"
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // The new screen's heading takes focus, so a screen reader announces the change.
  useEffect(() => {
    if (screen !== "ask") heading.current?.focus();
  }, [screen]);

  async function stop() {
    setBusy(true);
    setError(null);
    const res = await miraApi(`/api/mira/journal/unsubscribe?t=${encodeURIComponent(token)}`, {
      method: "POST",
    });
    setBusy(false);
    if (res.ok) setScreen("done");
    else if (res.status === 403) setScreen("invalid");
    else setError("That didn’t go through. Please try again.");
  }

  if (screen === "invalid") {
    return (
      <EmailLinkPage>
        <LinkDoesNotWork
          headingRef={heading}
          elsewhere={
            <>
              switch the reminder off in{" "}
              <Link href="/mira/journal" className={LINK}>
                your journal
              </Link>
              .
            </>
          }
        />
      </EmailLinkPage>
    );
  }

  return (
    <EmailLinkPage>
      <h1 ref={heading} tabIndex={-1} className={HEADING}>
        {screen === "ask"
          ? "Stop your daily check-in reminder?"
          : screen === "done"
            ? "No more reminders"
            : "Nothing to stop"}
      </h1>
      {screen === "ask" ? (
        <>
          <p className="text-[15px] leading-relaxed text-ap-body">
            You’ll stop getting the daily email that reminds you to check in. Your journal stays as
            it is, and you can turn the reminder back on in it any time.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <PrimaryButton onClick={stop} disabled={busy}>
              {busy ? "Stopping…" : "Stop reminders"}
            </PrimaryButton>
            <Link
              href="/mira/journal"
              className="inline-flex min-h-[44px] items-center text-[15px] font-semibold text-ap-link underline-offset-4 hover:underline"
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
      ) : screen === "none" ? (
        <p role="status" className="text-[15px] leading-relaxed text-ap-body">
          There’s no check-in reminder to stop, so none will come.
        </p>
      ) : (
        <>
          <p role="status" className="text-[15px] leading-relaxed text-ap-body">
            You won’t get the check-in reminder any more. Your journal and Mira’s other emails stay
            as they are.
          </p>
          <Link
            href="/mira/journal"
            className="inline-flex min-h-[44px] w-fit items-center text-[15px] font-semibold text-ap-link underline-offset-4 hover:underline"
          >
            Open your journal
          </Link>
        </>
      )}
    </EmailLinkPage>
  );
}
