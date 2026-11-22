"use client";

import { useId, useRef, useState } from "react";
import { SwitchRow } from "../checks/ChecksSettings";
import { AskFirst, refocus } from "../journal/parts";
import { AdultsOnly } from "../kit";
import { ScheduleSheet } from "./ScheduleSheet";
import { slotLabel, useWeeklySession, zoneLabel } from "./useWeeklySession";

const OUTLINE_PILL =
  "inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-full border border-ap-line bg-white px-5 text-[14px] font-semibold text-ap-ink transition-colors hover:bg-ap-ground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ap-purple focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-50";

/**
 * Settings' "Weekly session" section (board 08c's "Session reminders"): the booked time with a
 * way to change it, reminder emails on or off, and cancelling. Each control saves at once, apart
 * from the page's Save button. Fetches its own data; renders nothing for an account Mira stopped
 * as under 18. Settings mounts it in the anchor the session emails' "Change or cancel" link
 * opens (#weekly).
 */
export function WeeklySessionSettings() {
  const { state, load, book, setPaused, cancel } = useWeeklySession();
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A cancellation that couldn't be emailed: its calendar update, to open in a calendar instead.
  const [file, setFile] = useState<string | null>(null);
  // Where focus goes when the sheet closes and its opener went with the booking.
  const opener = useRef<HTMLButtonElement | null>(null);
  const id = useId();

  if (state.status === "signed-out") return null;
  if (state.status === "unavailable") {
    return (
      <section aria-labelledby="weekly-session-h" className="flex flex-col gap-3">
        <h2 id="weekly-session-h" className="font-serif text-[22px] font-medium">
          Weekly session
        </h2>
        <AdultsOnly />
      </section>
    );
  }
  const slot = state.status === "ready" ? state.slot : null;

  async function run(action: () => Promise<string | null>, done: string) {
    setBusy(true);
    setError(null);
    setStatus(null);
    const failed = await action();
    setBusy(false);
    if (failed) setError(failed);
    else setStatus(done);
  }

  /** "Cancel session" once asked: null, or the message the question shows. */
  async function cancelSession(): Promise<string | null> {
    setError(null);
    setStatus(null);
    const r = await cancel();
    if (!r.ok) return r.error;
    setFile(r.emailed ? null : r.ics);
    setStatus(
      r.emailed
        ? "Your weekly session is cancelled."
        : "Your weekly session is cancelled, but we couldn’t email the update, so it may still be in your calendar. Delete it there, or open this file with Apple Calendar or Outlook."
    );
    // The question goes with the session: focus goes to "Choose a time", which took its place.
    refocus(() => opener.current);
    return null;
  }

  return (
    <section
      id="weekly-session"
      aria-labelledby="weekly-session-h"
      className="flex scroll-mt-6 flex-col gap-3"
    >
      <h2 id="weekly-session-h" className="font-serif text-[22px] font-medium">
        Weekly session
      </h2>

      {state.status === "loading" ? (
        <div
          aria-busy="true"
          aria-label="Loading your weekly session"
          className="h-[76px] rounded-2xl bg-ap-track motion-safe:animate-pulse"
        />
      ) : state.status === "error" ? (
        <p role="alert" className="text-[14px] text-ap-body">
          {state.message}{" "}
          <button type="button" onClick={() => void load()} className="font-semibold underline">
            Try again
          </button>
        </p>
      ) : slot ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ap-line p-4">
            <span className="min-w-0">
              <span className="block text-[15px] font-bold">{slotLabel(slot)}</span>
              <span className="text-[14px] text-ap-body">
                {zoneLabel(slot.timeZone)} · 15 minutes · next on{" "}
                {new Intl.DateTimeFormat("en-GB", {
                  timeZone: slot.timeZone,
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                }).format(new Date(slot.next))}
              </span>
            </span>
            <button
              ref={opener}
              type="button"
              aria-label="Change your weekly session"
              onClick={() => setSheet(true)}
              className={OUTLINE_PILL}
            >
              Change
            </button>
          </div>
          <SwitchRow
            id={id}
            label="Reminder emails"
            description="A short email 30 to 60 minutes before each session. Neutral subject line."
            checked={!slot.paused}
            busy={busy}
            onChange={(on) =>
              void run(() => setPaused(!on), on ? "Reminders are on." : "Reminders are paused.")
            }
          />
          {slot.remindersOnHold && !slot.paused ? (
            <p className="text-[14px] text-ap-body">
              Reminder emails are on hold for up to two weeks after the support lines came up, so
              none goes out for now. They start again on their own.
            </p>
          ) : null}
          <AskFirst
            label="Cancel weekly session"
            question="Cancel your weekly session? An update that takes it out of your calendar comes by email, or here if the email can’t go."
            action="Cancel session"
            className="w-fit min-h-[44px] text-[14px] font-semibold text-ap-bad-ink underline underline-offset-2"
            run={cancelSession}
          />
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ap-line p-4">
          <p className="max-w-[48ch] text-[14px] leading-relaxed text-ap-body">
            No weekly session yet. Book 15 minutes a week with Mira: a calendar invite, and a short
            reminder before each session.
          </p>
          <button
            ref={opener}
            type="button"
            onClick={() => setSheet(true)}
            className={OUTLINE_PILL}
          >
            Choose a time
          </button>
        </div>
      )}

      <p
        role="status"
        className={`min-h-[20px] text-[14px] ${file ? "text-ap-body" : "text-ap-good-ink"}`}
      >
        {status}
      </p>
      {file && !slot ? (
        <a
          href={`data:text/calendar;charset=utf-8,${encodeURIComponent(file)}`}
          download="mira-weekly-session-cancelled.ics"
          className={`${OUTLINE_PILL} w-fit`}
        >
          Download the cancellation
        </a>
      ) : null}
      {error ? (
        <p role="alert" className="text-[14px] text-ap-bad-ink">
          {error}
        </p>
      ) : null}
      {sheet && state.status === "ready" ? (
        <ScheduleSheet
          slot={slot}
          timeZone={state.timeZone}
          source="settings"
          book={book}
          onClose={() => {
            setSheet(false);
            refocus(() => opener.current);
          }}
        />
      ) : null}
    </section>
  );
}
