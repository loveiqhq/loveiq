"use client";

import { useCallback, useEffect, useState } from "react";
import type { CoachEvent, CoachId } from "@features/mira/content/coaches";
import { miraApi, type ApiResult } from "../api";

/** What GET /api/mira/coaches answers (app/api/mira/coaches/route.ts). */
export type CoachData = {
  name: string | null;
  email: string;
  remember: boolean;
  topics: string[];
  notified: CoachId[];
  chats: Array<{ id: string; title: string; updated_at: string }>;
};

/**
 * "out": signed out (the page sends them to sign in); "closed": someone Mira stopped as under 18
 * (403), to whom no coach is offered.
 */
export type CoachState =
  | { status: "loading" }
  | { status: "ready"; data: CoachData }
  | { status: "error"; error: string }
  | { status: "out" }
  | { status: "closed" };

let pending: Promise<ApiResult<CoachData>> | null = null;

/** One request however many of the coaches' pieces a page shows at once (Home has three). */
function load(): Promise<ApiResult<CoachData>> {
  pending ??= miraApi<CoachData>("/api/mira/coaches").finally(() => {
    pending = null;
  });
  return pending;
}

const stateOf = (r: ApiResult<CoachData>): CoachState =>
  r.ok
    ? { status: "ready", data: r.data }
    : r.signedOut
      ? { status: "out" }
      : r.minor
        ? { status: "closed" }
        : { status: "error", error: r.data.error ?? "That didn't load." };

/** The signed-in person's coaches data, with its loading and error states and a retry. */
export function useCoachData(): { state: CoachState; retry: () => void } {
  const [state, setState] = useState<CoachState>({ status: "loading" });
  const fetchIt = useCallback(() => {
    void load().then((r) => setState(stateOf(r)));
  }, []);
  useEffect(fetchIt, [fetchIt]);
  const retry = useCallback(() => {
    setState({ status: "loading" });
    fetchIt();
  }, [fetchIt]);
  return { state, retry };
}

/** One of the feature's KPI moments (POST /api/mira/event): ids and numbers only. */
export function track(name: CoachEvent, detail?: string): void {
  void miraApi("/api/mira/event", {
    body: { type: "coaches", name, ...(detail === undefined ? {} : { detail }) },
  });
}

/**
 * "Notify me" on a coming-soon coach: null when it went through, else what to tell the person.
 * `keepalive`: sent as the page goes, outliving it (parts.tsx).
 */
export async function notify(coach: CoachId, keepalive = false): Promise<string | null> {
  const r = await miraApi("/api/mira/event", { body: { type: "notify", coach }, keepalive });
  return r.ok ? null : (r.data.error ?? "That didn't go through. Please try again.");
}

/** "Notify me" taken back: null when it went through, else what to tell the person. */
export async function stopNotifying(coach: CoachId, keepalive = false): Promise<string | null> {
  const r = await miraApi(`/api/mira/coaches?notify=${coach}`, { method: "DELETE", keepalive });
  return r.ok ? null : (r.data.error ?? "That didn't go through. Please try again.");
}

/**
 * A search that finds nothing, counted once it has settled (a pause in typing), once per streak,
 * and never with its words.
 */
export function useEmptySearchCount(where: "home" | "roster", empty: boolean): void {
  useEffect(() => {
    if (!empty) return;
    const t = window.setTimeout(() => track("search_empty", where), 1200);
    return () => window.clearTimeout(t);
  }, [empty, where]);
}
