"use client";

import { useState } from "react";
import { ScheduleSheet } from "./ScheduleSheet";
import { slotLabel, useWeeklySession, zoneLabel } from "./useWeeklySession";

const OUTLINE_PILL =
  "inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-full border border-ap-line bg-white px-5 text-[14px] font-semibold text-ap-ink transition-colors hover:bg-ap-ground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ap-purple focus-visible:ring-offset-2 disabled:opacity-50";

/**
 * Settings' "Weekly session" section (board 08c's "Session reminders"): the booked time with a
 * way to change it, reminder emails on or off, and cancelling. Each control saves at once, apart
 * from the page's Save button. Fetches its own data; renders nothing for an account Mira stopped
 * as under 18. Its id is the anchor the session emails' "Change or cancel" link opens.
 */
export function WeeklySessionSettings() {
  const { state, load, book, setPaused, cancel } = useWeeklySession({ signIn: true });
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A cancellation that couldn't be emailed: its calendar update, to open in a calendar instead.
  const [file, setFile] = useState<string | null>(null);

  if (state.status === "signed-out" || state.status === "unavailable") return null;
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

  async function cancelSession() {
    setBusy(true);
    setError(null);
    setStatus(null);
    const r = await cancel();
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setConfirm(false);
    setFile(r.emailed ? null : r.ics);
    setStatus(
      r.emailed
        ? "Your weekly session is cancelled."
        : "Your weekly session is cancelled, but we couldn’t email the update, so it may still be in your calendar. Delete it there, or open this file with Apple Calendar or Outlook."
    );
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
            <button type="button" onClick={() => setSheet(true)} className={OUTLINE_PILL}>
              Change
            </button>
          </div>
          <label className="flex items-start justify-between gap-4 rounded-2xl border border-ap-line p-4">
            <span>
              <span className="block text-[15px] font-bold">Reminder emails</span>
              <span className="text-[14px] text-ap-body">
                A short email 30 to 60 minutes before each session. Neutral subject line.
              </span>
            </span>
            <input
              type="checkbox"
              checked={!slot.paused}
              disabled={busy}
              onChange={(e) =>
                void run(
                  () => setPaused(!e.target.checked),
                  e.target.checked ? "Reminders are on." : "Reminders are paused."
                )
              }
              className="mt-1 h-5 w-5 shrink-0 accent-ap-purple"
            />
          </label>
          {confirm ? (
            <div className="rounded-2xl border border-ap-bad p-4 text-[14px]">
              <p>
                Cancel your weekly session? An update that takes it out of your calendar comes by
                email, or here if the email can’t go.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void cancelSession()}
                  className="min-h-[44px] rounded-full bg-ap-bad px-5 font-semibold text-white disabled:opacity-50"
                >
                  Cancel session
                </button>
                <button
                  type="button"
                  onClick={() => setConfirm(false)}
                  className="min-h-[44px] rounded-full border border-ap-line px-5 font-semibold"
                >
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setStatus(null);
                setConfirm(true);
              }}
              className="w-fit min-h-[44px] text-[14px] font-semibold text-ap-bad-ink underline underline-offset-2"
            >
              Cancel weekly session
            </button>
          )}
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ap-line p-4">
          <p className="max-w-[48ch] text-[14px] leading-relaxed text-ap-body">
            No weekly session yet. Book 15 minutes a week with Mira: a calendar invite, and a short
            reminder before each session.
          </p>
          <button type="button" onClick={() => setSheet(true)} className={OUTLINE_PILL}>
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
          onClose={() => setSheet(false)}
        />
      ) : null}
    </section>
  );
}
