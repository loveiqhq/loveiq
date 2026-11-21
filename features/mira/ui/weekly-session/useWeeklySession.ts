"use client";

import { useCallback, useEffect, useState } from "react";
import miraConfig from "@features/mira/content/mira-config.json";
import { nextOccurrence } from "@features/mira/server/calendar";

export { slotLabel, zoneLabel } from "@features/mira/server/calendar";
import { miraApi } from "../api";

/**
 * The person's weekly session, as /api/mira/weekly-session gives it, for the chat's time picker,
 * Home's card and Settings' section. Each owns its own loading, empty and error states.
 */

export type SlotView = {
  weekday: number;
  time: string;
  timeZone: string;
  paused: boolean;
  next: string;
  googleUrl: string;
};
type View = { slot: SlotView | null; timeZone: string };

export type WeeklyState =
  | { status: "loading" }
  | { status: "ready"; slot: SlotView | null; timeZone: string }
  | { status: "signed-out" }
  /** Mira stopped this account as under 18: nothing about sessions shows. */
  | { status: "unavailable" }
  | { status: "error"; message: string };

export type Booked =
  { ok: true; emailed: boolean; change: string; slot: SlotView } | { ok: false; error: string };

export const ICS_URL = "/api/mira/weekly-session?format=ics";

/** Sanjin's suggested times, from the weekly question's answers ("Thu 19:00"), earliest first. */
export const SUGGESTED_TIMES = [
  ...new Set(
    (miraConfig.intakeQuestions.find((q) => q.id === "weekly")?.options ?? [])
      .map((o) => /\b([01]\d|2[0-3]):[0-5]\d\b/.exec(o)?.[0])
      .filter((t): t is string => Boolean(t))
  ),
].sort();

/** The browser's own zone, when it has a usable one. */
export function browserZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export function useWeeklySession() {
  const [state, setState] = useState<WeeklyState>({ status: "loading" });

  const apply = useCallback((r: { ok: boolean; status: number; data: Partial<View> }) => {
    if (r.status === 401) setState({ status: "signed-out" });
    else if (r.status === 403) setState({ status: "unavailable" });
    else if (r.ok)
      setState({ status: "ready", slot: r.data.slot ?? null, timeZone: r.data.timeZone ?? "" });
    return r.ok;
  }, []);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    const r = await miraApi<View>("/api/mira/weekly-session");
    if (!apply(r) && r.status !== 401 && r.status !== 403) {
      setState({
        status: "error",
        message: r.data.error ?? "Your weekly session didn't load.",
      });
    }
  }, [apply]);

  useEffect(() => {
    // Loaded once the page is in the browser (the server can't see the person's session).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  /** Book or move it. The state follows only what the server saved. */
  const book = useCallback(
    async (
      slot: { weekday: number; time: string; timeZone: string },
      source: "chat" | "home" | "settings"
    ): Promise<Booked> => {
      const r = await miraApi<View & { emailed?: boolean; change?: string }>(
        "/api/mira/weekly-session",
        { method: "PUT", body: { ...slot, source } }
      );
      apply(r);
      if (!r.ok || !r.data.slot) {
        return { ok: false, error: r.data.error ?? "That didn't go through. Please try again." };
      }
      return {
        ok: true,
        emailed: Boolean(r.data.emailed),
        change: r.data.change ?? "booked",
        slot: r.data.slot,
      };
    },
    [apply]
  );

  const setPaused = useCallback(
    async (paused: boolean): Promise<string | null> => {
      const r = await miraApi<View>("/api/mira/weekly-session", {
        method: "PATCH",
        body: { paused },
      });
      apply(r);
      return r.ok ? null : (r.data.error ?? "That didn't save. Please try again.");
    },
    [apply]
  );

  const cancel = useCallback(async (): Promise<string | null> => {
    const r = await miraApi<View>("/api/mira/weekly-session", { method: "DELETE" });
    apply(r);
    return r.ok ? null : (r.data.error ?? "That didn't go through. Please try again.");
  }, [apply]);

  return { state, load, book, setPaused, cancel };
}

/**
 * The slot's next start on its own clock, as the pages say it, and whether it is under way:
 * from 30 minutes before to 30 minutes after its start, the session is open now.
 */
export function upcoming(slot: SlotView, now: number) {
  const start = nextOccurrence(slot, new Date(now - 30 * 60_000));
  // The day count on the slot's own calendar (its zone's midnight, not the browser's).
  const dayOf = (d: Date) => {
    const [y, m, day] = new Intl.DateTimeFormat("en-CA", { timeZone: slot.timeZone })
      .format(d)
      .split("-")
      .map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, day);
  };
  const days = Math.round((dayOf(start) - dayOf(new Date(now))) / 86_400_000);
  const fmt = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: slot.timeZone, ...o }).format(start);
  return {
    start,
    weekdayShort: fmt({ weekday: "short" }),
    weekday: fmt({ weekday: "long" }),
    day: fmt({ day: "numeric" }),
    when: days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`,
    now: Math.abs(start.getTime() - now) <= 30 * 60_000,
  };
}
