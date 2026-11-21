"use client";

import {
  WebAuthnAbortService,
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  platformAuthenticatorIsAvailable,
  sendSignal,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { useSyncExternalStore } from "react";
import { miraApi } from "../api";

/**
 * The browser's side of Mira's passkeys (app/api/mira/passkeys): the device's own sheet (Face ID,
 * Touch ID, Windows Hello, a fingerprint) between two calls to our route. A person who closes the
 * sheet gets no error: `error: null`.
 */

export type Ticks = { adult: boolean; terms: boolean; consent: boolean; useAssessment: boolean };
type Failure = {
  ok: false;
  /** What to tell the person; null when they closed the sheet themselves. */
  error: string | null;
  /** Adding a passkey needs a fresh sign-in. */
  reauth?: boolean;
  /** The consent on file is an older wording's: tick the boxes, then try again. */
  needsConsent?: boolean;
};

/** What the person calls their device's lock, for "Use Face ID next time?". */
export function unlockName(userAgent: string, touchPoints = 0): string {
  if (/iPhone|iPod/.test(userAgent)) return "Face ID";
  // iPadOS asks for desktop pages as a Mac; only its touch screen tells them apart.
  if (/iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1)) {
    return "Touch ID or Face ID";
  }
  if (/Macintosh|Mac OS X/.test(userAgent)) return "Touch ID";
  if (/Windows/.test(userAgent)) return "Windows Hello";
  if (/Android/.test(userAgent)) return "your fingerprint";
  return "your device";
}

export const passkeysWork = () => browserSupportsWebAuthn();
const unchanging = () => () => {};
/** Whether this browser has passkeys at all: false on the server, then the browser's answer. */
export const usePasskeysWork = () => useSyncExternalStore(unchanging, passkeysWork, () => false);
/** A built-in authenticator (not only a phone or a security key) can make the passkey. */
export const canOfferPasskey = () => platformAuthenticatorIsAvailable().catch(() => false as const);
export const autofillWorks = () => browserSupportsWebAuthnAutofill().catch(() => false as const);
export const stopPasskeyPrompt = () => WebAuthnAbortService.cancelCeremony();

/** The offer after a code sign-in comes once per browser. */
const OFFERED = "mira.passkey.offer.v1";
export function offeredHere(): boolean {
  try {
    return window.localStorage.getItem(OFFERED) !== null;
  } catch {
    return true; // storage blocked: don't risk asking at every sign-in
  }
}
export function markOffered(): void {
  try {
    window.localStorage.setItem(OFFERED, String(Date.now()));
  } catch {
    // Private mode: it may be offered again, nothing worse.
  }
}

/** The device's sheet closed or timed out, or another prompt replaced it: not an error. */
function cancelled(err: unknown): boolean {
  const e = err as { name?: string; code?: string } | null;
  return (
    e?.name === "NotAllowedError" ||
    e?.name === "AbortError" ||
    e?.code === "ERROR_CEREMONY_ABORTED"
  );
}

function failure(err: unknown, fallback: string): Failure {
  if (cancelled(err)) return { ok: false, error: null };
  if ((err as { code?: string }).code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") {
    return { ok: false, error: "This device already has a passkey for your account." };
  }
  return { ok: false, error: fallback };
}

export type AddedPasskey = {
  id: string;
  label: string;
  backed_up: boolean;
  created_at: string;
  last_used_at: string | null;
};

/** Adds a passkey to the signed-in account: Settings, or the offer after a code sign-in. */
export async function addPasskey(
  via: "offer" | "settings"
): Promise<{ ok: true; passkey: AddedPasskey } | Failure> {
  const asked = await miraApi<{
    options?: Parameters<typeof startRegistration>[0]["optionsJSON"];
    reauth?: boolean;
  }>("/api/mira/passkeys", { body: { action: "register-options", via } });
  if (!asked.ok || !asked.data.options) {
    return {
      ok: false,
      error: asked.data.error ?? "Passkeys aren't working right now.",
      reauth: asked.data.reauth === true,
    };
  }
  let response: Awaited<ReturnType<typeof startRegistration>>;
  try {
    response = await startRegistration({ optionsJSON: asked.data.options });
  } catch (err) {
    return failure(err, "Your device couldn't make the passkey. Please try again.");
  }
  const saved = await miraApi<{ passkey?: AddedPasskey }>("/api/mira/passkeys", {
    body: { action: "register", response, via },
  });
  if (!saved.ok || !saved.data.passkey) {
    return {
      ok: false,
      error: saved.data.error ?? "We couldn't save that passkey. Please try again.",
    };
  }
  return { ok: true, passkey: saved.data.passkey };
}

/**
 * Signs in with a passkey: from the button (the device's own picker) or, with `autofill`, from the
 * email field's suggestions, which wait until the person picks one. `ticks` is read when the
 * passkey answers, so boxes ticked meanwhile count.
 */
export async function signInWithPasskey(opts: {
  autofill?: boolean;
  ticks: () => Ticks;
}): Promise<{ ok: true; needsProfile: boolean } | (Failure & { retry?: boolean })> {
  const asked = await miraApi<{
    options?: Parameters<typeof startAuthentication>[0]["optionsJSON"];
  }>("/api/mira/passkeys", { body: { action: "sign-in-options" } });
  if (!asked.ok || !asked.data.options) {
    return {
      ok: false,
      error: opts.autofill ? null : (asked.data.error ?? "Passkeys aren't working right now."),
    };
  }
  let response: Awaited<ReturnType<typeof startAuthentication>>;
  try {
    response = await startAuthentication({
      optionsJSON: asked.data.options,
      useBrowserAutofill: opts.autofill === true,
    });
  } catch (err) {
    return failure(err, "Your device couldn't use the passkey. Please try again.");
  }
  const t = opts.ticks();
  const ticked = t.adult && t.terms && t.consent;
  const res = await miraApi<{
    needsProfile?: boolean;
    needsConsent?: boolean;
    retry?: boolean;
    unknown?: boolean;
    rpID?: string;
  }>("/api/mira/passkeys", {
    body: { action: "sign-in", response, ...(ticked ? { ticks: t } : {}) },
  });
  if (res.ok) return { ok: true, needsProfile: res.data.needsProfile === true };
  // A passkey Mira no longer knows (removed in Settings): ask the passkey manager to forget it.
  if (res.data.unknown && res.data.rpID) {
    void sendSignal({
      signalName: "unknownCredential",
      rpID: res.data.rpID,
      credentialID: response.id,
    }).catch(() => undefined);
  }
  return {
    ok: false,
    error: res.data.error ?? "That passkey didn't work. Please try again, or use your email.",
    needsConsent: res.data.needsConsent === true,
    retry: res.data.retry === true,
  };
}

/** Tells the passkey manager which of the account's passkeys still work (after a removal). */
export function syncPasskeyList(rpID: string, userHandle: string, ids: string[]): void {
  void sendSignal({
    signalName: "allAcceptedCredentials",
    rpID,
    userID: userHandle,
    allAcceptedCredentialIDs: ids,
  }).catch(() => undefined);
}

/** Shows the account's new address in the passkey manager (after a change of email). */
export function syncPasskeyName(rpID: string, userHandle: string, email: string): void {
  void sendSignal({
    signalName: "currentUserDetails",
    rpID,
    userID: userHandle,
    userName: email,
    userDisplayName: email,
  }).catch(() => undefined);
}
