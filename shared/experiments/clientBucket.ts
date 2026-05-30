/**
 * Browser-safe deterministic A/B bucketing.
 *
 * `shared/emails/ab-variant.ts` is the server-side equivalent, but it imports
 * `node:crypto` (SHA-1) and therefore can't run in client components. This
 * module mirrors its *semantics* — a stable per-key hash, salted per
 * experiment — using a pure-JS hash so it works identically on the server
 * (SSR) and in the browser with no `node:crypto`, no `Math.random`, and no
 * hydration mismatch.
 *
 * Keep this hash STABLE. Changing it re-buckets every existing user, which
 * corrupts any in-flight experiment.
 */

export type ClientVariant = "a" | "b";

/**
 * cyrb53 — a fast, well-distributed 53-bit string hash (public domain).
 * Returns an integer in the range [0, 2^53). Deterministic for a given input.
 */
function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Deterministic 50/50 A/B variant for a client surface.
 *
 * Hashes `experiment:key` so the same key always lands on the same variant —
 * keeps a user's arm consistent across surfaces and reloads. Pass a unique
 * `experiment` salt so a user who is "a" for one test may be "b" for another.
 *
 * An empty/missing key returns "b" (the conventional control arm) rather than
 * a random pick: a user we can't identify should never be forced into a
 * treatment arm.
 */
export function pickClientVariant(
  key: string | null | undefined,
  experiment: string
): ClientVariant {
  const trimmed = (key || "").trim().toLowerCase();
  if (!trimmed) return "b";
  return cyrb53(`${experiment}:${trimmed}`) % 2 === 0 ? "a" : "b";
}
