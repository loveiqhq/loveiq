"use client";

import { useEffect } from "react";
import { getCsrfToken } from "@shared/http/csrf-client";
import { captureUtmFromUrl, getStoredUtm } from "@shared/url/utm";
import { SOURCE_COOKIE, SOURCE_HEADER } from "../server/config";

export type ApiResult<T> = { ok: boolean; status: number; data: T & { error?: string } };

/**
 * Where this browser's visit came from, from the site's campaign tracker (shared/url/utm.ts):
 * the link's utm_source, utm_medium and utm_campaign or, untagged, the referring site; `{}` for
 * neither. URI-encoded JSON, so any character fits a header or a cookie. Mira's KPI events
 * record it (server/attribution.ts).
 */
export function miraSource(): string {
  captureUtmFromUrl(); // this page's own tags, should Mira call before the site-wide capture ran
  let tracker: Record<string, unknown> = {};
  try {
    const v: unknown = JSON.parse(getStoredUtm() ?? "{}");
    if (v && typeof v === "object" && !Array.isArray(v)) tracker = v as Record<string, unknown>;
  } catch {
    // Not JSON: nothing known.
  }
  const s = (k: string) => (typeof tracker[k] === "string" ? (tracker[k] as string) : undefined);
  const tags = { source: s("utm_source"), medium: s("utm_medium"), campaign: s("utm_campaign") };
  const sent =
    tags.source || tags.medium || tags.campaign ? tags : { referrer_host: s("referrer_host") };
  return encodeURIComponent(JSON.stringify(sent));
}

/**
 * Google sign-in is a full-page hand-over that carries no header, so its link leaves the source
 * in a cookie only the Google routes receive, for 10 minutes; the callback's sign-up event reads it.
 */
export function rememberSourceForGoogle(): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${SOURCE_COOKIE}=${miraSource()}; Path=/api/mira/auth/google; Max-Age=600; SameSite=Lax${secure}`;
}

/** JSON call to a Mira API route, with the CSRF header every write needs. */
export async function miraApi<T = Record<string, unknown>>(
  url: string,
  init: { method?: string; body?: unknown } = {}
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": getCsrfToken(),
        [SOURCE_HEADER]: miraSource(),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: "same-origin",
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    return { ok: res.ok, status: res.status, data };
  } catch {
    return {
      ok: false,
      status: 0,
      data: { error: "No connection. Please check your internet and try again." } as T & {
        error?: string;
      },
    };
  }
}

export type Turn = { role: "user" | "assistant"; content: string };
export type Source = { id: string; label: string; link: string | null };
/**
 * A turn as this browser keeps it: a reply's sources, its rating, the intake question it asked
 * (its answer buttons) and whether a stop rail fired on it (`crisis`) survive a reload.
 */
export type LocalTurn = Turn & {
  sources?: Source[];
  rated?: 1 | -1;
  ask?: string | null;
  crisis?: boolean;
};

/**
 * A page the browser brings back from its back/forward cache still shows the signed-in state it
 * was left with, which a sign-in or sign-out since may have changed: load it fresh instead.
 */
export function useReloadWhenRestored(): void {
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);
}

/** The anonymous chat lives only in this browser until sign-up carries it into the account. */
const LOCAL_CHAT = "mira.chat.v1";
const LOCAL_CONSENT = "mira.consent.v1";
const LOCAL_STYLE = "mira.style.v1";
const LOCAL_NPS = "mira.nps.v1";
const LOCAL_BODY_CHECK = "mira.bodycheck.v1";
/** "Not now" on the body check offer waits this long before it is offered again. */
const BODY_CHECK_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or blocked storage: the chat still works for this visit.
  }
}

/**
 * This browser's anonymous chat; `gate` is set once the free messages are used, `keepOff` once
 * "Not now" put the "Keep this chat" card away for this chat.
 */
type LocalChat = { turns: LocalTurn[]; freeLeft: number | null; gate?: boolean; keepOff?: boolean };

/** The first-message consent: its wording's version, and the optional rating tick. */
export type LocalConsent = { version: string; shareRated: boolean };

export const local = {
  chat: () => read<LocalChat>(LOCAL_CHAT),
  saveChat: (v: LocalChat | null) => write(LOCAL_CHAT, v),
  /** A tick from before 21 Nov 2026 was its version alone (a string), so it is asked again. */
  consent: () => {
    const c = read<LocalConsent>(LOCAL_CONSENT);
    return c && typeof c === "object" && typeof c.version === "string" ? c : null;
  },
  saveConsent: (v: LocalConsent) => write(LOCAL_CONSENT, v),
  /** Under 18 (the chat's `minor`): this browser forgets its chat and its 18+ tick. */
  forget: () => {
    write(LOCAL_CHAT, null);
    write(LOCAL_CONSENT, null);
  },
  style: () => read<Record<string, number>>(LOCAL_STYLE),
  saveStyle: (v: Record<string, number> | null) => write(LOCAL_STYLE, v),
  /** For the NPS question: conversations this browser started, and when it last asked. */
  nps: () =>
    read<{ convos: number; asked: number | null }>(LOCAL_NPS) ?? { convos: 0, asked: null },
  saveNps: (v: { convos: number; asked: number | null }) => write(LOCAL_NPS, v),
  /** True while a "Not now" on the body check is less than three days old. */
  bodyCheckSnoozed: () => {
    const at = read<{ snoozedAt: number }>(LOCAL_BODY_CHECK)?.snoozedAt;
    return typeof at === "number" && Date.now() - at < BODY_CHECK_SNOOZE_MS;
  },
  snoozeBodyCheck: () => write(LOCAL_BODY_CHECK, { snoozedAt: Date.now() }),
};
