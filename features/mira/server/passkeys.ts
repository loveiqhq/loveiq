import { supabaseFetch } from "@features/admin/server/supabase";

/**
 * Passkeys for Mira's free account (22 Nov 2026), the free alternative to Sign in with Apple
 * (which needs a paid Apple Developer membership): Face ID, Touch ID, Windows Hello or an Android
 * screen lock, synced by iCloud Keychain or Google Password Manager. Our own WebAuthn relying
 * party (app/api/mira/passkeys, @simplewebauthn/server), not Supabase's project-wide passkeys:
 * those would let any session in the shared project (admin panel, Jarvis) add a passkey straight
 * at Supabase, outside Mira's checks.
 *
 * This file holds the stored side (supabase/migrations/20261122070000_mira_account.sql) and which
 * sites passkeys work on; the ceremonies themselves live in the route. Every read and write of a
 * passkey is scoped to its account, except finding one by its credential id at sign-in, which is
 * how the account is found.
 */

/**
 * Each site's own relying party, so a passkey never crosses production, staging and local. The
 * production one is the registrable domain, so its passkeys also work on loveiq.org itself.
 * Anywhere else (a preview deployment) has no passkeys.
 */
const RELYING_PARTIES = new Map([
  ["https://www.loveiq.org", "loveiq.org"],
  ["https://staging.loveiq.org", "staging.loveiq.org"],
  ["http://localhost:3000", "localhost"],
]);
export type RelyingParty = { origin: string; rpID: string };

export function relyingParty(requestUrl: string): RelyingParty | null {
  const origin = new URL(requestUrl).origin;
  const rpID = RELYING_PARTIES.get(origin);
  return rpID ? { origin, rpID } : null;
}

/** The httpOnly cookie that binds a ceremony's challenge to the browser that asked for it. */
export const CHALLENGE_COOKIE = "mira-passkey";
export const CHALLENGE_PATH = "/api/mira/passkeys";
export const CHALLENGE_TTL_MS = 5 * 60_000;
/** More than enough for every device a person has; keeps the list (and abuse) small. */
export const MAX_PASSKEYS = 10;

export type ChallengePurpose = "register" | "sign_in";
export type StoredPasskey = {
  id: string;
  user_id: string;
  public_key: string;
  counter: number;
  transports: string[];
  backed_up: boolean;
  label: string;
  created_at: string;
  last_used_at: string | null;
};
/** What Settings shows of a passkey. */
export type PasskeySummary = Pick<
  StoredPasskey,
  "id" | "label" | "backed_up" | "created_at" | "last_used_at"
>;

const enc = encodeURIComponent;
const UUID = /^[0-9a-f-]{36}$/i;
const CREDENTIAL_ID = /^[A-Za-z0-9_-]{16,1366}$/;

/** The user handle a passkey carries: the account id as UTF-8, base64url (never the email). */
export const userHandleOf = (userId: string) => Buffer.from(userId, "utf8").toString("base64url");

/** Keeps a ceremony's challenge for 5 minutes; the row's id goes in the browser's cookie. */
export async function saveChallenge(
  purpose: ChallengePurpose,
  challenge: string,
  userId: string | null
): Promise<string> {
  const res = await supabaseFetch("/rest/v1/mira_webauthn_challenge", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      challenge,
      purpose,
      user_id: userId,
      expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`mira challenge save failed (${res.status})`);
  return ((await res.json()) as Array<{ id: string }>)[0]!.id;
}

/**
 * The challenge this browser was given, taken out in the same step (one DELETE, so a replay or a
 * second tab can't use it again), or null when it is used, expired, for something else, or (for a
 * registration) another account's.
 */
export async function takeChallenge(
  id: string | undefined,
  purpose: ChallengePurpose,
  userId: string | null
): Promise<string | null> {
  if (!id || !UUID.test(id)) return null;
  const owner = userId ? `&user_id=eq.${enc(userId)}` : "&user_id=is.null";
  const res = await supabaseFetch(
    `/rest/v1/mira_webauthn_challenge?id=eq.${enc(id)}&purpose=eq.${purpose}${owner}` +
      `&expires_at=gt.${enc(new Date().toISOString())}&select=challenge`,
    { method: "DELETE", headers: { Prefer: "return=representation" } }
  );
  if (!res.ok) throw new Error(`mira challenge take failed (${res.status})`);
  return ((await res.json()) as Array<{ challenge: string }>)[0]?.challenge ?? null;
}

const SUMMARY = "id,label,backed_up,created_at,last_used_at";

export async function listPasskeys(userId: string): Promise<StoredPasskey[]> {
  const res = await supabaseFetch(
    `/rest/v1/mira_passkey?user_id=eq.${enc(userId)}&select=*&order=created_at.asc&limit=${MAX_PASSKEYS + 5}`
  );
  if (!res.ok) throw new Error(`mira passkeys read failed (${res.status})`);
  return (await res.json()) as StoredPasskey[];
}

export const summarise = (p: StoredPasskey): PasskeySummary => ({
  id: p.id,
  label: p.label,
  backed_up: p.backed_up,
  created_at: p.created_at,
  last_used_at: p.last_used_at,
});

/** The passkey a sign-in presents, by its credential id: whose it is comes from here only. */
export async function findPasskey(credentialId: string): Promise<StoredPasskey | null> {
  if (!CREDENTIAL_ID.test(credentialId)) return null;
  const res = await supabaseFetch(
    `/rest/v1/mira_passkey?id=eq.${enc(credentialId)}&select=*&limit=1`
  );
  if (!res.ok) throw new Error(`mira passkey read failed (${res.status})`);
  return ((await res.json()) as StoredPasskey[])[0] ?? null;
}

export async function addPasskey(
  p: Omit<StoredPasskey, "created_at" | "last_used_at">
): Promise<PasskeySummary> {
  const res = await supabaseFetch(`/rest/v1/mira_passkey?select=${SUMMARY}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(p),
  });
  if (!res.ok) throw new Error(`mira passkey save failed (${res.status})`);
  return ((await res.json()) as PasskeySummary[])[0]!;
}

/**
 * Moves the signature counter on after a sign-in, only from the value the check used (compare and
 * set): two sign-ins racing with the same counter, a cloned authenticator's sign of trouble, can't
 * both pass. False when the counter moved meanwhile.
 */
export async function markPasskeyUsed(p: StoredPasskey, counter: number): Promise<boolean> {
  const res = await supabaseFetch(
    `/rest/v1/mira_passkey?id=eq.${enc(p.id)}&user_id=eq.${enc(p.user_id)}&counter=eq.${p.counter}&select=id`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ counter, last_used_at: new Date().toISOString() }),
    }
  );
  if (!res.ok) throw new Error(`mira passkey update failed (${res.status})`);
  return ((await res.json()) as unknown[]).length === 1;
}

export async function renamePasskey(userId: string, id: string, label: string): Promise<boolean> {
  if (!CREDENTIAL_ID.test(id)) return false;
  const res = await supabaseFetch(
    `/rest/v1/mira_passkey?id=eq.${enc(id)}&user_id=eq.${enc(userId)}&select=id`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ label }),
    }
  );
  if (!res.ok) throw new Error(`mira passkey rename failed (${res.status})`);
  return ((await res.json()) as unknown[]).length === 1;
}

/** Removes one of the account's passkeys (`id`), or all of them; how many went. */
export async function removePasskeys(userId: string, id?: string): Promise<number> {
  if (id !== undefined && !CREDENTIAL_ID.test(id)) return 0;
  const res = await supabaseFetch(
    `/rest/v1/mira_passkey?user_id=eq.${enc(userId)}${id === undefined ? "" : `&id=eq.${enc(id)}`}&select=id`,
    { method: "DELETE", headers: { Prefer: "return=representation" } }
  );
  if (!res.ok) throw new Error(`mira passkey delete failed (${res.status})`);
  return ((await res.json()) as unknown[]).length;
}
