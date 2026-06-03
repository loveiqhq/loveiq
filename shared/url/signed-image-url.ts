/**
 * HMAC-signed payload helpers for the digest-image edge route.
 *
 * Slack's image proxy is anonymous (cannot attach cookies/headers), so the
 * URL itself must carry the data + a signature proving it came from our cron.
 *
 * Why a separate module from shareVerify.ts: that file uses node:crypto and
 * targets Node-only paths. The digest-image route runs in the edge runtime,
 * which doesn't have node:crypto. This module uses Web Crypto (crypto.subtle)
 * so the SAME signer works in both the Node cron handler AND the edge image
 * route.
 *
 * Payload is JSON-encoded then base64url-encoded for URL-safe transport.
 * Signature is HMAC-SHA256 over the base64url payload, also base64url-encoded.
 */

const SUBTLE = (globalThis.crypto as Crypto | undefined)?.subtle;
if (!SUBTLE) {
  // Module load-time guard — if Web Crypto is unavailable the module fails fast
  // instead of silently producing unverifiable URLs.
  throw new Error("signed-image-url: Web Crypto (crypto.subtle) not available");
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Read the signing secret from env, with the same defensive fallback chain as
 * shareVerify.ts: prefer a dedicated `STRATEGY_DIGEST_SIGNING_SECRET`, fall
 * back to `SHARE_VERIFY_SECRET`, fall back to `SUPABASE_SERVICE_ROLE_KEY`.
 * Throws when none of the three are configured — the route is unusable
 * without a secret.
 */
let warnedDigestSecretFallback = false;

export function getDigestSigningSecret(): string {
  const dedicated = process.env.STRATEGY_DIGEST_SIGNING_SECRET;
  if (dedicated && dedicated.length >= 16) return dedicated;
  const shareFallback = process.env.SHARE_VERIFY_SECRET;
  if (shareFallback && shareFallback.length >= 16) return `digest-image:${shareFallback}`;
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (srk && srk.length >= 16) {
    // [Audit L4] Reusing the DB service-role key as the HMAC signing key — poor
    // hygiene, not an escalation (the digest route only renders aggregate funnel
    // PNGs from the signed payload, no DB read). Edge-runtime safe (no pino).
    // console.warn survives the production removeConsole (exclude: error,warn).
    if (!warnedDigestSecretFallback) {
      warnedDigestSecretFallback = true;
      console.warn(
        "[signed-image-url] STRATEGY_DIGEST_SIGNING_SECRET / SHARE_VERIFY_SECRET not set — deriving the digest-image HMAC key from SUPABASE_SERVICE_ROLE_KEY. Set STRATEGY_DIGEST_SIGNING_SECRET (>=16 chars). [Audit L4]"
      );
    }
    return `digest-image:${srk}`;
  }
  throw new Error("digest_signing_secret_missing");
}

/** Base64url (RFC 4648 §5, URL-safe, no padding) encode a byte sequence. */
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  // btoa is available in both Node 18+ and edge runtime.
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Reverse of base64UrlEncode. Returns null on malformed input. */
function base64UrlDecode(input: string): Uint8Array | null {
  if (typeof input !== "string" || input.length === 0) return null;
  // Disallow any character outside the base64url alphabet — defends against
  // injection of binary that atob would tolerate via padding chars.
  if (!/^[A-Za-z0-9_-]+$/.test(input)) return null;
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  try {
    const binary = atob(padded + "=".repeat(padLen));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return SUBTLE!.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/**
 * Constant-time string compare. Web Crypto has no `timingSafeEqual`, so we
 * roll our own (operates on the base64url-encoded signatures, which have
 * equal length when valid — length-mismatch returns false immediately).
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Sign an arbitrary JSON-serializable payload. Returns `{ d, s }` — both
 * base64url-encoded strings safe to embed in URL query params.
 *
 * Throws when JSON.stringify fails (cycles, BigInt, etc.) or when the secret
 * is misconfigured. Caller is responsible for keeping payload small enough
 * to fit in a URL (Slack tolerates ~2k chars).
 */
export async function signImagePayload<T>(
  payload: T,
  secret: string = getDigestSigningSecret()
): Promise<{ d: string; s: string }> {
  const json = JSON.stringify(payload);
  const dataBytes = textEncoder.encode(json);
  const d = base64UrlEncode(dataBytes);
  const key = await importHmacKey(secret);
  const sigBytes = await SUBTLE!.sign("HMAC", key, textEncoder.encode(d));
  const s = base64UrlEncode(new Uint8Array(sigBytes));
  return { d, s };
}

/**
 * Verify-and-parse a signed payload. Returns the deserialized object on
 * success, or `null` for any failure — bad signature, malformed base64,
 * malformed JSON, or wrong secret. Never throws on bad input.
 *
 * Constant-time signature comparison defends against signature-timing attacks.
 */
export async function verifyImagePayload<T = unknown>(
  d: string | null | undefined,
  s: string | null | undefined,
  secret: string = getDigestSigningSecret()
): Promise<T | null> {
  if (!d || !s) return null;
  const sigBytes = base64UrlDecode(s);
  const dataBytes = base64UrlDecode(d);
  if (!sigBytes || !dataBytes) return null;
  let key: CryptoKey;
  try {
    key = await importHmacKey(secret);
  } catch {
    return null;
  }
  // Recompute the expected signature; compare in constant time on the
  // base64url-string form (the same form an attacker would see in the URL).
  const expectedSigBytes = await SUBTLE!.sign("HMAC", key, textEncoder.encode(d));
  const expectedS = base64UrlEncode(new Uint8Array(expectedSigBytes));
  if (!constantTimeEqual(s, expectedS)) return null;
  try {
    const json = textDecoder.decode(dataBytes);
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
