"use client";

import Link from "next/link";
import { useState } from "react";
import { miraApi } from "../api";
import { PrimaryButton } from "../MiraShell";

const SETTINGS = "/mira/settings#weekly-session";
const LINK = "font-semibold text-ap-plum underline underline-offset-2";

/**
 * The page behind "Stop reminders" in a weekly-session email (no sign-in: the link is signed for
 * this one purpose). It can only stop the reminder emails; changing or cancelling the session
 * itself happens in Settings, after signing in.
 */
export function SessionStop({ token }: { token: string | null }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "none" | "error">("idle");

  if (!token) {
    return (
      <div className="mx-auto max-w-[560px] py-10 sm:py-16">
        <h1 className="font-serif text-[32px] font-medium leading-tight">This link doesn’t work</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ap-body">
          It may be incomplete. You can turn reminder emails off, change or cancel your weekly
          session in{" "}
          <Link href={SETTINGS} className={LINK}>
            Settings
          </Link>{" "}
          after signing in.
        </p>
      </div>
    );
  }

  async function stop() {
    setState("busy");
    const r = await miraApi<{ booked?: boolean }>(
      `/api/mira/weekly-session/stop?t=${encodeURIComponent(token!)}`,
      { body: { action: "pause" } }
    );
    setState(!r.ok ? "error" : r.data.booked ? "done" : "none");
  }

  if (state === "done" || state === "none") {
    return (
      <div className="mx-auto max-w-[560px] py-10 sm:py-16" role="status">
        <h1 className="font-serif text-[32px] font-medium leading-tight motion-safe:animate-mira-in">
          {state === "done" ? "No more reminders" : "Nothing to stop"}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ap-body">
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
    );
  }

  return (
    <div className="mx-auto max-w-[560px] py-10 sm:py-16">
      <h1 className="font-serif text-[32px] font-medium leading-tight">Reminder emails</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ap-body">
        You get these because you booked a weekly session with Mira: a short email 30 to 60 minutes
        before each session.
      </p>
      <div className="mt-6">
        <PrimaryButton onClick={() => void stop()} disabled={state === "busy"}>
          {state === "busy" ? "Stopping…" : "Stop reminder emails"}
        </PrimaryButton>
      </div>
      {state === "error" ? (
        <p role="alert" className="mt-3 text-[14px] text-ap-bad-ink">
          That didn’t go through. Please try again.
        </p>
      ) : null}
      <p className="mt-6 text-[14px] leading-relaxed text-ap-muted">
        Your session stays in your calendar. To change or cancel it, open{" "}
        <Link href={SETTINGS} className={LINK}>
          Settings
        </Link>{" "}
        (you’ll sign in first).
      </p>
    </div>
  );
}
