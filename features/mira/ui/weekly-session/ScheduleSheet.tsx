"use client";

import { useState } from "react";
import { PrimaryButton } from "../MiraShell";
import { Modal } from "../SupportPanel";
import { CalendarLinks, SlotPicker, bookLabel, type Pick } from "./SlotPicker";
import { browserZone, slotLabel, zoneLabel, type Booked, type SlotView } from "./useWeeklySession";

/**
 * "Schedule a weekly session" from Home or Settings: the picker in Mira's sheet (a bottom sheet on
 * phones), then a confirmation that blooms in with the invite's way into a calendar. Booking a
 * new time and moving the booked one are the same sheet.
 */
export function ScheduleSheet({
  slot,
  timeZone,
  source,
  book,
  onClose,
}: {
  slot: SlotView | null;
  /** The profile's zone, for a first booking. */
  timeZone: string;
  source: "home" | "settings";
  book: (
    slot: { weekday: number; time: string; timeZone: string },
    source: "home" | "settings"
  ) => Promise<Booked>;
  onClose: () => void;
}) {
  const [pick, setPick] = useState<Pick>({
    weekday: slot?.weekday ?? null,
    time: slot?.time ?? null,
  });
  const [zone, setZone] = useState(
    () => slot?.timeZone || timeZone || browserZone() || "Europe/Berlin"
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ emailed: boolean; moved: boolean; slot: SlotView } | null>(
    null
  );
  const label = bookLabel(pick, slot, zone);
  const unchanged = label.startsWith("Keep ");
  const ready = pick.weekday !== null && pick.time !== null && !unchanged;

  async function submit() {
    if (!ready || busy || pick.weekday === null || pick.time === null) return;
    setBusy(true);
    setError(null);
    const r = await book({ weekday: pick.weekday, time: pick.time, timeZone: zone }, source);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setDone({ emailed: r.emailed, moved: r.change === "moved", slot: r.slot });
  }

  if (done) {
    return (
      <Modal
        label={done.moved ? "Weekly session moved" : "Weekly session booked"}
        onClose={onClose}
      >
        <div className="relative flex flex-col items-center text-center">
          {/* The one moment that celebrates: Mira's cloud blooms behind the check. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-10 left-1/2 h-[220px] w-[340px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side_at_30%_55%,rgba(254,104,57,0.16),rgba(254,104,57,0)_100%),radial-gradient(closest-side_at_52%_42%,rgba(191,102,217,0.18),rgba(191,102,217,0)_100%),radial-gradient(closest-side_at_72%_58%,rgba(149,142,246,0.2),rgba(149,142,246,0)_100%)] blur-[36px] motion-safe:animate-mira-cloud"
          />
          <span className="relative mt-2 flex h-14 w-14 items-center justify-center rounded-full bg-ap-ink text-white [animation-delay:150ms] motion-safe:animate-mira-pop">
            <svg
              aria-hidden="true"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          <h2
            data-autofocus
            tabIndex={-1}
            className="relative mt-4 font-serif text-[26px] font-medium outline-none [animation-delay:260ms] motion-safe:animate-mira-in"
          >
            {done.moved ? "Moved" : "You’re booked"}
          </h2>
          <p className="relative mt-1 max-w-[34ch] text-balance text-[15px] leading-relaxed text-ap-body [animation-delay:340ms] motion-safe:animate-mira-in">
            {slotLabel(done.slot)}, {zoneLabel(done.slot.timeZone)}. Fifteen minutes, just you and
            Mira.
          </p>
          <p
            role="status"
            className="relative mt-4 text-[14px] text-ap-muted [animation-delay:420ms] motion-safe:animate-mira-in"
          >
            {done.emailed
              ? "Your calendar invite is on its way to your inbox. Or add it here:"
              : "We couldn’t email your invite just now. Add it to your calendar here:"}
          </p>
          <div className="relative mt-3 [animation-delay:480ms] motion-safe:animate-mira-in">
            <CalendarLinks googleUrl={done.slot.googleUrl} center />
          </div>
          <div className="relative mt-6">
            <PrimaryButton onClick={onClose}>Done</PrimaryButton>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal label="Your weekly session" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2
          data-autofocus
          tabIndex={-1}
          className="font-serif text-[24px] font-medium outline-none"
        >
          {slot ? "Change your weekly session" : "Your weekly session"}
        </h2>
        <p className="mt-1 text-[15px] leading-relaxed text-ap-body">
          Fifteen minutes with Mira, the same time each week. You’ll get a calendar invite, and a
          short reminder before each session.
        </p>
        <div className="mt-5">
          <SlotPicker value={pick} onChange={setPick} timeZone={zone} onTimeZone={setZone} />
        </div>
        {error ? (
          <p role="alert" className="mt-4 text-[14px] text-ap-bad-ink">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap-reverse items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 text-[15px] font-semibold text-ap-muted"
          >
            Not now
          </button>
          <PrimaryButton type="submit" disabled={!ready || busy}>
            {busy ? "Booking…" : label}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
