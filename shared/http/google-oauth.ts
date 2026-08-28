import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";

/**
 * Google access tokens from a refresh token.
 *
 * WHY THIS SHAPE AND NOT A SERVICE ACCOUNT. A service-account key requires
 * creating a Google Cloud project, enabling APIs on it and downloading a JSON
 * key — a path we deliberately are not taking. A refresh token issued by
 * `gcloud auth application-default login` uses GOOGLE'S OWN client id, so there
 * is no project to create and no key file to store or rotate. Three plain env
 * vars are the whole configuration, and the exchange below is one POST.
 *
 * DO NOT USE GCLOUD'S SHARED CLIENT FOR THIS. `gcloud auth
 * application-default login --scopes=...analytics.readonly` is REFUSED by
 * Google — "This app tried to access sensitive info in your Google Account. To
 * keep your account safe, Google blocked this access." `analytics.readonly` is a
 * sensitive scope and gcloud's shared client id (764086051850-…) is not
 * permitted to request it. Confirmed by hitting it on 2026-08-27; gcloud even
 * says so before opening the browser ("you must provide your own client ID or
 * use service account impersonation"). An earlier version of this comment
 * recommended that command, which is why it is called out here.
 *
 * Getting the three values — use YOUR OWN OAuth client, which IS allowed the
 * sensitive scope (run once, on a laptop, opens a browser):
 *
 *   1. Google Cloud console → project `loveiq-brain` → APIs & Services →
 *      Credentials → Create credentials → OAuth client ID → Desktop app.
 *      The consent screen must be **Internal** (Workspace-only): that removes
 *      both the verification requirement and the 7-day refresh-token expiry.
 *   2. Download its JSON, then:
 *
 *        gcloud auth application-default login \
 *          --client-id-file=client_secret_…json \
 *          --scopes=openid,\
 *            https://www.googleapis.com/auth/userinfo.email,\
 *            https://www.googleapis.com/auth/cloud-platform,\
 *            https://www.googleapis.com/auth/analytics.readonly,\
 *            https://www.googleapis.com/auth/webmasters.readonly
 *
 *   3. Read client_id / client_secret / refresh_token out of
 *      ~/.config/gcloud/application_default_credentials.json.
 *
 * ANY PLAIN `gcloud auth application-default login` ON THE SAME MACHINE
 * OVERWRITES THAT FILE and silently drops the two extra scopes, after which
 * every Google call answers 403 ACCESS_TOKEN_SCOPE_INSUFFICIENT. Copy the three
 * values into `.env.local` so the credential does not live only in a file any
 * other terminal can clobber.
 *
 * SCOPES ARE FIXED AT LOGIN, NOT AT REQUEST TIME. This is the trap: asking for a
 * scope when exchanging the token does nothing — the grant already decided. A
 * missing scope surfaces as ACCESS_TOKEN_SCOPE_INSUFFICIENT on the API call, not
 * as an auth failure here, so `googleScopeHint()` exists to make that legible.
 *
 * NO NEW DEPENDENCY: `googleapis` is tens of megabytes for what is one POST, and
 * bundle size is latency in a serverless function.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TIMEOUT_MS = 10_000;

/** Refresh a minute early so a request starting just under the wire cannot
 *  finish just over it. */
const EXPIRY_SKEW_MS = 60_000;

export const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
export const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

let cached: { token: string; expiresAtMs: number } | null = null;

export function isGoogleConfigured(): boolean {
  if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN) return true;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) return true;
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  );
}

/**
 * Exchange the refresh token for an access token, cached until just before it
 * expires. Returns null on any failure so a caller can skip its work rather than
 * fail a whole cron run.
 */
export async function getGoogleAccessToken(nowMs: number = Date.now()): Promise<string | null> {
  /**
   * A ready-made access token, for LOCAL runs only.
   *
   * Service-account impersonation is the one route that needs no browser consent
   * and no custom OAuth client:
   *
   *   gcloud auth print-access-token \
   *     --impersonate-service-account=ga4-reader@loveiq-brain.iam.gserviceaccount.com \
   *     --scopes=https://www.googleapis.com/auth/analytics.readonly
   *
   * It cannot be used in production — it needs the gcloud CLI, which a serverless
   * function does not have — and the token lasts an hour, so it is a laptop
   * convenience for re-ingesting, never a deployment credential. Checked first so
   * it overrides a stale refresh token rather than fighting it.
   */
  const direct = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  if (direct) return direct;

  if (cached && cached.expiresAtMs > nowMs) return cached.token;

  /**
   * A SERVICE-ACCOUNT KEY, PREFERRED WHEN PRESENT.
   *
   * Added 2026-08-28 after the user refresh token died with
   * `invalid_grant / invalid_rapt` — a Google Workspace REAUTH policy, which
   * periodically invalidates refresh tokens for sensitive scopes no matter how
   * the token was minted. Re-consenting fixes it until the next expiry, so a
   * user token cannot deliver "always in sync": every few weeks GA4 and Search
   * Console would freeze and someone would have to click a browser prompt.
   *
   * A service account has no user session and therefore never reauths. The
   * earlier objection to this route — "requires creating a project, enabling
   * APIs and downloading a key" — no longer holds: project `loveiq-brain` and
   * `ga4-reader` already exist, and that account already has GA4 Viewer plus
   * Search Console Full access.
   *
   * The refresh-token path below is kept as a fallback so nothing breaks while
   * the key is being put in place.
   */
  const saKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (saKey) {
    const token = await serviceAccountToken(saKey, nowMs);
    if (token) return token;
    logger.warn("google oauth: service-account key present but unusable, falling back to refresh token");
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  try {
    const res = await fetchWithTimeout(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }).toString(),
      timeoutMs: TIMEOUT_MS,
    });

    if (!res.ok) {
      // The body names the real problem (invalid_grant when the token was
      // revoked or the account's password changed); the status alone does not.
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      logger.error({ status: res.status, detail }, "google oauth: refresh rejected");
      cached = null;
      return null;
    }

    const json = (await res.json().catch(() => null)) as {
      access_token?: string;
      expires_in?: number;
    } | null;

    if (!json?.access_token) {
      logger.error("google oauth: response carried no access_token");
      return null;
    }

    cached = {
      token: json.access_token,
      expiresAtMs: nowMs + Math.max((json.expires_in ?? 3600) * 1000 - EXPIRY_SKEW_MS, 0),
    };
    return cached.token;
  } catch (err) {
    logger.error({ err }, "google oauth: refresh failed");
    return null;
  }
}

/**
 * Turn Google's scope error into an instruction. Without this the failure reads
 * as a generic 403 and the fix (re-run the login WITH the scope) is invisible.
 */

/**
 * Sign a JWT with the service account's private key and swap it for an access
 * token. Google calls this the "JWT bearer" flow; it needs no browser, no user
 * and no consent screen, which is the whole point.
 *
 * Scopes are requested here rather than granted to the key, so the token is
 * narrowed to exactly the two read-only APIs the ingesters use even though the
 * account itself could be given more.
 */
async function serviceAccountToken(rawKey: string, nowMs: number): Promise<string | null> {
  let key: { client_email?: string; private_key?: string };
  try {
    // Accept both the raw JSON and a base64 blob: Vercel's env UI mangles
    // multi-line values, and a PEM is multi-line by definition.
    const text = rawKey.trim().startsWith("{")
      ? rawKey
      : Buffer.from(rawKey, "base64").toString("utf8");
    key = JSON.parse(text);
  } catch {
    logger.error("google oauth: GOOGLE_SERVICE_ACCOUNT_KEY is neither JSON nor base64 JSON");
    return null;
  }
  if (!key.client_email || !key.private_key) {
    logger.error("google oauth: service-account key missing client_email or private_key");
    return null;
  }

  const iat = Math.floor(nowMs / 1000);
  const claims = {
    iss: key.client_email,
    scope: `${GA4_SCOPE} ${SEARCH_CONSOLE_SCOPE}`,
    aud: TOKEN_URL,
    iat,
    exp: iat + 3600,
  };
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const signingInput = `${b64({ alg: "RS256", typ: "JWT" })}.${b64(claims)}`;

  let assertion: string;
  try {
    const { createSign } = await import("node:crypto");
    const signer = createSign("RSA-SHA256");
    signer.update(signingInput);
    // A key pasted through a shell or an env UI often arrives with literal \n.
    assertion = `${signingInput}.${signer.sign(key.private_key.replace(/\\n/g, "\n"), "base64url")}`;
  } catch (err) {
    logger.error({ err }, "google oauth: could not sign the service-account assertion");
    return null;
  }

  const res = await fetchWithTimeout(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
    timeoutMs: TIMEOUT_MS,
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    logger.error({ status: res.status, detail }, "google oauth: service-account exchange rejected");
    return null;
  }
  const json = (await res.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number }
    | null;
  if (!json?.access_token) {
    logger.error("google oauth: service-account exchange returned no access_token");
    return null;
  }
  cached = {
    token: json.access_token,
    expiresAtMs: nowMs + Math.max(0, (json.expires_in ?? 3600) * 1000 - EXPIRY_SKEW_MS),
  };
  return json.access_token;
}

export function googleScopeHint(status: number, body: string, scope: string): string | null {
  if (status !== 403 || !/ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient/i.test(body)) return null;
  return `The Google credential is missing the ${scope} scope. Re-run "gcloud auth application-default login --scopes=...,${scope}" and update GOOGLE_OAUTH_REFRESH_TOKEN.`;
}

/** Test seam: module-scope caching would otherwise leak between test cases. */
export function clearGoogleTokenCache(): void {
  cached = null;
}
