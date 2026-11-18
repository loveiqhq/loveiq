"use client";

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

/** The anonymous chat lives only in this browser until sign-up carries it into the account. */
const LOCAL_CHAT = "mira.chat.v1";
const LOCAL_CONSENT = "mira.consent.v1";
const LOCAL_STYLE = "mira.style.v1";

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

export const local = {
  chat: () => read<{ turns: Turn[]; freeLeft: number | null }>(LOCAL_CHAT),
  saveChat: (v: { turns: Turn[]; freeLeft: number | null } | null) => write(LOCAL_CHAT, v),
  consent: () => read<string>(LOCAL_CONSENT),
  saveConsent: (version: string) => write(LOCAL_CONSENT, version),
  style: () => read<Record<string, number>>(LOCAL_STYLE),
  saveStyle: (v: Record<string, number> | null) => write(LOCAL_STYLE, v),
};
