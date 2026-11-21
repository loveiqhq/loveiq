"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { CalendarLinks, ScheduleSheet } from "./ScheduleSheet";
import { slotLabel, upcoming, useWeeklySession, zoneLabel } from "./useWeeklySession";

const SECTION = "rounded-3xl border border-ap-line p-5";
const OUTLINE_PILL =
  "inline-flex min-h-[44px] items-center justify-center rounded-full border border-ap-line bg-white px-5 text-[14px] font-semibold text-ap-ink transition-colors hover:bg-ap-ground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ap-purple focus-visible:ring-offset-2 disabled:opacity-50";
const INK_PILL =
  "inline-flex min-h-[44px] items-center justify-center rounded-full bg-ap-ink px-5 text-[14px] font-bold text-white transition-[transform,background-color] hover:bg-[#2b2338] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ap-purple focus-visible:ring-offset-2";

/**
 * Home's weekly session card: the next session's day and time with a way into a calendar and a
 * way to change it; while a session is under way (30 minutes either side of its start), a way
 * in. Before one is booked, an invitation to book. Fetches its own data; renders nothing for an
 * account Mira stopped as under 18, or signed out (Home sends those to sign-in anyway).
 */
export function NextSessionCard() {
  const { state, load, book, setPaused } = useWeeklySession();
  const [sheet, setSheet] = useState(false);
  const [calendar, setCalendar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The card turns into "now" on its own when the time comes.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // The browser's clock only: the server render shows the loading state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  if (state.status === "signed-out" || state.status === "unavailable") return null;

  if (state.status === "loading" || now === null) {
    return (
      <section aria-busy="true" aria-label="Your weekly session" className={SECTION}>
        <div className="flex items-center gap-4">
          <span className="h-[64px] w-[58px] shrink-0 rounded-2xl bg-ap-track motion-safe:animate-pulse" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="h-5 w-40 rounded-full bg-ap-track motion-safe:animate-pulse" />
            <span className="h-4 w-56 max-w-full rounded-full bg-ap-track motion-safe:animate-pulse" />
          </span>
        </div>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section aria-labelledby="weekly-h" className={SECTION}>
        <h2 id="weekly-h" className="font-serif text-[20px] font-semibold">
          Your weekly session
        </h2>
        <p role="alert" className="mt-1 text-[14px] text-ap-body">
          {state.message}{" "}
          <button type="button" onClick={() => void load()} className="font-semibold underline">
            Try again
          </button>
        </p>
      </section>
    );
  }

  const { slot } = state;
  // Beside the card, never inside one of its states: booking turns the empty card into the booked
  // one, and the sheet must stay open on its confirmation through that.
  const sheetEl = sheet ? (
    <ScheduleSheet
      slot={slot}
      timeZone={state.timeZone}
      source="home"
      book={book}
      onClose={() => setSheet(false)}
    />
  ) : null;
  const withSheet = (card: ReactNode) => (
    <>
      {card}
      {sheetEl}
    </>
  );

  if (!slot) {
    return withSheet(
      <section aria-labelledby="weekly-h" className={SECTION}>
        <h2 id="weekly-h" className="font-serif text-[20px] font-semibold">
          A weekly 15 minutes with Mira
        </h2>
        <p className="mt-1 max-w-[56ch] text-[15px] leading-relaxed text-ap-body">
          Real change comes from small, regular steps. Pick a time that’s yours each week: Mira
          sends a calendar invite, and a short reminder before you meet.
        </p>
        <button type="button" onClick={() => setSheet(true)} className={`${INK_PILL} mt-4`}>
          Choose a time
        </button>
      </section>
    );
  }

  const next = upcoming(slot, now);
  async function resume() {
    setError(null);
    const failed = await setPaused(false);
    if (failed) setError(failed);
  }

  return withSheet(
    <section aria-labelledby="weekly-h" className={SECTION}>
      <div className="flex items-start gap-4">
        {/* The day at a glance, as a calendar shows it. */}
        <div
          aria-hidden="true"
          className={`relative flex h-[64px] w-[58px] shrink-0 flex-col items-center justify-center rounded-2xl border ${next.now ? "border-ap-purple bg-ap-lilac" : "border-ap-line bg-white"}`}
        >
          {next.now ? (
            <span className="absolute inset-0 rounded-2xl ring-2 ring-ap-purple motion-safe:animate-play-pulse" />
          ) : null}
          <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ap-plum">
            {next.weekdayShort}
          </span>
          <span className="font-serif text-[24px] font-semibold leading-none tabular-nums">
            {next.day}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="weekly-h" className="font-serif text-[20px] font-semibold">
            {next.now
              ? "Your session is open now"
              : `Your next session · ${next.weekday} ${slot.time}`}
          </h2>
          <p className="mt-0.5 text-[14px] text-ap-body">
            {next.now
              ? `${slotLabel(slot)}, ${zoneLabel(slot.timeZone)}. Fifteen minutes, whenever you’re ready.`
              : `${next.when}, ${next.date} · 15 minutes · ${zoneLabel(slot.timeZone)}`}
          </p>
          {slot.paused ? (
            <p className="mt-1 text-[13px] text-ap-muted">
              Reminder emails are paused.{" "}
              <button
                type="button"
                onClick={() => void resume()}
                className="inline-flex min-h-[32px] items-center font-semibold text-ap-plum underline underline-offset-2"
              >
                Turn them back on
              </button>
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {next.now ? (
          <Link href="/mira/session" prefetch={false} className={INK_PILL}>
            Join now
          </Link>
        ) : (
          <button
            type="button"
            aria-expanded={calendar}
            aria-controls="weekly-calendar"
            onClick={() => setCalendar((c) => !c)}
            className={OUTLINE_PILL}
          >
            Add to calendar
          </button>
        )}
        <button type="button" onClick={() => setSheet(true)} className={OUTLINE_PILL}>
          Change
        </button>
      </div>
      {calendar && !next.now ? (
        <div id="weekly-calendar" className="mt-3 motion-safe:animate-mira-reply">
          <CalendarLinks googleUrl={slot.googleUrl} />
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-ap-bad-ink">
          {error}
        </p>
      ) : null}
    </section>
  );
}
