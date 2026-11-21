"use client";

import { useState } from "react";
import { AREAS, SCALE, patterns, streak, type JournalEntry } from "@features/mira/journal";
import { MiraAppFrame } from "../MiraAppFrame";
import { PrimaryButton } from "../MiraShell";
import { CheckIn } from "./CheckIn";
import { JournalSettings } from "./JournalSettings";
import { ARROW, CHECK, Icon, Skeleton, WeekDots, dayName, thisWeek } from "./parts";
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
  const [day, setDay] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [said, setSaid] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const openDay = day ?? (startCheckIn && !dismissed && status === "ready" && today ? today : null);
  const doneToday = entries.some((e) => e.day === today);
  const run = streak(
    entries.map((e) => e.day),
    today
  );
  const recent = thisWeek(entries, today);

  async function remove(d: string) {
    setBusy(true);
    const ok = await journal.remove(d);
    setBusy(false);
    setConfirm(null);
    setSaid(
      ok
        ? { text: `${dayName(d, today)}: check-in deleted.` }
        : { text: "Unable to delete right now. Please try again.", bad: true }
    );
  }

  const checkInButton = doneToday ? (
    <button
      type="button"
      onClick={() => setDay(today)}
      className="inline-flex min-h-[48px] items-center gap-2 rounded-full border border-ap-lavender bg-white px-6 text-[15px] font-bold text-[#561dbd] transition-colors hover:bg-ap-lilac"
    >
      Edit today’s check-in <Icon path={CHECK} />
    </button>
  ) : (
    <PrimaryButton onClick={() => setDay(today)}>
      <span className="inline-flex items-center gap-2">
        {entries.length ? "Do today’s check-in" : "Do your first check-in"} <Icon path={ARROW} />
      </span>
    </PrimaryButton>
  );

  return (
    <MiraAppFrame active="home">
      <h1 className="font-serif text-[34px] font-medium leading-tight motion-safe:animate-mira-in">
        Daily journal
      </h1>
      <p className="mt-2 max-w-[56ch] text-[15px] leading-relaxed text-ap-body">
        A 30-second check-in on how life feels. Over the weeks, single days turn into a pattern you
        can read.
      </p>

      {status === "loading" ? (
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
      ) : status === "unavailable" ? (
        <p className="mt-8 text-[15px] text-ap-body">The journal isn’t available here.</p>
      ) : (
        <>
          <div className="mt-7 flex flex-col gap-6 rounded-[28px] border border-ap-line p-5 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
            <div>
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

          {entries.length === 0 ? (
            <section aria-labelledby="journal-start-h" className="mt-12 max-w-[56ch]">
              <h2 id="journal-start-h" className="font-serif text-[24px] font-medium">
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
                <ul
                  className="mt-4 divide-y divide-ap-line border-y border-ap-line"
                >
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
                <p
                  role="status"
                  className={`mt-1 min-h-[20px] text-[14px] ${said?.bad ? "text-ap-bad-ink" : "text-ap-muted"}`}
                >
                  {said?.text}
                </p>
                <ol
                  className="mt-2 divide-y divide-ap-line border-y border-ap-line"
                >
                  {entries.slice(0, shown).map((e) => (
                    <Day
                      key={e.day}
                      entry={e}
                      name={dayName(e.day, today)}
                      confirming={confirm === e.day}
                      busy={busy}
                      onEdit={() => setDay(e.day)}
                      onAsk={() => setConfirm(e.day)}
                      onCancel={() => setConfirm(null)}
                      onDelete={() => remove(e.day)}
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
  onEdit,
  onAsk,
  onCancel,
  onDelete,
}: {
  entry: JournalEntry;
  name: string;
  confirming: boolean;
  busy: boolean;
  onEdit: () => void;
  onAsk: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <h3 className="text-[15px] font-semibold">{name}</h3>
        <div className="-mr-2 flex">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${name}`}
            className="min-h-[44px] px-2 text-[14px] font-semibold text-[#561dbd] underline-offset-4 hover:underline"
          >
            Edit
          </button>
          <button
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
        <div className="mt-3 rounded-2xl border border-ap-bad p-4 text-[14px]">
          <p>Delete this check-in? This can’t be undone.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={onDelete}
              className="min-h-[44px] rounded-full bg-ap-bad px-5 font-semibold text-white disabled:opacity-50"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="min-h-[44px] rounded-full border border-ap-line px-5 font-semibold"
            >
              Keep it
            </button>
          </div>
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
