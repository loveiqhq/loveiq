"use client";

import { useEffect } from "react";
import { getCsrfToken } from "@shared/http/csrf-client";

export type ApiResult<T> = { ok: boolean; status: number; data: T & { error?: string } };

/** JSON call to a Mira API route, with the CSRF header every write needs. */
export async function miraApi<T = Record<string, unknown>>(
  url: string,
  init: { method?: string; body?: unknown } = {}
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() },
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
 * A turn as this browser keeps it: a reply's sources, its rating and the intake question it
 * asked (its answer buttons) survive a reload.
 */
export type LocalTurn = Turn & { sources?: Source[]; rated?: 1 | -1; ask?: string | null };

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

/** This browser's anonymous chat; `gate` is set once the free conversations are used. */
type LocalChat = { turns: LocalTurn[]; freeLeft: number | null; gate?: boolean };

export const local = {
  chat: () => read<LocalChat>(LOCAL_CHAT),
  saveChat: (v: LocalChat | null) => write(LOCAL_CHAT, v),
  consent: () => read<string>(LOCAL_CONSENT),
  saveConsent: (version: string) => write(LOCAL_CONSENT, version),
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
