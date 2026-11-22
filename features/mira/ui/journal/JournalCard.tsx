"use client";

import { useRef, useState } from "react";
import { streak } from "@features/mira/journal";
import { PrimaryButton } from "../MiraShell";
import { useSignedOut } from "../api";
import { AdultsOnly, SectionLink } from "../kit";
import { LoadFailed, useRetry } from "../kit/load-failed";
import { CheckIn } from "./CheckIn";
import {
  ARROW,
  CHECK,
  DEFAULT_REMINDER,
  Icon,
  Skeleton,
  Switch,
  WeekDots,
  refocus,
  thisWeek,
} from "./parts";
import { useJournal } from "./useJournal";

/**
 * Home's "Daily journal" card (Mark's Home board): today's question, the check-in, "Remind me
 * daily", and the week so far. Loads its own journal. Gentle by design: no streak is ever shown
 * as broken, and a day without a check-in is just a quiet dash.
 */
export function JournalCard() {
  const journal = useJournal();
  const { status, entries, settings, today } = journal;
  const again = useRetry(status === "loading", journal.reload);
  // A lost sign-in, here or anywhere on the page: the one notice, with the way back (HAB-16).
  const out = useSignedOut() || status === "signed-out";
  const [open, setOpen] = useState(false);
  const [bloom, setBloom] = useState(false);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const actions = useRef<HTMLDivElement | null>(null);

  const doneToday = entries.some((e) => e.day === today);
  const days = entries.map((e) => e.day);
  const run = streak(days, today);
  const recent = thisWeek(entries, today);

  /** Today's check-in: today as it is at the tap, in a tab open since yesterday too. */
  function checkIn() {
    journal.freshToday();
    setOpen(true);
  }

  async function remind(on: boolean) {
    const time = on ? (settings?.reminderTime ?? DEFAULT_REMINDER) : null;
    setNote(null);
    const ok = await journal.setSettings({ reminderTime: time });
    setNote(
      ok
        ? {
            text: time
              ? `Daily reminder on, at ${time} your time. You can change the time in your journal.`
              : "Daily reminder off.",
          }
        : { text: "That didn’t save. Please try again.", bad: true }
    );
  }

  // Home says a lost sign-in once, above its cards (HAB-16): the card goes quiet.
  if (out) return null;

  return (
    <section
      aria-labelledby="journal-card-h"
      aria-busy={status === "loading"}
      className="font-sans text-ap-ink"
    >
      <div className="flex items-end justify-between gap-3">
        <h2
          id="journal-card-h"
          tabIndex={-1}
          className="font-serif text-[24px] font-medium leading-tight outline-none"
        >
          Daily journal
        </h2>
        <SectionLink href="/mira/journal" what="check-ins" />
      </div>

      <div className="relative mt-3 overflow-hidden rounded-[28px] border border-ap-line bg-white p-5 sm:p-7">
        {/* Mira's cloud, used sparingly: one faint wash behind the question. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-28 h-64 w-80 rounded-full bg-[radial-gradient(closest-side_at_40%_55%,rgba(191,102,217,0.12),rgba(191,102,217,0)_100%),radial-gradient(closest-side_at_65%_45%,rgba(149,142,246,0.14),rgba(149,142,246,0)_100%)] blur-[40px]"
        />
        {status === "loading" && !again.busy ? (
          <div className="relative flex flex-col gap-4" aria-hidden="true">
            <Skeleton className="h-7 w-3/4 max-w-[340px]" />
            <Skeleton className="h-4 w-full max-w-[420px]" />
            <Skeleton className="h-12 w-[220px] rounded-full" />
            <Skeleton className="h-11 w-full max-w-[360px]" />
          </div>
        ) : status === "error" || again.busy ? (
          <LoadFailed what="Your journal" {...again} className="relative" />
        ) : status === "minor" ? (
          <AdultsOnly className="relative" />
        ) : (
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
            <div className="min-w-0 flex-1">
              <h3 className="font-serif text-[22px] font-semibold leading-snug tracking-[-0.01em] sm:text-[26px]">
                How is life feeling today?
              </h3>
              <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-ap-body">
                {doneToday
                  ? "Checked in for today. See how your week is shaping up in your journal."
                  : entries.length
                    ? "You haven’t checked in yet today. A few quick ratings across the areas of your life, plus a line if you feel like writing one."
                    : "A few quick ratings across the areas of your life, plus a line if you feel like writing one. About 30 seconds, and yours to look back on."}
              </p>
              <div ref={actions} className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
                {doneToday ? (
                  <button
                    type="button"
                    onClick={checkIn}
                    className="inline-flex min-h-[48px] items-center gap-2 rounded-full border border-ap-lavender bg-white px-6 text-[15px] font-bold text-ap-link transition-colors hover:bg-ap-lilac"
                  >
                    Edit today’s check-in <Icon path={CHECK} />
                  </button>
                ) : (
                  <PrimaryButton onClick={checkIn}>
                    <span className="inline-flex items-center gap-2">
                      Do today’s check-in <Icon path={ARROW} />
                    </span>
                  </PrimaryButton>
                )}
                <Switch
                  checked={Boolean(settings?.reminderTime)}
                  onChange={remind}
                  label={
                    <span>
                      Remind me daily
                      {settings?.reminderTime ? (
                        <span className="text-ap-muted"> · {settings.reminderTime}</span>
                      ) : null}
                    </span>
                  }
                />
              </div>
              {settings?.reminderTime && settings.remindersOnHold ? (
                // Home stays neutral while this lasts: the why is in Settings (R3-HAB-5).
                <p className="mt-2 text-[13px] text-ap-muted">
                  Reminder emails are on hold for now. They start again on their own.
                </p>
              ) : null}
              <p
                role="status"
                className={`text-[13px] ${note ? "mt-2" : ""} ${note?.bad ? "text-ap-bad-ink" : "text-ap-muted"}`}
              >
                {note?.text}
              </p>
            </div>
            <div className="w-full lg:w-[356px] lg:shrink-0">
              <p className="mb-3 text-[14px] text-ap-body">
                {run >= 2 ? (
                  <>
                    <span className="font-serif text-[20px] font-semibold tabular-nums text-ap-ink">
                      {run}
                    </span>{" "}
                    days in a row
                  </>
                ) : recent ? (
                  `${recent} check-in${recent === 1 ? "" : "s"} in the last 7 days`
                ) : (
                  "Your week fills in as you go."
                )}
              </p>
              <WeekDots days={days} today={today} bloom={bloom} />
            </div>
          </div>
        )}
      </div>
      {open ? (
        <CheckIn
          journal={journal}
          day={today}
          journalLink
          onClose={() => {
            setOpen(false);
            setBloom(true);
            refocus(() => actions.current?.querySelector("button"));
          }}
        />
      ) : null}
    </section>
  );
}
