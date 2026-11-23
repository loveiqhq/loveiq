"use client";

import { useEffect, useRef, useState } from "react";
import { streak } from "@features/mira/journal";
import { PrimaryButton } from "../MiraShell";
import { useSignedOut } from "../api";
import { SIGNED_OUT_ID } from "../account/SignedOut";
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
  byId,
  refocus,
  thisWeek,
} from "./parts";
import { checkInDrafts, useJournal, type CheckInDraft } from "./useJournal";

/**
 * Home's "Daily journal" card (Mark's Home board): today's question, the check-in, "Remind me
 * daily", and the week so far. Loads its own journal. Gentle by design: no streak is ever shown
 * as broken, and a day without a check-in is just a quiet dash. `account`: the signed-in account's
 * id, which a check-in kept through a lost sign-in belongs to (round-4 R4-HABITS-3).
 */
export function JournalCard({ account = null }: { account?: string | null }) {
  const journal = useJournal();
  const { status, entries, settings, today } = journal;
  const again = useRetry(status === "loading", journal.reload);
  // A lost sign-in, here or anywhere on the page: the one notice, with the way back (HAB-16).
  const out = useSignedOut() || status === "signed-out";
  const [open, setOpen] = useState(false);
  const [bloom, setBloom] = useState(false);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  // A check-in kept when the sign-in went: back in its sheet once the journal is in.
  const [draft, setDraft] = useState<CheckInDraft | null>(null);
  const actions = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (status !== "ready" || !account) return;
    const kept = checkInDrafts.take(account);
    if (!kept) return;
    /* eslint-disable react-hooks/set-state-in-effect -- this tab's storage, read once it's in */
    setDraft(kept);
    setOpen(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [status, account]);

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

  // Beside the card, never inside it: a Save that finds the sign-in gone keeps the sheet, and what
  // is in it, while the card goes quiet (R4-HABITS-3).
  const sheet = open ? (
    <CheckIn
      journal={journal}
      day={draft?.day ?? today}
      journalLink
      account={account}
      draft={draft}
      onClose={() => {
        setOpen(false);
        setDraft(null);
        setBloom(true);
        // What replaced the opener, or the page's notice once the card has gone quiet.
        refocus(() => actions.current?.querySelector("button") ?? byId(SIGNED_OUT_ID));
      }}
    />
  ) : null;

  // Home says a lost sign-in once, above its cards (HAB-16): the card goes quiet. The sheet keeps
  // its place, second, so it stays as it was.
  if (out) {
    return (
      <>
        {null}
        {sheet}
      </>
    );
  }

  return (
    <>
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
      </section>
      {sheet}
    </>
  );
}
