"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { JournalEntry, JournalShare } from "@features/mira/journal";
import { miraApi } from "../api";
import type { SupportCountry } from "../SupportPanel";
import { useToday } from "../useToday";

/**
 * The daily journal as one browser view holds it: what GET /api/mira/journal answered, kept in step
 * with each save. Every journal component (Home card, journal page, settings section) loads its own,
 * so the lead can mount any of them anywhere.
 */

export type JournalSettings = {
  share: JournalShare;
  /** "20:00" in the person's time zone, or null: no reminder. */
  reminderTime: string | null;
  timeZone: string;
};

export type Journal = {
  /** unavailable: signed out, or an account Mira stopped as under 18. */
  status: "loading" | "ready" | "error" | "unavailable";
  /** Newest first. */
  entries: JournalEntry[];
  settings: JournalSettings | null;
  /**
   * The person's own today, from this browser's clock ("" until it has run here), kept current
   * when the tab comes back into view; `freshToday` reads it again at the tap that acts on today.
   */
  today: string;
  freshToday: () => string;
  reload: () => void;
  save: (entry: JournalEntry) => Promise<SaveResult>;
  remove: (day?: string) => Promise<boolean>;
  setSettings: (patch: { share?: JournalShare; reminderTime?: string | null }) => Promise<boolean>;
};

export type SaveResult = {
  ok: boolean;
  error?: string;
  /** Set when the note had crisis words: the chat's support lines, this country first. */
  crisisLines?: SupportCountry;
};

/** This browser's calendar day, "YYYY-MM-DD". */
export function localToday(at = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

const byDayDesc = (a: JournalEntry, b: JournalEntry) => b.day.localeCompare(a.day);

/** `enabled: false` loads nothing: a parent passes its own journal instead. */
export function useJournal(enabled = true): Journal {
  const [status, setStatus] = useState<Journal["status"]>("loading");
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [settings, setSettingsState] = useState<JournalSettings | null>(null);
  const { today, fresh: freshToday } = useToday();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void miraApi<{ entries: JournalEntry[]; settings: JournalSettings }>("/api/mira/journal").then(
      (r) => {
        if (!live) return;
        if (r.status === 401 || r.status === 403) return setStatus("unavailable");
        if (!r.ok) return setStatus("error");
        setEntries([...r.data.entries].sort(byDayDesc));
        setSettingsState(r.data.settings);
        setStatus("ready");
      }
    );
    return () => {
      live = false;
    };
  }, [enabled, attempt]);

  const reload = useCallback(() => {
    setStatus("loading");
    setAttempt((n) => n + 1);
  }, []);

  const save = useCallback(async (entry: JournalEntry): Promise<SaveResult> => {
    const r = await miraApi<{ success?: boolean; crisis?: boolean; crisisLines?: SupportCountry }>(
      "/api/mira/journal",
      { method: "PUT", body: entry }
    );
    const ok = r.ok && r.data.success !== false;
    if (ok) setEntries((all) => [entry, ...all.filter((e) => e.day !== entry.day)].sort(byDayDesc));
    return {
      ok,
      error: ok ? undefined : (r.data.error ?? "Your check-in didn’t save. Please try again."),
      crisisLines: r.data.crisis ? r.data.crisisLines : undefined,
    };
  }, []);

  const remove = useCallback(async (day?: string): Promise<boolean> => {
    const r = await miraApi(`/api/mira/journal?${day ? `day=${day}` : "all=1"}`, {
      method: "DELETE",
    });
    if (r.ok) setEntries((all) => (day ? all.filter((e) => e.day !== day) : []));
    return r.ok;
  }, []);

  const current = useRef(settings);
  useEffect(() => {
    current.current = settings;
  }, [settings]);
  const setSettings = useCallback(
    async (patch: { share?: JournalShare; reminderTime?: string | null }): Promise<boolean> => {
      const before = current.current;
      // Shown at once; put back if the server says no.
      if (before) setSettingsState({ ...before, ...patch });
      const r = await miraApi("/api/mira/journal", { method: "PATCH", body: patch });
      if (!r.ok) setSettingsState(before);
      return r.ok;
    },
    []
  );

  return { status, entries, settings, today, freshToday, reload, save, remove, setSettings };
}
