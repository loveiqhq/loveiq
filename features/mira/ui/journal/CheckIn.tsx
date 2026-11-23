"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import miraConfig from "@features/mira/content/mira-config.json";
import {
  AREAS,
  NOTE_MAX,
  SCALE,
  longDate,
  streak,
  type AreaId,
  type JournalEntry,
} from "@features/mira/journal";
import { PrimaryButton } from "../MiraShell";
import { Modal, SupportPanel, type SupportCountry } from "../SupportPanel";
import { SIGNED_OUT, signInHref } from "../api";
import { CHECK, Icon, WeekDots } from "./parts";
import { checkInDrafts, type CheckInDraft, type Journal } from "./useJournal";

type Ratings = Record<AreaId, number | null>;

const empty = (): Ratings => ({ mood: null, body: null, closeness: null, energy: null });

// Words for every way in: a keyboard or screen reader chooses, it doesn't tap (A11Y-16).
const UNRATED = "Choose one rating in any row to save.";

/** Another tab or device changed the day while this sheet was open: nothing was overwritten. */
const CHANGED_ELSEWHERE =
  "This day’s check-in was saved in another tab or on another device while this was open. Save again to replace it with what’s here, or choose Not now to keep that one.";
const DELETED_ELSEWHERE =
  "This check-in was deleted in another tab or on another device. Save again to keep what’s here.";

const NOTE_HINT = {
  off: "Mira reads your journal only if you allow it in Settings.",
  scores: "Mira sees your ratings, not this line.",
  notes: "Mira can read this line too, as you allowed.",
} as const;

/**
 * The 30-second check-in (Mark's Home board, "Do today's check-in"): every area of life on one
 * screen, one tap each on a labelled 1-to-5 scale (native radios, so arrow keys and screen
 * readers work as they expect), any of them skippable, then an optional line. A sheet at the foot
 * of a phone's screen, a calm dialog on a wider one (Modal). It ends on one moment: the day fills
 * in on the week. A note with crisis words opens the chat's own support panel.
 *
 * A Save that finds the sign-in gone keeps the sheet and what is in it, with the way back in, and
 * keeps the check-in in this tab for the account (round-4 R4-HABITS-3), so the page that opens
 * after signing in brings it back (`draft`).
 */
export function CheckIn({
  journal,
  day,
  onClose,
  journalLink = false,
  account = null,
  draft = null,
}: {
  journal: Journal;
  /** The day to check in for or change: today, or an earlier entry's. */
  day: string;
  onClose: () => void;
  /** Offer "Open journal" when done (not on the journal page itself). */
  journalLink?: boolean;
  /** The signed-in account's id, which a kept check-in belongs to. */
  account?: string | null;
  /** A check-in kept when the sign-in went, back as it was. */
  draft?: CheckInDraft | null;
}) {
  const existing = journal.entries.find((e) => e.day === day);
  const [ratings, setRatings] = useState<Ratings>(() =>
    draft
      ? draft.ratings
      : existing
        ? {
            mood: existing.mood,
            body: existing.body,
            closeness: existing.closeness,
            energy: existing.energy,
          }
        : empty()
  );
  const [note, setNote] = useState(draft?.note ?? existing?.note ?? "");
  // The version this sheet started from: a save never lands on one it hasn't seen (HAB-13).
  const [base, setBase] = useState<string | null>(
    draft ? draft.base : (existing?.updated_at ?? null)
  );
  // Deleted in another tab while open: the next Save puts this day back, an older one too.
  const [restore, setRestore] = useState(draft?.restore ?? false);
  // The sign-in went at a Save: whether the tab keeps this check-in for after signing in.
  const [signedOut, setSignedOut] = useState<{ kept: boolean } | null>(null);
  // Read as the sheet opens: once saved, the journal holds this check-in too.
  const [firstEver] = useState(journal.entries.length === 0);
  const [phase, setPhase] = useState<"edit" | "saving" | "done">("edit");
  const [error, setError] = useState<string | null>(null);
  // A note with crisis words: the support lines (this country first), open until closed.
  const [crisis, setCrisis] = useState<SupportCountry | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const doneHeading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const isToday = day === journal.today;
  const share = journal.settings?.share ?? "off";

  // Keyboard and screen reader users land on the result.
  useEffect(() => {
    if (phase === "done") doneHeading.current?.focus();
  }, [phase]);

  // Signed out, what changes after the Save is kept too, until the person is back.
  useEffect(() => {
    if (signedOut?.kept && account) {
      checkInDrafts.keep(account, { day, ratings, note, base, restore });
    }
  }, [signedOut, account, day, ratings, note, base, restore]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const rated = AREAS.some((a) => ratings[a.id] !== null);
    const line = note.replace(/\s+/g, " ").trim() || null;
    // Nothing rated is no check-in; a line alone still goes to the server, which reads it for
    // crisis words (and answers with the support lines) before it refuses to save it.
    if (!rated && !line) {
      setError(UNRATED);
      return;
    }
    setError(null);
    setSignedOut(null);
    setPhase("saving");
    const entry: JournalEntry = { day, ...ratings, note: line };
    const result = await journal.save(entry, base, restore);
    // The support lines come first, whatever happened to the save.
    if (result.crisisLines) {
      setCrisis(result.crisisLines);
      setSupportOpen(true);
    }
    if (result.conflict) {
      // What is typed here stays; a second Save replaces the other one, knowingly.
      setBase(result.conflict.current?.updated_at ?? null);
      setRestore(!result.conflict.current);
      setPhase("edit");
      setError(result.conflict.current ? CHANGED_ELSEWHERE : DELETED_ELSEWHERE);
      return;
    }
    if (result.signedOut) {
      // Nothing to try again: the way back in, with what is here kept for then.
      setPhase("edit");
      const kept = account
        ? checkInDrafts.keep(account, { day, ratings, note, base, restore })
        : false;
      setSignedOut({ kept });
      return;
    }
    if (!result.ok) {
      setPhase("edit");
      setError(rated ? (result.error ?? "Your check-in didn’t save. Please try again.") : UNRATED);
      return;
    }
    // Saved: nothing waits for a sign-in any more (one made in another tab, say).
    if (account) checkInDrafts.take(account);
    setPhase("done");
  }

  // Characters as a person counts them, and as the database and the API do: an emoji is one.
  const left = NOTE_MAX - [...note].length;
  const days = journal.entries.map((e) => e.day);
  const run = streak(days, journal.today);

  return (
    <>
      <Modal
        label={isToday ? "Today’s check-in" : `Check-in for ${longDate(day)}`}
        onClose={onClose}
      >
        <div className="motion-safe:animate-mira-rise">
          {phase === "done" ? (
            <div className="flex flex-col items-center py-2 text-center">
              <span className="relative flex h-16 w-16 items-center justify-center">
                <span
                  aria-hidden="true"
                  className="absolute -inset-6 rounded-full bg-[radial-gradient(closest-side,rgba(191,102,217,0.22),rgba(149,142,246,0.12)_55%,rgba(255,255,255,0)_100%)] blur-md motion-safe:animate-mira-cloud"
                />
                <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-ap-purple text-white motion-safe:animate-mira-pop">
                  <Icon path={CHECK} className="h-7 w-7" />
                </span>
              </span>
              <h2
                ref={doneHeading}
                tabIndex={-1}
                className="mt-5 font-serif text-[26px] font-medium leading-tight outline-none"
              >
                Saved to your journal.
              </h2>
              <p
                role="status"
                className="mt-2 max-w-[34ch] text-[15px] leading-relaxed text-ap-body"
              >
                {crisis
                  ? miraConfig.crisisMessage
                  : share === "off"
                    ? "Mira can reflect on it if you allow it."
                    : "Mira can reflect on it with you in your next chat."}
              </p>
              {crisis ? (
                <button
                  type="button"
                  onClick={() => setSupportOpen(true)}
                  className="mt-3 min-h-[44px] text-[15px] font-semibold text-ap-link underline"
                >
                  See support lines
                </button>
              ) : isToday && journal.today ? (
                <div className="mt-6 w-full max-w-[360px]">
                  <WeekDots days={days} today={journal.today} bloom />
                  <p className="mt-3 text-[14px] text-ap-muted">
                    {firstEver
                      ? "Your first check-in. Come back any day."
                      : run >= 2
                        ? `That’s ${run} days in a row.`
                        : "Every check-in adds to the picture."}
                  </p>
                </div>
              ) : null}
              <div className="mt-7 flex flex-wrap items-center justify-center gap-4">
                <PrimaryButton onClick={onClose}>Done</PrimaryButton>
                {journalLink ? (
                  <Link
                    href="/mira/journal"
                    className="inline-flex min-h-[44px] items-center text-[15px] font-semibold text-ap-link underline-offset-4 hover:underline"
                  >
                    Open journal
                  </Link>
                ) : null}
              </div>
            </div>
          ) : (
            <form onSubmit={save} noValidate>
              <h2
                data-autofocus
                tabIndex={-1}
                className="font-serif text-[26px] font-medium leading-tight outline-none"
              >
                {isToday ? "How is life feeling today?" : `How was ${longDate(day).split(" ")[0]}?`}
              </h2>
              <p className="mt-1.5 text-[14px] text-ap-muted">
                {longDate(day)} · one rating a row, skip any
              </p>
              {/* Nothing goes disabled while it saves (decision 7: that would drop the keyboard's
                  focus): the circles ignore a change and the line is read-only till then. */}
              <fieldset aria-busy={phase === "saving"} className="mt-5 flex flex-col gap-5">
                {AREAS.map((area, i) => (
                  <Scale
                    key={area.id}
                    ends={i === 0}
                    id={`${id}-${area.id}`}
                    label={area.label}
                    hint={area.hint}
                    value={ratings[area.id]}
                    onChange={(v) => {
                      if (phase === "saving") return;
                      setError(null);
                      setRatings((r) => ({ ...r, [area.id]: v }));
                    }}
                  />
                ))}
                <div>
                  <label htmlFor={`${id}-note`} className="text-[15px] font-semibold">
                    A line for the day <span className="font-normal text-ap-muted">(optional)</span>
                  </label>
                  <input
                    id={`${id}-note`}
                    value={note}
                    autoComplete="off"
                    enterKeyHint="done"
                    placeholder="What stood out?"
                    aria-describedby={`${id}-note-hint`}
                    readOnly={phase === "saving"}
                    onChange={(e) => setNote([...e.target.value].slice(0, NOTE_MAX).join(""))}
                    className="mt-2 min-h-[48px] w-full rounded-2xl border border-ap-field bg-white px-4 text-[16px] caret-ap-purple outline-none transition-colors placeholder:text-ap-muted focus:border-ap-purple"
                  />
                  <p
                    id={`${id}-note-hint`}
                    className="mt-1.5 text-[12px] leading-relaxed text-ap-muted"
                  >
                    {NOTE_HINT[share]}
                    {left <= 40 ? ` ${left} character${left === 1 ? "" : "s"} left.` : ""}
                  </p>
                </div>
              </fieldset>
              {signedOut ? (
                // Not red: nothing the person did is wrong. The link comes back to this page.
                <p role="alert" className="mt-4 text-[14px] text-ap-body">
                  {signedOut.kept
                    ? "You were signed out. Your check-in is kept in this tab, to save once you’re back."
                    : SIGNED_OUT}{" "}
                  <a href={signInHref()} className="font-semibold text-ap-link underline">
                    Sign in again
                  </a>
                </p>
              ) : error ? (
                <p role="alert" className="mt-4 text-[14px] text-ap-bad-ink">
                  {error}
                </p>
              ) : null}
              <div className="mt-6 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[44px] px-1 text-[14px] text-ap-muted underline-offset-4 hover:text-ap-ink hover:underline"
                >
                  Not now
                </button>
                <PrimaryButton type="submit" disabled={phase === "saving"}>
                  {phase === "saving" ? "Saving…" : "Save"}
                </PrimaryButton>
              </div>
            </form>
          )}
        </div>
      </Modal>
      {crisis && supportOpen ? (
        <SupportPanel highlight={crisis} onClose={() => setSupportOpen(false)} />
      ) : null}
    </>
  );
}

/** One area: its name and hint, five circles 1 to 5 with the scale's words, the chosen word. */
function Scale({
  id,
  label,
  hint,
  value,
  onChange,
  ends,
}: {
  id: string;
  label: string;
  hint: string;
  /** Show the scale's end words under this row (the first: every row uses the same scale). */
  ends: boolean;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={`${id}-hint`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0">
          <span id={`${id}-label`} className="text-[15px] font-semibold">
            {label}
          </span>{" "}
          <span id={`${id}-hint`} className="text-[13px] text-ap-muted">
            {hint}
          </span>
        </p>
        <span aria-hidden="true" className="shrink-0 text-[13px] font-semibold text-ap-link">
          {value ? SCALE[value - 1] : ""}
        </span>
      </div>
      <div className="mt-2 flex justify-between sm:justify-start sm:gap-2">
        {SCALE.map((word, i) => (
          <label key={word} className="relative cursor-pointer">
            <input
              type="radio"
              name={id}
              aria-label={`${i + 1}, ${word}`}
              value={i + 1}
              checked={value === i + 1}
              onChange={() => onChange(i + 1)}
              // A second tap on the chosen circle clears the row again.
              onClick={() => value === i + 1 && onChange(null)}
              className="peer sr-only"
            />
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-ap-field bg-white text-[15px] font-semibold tabular-nums text-ap-ink transition-[background-color,border-color,color,transform] duration-200 ease-out hover:border-ap-mist hover:bg-ap-ground peer-checked:border-ap-purple peer-checked:bg-ap-purple peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ap-purple motion-safe:peer-checked:scale-[1.06] sm:h-12 sm:w-12">
              {i + 1}
            </span>
          </label>
        ))}
      </div>
      {ends ? (
        <div
          aria-hidden="true"
          className="mt-1.5 flex justify-between text-[12px] text-ap-muted sm:w-[272px]"
        >
          <span>{SCALE[0]}</span>
          <span>{SCALE[4]}</span>
        </div>
      ) : null}
    </div>
  );
}
