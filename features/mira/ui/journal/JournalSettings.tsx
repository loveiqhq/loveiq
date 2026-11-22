"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import type { JournalShare } from "@features/mira/journal";
import { zoneLabel } from "@features/mira/server/calendar";
import { AdultsOnly } from "../kit";
import { AskFirst, DEFAULT_REMINDER, Skeleton, Switch } from "./parts";
import { useJournal, type Journal } from "./useJournal";

/** On the hour or half hour, 6:00 to 23:00: the nudge cron runs twice an hour. */
const TIMES = Array.from({ length: 35 }, (_, i) => {
  const m = 360 + i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${m % 60 ? "30" : "00"}`;
});

/**
 * Settings › Daily journal (for the lead to mount in Settings; the journal page shows it too):
 * "Let Mira read my journal" (off unless turned on, the explicit Art. 9 consent), "Include my
 * notes" (a second, separate choice), the daily reminder and its time, and deleting the journal.
 * Each switch saves at once and says so. Pass `journal` to share a parent's; else it loads its own.
 */
export function JournalSettings({
  journal,
  title = "Daily journal",
}: {
  journal?: Journal;
  /** Its heading: the journal page says "Privacy and reminders" instead. */
  title?: string;
}) {
  const own = useJournal(!journal);
  const j = journal ?? own;
  const id = useId();
  const [status, setStatus] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const s = j.settings;

  async function change(
    patch: { share?: JournalShare; reminderTime?: string | null },
    said: string
  ) {
    setBusy(true);
    setStatus(null);
    const ok = await j.setSettings(patch);
    setBusy(false);
    setStatus(ok ? { text: said } : { text: "That didn’t save. Please try again.", bad: true });
  }

  /** "Delete my journal" once asked: null, or the message the question shows. */
  async function deleteAll(): Promise<string | null> {
    const ok = await j.remove();
    if (!ok) return "Unable to delete right now. Please try again.";
    setStatus({ text: "Your journal is deleted." });
    return null;
  }

  return (
    <section
      id="journal-settings"
      aria-labelledby={`${id}-h`}
      className="flex flex-col gap-3 font-sans text-ap-ink"
    >
      <h2 id={`${id}-h`} className="font-serif text-[22px] font-medium">
        {title}
      </h2>
      {j.status === "loading" ? (
        <div aria-hidden="true" className="flex flex-col gap-3">
          <Skeleton className="h-[88px] w-full rounded-2xl" />
          <Skeleton className="h-[88px] w-full rounded-2xl" />
        </div>
      ) : !s ? (
        <div className="text-[14px] text-ap-body">
          {j.status === "minor" ? (
            <AdultsOnly />
          ) : j.status === "signed-out" ? null : (
            <>
              Your journal settings didn’t load.{" "}
              <button type="button" onClick={j.reload} className="font-semibold underline">
                Try again
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <Row
            id={`${id}-read`}
            title="Let Mira read my journal"
            desc="Mira sees your ratings from the last 7 days, so she can notice patterns with you in a chat. Off unless you turn it on."
          >
            <Switch
              checked={s.share !== "off"}
              disabled={busy}
              labelledBy={`${id}-read`}
              describedBy={`${id}-read-d`}
              onChange={(on) =>
                change(
                  { share: on ? "scores" : "off" },
                  on ? "Mira may read your ratings now." : "Mira no longer reads your journal."
                )
              }
            />
          </Row>
          {s.share !== "off" ? (
            <div className="motion-safe:animate-mira-rise sm:pl-6">
              <Row
                id={`${id}-notes`}
                title="Include my notes"
                desc="Mira also reads the line you write each day. A separate choice: only if you want her to."
              >
                <Switch
                  checked={s.share === "notes"}
                  disabled={busy}
                  labelledBy={`${id}-notes`}
                  describedBy={`${id}-notes-d`}
                  onChange={(on) =>
                    change(
                      { share: on ? "notes" : "scores" },
                      on
                        ? "Mira may read your notes too."
                        : "Mira reads your ratings, not your notes."
                    )
                  }
                />
              </Row>
            </div>
          ) : null}
          <Row
            id={`${id}-remind`}
            title="Remind me daily"
            desc="One short email at the time you choose, never with anything you wrote. One a day at most."
            more={
              s.reminderTime ? (
                <label className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px]">
                  <span className="font-semibold">Time</span>
                  <span className="relative flex">
                    <select
                      value={s.reminderTime}
                      onChange={(e) =>
                        change(
                          { reminderTime: e.target.value },
                          `Reminder moved to ${e.target.value}.`
                        )
                      }
                      className="min-h-[44px] appearance-none rounded-2xl border border-ap-field bg-white pl-4 pr-10 text-[16px] tabular-nums text-ap-ink outline-none focus:border-ap-purple focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ap-purple"
                    >
                      {[...new Set([s.reminderTime, ...TIMES])].sort().map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <svg
                      aria-hidden="true"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ap-muted"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </span>
                  <span className="text-ap-muted">{zoneLabel(s.timeZone)}</span>
                </label>
              ) : null
            }
          >
            <Switch
              checked={Boolean(s.reminderTime)}
              disabled={busy}
              labelledBy={`${id}-remind`}
              describedBy={`${id}-remind-d`}
              onChange={(on) =>
                change(
                  { reminderTime: on ? DEFAULT_REMINDER : null },
                  on
                    ? `Daily reminder on, at ${DEFAULT_REMINDER} your time.`
                    : "Daily reminder off."
                )
              }
            />
          </Row>
          <p
            role="status"
            className={`min-h-[20px] text-[14px] ${status?.bad ? "text-ap-bad-ink" : "text-ap-good-ink"}`}
          >
            {status?.text}
          </p>
          <p className="text-[12px] leading-relaxed text-ap-muted">
            Your check-ins are about your mood, body and closeness, which is sensitive data. Mira
            reads them only while you let her. As on the rest of our site, our analytics tools
            record what’s on screen, so they see your ratings and notes here too. They stay until
            you delete them or your account.{" "}
            <Link href="/mira/privacy" className="underline">
              How Mira handles your data
            </Link>
          </p>
          {j.entries.length ? (
            <AskFirst
              label="Delete my journal"
              question="Delete every check-in in your journal? This can’t be undone."
              action="Delete my journal"
              className="min-h-[44px] w-fit rounded-full border border-ap-bad px-5 text-[14px] font-semibold text-ap-bad-ink"
              run={deleteAll}
            />
          ) : null}
        </>
      )}
    </section>
  );
}

/** A setting: its title and line, its switch, and anything that belongs under it. */
function Row({
  id,
  title,
  desc,
  more,
  children,
}: {
  id: string;
  title: string;
  desc: string;
  more?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-ap-line p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p id={id} className="text-[15px] font-bold">
            {title}
          </p>
          <p id={`${id}-d`} className="mt-0.5 text-[14px] leading-relaxed text-ap-body">
            {desc}
          </p>
        </div>
        <div className="-my-1.5">{children}</div>
      </div>
      {more}
    </div>
  );
}
