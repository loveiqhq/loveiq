"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { ANSWER_CHIP } from "../IntakeAnswers";
import { PrimaryButton } from "../MiraShell";
import {
  ICS_URL,
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
  "inline-flex min-h-[44px] min-w-[52px] cursor-pointer select-none items-center justify-center rounded-full border border-ap-field bg-white px-3.5 text-[14px] tabular-nums text-ap-body transition-colors duration-150 hover:border-ap-mist hover:bg-ap-ground peer-checked:border-ap-purple peer-checked:bg-ap-lilac peer-checked:font-semibold peer-checked:text-ap-ink peer-focus-visible:ring-2 peer-focus-visible:ring-ap-purple peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white";
const LEGEND = "text-[13px] font-semibold text-ap-ink";
export const CARD = "rounded-[20px] border border-ap-line bg-white/90 p-4";
const LINK_PILL =
  "inline-flex min-h-[44px] items-center justify-center rounded-full border border-ap-line bg-white px-4 text-[14px] font-semibold text-ap-ink transition-colors hover:bg-ap-ground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ap-purple focus-visible:ring-offset-2 focus-visible:ring-offset-white";

/** Add the session to a calendar: Google's own form, or the invite as a file (Apple, Outlook). */
export function CalendarLinks({
  googleUrl,
  center = false,
}: {
  googleUrl: string;
  center?: boolean;
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${center ? "justify-center" : ""}`}>
      <a href={googleUrl} target="_blank" rel="noopener noreferrer" className={LINK_PILL}>
        Google Calendar
      </a>
      <a href={ICS_URL} download className={LINK_PILL}>
        Apple or Outlook
      </a>
    </div>
  );
}

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
  const [here, setHere] = useState<string | null>(null);
  // This device's zone is only known in the browser.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setHere(browserZone()), []);
  // The zone the picker opened on. Once this device's is chosen, the same button offers that one
  // back, so it never vanishes from under the keyboard's focus (R3-HAB-2).
  const [first] = useState(timeZone);
  const swap = here === timeZone ? first : here;

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
              // Keeps a picked time as the starting point. Focus stays in the group (arrows
              // only choose there); the time field is the next Tab stop.
              onChange={() => setOther(true)}
              className="peer sr-only"
            />
            <span className={RADIO_CHIP}>Another time</span>
          </label>
        </div>
        {other ? (
          <label className="mt-3 flex items-center gap-3 text-[14px] text-ap-body motion-safe:animate-mira-reply">
            Your time
            {/* The global ring (tailwind.config.js) needs :focus-visible, which WebKit never
                matches on a time field (its editor is inside it): the same ring on :focus, one
                outline either way, never a second ring. */}
            <input
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
              className="min-h-[44px] rounded-full border border-ap-field bg-white px-4 text-[16px] tabular-nums text-ap-ink outline-none transition-colors focus:border-ap-purple focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-ap-purple"
            />
          </label>
        ) : null}
      </fieldset>

      <p className="text-[13px] leading-snug text-ap-muted">
        {/* Said when it changes: the button beside it keeps the focus. */}
        <span aria-live="polite">Times are {zoneLabel(timeZone)}.</span>
        {swap && swap !== timeZone && clocksDiffer(swap, timeZone) ? (
          <>
            {" "}
            <button
              type="button"
              onClick={() => onTimeZone(swap)}
              className="inline-flex min-h-[32px] items-center font-semibold text-ap-plum underline underline-offset-2"
            >
              Use {zoneLabel(swap)}
            </button>
          </>
        ) : null}
      </p>
    </div>
  );
}

/**
 * What the booking button says: book, move (to another time, or the same time on another zone's
 * clock, which is then named), or keep the time already booked.
 */
export function bookLabel(pick: Pick, slot: SlotView | null, zone: string): string {
  if (pick.weekday === null || pick.time === null) return "Pick a day and a time";
  const label = slotLabel({ weekday: pick.weekday, time: pick.time });
  if (!slot) return `Book ${label}`;
  const newZone = slot.timeZone === zone ? "" : `, ${zoneLabel(zone)}`;
  return slot.weekday === pick.weekday && slot.time === pick.time && !newZone
    ? `Keep ${label}`
    : `Move to ${label}${newZone}`;
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
  // Booked, but the invite couldn't be emailed: its way into a calendar, then the answer.
  const [unsent, setUnsent] = useState<{ slot: SlotView; answer: string } | null>(null);
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

  if (unsent) {
    return (
      <div className={`${CARD} flex flex-col gap-3 motion-safe:animate-mira-reply`}>
        <p role="status" className="text-[14px] leading-normal text-ap-body">
          Booked: {slotLabel(unsent.slot)}, {zoneLabel(unsent.slot.timeZone)}. We couldn’t email
          your invite just now. Add it to your calendar here:
        </p>
        <CalendarLinks googleUrl={unsent.slot.googleUrl} />
        <div>
          <PrimaryButton onClick={() => onAnswer(unsent.answer)}>Done</PrimaryButton>
        </div>
      </div>
    );
  }

  const ready = pick.weekday !== null && pick.time !== null;
  const label = bookLabel(pick, slot, zone!);
  async function submit() {
    if (pick.weekday === null || pick.time === null || busy) return;
    const chosen = slotLabel({ weekday: pick.weekday, time: pick.time });
    if (label.startsWith("Keep ")) return onAnswer(`${chosen} still works for me.`);
    setBusy(true);
    setError(null);
    const r = await book({ weekday: pick.weekday, time: pick.time, timeZone: zone! }, "chat");
    setBusy(false);
    if (!r.ok) return setError(r.error);
    const newZone = slot && slot.timeZone !== zone ? `, ${zoneLabel(zone!)}` : "";
    const answer = slot ? `Let’s move it to ${chosen}${newZone}.` : `${chosen} works for me.`;
    if (!r.emailed) return setUnsent({ slot: r.slot, answer });
    onAnswer(answer);
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
