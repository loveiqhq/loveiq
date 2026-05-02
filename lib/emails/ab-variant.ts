import { createHash } from "node:crypto";

export type EmailVariant = "a" | "b";

/**
 * Hashes `experiment:key` to a uniform 0..(2^32-1) integer. Same key always
 * yields the same number — the call site picks the variant by modulo.
 */
function hashBucket(key: string, experiment: string): number {
  const digest = createHash("sha1").update(`${experiment}:${key}`).digest();
  // Read the last 4 bytes as an unsigned 32-bit integer for a wide bucket.
  return digest.readUInt32BE(digest.length - 4);
}

/**
 * Deterministic 50/50 A/B variant for an email send.
 *
 * Hashes a stable per-recipient key (email, sessionId, userId) so the same key
 * always lands on the same variant — keeps analytics consistent across retries
 * and reminder follow-ups, and lets us cohort users in dashboards.
 *
 * Pass an experiment salt to keep variant assignment per-experiment so a user
 * who's "A" for survey-complete may still be "B" for purchase emails.
 */
export function pickEmailVariant(key: string | null | undefined, experiment: string): EmailVariant {
  const trimmed = (key || "").trim().toLowerCase();
  if (!trimmed) {
    return Math.random() < 0.5 ? "a" : "b";
  }
  return hashBucket(trimmed, experiment) % 2 === 0 ? "a" : "b";
}

/**
 * Deterministic uniform N-way split over a fixed list of variants.
 *
 * Use when an experiment has more than two arms (e.g. share-report A/B/C).
 * Same caveat as `pickEmailVariant`: pass a stable per-recipient key + a
 * unique experiment salt.
 */
export function pickFromVariants<T>(
  key: string | null | undefined,
  experiment: string,
  variants: readonly T[]
): T {
  if (variants.length === 0) {
    throw new Error("pickFromVariants: variants must not be empty");
  }
  if (variants.length === 1) {
    return variants[0]!;
  }
  const trimmed = (key || "").trim().toLowerCase();
  if (!trimmed) {
    return variants[Math.floor(Math.random() * variants.length)]!;
  }
  return variants[hashBucket(trimmed, experiment) % variants.length]!;
}
