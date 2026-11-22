"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ANSWER_CHIP } from "../IntakeAnswers";
import { PrimaryButton } from "../MiraShell";
import {
  SUGGESTED_TIMES,
  browserZone,
  slotLabel,
  useWeeklySession,
  zoneLabel,
  type SlotView,
} from "./useWeeklySession";

/** A day and a time: what the picker holds until both are chosen. */
export type Pick = { weekday: number | null; time: string | null };

/** Short on screen, whole for screen readers (its aria-label). */
const DAYS: Array<[string, string]> = [
  ["Mon", "Monday"],
  ["Tue", "Tuesday"],
  ["Wed", "Wednesday"],
  ["Thu", "Thursday"],
  ["Fri", "Friday"],
  ["Sat", "Saturday"],
  ["Sun", "Sunday"],
];

/**
 * Whether two zones keep different clocks: now, or in six months (summer time can differ). Berlin
 * and Sarajevo don't, so the picker doesn't offer one for the other.
 */
function clocksDiffer(a: string, b: string): boolean {
  const offset = (timeZone: string, at: Date) =>
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value;
  const now = new Date();
  return [now, new Date(now.getTime() + 182 * 86_400_000)].some(
    (at) => offset(a, at) !== offset(b, at)
  );
}

/** A radio styled as the chat's answer chip; selected in the multi-select's lilac. */
const RADIO_CHIP =
  "inline-flex min-h-[44px] min-w-[52px] cursor-pointer select-none items-center justify-center rounded-full border border-ap-line bg-white px-3.5 text-[14px] tabular-nums text-ap-body transition-colors duration-150 hover:border-ap-mist hover:bg-ap-ground peer-checked:border-ap-purple peer-checked:bg-ap-lilac peer-checked:font-semibold peer-checked:text-ap-ink peer-focus-visible:ring-2 peer-focus-visible:ring-ap-purple peer-focus-visible:ring-offset-2";
const LEGEND = "text-[13px] font-semibold text-ap-ink";
export const CARD = "rounded-[20px] border border-ap-line bg-white/90 p-4";

/**
 * Day and time as radio chips: real radios (one tab stop per row, arrow keys, the whole day's
 * name read out), Sanjin's suggested times, and "Another time" with the browser's own time
 * input. The zone line says whose clock the time is on, and offers this device's zone when its
 * clock differs.
 */
export function SlotPicker({
  value,
  onChange,
  timeZone,
  onTimeZone,
}: {
  value: Pick;
  onChange: (next: Pick) => void;
  timeZone: string;
  onTimeZone: (zone: string) => void;
}) {
  const id = useId();
  const [other, setOther] = useState(value.time !== null && !SUGGESTED_TIMES.includes(value.time));
  const timeRef = useRef<HTMLInputElement | null>(null);
  const [here, setHere] = useState<string | null>(null);
  // This device's zone is only known in the browser.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setHere(browserZone()), []);

  return (
    <div className="flex flex-col gap-4">
      <fieldset>
        <legend className={LEGEND}>Day</legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DAYS.map(([short, day], i) => (
            <label key={short} className="relative">
              <input
                type="radio"
                name={`${id}-day`}
                value={i + 1}
                aria-label={day}
                checked={value.weekday === i + 1}
                onChange={() => onChange({ ...value, weekday: i + 1 })}
                className="peer sr-only"
              />
              <span className={RADIO_CHIP}>{short}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className={LEGEND}>Time</legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SUGGESTED_TIMES.map((t) => (
            <label key={t} className="relative">
              <input
                type="radio"
                name={`${id}-time`}
                value={t}
                checked={!other && value.time === t}
                onChange={() => {
                  setOther(false);
                  onChange({ ...value, time: t });
                }}
                className="peer sr-only"
              />
              <span className={RADIO_CHIP}>{t}</span>
            </label>
          ))}
          <label className="relative">
            <input
              type="radio"
              name={`${id}-time`}
              value="other"
              checked={other}
              onChange={() => {
                setOther(true);
                // Keeps a picked time as the starting point; focus moves to the time itself.
                window.requestAnimationFrame(() => timeRef.current?.focus());
              }}
              className="peer sr-only"
            />
            <span className={RADIO_CHIP}>Another time</span>
          </label>
        </div>
        {other ? (
          <label className="mt-3 flex items-center gap-3 text-[14px] text-ap-body motion-safe:animate-mira-reply">
            Your time
            <input
              ref={timeRef}
              type="time"
              step={300}
              required
              value={value.time ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  time: /^([01]\d|2[0-3]):[0-5]\d$/.test(e.target.value) ? e.target.value : null,
                })
              }
              className="min-h-[44px] rounded-full border border-ap-line bg-white px-4 text-[16px] tabular-nums text-ap-ink outline-none transition-colors focus:border-ap-purple focus-visible:ring-2 focus-visible:ring-ap-purple focus-visible:ring-offset-2"
            />
          </label>
        ) : null}
      </fieldset>

      <p className="text-[13px] leading-snug text-ap-muted">
        Times are {zoneLabel(timeZone)}.
        {here && here !== timeZone && clocksDiffer(here, timeZone) ? (
          <>
            {" "}
            <button
              type="button"
              onClick={() => onTimeZone(here)}
              className="inline-flex min-h-[32px] items-center font-semibold text-ap-plum underline underline-offset-2"
            >
              Use {zoneLabel(here)}
            </button>
          </>
        ) : null}
      </p>
    </div>
  );
}

/** What the booking button says: book, move, or keep the time already booked. */
export function bookLabel(pick: Pick, slot: SlotView | null): string {
  if (pick.weekday === null || pick.time === null) return "Pick a day and a time";
  const label = slotLabel({ weekday: pick.weekday, time: pick.time });
  if (!slot) return `Book ${label}`;
  return slot.weekday === pick.weekday && slot.time === pick.time
    ? `Keep ${label}`
    : `Move to ${label}`;
}

/**
 * The weekly question's answer in the chat ([[ASK:weekly]], answer type "slots"): the picker in a
 * card under Mira's question. Booking saves the slot and emails the invite first, then the
 * person's answer goes into the chat, so Mira confirms only what the app has done. Signed out:
 * an invitation to the free account (the chat comes along). "Not ready yet" and "Skip this one"
 * stay, as for every intake question.
 */
export function ChatSlotPicker({
  notReady,
  onAnswer,
  onSkip,
}: {
  notReady: string;
  onAnswer: (text: string) => void;
  onSkip: () => void;
}) {
  const { state, load, book } = useWeeklySession();
  const [pick, setPick] = useState<Pick>({ weekday: null, time: null });
  const [zone, setZone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slot = state.status === "ready" ? state.slot : null;

  // Starts from the time already booked, if there is one, and the profile's zone.
  useEffect(() => {
    if (state.status !== "ready" || zone !== null) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setZone(state.slot?.timeZone ?? (state.timeZone || browserZone() || "Europe/Berlin"));
    if (state.slot) setPick({ weekday: state.slot.weekday, time: state.slot.time });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [state, zone]);

  const quiet = (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => onAnswer(notReady)} className={ANSWER_CHIP}>
        {notReady}
      </button>
      <button type="button" onClick={onSkip} className={`${ANSWER_CHIP} text-ap-muted`}>
        Skip this one
      </button>
    </div>
  );

  if (state.status === "unavailable") return quiet;
  if (state.status === "signed-out") {
    return (
      <div className="flex flex-col gap-2 motion-safe:animate-mira-reply">
        <div className={`${CARD} flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4`}>
          <p className="flex-1 text-[14px] leading-normal text-ap-body">
            Weekly sessions come with a free account, so Mira can send your calendar invite and a
            short reminder before each one. This chat comes with you.
          </p>
          <Link
            href="/mira/start"
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-ap-ink px-5 text-[14px] font-bold text-white"
          >
            Create free account
          </Link>
        </div>
        {quiet}
      </div>
    );
  }
  if (state.status === "loading" || (state.status === "ready" && zone === null)) {
    return (
      <div aria-busy="true" aria-label="Loading times" className={`${CARD} flex flex-col gap-3`}>
        {[0, 1].map((row) => (
          <div key={row} className="flex flex-wrap gap-1.5">
            {Array.from({ length: row ? 5 : 7 }, (_, i) => (
              <span
                key={i}
                className="h-11 w-[52px] rounded-full bg-ap-track motion-safe:animate-pulse"
              />
            ))}
          </div>
        ))}
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="flex flex-col gap-2">
        <div className={CARD}>
          <p role="alert" className="text-[14px] text-ap-body">
            The times didn’t load.{" "}
            <button type="button" onClick={() => void load()} className="font-semibold underline">
              Try again
            </button>
          </p>
        </div>
        {quiet}
      </div>
    );
  }

  const ready = pick.weekday !== null && pick.time !== null;
  const label = bookLabel(pick, slot);
  async function submit() {
    if (pick.weekday === null || pick.time === null || busy) return;
    const chosen = slotLabel({ weekday: pick.weekday, time: pick.time });
    if (label.startsWith("Keep ")) return onAnswer(`${chosen} still works for me.`);
    setBusy(true);
    setError(null);
    const r = await book({ weekday: pick.weekday, time: pick.time, timeZone: zone! }, "chat");
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onAnswer(slot ? `Let’s move it to ${chosen}.` : `${chosen} works for me.`);
  }

  return (
    <div className="flex flex-col gap-2 motion-safe:animate-mira-reply">
      <form
        className={CARD}
        aria-label="Your weekly session"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <SlotPicker value={pick} onChange={setPick} timeZone={zone!} onTimeZone={setZone} />
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <PrimaryButton type="submit" disabled={!ready || busy}>
            {busy ? "Booking…" : label}
          </PrimaryButton>
          <span className="text-[13px] text-ap-muted">
            15 minutes · a calendar invite and a reminder
          </span>
        </div>
        {error ? (
          <p role="alert" className="mt-2 text-[13px] text-ap-bad-ink">
            {error}
          </p>
        ) : null}
      </form>
      {quiet}
    </div>
  );
}
