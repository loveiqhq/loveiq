"use client";

import { useRef, useState } from "react";
import { AREAS, SCALE, patterns, streak, type JournalEntry } from "@features/mira/journal";
import { MiraAppFrame } from "../MiraAppFrame";
import { useSignedOut } from "../api";
import { SignedOutNotice } from "../account/SignedOut";
import { AdultsOnly, ConfirmDelete } from "../kit";
import { PrimaryButton } from "../MiraShell";
import { CheckIn } from "./CheckIn";
import { JournalSettings } from "./JournalSettings";
import {
  ARROW,
  CHECK,
  Icon,
  Skeleton,
  WeekDots,
  byId,
  dayName,
  refocus,
  refocusRow,
  thisWeek,
} from "./parts";
import { useJournal } from "./useJournal";

/** Shown at once, then more on request. */
const PAGE = 30;

/**
 * /mira/journal (Mark's "Open journal →"): today's check-in and the week, each area's last four
 * weeks as a small chart with its pattern in words, every day's entry (edit or delete it), and the
 * journal's privacy and reminder settings. `startCheckIn`: the reminder email's button
 * (?checkin=1) opens today's check-in once the journal is in.
 */
export default function JournalPage({ startCheckIn = false }: { startCheckIn?: boolean }) {
  const journal = useJournal();
  const { status, entries, today } = journal;
  // A lost sign-in, here or anywhere on the page: the one notice, with the way back (HAB-16).
  const out = useSignedOut() || status === "signed-out";
  const [day, setDay] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [confirm, setConfirm] = useState<string | null>(null);
  // A delete that failed: said in its own question, which stays open.
  const [failed, setFailed] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const checkInRef = useRef<HTMLDivElement | null>(null);
  const daysList = useRef<HTMLOListElement | null>(null);

  const openDay = day ?? (startCheckIn && !dismissed && status === "ready" && today ? today : null);
  const doneToday = entries.some((e) => e.day === today);
  const run = streak(
    entries.map((e) => e.day),
    today
  );
  const recent = thisWeek(entries, today);

  /** Focus goes to the day now in its place, or to the start once none is left (R3-HAB-4). */
  async function remove(d: string, i: number) {
    setBusy(true);
    setFailed(null);
    const ok = await journal.remove(d);
    setBusy(false);
    if (!ok) return setFailed("Unable to delete right now. Please try again.");
    setConfirm(null);
    setSaid(`${dayName(d, today)}: check-in deleted.`);
    refocusRow(daysList, i, () => byId("journal-start-h"));
  }

  const checkInButton = doneToday ? (
    <button
      type="button"
      onClick={() => setDay(journal.freshToday())}
      className="inline-flex min-h-[48px] items-center gap-2 rounded-full border border-ap-lavender bg-white px-6 text-[15px] font-bold text-ap-link transition-colors hover:bg-ap-lilac"
    >
      Edit today’s check-in <Icon path={CHECK} />
    </button>
  ) : (
    <PrimaryButton onClick={() => setDay(journal.freshToday())}>
      <span className="inline-flex items-center gap-2">
        {entries.length ? "Do today’s check-in" : "Do your first check-in"} <Icon path={ARROW} />
      </span>
    </PrimaryButton>
  );

  return (
    <MiraAppFrame active="journal">
      <h1 className="font-serif text-[34px] font-medium leading-tight motion-safe:animate-mira-in">
        Daily journal
      </h1>
      <p className="mt-2 max-w-[56ch] text-[15px] leading-relaxed text-ap-body">
        A 30-second check-in on how life feels. Over the weeks, single days turn into a pattern you
        can read.
      </p>

      {out ? (
        <SignedOutNotice />
      ) : status === "loading" ? (
        <div aria-busy="true" className="mt-8 flex flex-col gap-4">
          <span className="sr-only">Loading your journal</span>
          <Skeleton className="h-[132px] w-full rounded-[28px]" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : status === "error" ? (
        <div className="mt-8">
          <p className="text-[15px] text-ap-body">Your journal didn’t load just now.</p>
          <button
            type="button"
            onClick={journal.reload}
            className="mt-3 min-h-[44px] rounded-full border border-ap-line px-5 text-[14px] font-semibold"
          >
            Try again
          </button>
        </div>
      ) : status === "minor" ? (
        <AdultsOnly className="mt-8" />
      ) : (
        <>
          <div className="mt-7 flex flex-col gap-6 rounded-[28px] border border-ap-line p-5 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
            <div ref={checkInRef}>
              {checkInButton}
              <p className="mt-3 text-[14px] text-ap-body">
                {run >= 2
                  ? `${run} days in a row.`
                  : recent
                    ? `${recent} check-in${recent === 1 ? "" : "s"} in the last 7 days.`
                    : "Your week fills in as you go."}
              </p>
            </div>
            <div className="w-full lg:w-[356px] lg:shrink-0">
              <WeekDots days={entries.map((e) => e.day)} today={today} />
            </div>
          </div>
          {/* Outside "Day by day", so deleting the last day is said too (R3-HAB-4). */}
          <p role="status" className={`text-[14px] text-ap-muted ${said ? "mt-4" : ""}`}>
            {said}
          </p>

          {entries.length === 0 ? (
            <section aria-labelledby="journal-start-h" className="mt-12 max-w-[56ch]">
              <h2
                id="journal-start-h"
                tabIndex={-1}
                className="font-serif text-[24px] font-medium outline-none"
              >
                Your patterns start here
              </h2>
              <p className="mt-2 text-[15px] leading-relaxed text-ap-body">
                Rate how a few areas of your life feel today: mood, body, closeness and energy.
                After a few days, this page shows how each one moves, week by week, and every day
                you wrote down.
              </p>
            </section>
          ) : (
            <>
              <section aria-labelledby="journal-patterns-h" className="mt-12">
                <h2 id="journal-patterns-h" className="font-serif text-[24px] font-medium">
                  Patterns
                </h2>
                <p className="mt-1 text-[14px] text-ap-muted">
                  The last four weeks, one bar a day, taller for a better day. This week is the
                  darker end.
                </p>
                <ul className="mt-4 divide-y divide-ap-line border-y border-ap-line">
                  {patterns(entries, today).map((p) => (
                    <li
                      key={p.id}
                      className="grid gap-x-8 gap-y-2 py-5 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start"
                    >
                      <h3 className="text-[16px] font-semibold">{p.label}</h3>
                      <div className="min-w-0">
                        <DayBars days={p.days} />
                        <p className="mt-2.5 text-[14px] leading-relaxed text-ap-body">
                          {p.summary}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              <section aria-labelledby="journal-days-h" className="mt-12">
                <h2 id="journal-days-h" className="font-serif text-[24px] font-medium">
                  Day by day
                </h2>
                <ol ref={daysList} className="mt-3 divide-y divide-ap-line border-y border-ap-line">
                  {entries.slice(0, shown).map((e, i) => (
                    <Day
                      key={e.day}
                      entry={e}
                      name={dayName(e.day, today)}
                      confirming={confirm === e.day}
                      busy={busy}
                      error={failed}
                      onEdit={() => setDay(e.day)}
                      onAsk={() => {
                        setFailed(null);
                        setConfirm(e.day);
                      }}
                      onCancel={() => setConfirm(null)}
                      onDelete={() => remove(e.day, i)}
                    />
                  ))}
                </ol>
                {entries.length > shown ? (
                  <button
                    type="button"
                    onClick={() => setShown((n) => n + PAGE)}
                    className="mt-4 min-h-[44px] rounded-full border border-ap-line px-5 text-[14px] font-semibold"
                  >
                    Show earlier days
                  </button>
                ) : null}
              </section>
            </>
          )}

          <div className="mt-12 border-t border-ap-line pt-8">
            <JournalSettings journal={journal} title="Privacy and reminders" />
          </div>
        </>
      )}

      {openDay ? (
        <CheckIn
          journal={journal}
          day={openDay}
          onClose={() => {
            setDay(null);
            setDismissed(true);
            refocus(() => checkInRef.current?.querySelector("button"));
            // The email's ?checkin=1 has done its job: a reload shouldn't open the sheet again.
            if (startCheckIn) window.history.replaceState(null, "", "/mira/journal");
          }}
        />
      ) : null}
    </MiraAppFrame>
  );
}

/** One day's entry: what was rated, the note, and its edit and delete. */
function Day({
  entry,
  name,
  confirming,
  busy,
  error,
  onEdit,
  onAsk,
  onCancel,
  onDelete,
}: {
  entry: JournalEntry;
  name: string;
  confirming: boolean;
  busy: boolean;
  /** Why the delete didn't go through, in its open question. */
  error: string | null;
  onEdit: () => void;
  onAsk: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const askRef = useRef<HTMLButtonElement | null>(null);
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <h3 className="text-[15px] font-semibold">{name}</h3>
        <div className="-mr-2 flex">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${name}`}
            className="min-h-[44px] px-2 text-[14px] font-semibold text-ap-link underline-offset-4 hover:underline"
          >
            Edit
          </button>
          <button
            ref={askRef}
            type="button"
            onClick={onAsk}
            aria-label={`Delete ${name}`}
            className="min-h-[44px] px-2 text-[14px] text-ap-muted underline-offset-4 hover:text-ap-bad-ink hover:underline"
          >
            Delete
          </button>
        </div>
      </div>
      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[14px]">
        {AREAS.filter((a) => entry[a.id] !== null).map((a) => (
          <div key={a.id} className="flex gap-1.5">
            <dt className="text-ap-muted">{a.label}</dt>
            <dd className="font-semibold text-ap-ink">{SCALE[entry[a.id]! - 1]}</dd>
          </div>
        ))}
      </dl>
      {entry.note ? (
        <p className="mt-2 max-w-[60ch] font-serif text-[16px] italic leading-relaxed text-ap-ink [overflow-wrap:anywhere]">
          “{entry.note}”
        </p>
      ) : null}
      {confirming ? (
        <div className="mt-3">
          <ConfirmDelete
            question="Delete this check-in? This can’t be undone."
            busy={busy}
            error={error}
            onConfirm={onDelete}
            onKeep={() => {
              // Back to the button that asked, which stays in place.
              askRef.current?.focus();
              onCancel();
            }}
          />
        </div>
      ) : null}
    </li>
  );
}

/**
 * Four weeks of one area as bars, one a day, height for the rating, a flat tick where there is
 * none. Decoration for sight: the summary under it says the same in words.
 */
function DayBars({ days }: { days: Array<number | null> }) {
  return (
    <div aria-hidden="true" className="flex h-12 items-end gap-[3px]">
      {days.map((v, i) => (
        <span
          key={i}
          className={`min-w-0 flex-1 rounded-[3px] ${v === null ? "h-[3px] bg-ap-line" : i >= 21 ? "bg-ap-purple" : "bg-ap-mist"}`}
          style={v === null ? undefined : { height: `${(v / 5) * 100}%` }}
        />
      ))}
    </div>
  );
}
