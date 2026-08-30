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
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const DIRECTORY_SCOPE = "https://www.googleapis.com/auth/admin.directory.user.readonly";
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

/** Scopes an impersonated service-account token is minted with. All read-only. */
/**
 * `cloud-platform` is here for one reason: `signJwt`, which domain-wide delegation
 * needs to mint a token that acts as a colleague. The IAM Credentials API accepts
 * no narrower scope, and a token without it answers
 * ACCESS_TOKEN_SCOPE_INSUFFICIENT — which reads like a permissions problem and is
 * actually a scope one.
 */
const IMPERSONATION_SCOPES = [
  GA4_SCOPE,
  SEARCH_CONSOLE_SCOPE,
  DRIVE_SCOPE,
  GMAIL_SCOPE,
  CALENDAR_SCOPE,
  "https://www.googleapis.com/auth/cloud-platform",
];

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
export async function getGoogleAccessToken(
  nowMs: number = Date.now(),
  /** Vercel's per-request identity token, from `readVercelOidcToken(request)`.
   *  Passed explicitly rather than held in module state: it is per-invocation, and
   *  a serverless instance is reused across invocations. */
  oidcToken?: string | null
): Promise<string | null> {
  /**
   * A ready-made access token, for LOCAL runs only.
   *
   * Service-account impersonation is the one route that needs no browser consent
   * and no custom OAuth client:
   *
   *   gcloud auth print-access-token \
   *     --impersonate-service-account=ga4-reader@loveiq-brain.iam.gserviceaccount.com \
   *     --scopes=https://www.googleapis.com/auth/analytics.readonly,https://www.googleapis.com/auth/webmasters.readonly
   *
   * BOTH scopes, comma-separated: a token minted with one reaches only its own
   * API, and with none it carries `cloud-platform` alone and both answer "Request
   * had insufficient authentication scopes". gcloud warns that `--scopes` "will be
   * ignored for account type impersonated_account" — that is wrong, the flag does
   * take effect, and its warnings go to STDOUT so they corrupt a captured token.
   *
   * A downloadable service-account key is NOT an option here:
   * `constraints/iam.disableServiceAccountKeyCreation` is set on the project, and
   * the keys `ga4-reader` holds are SYSTEM_MANAGED.
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
   * KEYLESS, AND THEREFORE THE ONLY OPTION THAT CANNOT EXPIRE.
   *
   * Vercel signs an OIDC token for every deployment and puts it in
   * `VERCEL_OIDC_TOKEN`. Google will trade that for its own token through a
   * Workload Identity Pool, and the pool is restricted to exactly one subject —
   * `owner:loveiq:project:loveiq-web:environment:production` — so a preview
   * deployment, another project, or another team cannot use it.
   *
   * This exists because every credential-holding alternative has already broken or
   * is blocked: a refresh token carrying the sensitive analytics scopes dies to a
   * Workspace reauth policy every few weeks, a downloadable service-account key is
   * refused by `constraints/iam.disableServiceAccountKeyCreation`, and gcloud
   * impersonation needs a CLI that serverless does not have. There is nothing here
   * to rotate, leak, or re-consent.
   *
   * Tried FIRST, before the refresh token, because on production it should always
   * win; locally `VERCEL_OIDC_TOKEN` is absent and the rest of the chain applies.
   */
  const oidc = oidcToken ?? process.env.VERCEL_OIDC_TOKEN;
  const wifAudience = process.env.GOOGLE_WORKLOAD_IDENTITY_AUDIENCE;
  if (oidc && wifAudience) {
    const federated = await federate(oidc, wifAudience);
    if (federated) {
      const impersonateAs = process.env.GOOGLE_IMPERSONATE_SERVICE_ACCOUNT?.trim();
      // Federation alone yields an identity with no API access of its own; the
      // service account is what actually holds GA4 Viewer and Search Console.
      if (impersonateAs) return impersonate(impersonateAs, federated, nowMs);
      logger.warn(
        "google oauth: federated successfully but GOOGLE_IMPERSONATE_SERVICE_ACCOUNT is unset, so there is no read access to use"
      );
    }
  }

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
    logger.warn(
      "google oauth: service-account key present but unusable, falling back to refresh token"
    );
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

    // IMPERSONATE, IF ASKED TO. See the comment on impersonate() for why this
    // exists: it lets the stored refresh token carry only `cloud-platform`, a
    // NON-SENSITIVE scope, instead of the analytics scopes Google refuses to some
    // clients and that a Workspace reauth policy keeps invalidating.
    const impersonateAs = process.env.GOOGLE_IMPERSONATE_SERVICE_ACCOUNT?.trim();
    if (impersonateAs) {
      return impersonate(impersonateAs, json.access_token, nowMs);
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
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
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
  const json = (await res.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
  } | null;
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

/**
 * Swap a `cloud-platform` token for a SERVICE-ACCOUNT token with the read scopes.
 *
 * WHY THIS IS THE DURABLE ANSWER. Three other routes were tried and each is closed:
 *
 *  - The refresh token minted WITH the analytics scopes dies to a Workspace reauth
 *    policy (`invalid_grant / invalid_rapt`) every few weeks, and a fresh
 *    `gcloud auth login` does not revive it — it is a separate credential.
 *  - A downloadable service-account key is refused outright by
 *    `constraints/iam.disableServiceAccountKeyCreation` on the project; the keys
 *    `ga4-reader` holds are SYSTEM_MANAGED and cannot be exported.
 *  - `gcloud auth print-access-token --impersonate-service-account` works, but
 *    needs the gcloud CLI, which a serverless function does not have.
 *
 * This is that last route done over plain HTTP, so it runs anywhere. The stored
 * refresh token then needs only `cloud-platform` — a non-sensitive scope, which is
 * both easier to obtain and the one that survived when the sensitive ones did not —
 * and the service account supplies the actual read access it already holds (GA4
 * Viewer, Search Console Full, plus whatever Drive folders are shared with it).
 *
 * Requires the source identity to hold `roles/iam.serviceAccountTokenCreator` on
 * the target account. Verified end to end on 2026-08-28: the minted token read GA4
 * back to 2025-12-30 and Search Console back to 2026-01-01.
 */
async function impersonate(
  serviceAccount: string,
  sourceToken: string,
  nowMs: number
): Promise<string | null> {
  const url =
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/` +
    `${encodeURIComponent(serviceAccount)}:generateAccessToken`;

  let res: Response;
  try {
    res = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sourceToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ scope: IMPERSONATION_SCOPES, lifetime: "3600s" }),
      timeoutMs: TIMEOUT_MS,
    });
  } catch (err) {
    logger.error({ err, serviceAccount }, "google oauth: impersonation request failed");
    return null;
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    // 403 here almost always means the missing role rather than a bad token, and
    // saying so turns a dead end into a one-line fix.
    const hint =
      res.status === 403
        ? " — the caller likely lacks roles/iam.serviceAccountTokenCreator on this account"
        : "";
    logger.error(
      { status: res.status, detail, serviceAccount },
      `google oauth: impersonation refused${hint}`
    );
    return null;
  }

  const json = (await res.json().catch(() => null)) as {
    accessToken?: string;
    expireTime?: string;
  } | null;
  if (!json?.accessToken) {
    logger.error("google oauth: impersonation returned no accessToken");
    return null;
  }

  // Google returns an absolute expiry here, not a lifetime.
  const expiresAtMs = json.expireTime ? Date.parse(json.expireTime) : nowMs + 3_600_000;
  cached = {
    token: json.accessToken,
    expiresAtMs: (Number.isFinite(expiresAtMs) ? expiresAtMs : nowMs + 3_600_000) - EXPIRY_SKEW_MS,
  };
  return cached.token;
}

/**
 * Exchange a third-party OIDC token for a Google access token via STS.
 *
 * The audience is the full provider resource path
 * (`//iam.googleapis.com/projects/<num>/locations/global/workloadIdentityPools/<pool>/providers/<provider>`)
 * and lives in an env var rather than in code: it embeds a project number and a
 * pool name, which are deployment facts, and the repo's own no-secrets lint rule
 * objects to high-entropy identifiers in source anyway.
 *
 * Only `cloud-platform` is requested. The federated identity is a stepping stone —
 * it holds no API access itself, and the service account it then impersonates is
 * what carries the actual read permissions.
 */
async function federate(oidcToken: string, audience: string): Promise<string | null> {
  let res: Response;
  try {
    res = await fetchWithTimeout("https://sts.googleapis.com/v1/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audience,
        grantType: "urn:ietf:params:oauth:grant-type:token-exchange",
        requestedTokenType: "urn:ietf:params:oauth:token-type:access_token",
        scope: "https://www.googleapis.com/auth/cloud-platform",
        subjectTokenType: "urn:ietf:params:oauth:token-type:jwt",
        subjectToken: oidcToken,
      }),
      timeoutMs: TIMEOUT_MS,
    });
  } catch (err) {
    logger.error({ err }, "google oauth: STS token exchange failed");
    return null;
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    // The common causes are all configuration, and naming them turns a 400 into a
    // one-line fix: a mismatched audience, an attribute condition the deployment's
    // subject does not satisfy, or an `aud` claim the provider does not allow.
    logger.error(
      { status: res.status, detail },
      "google oauth: STS refused the Vercel OIDC token — check the audience, the provider's allowed audiences, and the attribute condition against this deployment's subject"
    );
    return null;
  }

  const json = (await res.json().catch(() => null)) as { access_token?: string } | null;
  if (!json?.access_token) {
    logger.error("google oauth: STS returned no access_token");
    return null;
  }
  return json.access_token;
}

/**
 * WHICH credential sources are present, as a short flag string — never a value.
 *
 * Added because a production run reported `google-token-unavailable` and logged
 * NOTHING: `getGoogleAccessToken()` has silent-null paths (a missing refresh
 * triple, or federation skipped because `VERCEL_OIDC_TOKEN` is absent), and Vercel's
 * log query kept timing out. `cron_run.error_message` is a channel that can always
 * be read back from the database, so the diagnosis travels there instead.
 *
 * Booleans only. Whether a credential EXISTS is not a secret; its value is.
 */

/**
 * Vercel's per-invocation identity token, read from the REQUEST rather than the
 * environment.
 *
 * This is the whole reason keyless auth was silently failing in production. I
 * assumed `VERCEL_OIDC_TOKEN` was an ordinary environment variable, and the
 * diagnostic proved otherwise: `oidc=0` in BOTH a cron and a request context, on a
 * deployment that definitely had the federation config. Reading Vercel's own
 * `@vercel/oidc` source settles it —
 *
 *   getContext().headers?.["x-vercel-oidc-token"] ?? process.env.VERCEL_OIDC_TOKEN
 *
 * — so the token arrives as a request HEADER and the env var is only a local-dev
 * fallback, which is exactly why `vercel env pull` produced one and production did
 * not.
 *
 * Read directly rather than adding `@vercel/functions`: the whole mechanism is one
 * header lookup, and the house rule is to hand-roll instead of taking a dependency
 * for a couple of calls. The header name comes from Vercel's source, not a guess.
 */
export const VERCEL_OIDC_HEADER = "x-vercel-oidc-token";

export function readVercelOidcToken(request: Request): string | null {
  return request.headers.get(VERCEL_OIDC_HEADER) ?? process.env.VERCEL_OIDC_TOKEN ?? null;
}

export function googleCredentialShape(oidcToken?: string | null): string {
  const flags = [
    // The RESOLVED token, not the env var. Reporting the env var was itself
    // misleading: it is only populated in local dev, so this would have kept
    // saying oidc=0 in production even after the header fix worked.
    `oidc=${(oidcToken ?? process.env.VERCEL_OIDC_TOKEN) ? 1 : 0}`,
    `wif=${process.env.GOOGLE_WORKLOAD_IDENTITY_AUDIENCE ? 1 : 0}`,
    `imp=${process.env.GOOGLE_IMPERSONATE_SERVICE_ACCOUNT ? 1 : 0}`,
    `sakey=${process.env.GOOGLE_SERVICE_ACCOUNT_KEY ? 1 : 0}`,
    `direct=${process.env.GOOGLE_OAUTH_ACCESS_TOKEN ? 1 : 0}`,
    `refresh=${
      process.env.GOOGLE_OAUTH_CLIENT_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
      process.env.GOOGLE_OAUTH_REFRESH_TOKEN
        ? 1
        : 0
    }`,
  ];
  return flags.join(",");
}

export function googleScopeHint(status: number, body: string, scope: string): string | null {
  if (status !== 403 || !/ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient/i.test(body)) return null;
  return `The Google credential is missing the ${scope} scope. Re-run "gcloud auth application-default login --scopes=...,${scope}" and update GOOGLE_OAUTH_REFRESH_TOKEN.`;
}

/** Test seam: module-scope caching would otherwise leak between test cases. */
export function clearGoogleTokenCache(): void {
  cached = null;
}

/**
 * An access token that acts AS a given user, via Workspace domain-wide delegation.
 *
 * This is the only way to read a colleague's mailbox. A user OAuth token reaches
 * its own mail and nothing else, whatever scope it carries — that is a property of
 * the token, not a misconfiguration. Domain-wide delegation instead authorises the
 * SERVICE ACCOUNT, in the Workspace Admin console, to impersonate users in the
 * domain.
 *
 * The usual recipe signs the assertion with a downloaded service-account KEY, which
 * is impossible here: `constraints/iam.disableServiceAccountKeyCreation` is set on
 * the project and the keys `ga4-reader` holds are SYSTEM_MANAGED. `signJwt` is the
 * way round it — the IAM Credentials API signs on the account's behalf, so there is
 * no key to download, leak or rotate.
 *
 * Two steps, and both have to be exactly right:
 *   1. ask IAM to sign a JWT whose `sub` is the mailbox we want to read
 *   2. exchange that assertion at Google's token endpoint for an access token
 *
 * `aud` MUST be the token endpoint, not the API being called — a wrong audience
 * fails at the exchange with `invalid_grant`, which reads like a permissions
 * problem and is not.
 */
export async function getDelegatedToken(
  subject: string,
  scope: string,
  nowMs: number = Date.now(),
  oidcToken?: string | null
): Promise<string | null> {
  const sa = process.env.GOOGLE_IMPERSONATE_SERVICE_ACCOUNT?.trim();
  if (!sa) {
    logger.warn("google oauth: GOOGLE_IMPERSONATE_SERVICE_ACCOUNT unset, cannot delegate");
    return null;
  }
  // The caller must already be able to act as the service account; that is the same
  // permission the existing impersonation path uses.
  const caller = await getGoogleAccessToken(nowMs, oidcToken);
  if (!caller) return null;

  const iat = Math.floor(nowMs / 1000);
  const payload = JSON.stringify({
    iss: sa,
    sub: subject,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp: iat + 3600,
  });

  const signed = await fetchWithTimeout(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(sa)}:signJwt`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${caller}`, "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
      timeoutMs: 15_000,
    }
  );
  if (!signed.ok) {
    const detail = (await signed.text().catch(() => "")).slice(0, 300);
    logger.error({ status: signed.status, subject, detail }, "google oauth: signJwt refused");
    return null;
  }
  const { signedJwt } = (await signed.json()) as { signedJwt?: string };
  if (!signedJwt) return null;

  const exchanged = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedJwt,
    }).toString(),
    timeoutMs: 15_000,
  });
  if (!exchanged.ok) {
    const detail = (await exchanged.text().catch(() => "")).slice(0, 300);
    // `unauthorized_client` here means the Admin console step is missing or the
    // scope list there does not include the one being asked for. It is a
    // configuration answer, not a code one, so say which.
    logger.error(
      { status: exchanged.status, subject, scope, detail },
      "google oauth: delegated token exchange refused — check domain-wide delegation in the Workspace Admin console"
    );
    return null;
  }
  const { access_token: token } = (await exchanged.json()) as { access_token?: string };
  return token ?? null;
}
