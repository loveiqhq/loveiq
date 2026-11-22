"use client";

import Link from "next/link";
import { useState } from "react";
import { miraApi } from "../api";
import { EmailLinkPage, HEADING, LINK, LinkDoesNotWork } from "../EmailLinkPage";
import { AdultsOnly } from "../kit";
import { PrimaryButton } from "../MiraShell";

const SETTINGS = "/mira/settings#weekly";

/**
 * The page behind "Stop reminders" in a weekly-session email (no sign-in: the link is signed for
 * this one purpose). It can only stop the reminder emails; changing or cancelling the session
 * itself happens in Settings, after signing in. `already`: what the page found when it opened
 * (reminders already paused, or no session booked), so a link opened again says so instead of
 * offering to stop what is stopped.
 */
export function SessionStop({
  token,
  already,
}: {
  token: string | null;
  already?: "done" | "none";
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "none" | "error" | "minor">(
    already ?? "idle"
  );

  if (!token) {
    return (
      <EmailLinkPage>
        <LinkDoesNotWork
          elsewhere={
            <>
              turn reminder emails off, change or cancel your weekly session in{" "}
              <Link href={SETTINGS} className={LINK}>
                Settings
              </Link>{" "}
              after signing in.
            </>
          }
        />
      </EmailLinkPage>
    );
  }

  async function stop() {
    setState("busy");
    const r = await miraApi<{ booked?: boolean; minor?: boolean }>(
      `/api/mira/weekly-session/stop?t=${encodeURIComponent(token!)}`,
      { body: { action: "pause" } }
    );
    if (r.status === 403 && r.data.minor) return setState("minor");
    setState(!r.ok ? "error" : r.data.booked ? "done" : "none");
  }

  // Decision 9: a stop refused as under 18 gets the one refusal, never an error to retry.
  if (state === "minor") {
    return (
      <EmailLinkPage>
        <h1 className={HEADING}>Reminder emails</h1>
        <AdultsOnly />
      </EmailLinkPage>
    );
  }

  if (state === "done" || state === "none") {
    return (
      <EmailLinkPage>
        <div role="status" className="flex flex-col gap-5">
          <h1 className={`${HEADING} motion-safe:animate-mira-in`}>
            {state === "done" ? "No more reminders" : "Nothing to stop"}
          </h1>
          <p className="text-[15px] leading-relaxed text-ap-body">
            {state === "done"
              ? "Your weekly session stays in your calendar, and you can still open it whenever you like. "
              : "There’s no weekly session booked, so no reminders will come. "}
            To turn reminders back on, change or cancel your session, open{" "}
            <Link href={SETTINGS} className={LINK}>
              Settings
            </Link>
            .
          </p>
        </div>
      </EmailLinkPage>
    );
  }

  return (
    <EmailLinkPage>
      <h1 className={HEADING}>Reminder emails</h1>
      <p className="text-[15px] leading-relaxed text-ap-body">
        You get these because you booked a weekly session with Mira: a short email 30 to 60 minutes
        before each session.
      </p>
      <div>
        <PrimaryButton onClick={() => void stop()} disabled={state === "busy"}>
          {state === "busy" ? "Stopping…" : "Stop reminder emails"}
        </PrimaryButton>
      </div>
      {state === "error" ? (
        <p role="alert" className="text-[14px] text-ap-bad-ink">
          That didn’t go through. Please try again.
        </p>
      ) : null}
      <p className="text-[14px] leading-relaxed text-ap-muted">
        Your session stays in your calendar. To change or cancel it, open{" "}
        <Link href={SETTINGS} className={LINK}>
          Settings
        </Link>{" "}
        (you’ll sign in first).
      </p>
    </EmailLinkPage>
  );
}
