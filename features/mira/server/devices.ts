import { supabaseFetch } from "@features/admin/server/supabase";
import { scheduleAfterResponse } from "@shared/http/after-response";
import logger from "@shared/observability/logger";

/**
 * The devices signed in to a Mira account (Settings › Sign-in & security, 22 Nov 2026): one
 * mira_session row per sign-in (supabase/migrations/20261122070000_mira_account.sql), keyed by
 * the Supabase Auth session's id, written by each sign-in route (emailed code, Google, passkey)
 * before it answers.
 *
 * Mira honours only a session that has a row (session.ts getMiraAccount), so a row is how a
 * device stays signed in: "Sign out" on one device, "Sign out everywhere" and deleting the account
 * delete rows, and a session Mira's sign-in never made (one minted elsewhere in the shared Supabase
 * project, or one from before this shipped) is refused. A device not seen for 90 days is deleted
 * by the daily mira-memory job, so it signs in again.
 *
 * What a row knows: how the person signed in, a label from the user agent ("iPhone · Safari"),
 * the approximate city from Vercel's geo header at sign-in (never the IP, and never updated after),
 * when it was made and last seen (updated at most hourly).
 */

export type SignInMethod = "email" | "google" | "passkey";
export type Device = {
  id: string;
  method: SignInMethod;
  device: string;
  city: string | null;
  created_at: string;
  last_seen_at: string;
};
/** A recorded session: whose it is and when it signed in (ms), for the recent-sign-in check. */
export type SessionRecord = { userId: string; signedInAt: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const enc = encodeURIComponent;
const HOUR_MS = 3_600_000;
/** Devices not seen for this long are deleted by the mira-memory job (and must sign in again). */
export const DEVICE_IDLE_DAYS = 90;
/**
 * Adding a passkey or changing the email needs a sign-in this recent: a device left signed in
 * (a shared computer, a stolen cookie) can't add its own way in or take the account's address.
 */
export const RECENT_SIGN_IN_MS = 15 * 60_000;

export const isRecentSignIn = (signedInAt: number, now = Date.now()) =>
  now - signedInAt < RECENT_SIGN_IN_MS;

/**
 * The Supabase Auth session id in an access token (its `session_id` claim), or null. Read without
 * checking the signature: callers trust it only beside a getUser() that checked the same token, or
 * from the verifyOtp that just issued it.
 */
export function sessionIdOf(accessToken: string | null | undefined): string | null {
  const payload = accessToken?.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      session_id?: unknown;
    };
    return typeof claims.session_id === "string" && UUID.test(claims.session_id)
      ? claims.session_id.toLowerCase()
      : null;
  } catch {
    return null;
  }
}

const DEVICES: Array<[RegExp, string]> = [
  [/iPhone|iPod/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android.*Mobile/, "Android phone"],
  [/Android/, "Android tablet"],
  [/CrOS/, "Chromebook"],
  [/Macintosh|Mac OS X/, "Mac"],
  [/Windows/, "Windows PC"],
  [/Linux/, "Linux PC"],
];
// Order matters: Edge, Opera and Samsung Internet also say Chrome and Safari; Chrome says Safari.
const BROWSERS: Array<[RegExp, string]> = [
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/CriOS\/|Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
];

/** A label a person recognises their device by: "iPhone · Safari", "Windows PC · Edge". */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const device = DEVICES.find(([re]) => re.test(ua))?.[1] ?? "A device";
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1];
  return browser ? `${device} · ${browser}` : device;
}

/** The city Vercel puts on the request (URL-encoded), cleaned, or null (local, unknown). */
export function cityFrom(headers: Headers): string | null {
  const raw = headers.get("x-vercel-ip-city");
  if (!raw) return null;
  let city: string;
  try {
    city = decodeURIComponent(raw);
  } catch {
    return null;
  }
  // Control characters a header may carry, and angle brackets, never reach the page.
  city = city.replace(/[\u0000-\u001f\u007f<>]/g, "").trim();
  return city ? city.slice(0, 80) : null;
}

/**
 * Records a sign-in that just happened, from the access token the sign-in issued. Throws when it
 * can't: the caller signs out again, since a session without its row is refused anyway.
 */
export async function recordSession(
  accessToken: string | null | undefined,
  userId: string,
  method: SignInMethod,
  headers: Headers
): Promise<void> {
  const id = sessionIdOf(accessToken);
  if (!id) throw new Error("mira: the new session has no id");
  const res = await supabaseFetch("/rest/v1/mira_session", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      id,
      user_id: userId,
      method,
      device: deviceLabel(headers.get("user-agent")),
      city: cityFrom(headers),
    }),
  });
  if (!res.ok) throw new Error(`mira session record failed (${res.status})`);
}

/**
 * The recorded session with this id, or "gone" (signed out, never recorded), or "error" (the
 * read failed: refused for this request, but not signed out). Seen again after an hour or more,
 * its last_seen_at moves on, after the response.
 */
export async function findSession(id: string): Promise<SessionRecord | "gone" | "error"> {
  if (!UUID.test(id)) return "gone";
  let rows: Array<{ user_id: string; created_at: string; last_seen_at: string }>;
  try {
    const res = await supabaseFetch(
      `/rest/v1/mira_session?id=eq.${enc(id)}&select=user_id,created_at,last_seen_at&limit=1`
    );
    if (!res.ok) return "error";
    rows = (await res.json()) as typeof rows;
  } catch {
    return "error";
  }
  const row = rows[0];
  if (!row) return "gone";
  if (Date.now() - Date.parse(row.last_seen_at) > HOUR_MS) {
    scheduleAfterResponse("mira-session-seen", async () => {
      const res = await supabaseFetch(`/rest/v1/mira_session?id=eq.${enc(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
      });
      if (!res.ok) logger.warn({ status: res.status }, "mira: a device's last seen was not saved");
    });
  }
  return { userId: row.user_id, signedInAt: Date.parse(row.created_at) };
}

/** The account's signed-in devices, most recently seen first. */
export async function listDevices(userId: string): Promise<Device[]> {
  const res = await supabaseFetch(
    `/rest/v1/mira_session?user_id=eq.${enc(userId)}&select=id,method,device,city,created_at,last_seen_at&order=last_seen_at.desc&limit=50`
  );
  if (!res.ok) throw new Error(`mira devices read failed (${res.status})`);
  return (await res.json()) as Device[];
}

/**
 * Signs out one of the account's devices (`id`) or all of them (`id` omitted): their rows go, so
 * Mira refuses those sessions from their next request on. How many went.
 */
export async function signOutDevices(userId: string, id?: string): Promise<number> {
  if (id !== undefined && !UUID.test(id)) return 0;
  const res = await supabaseFetch(
    `/rest/v1/mira_session?user_id=eq.${enc(userId)}${id === undefined ? "" : `&id=eq.${enc(id)}`}&select=id`,
    { method: "DELETE", headers: { Prefer: "return=representation" } }
  );
  if (!res.ok) throw new Error(`mira sign-out failed (${res.status})`);
  return ((await res.json()) as unknown[]).length;
}
