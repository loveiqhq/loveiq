import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const calls: Array<{ url: string; body: unknown; headers: Record<string, string> }> = [];
let stsOk = true;
let iamOk = true;

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    let body: unknown = null;
    try {
      body = JSON.parse(String(init?.body ?? "null"));
    } catch {
      body = String(init?.body ?? "");
    }
    calls.push({ url, body, headers });

    if (url.includes("sts.googleapis.com")) {
      return stsOk
        ? { ok: true, status: 200, json: async () => ({ access_token: "federated-token" }), text: async () => "" }
        : { ok: false, status: 400, text: async () => '{"error":"invalid_grant"}' };
    }
    if (url.includes("iamcredentials.googleapis.com")) {
      return iamOk
        ? {
            ok: true,
            status: 200,
            json: async () => ({ accessToken: "sa-token", expireTime: "2099-01-01T00:00:00Z" }),
            text: async () => "",
          }
        : { ok: false, status: 403, text: async () => '{"error":"permission denied"}' };
    }
    // the refresh-token endpoint, which must NOT be reached when federation works
    return { ok: true, status: 200, json: async () => ({ access_token: "refresh-token", expires_in: 3600 }), text: async () => "" };
  }),
}));

import { clearGoogleTokenCache, getGoogleAccessToken } from "@shared/http/google-oauth";

const AUD =
  "//iam.googleapis.com/projects/1/locations/global/workloadIdentityPools/vercel/providers/vercel-oidc";
const SA = "ga4-reader@example.iam.gserviceaccount.com";

describe("keyless Google auth via Vercel OIDC federation", () => {
  beforeEach(() => {
    calls.length = 0;
    stsOk = true;
    iamOk = true;
    clearGoogleTokenCache();
    delete process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    process.env.VERCEL_OIDC_TOKEN = "vercel.oidc.jwt";
    process.env.GOOGLE_WORKLOAD_IDENTITY_AUDIENCE = AUD;
    process.env.GOOGLE_IMPERSONATE_SERVICE_ACCOUNT = SA;
    // present but must be UNUSED while federation works
    process.env.GOOGLE_OAUTH_CLIENT_ID = "cid";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "csec";
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN = "rtok";
  });

  it("trades the Vercel OIDC token for a service-account token, and never touches the refresh token", async () => {
    // The whole point: nothing stored, nothing to expire. If this silently fell
    // back to the refresh token the system would look healthy until that token
    // died again.
    expect(await getGoogleAccessToken()).toBe("sa-token");
    expect(calls.map((c) => c.url).some((u) => u.includes("oauth2.googleapis.com/token"))).toBe(false);
    expect(calls[0].url).toContain("sts.googleapis.com");
    expect(calls[1].url).toContain("iamcredentials.googleapis.com");
  });

  it("sends the exchange exactly as STS requires", async () => {
    await getGoogleAccessToken();
    const sts = calls[0].body as Record<string, string>;
    expect(sts.audience).toBe(AUD);
    expect(sts.grantType).toBe("urn:ietf:params:oauth:grant-type:token-exchange");
    expect(sts.subjectTokenType).toBe("urn:ietf:params:oauth:token-type:jwt");
    expect(sts.subjectToken).toBe("vercel.oidc.jwt");
    // Only cloud-platform: the federated identity is a stepping stone with no
    // API access of its own.
    expect(sts.scope).toBe("https://www.googleapis.com/auth/cloud-platform");
  });

  it("asks for the read scopes when impersonating, not cloud-platform", async () => {
    await getGoogleAccessToken();
    const iam = calls[1].body as { scope: string[] };
    expect(iam.scope).toContain("https://www.googleapis.com/auth/analytics.readonly");
    expect(iam.scope).toContain("https://www.googleapis.com/auth/webmasters.readonly");
    expect(iam.scope).toContain("https://www.googleapis.com/auth/drive.readonly");
    expect(calls[1].headers.Authorization).toBe("Bearer federated-token");
  });

  it("falls back to the refresh token when there is no OIDC token (i.e. locally)", async () => {
    delete process.env.VERCEL_OIDC_TOKEN;
    clearGoogleTokenCache();
    await getGoogleAccessToken();
    expect(calls.some((c) => c.url.includes("oauth2.googleapis.com/token"))).toBe(true);
    expect(calls.some((c) => c.url.includes("sts.googleapis.com"))).toBe(false);
  });

  it("does not attempt federation when the audience is unconfigured", async () => {
    delete process.env.GOOGLE_WORKLOAD_IDENTITY_AUDIENCE;
    clearGoogleTokenCache();
    await getGoogleAccessToken();
    expect(calls.some((c) => c.url.includes("sts.googleapis.com"))).toBe(false);
  });

  it("degrades to the refresh token AND still impersonates when STS refuses", async () => {
    // Better degradation than I first assumed: federation failing does not lose
    // the impersonation step, so a stale pool config falls back to the previous
    // working path rather than to no access. It must never hand back the raw OIDC
    // token, which carries no Google authority at all.
    stsOk = false;
    clearGoogleTokenCache();
    const tok = await getGoogleAccessToken();
    expect(tok).toBe("sa-token");
    expect(tok).not.toBe("vercel.oidc.jwt");
    expect(calls.some((c) => c.url.includes("sts.googleapis.com"))).toBe(true);
    expect(calls.some((c) => c.url.includes("oauth2.googleapis.com/token"))).toBe(true);
  });

  it("returns null when impersonation is refused, instead of the federated token", async () => {
    // The federated identity has NO API access, so handing it back would produce
    // confusing 403s from GA4 rather than a clear auth failure here.
    iamOk = false;
    clearGoogleTokenCache();
    expect(await getGoogleAccessToken()).toBeNull();
  });

  it("caches the service-account token so one cron run does not re-federate per call", async () => {
    await getGoogleAccessToken();
    const first = calls.length;
    await getGoogleAccessToken();
    expect(calls.length).toBe(first);
  });
});

describe("googleCredentialShape", () => {
  it("reports which sources are present, and never a value", async () => {
    // This exists because a production run reported google-token-unavailable and
    // logged NOTHING — the function has silent-null paths and Vercel's log query
    // kept timing out. The flags travel in cron_run.error_message instead, which
    // can always be read back from the database.
    const { googleCredentialShape } = await import("@shared/http/google-oauth");
    process.env.VERCEL_OIDC_TOKEN = "a.secret.jwt";
    process.env.GOOGLE_WORKLOAD_IDENTITY_AUDIENCE = "//iam.example/aud";
    delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    delete process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

    const shape = googleCredentialShape();
    expect(shape).toContain("oidc=1");
    expect(shape).toContain("wif=1");
    expect(shape).toContain("sakey=0");
    expect(shape).toContain("refresh=0");
    // no values, ever
    expect(shape).not.toContain("secret");
    expect(shape).not.toContain("iam.example");
  });

  it("needs ALL THREE refresh parts before reporting refresh=1", async () => {
    const { googleCredentialShape } = await import("@shared/http/google-oauth");
    process.env.GOOGLE_OAUTH_CLIENT_ID = "cid";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "csec";
    delete process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
    expect(googleCredentialShape()).toContain("refresh=0");
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN = "rt";
    expect(googleCredentialShape()).toContain("refresh=1");
  });
});
