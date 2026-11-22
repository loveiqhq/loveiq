import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";
import { scheduleAfterResponse } from "@shared/http/after-response";
import { cancelSessionInvite } from "./session-emails";

/**
 * Changing a Mira account's email (Settings › Sign-in & security, 22 Nov 2026): an 8-digit code
 * to the NEW address proves it is the person's, then the login's address changes (Supabase Auth,
 * admin API) and the profile's with it, or neither does. The old address gets a neutral note
 * (sign-in.ts).
 *
 * Supabase's own email change can't do this: it sends its own template from its own mailer, and
 * with "secure email change" on it needs a code from both inboxes. So the code is Mira's own,
 * kept only as a keyed hash beside the new address (mira_email_change), with 5 guesses reserved
 * atomically before each check (mira_claim_email_change_attempt), for an hour; a new code resets
 * them and a used one is deleted. The emails reuse the sign-in code's sender and limits.
 *
 * What follows the address: the LoveIQ test result (store.ts findAssessment matches the account's
 * confirmed address, so the new one's result from then on), sign-in by code, the nudges. Google's
 * confirmation was for the old address, so it is cleared.
 */

export const NEW_ADDRESS_CODE = /^\d{8}$/;
export const NEW_ADDRESS_TTL_SECONDS = 3600;
export const NEW_ADDRESS_GUESSES = 5;

const enc = encodeURIComponent;

/** 8 digits from the OS's random source, like Supabase's sign-in codes. */
export const newAddressCode = () => String(randomInt(0, 100_000_000)).padStart(8, "0");

/** A key for this use only, from the server's base secret (as the nudge links derive theirs). */
function key(): Buffer {
  for (const v of [
    process.env.UNSUBSCRIBE_SECRET,
    process.env.SHARE_VERIFY_SECRET,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ]) {
    const s = v?.trim();
    if (s && s.length >= 16) return createHmac("sha256", s).update("mira-email-change/v1").digest();
  }
  throw new Error("mira: no secret to keep an email change's code with");
}

/** The code as kept: bound to the account and the address, so it fits no other change. */
export const codeHash = (userId: string, newEmail: string, code: string) =>
  createHmac("sha256", key()).update(`${userId}:${newEmail}:${code}`).digest("hex");

/** Keeps the change waiting for its code; replaces one waiting before, with fresh guesses. */
export async function savePendingChange(userId: string, newEmail: string, code: string) {
  // One waiting change per account: a new code replaces the old one (upsert on user_id).
  // eslint-disable-next-line no-secrets/no-secrets -- REST path, not a secret
  const res = await supabaseFetch("/rest/v1/mira_email_change?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      user_id: userId,
      new_email: newEmail,
      code_hash: codeHash(userId, newEmail, code),
      issued_at: new Date().toISOString(),
      attempts: 0,
    }),
  });
  if (!res.ok) throw new Error(`mira email change save failed (${res.status})`);
}

export async function dropPendingChange(userId: string): Promise<void> {
  const res = await supabaseFetch(`/rest/v1/mira_email_change?user_id=eq.${enc(userId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`mira email change delete failed (${res.status})`);
}

/**
 * The new address the code confirms, or null: no change waiting, over an hour old, out of
 * guesses, or the wrong code. One guess is reserved before the comparison; fails closed.
 */
export async function confirmPendingChange(userId: string, code: string): Promise<string | null> {
  if (!NEW_ADDRESS_CODE.test(code)) return null;
  const res = await supabaseFetch("/rest/v1/rpc/mira_claim_email_change_attempt", {
    method: "POST",
    body: JSON.stringify({
      p_user: userId,
      p_max: NEW_ADDRESS_GUESSES,
      p_ttl_seconds: NEW_ADDRESS_TTL_SECONDS,
    }),
  });
  if (!res.ok) return null;
  const pending = (await res.json()) as { new_email: string; code_hash: string } | null;
  if (!pending) return null;
  const a = Buffer.from(codeHash(userId, pending.new_email, code));
  const b = Buffer.from(pending.code_hash);
  return a.length === b.length && timingSafeEqual(a, b) ? pending.new_email : null;
}

/** The login's own address (Supabase Auth's record), or null when it can't be read. */
export async function loginEmail(userId: string): Promise<string | null> {
  const res = await supabaseFetch(`/auth/v1/admin/users/${enc(userId)}`).catch(() => null);
  if (!res?.ok) return null;
  const user = (await res.json().catch(() => null)) as { email?: string } | null;
  return user?.email?.toLowerCase() ?? null;
}

const setLoginEmail = (userId: string, email: string) =>
  supabaseFetch(`/auth/v1/admin/users/${enc(userId)}`, {
    method: "PUT",
    body: JSON.stringify({ email, email_confirm: true }),
  });

/**
 * Moves the account to the new address: the login first (Supabase refuses an address another
 * login has: "taken"), then the profile's copy, which the emails and the nudges read. When the copy
 * can't follow, the login goes back, so a failure leaves both on the old address. Only if that
 * fails too is it "changed": the login has moved, so the person and the old address must hear of
 * it, and the copy catches up at the next sign-in. ponytail: an answer lost after Auth applied it
 * reads as not applied; read the login back (loginEmail) if that ever shows up. Once the copy has
 * moved, a booked weekly session's emails follow it, and after the response a cancellation takes
 * the session out of the old address's calendar (best effort).
 */
export async function changeAccountEmail(
  userId: string,
  oldEmail: string,
  newEmail: string
): Promise<"changed" | "taken"> {
  const auth = await setLoginEmail(userId, newEmail);
  if (auth.status === 422) return "taken";
  if (!auth.ok) throw new Error(`mira login email change failed (${auth.status})`);
  const profile = await supabaseFetch(`/rest/v1/mira_user?id=eq.${enc(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      email: newEmail,
      google_connected_at: null,
      updated_at: new Date().toISOString(),
    }),
  }).catch(() => null);
  if (profile?.ok) {
    scheduleAfterResponse("mira-session-old-address", async () => {
      await cancelSessionInvite({ id: userId, email: oldEmail }, "address-changed");
    });
    return "changed";
  }
  if ((await setLoginEmail(userId, oldEmail).catch(() => null))?.ok) {
    throw new Error(`mira profile email change failed (${profile?.status}); the login went back`);
  }
  logger.error(
    { status: profile?.status },
    "mira: an email change moved the login, but its profile kept the old address"
  );
  return "changed";
}

/** "l•••@gmail.com": enough for the owner to recognise, not enough to learn the address. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  return `${email.slice(0, 1)}•••${email.slice(at)}`;
}
