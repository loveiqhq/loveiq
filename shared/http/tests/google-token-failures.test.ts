import { generateKeyPairSync } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A Google token request that times out is a refusal, not a crash.
 *
 * `fetchWithTimeout` throws on a timeout. Every token path in google-oauth.ts caught
 * that except two, so a slow token request ended the caller's whole run: a Gmail,
 * calendar or Drive walk lost every mailbox instead of one. Null is what every caller
 * already handles as "not read this run".
 */

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock("@shared/observability/logger", () => ({ default: log }));

type How = "ok" | "refuse" | "timeout" | "unreadable" | "blank";
/** What each Google endpoint does in this test. */
const how: Record<"sign" | "exchange" | "keyExchange" | "refresh", How> = {
  sign: "ok",
  exchange: "ok",
  keyExchange: "ok",
  refresh: "ok",
};

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(async (url: string, init?: RequestInit) => {
    const body = String(init?.body ?? "");
    const step = url.includes(":signJwt")
      ? "sign"
      : body.includes("refresh_token")
        ? "refresh"
        : process.env.GOOGLE_SERVICE_ACCOUNT_KEY
          ? "keyExchange"
          : "exchange";
    const answer = how[step];
    if (answer === "timeout") throw new Error(`Request timeout after 15000ms: ${url}`);
    if (answer === "refuse") return { ok: false, status: 403, text: async () => "denied" };
    return {
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => {
        if (answer === "unreadable") {
          throw new DOMException("This operation was aborted", "AbortError");
        }
        if (answer === "blank") return {};
        return step === "sign"
          ? { signedJwt: "signed.jwt" }
          : { access_token: `${step}-token`, expires_in: 3600 };
      },
    };
  }),
}));

import {
  clearGoogleTokenCache,
  getDelegatedToken,
  getGoogleAccessToken,
} from "@shared/http/google-oauth";

const ENV = [
  "GOOGLE_OAUTH_ACCESS_TOKEN",
  "GOOGLE_IMPERSONATE_SERVICE_ACCOUNT",
  "GOOGLE_SERVICE_ACCOUNT_KEY",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "GOOGLE_OAUTH_REFRESH_TOKEN",
  "GOOGLE_WORKLOAD_IDENTITY_AUDIENCE",
  "VERCEL_OIDC_TOKEN",
] as const;
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

beforeEach(() => {
  for (const k of ENV) delete process.env[k];
  Object.assign(how, { sign: "ok", exchange: "ok", keyExchange: "ok", refresh: "ok" });
  clearGoogleTokenCache();
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("getDelegatedToken", () => {
  beforeEach(() => {
    process.env.GOOGLE_OAUTH_ACCESS_TOKEN = "caller-token";
    process.env.GOOGLE_IMPERSONATE_SERVICE_ACCOUNT = "sa@example.iam.gserviceaccount.com";
  });

  it("mints a token when both steps answer", async () => {
    expect(await getDelegatedToken("mo@loveiq.org", "drive")).toBe("exchange-token");
  });

  it.each([
    ["sign", "timeout"],
    ["exchange", "timeout"],
    ["sign", "unreadable"],
    ["exchange", "unreadable"],
    ["sign", "refuse"],
    ["exchange", "refuse"],
  ] as const)("returns null, never a throw, when the %s step is %s", async (step, answer) => {
    how[step] = answer;
    await expect(getDelegatedToken("mo@loveiq.org", "drive")).resolves.toBeNull();
  });

  // Callers tell the reader "the log says which", so every null must leave a log line.
  it.each(["sign", "exchange"] as const)(
    "logs why when the %s step answers ok but without a token",
    async (step) => {
      how[step] = "blank";
      log.error.mockClear();
      await expect(getDelegatedToken("mo@loveiq.org", "drive")).resolves.toBeNull();
      expect(log.error).toHaveBeenCalledWith(
        expect.objectContaining({ subject: "mo@loveiq.org" }),
        expect.stringMatching(/answered without/)
      );
    }
  );
});

describe("the service-account key path", () => {
  beforeEach(() => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = JSON.stringify({
      client_email: "sa@example.iam.gserviceaccount.com",
      private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
    });
  });

  it("falls back to the refresh token when the key exchange times out", async () => {
    // The fallback is there for exactly this, and a throw skipped it.
    how.keyExchange = "timeout";
    process.env.GOOGLE_OAUTH_CLIENT_ID = "cid";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "csec";
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN = "rtok";
    expect(await getGoogleAccessToken()).toBe("refresh-token");
  });

  it("returns null, never a throw, when there is nothing to fall back to", async () => {
    how.keyExchange = "timeout";
    await expect(getGoogleAccessToken()).resolves.toBeNull();
  });
});
