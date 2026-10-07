/**
 * The hash every SESSION-DERIVED experiment arm is drawn from: C13's opening order
 * (`questionOrderArm.ts`) and the email question test (`emailQuestionArm.ts`). One
 * implementation, so the two can never drift apart, and each experiment salts it with
 * its own name so their splits are independent of each other.
 *
 * Its values may never change: C13 has been live on it since 2026-10-06, `c13_arm()`
 * mirrors it in SQL to read stored sessions back, and the e2e session fixtures rely on
 * its buckets. `tests/sessionHash.test.ts` pins recorded values.
 *
 * FNV-1a, 32-bit, FINISHED WITH AN AVALANCHE STEP. Not a security primitive: it
 * only needs to spread session ids evenly across two buckets, and — because it is
 * salted with the experiment name — to spread them DIFFERENTLY from any other test
 * seeded the same way.
 *
 * WHY THE FINALIZER IS NOT OPTIONAL. Taking `% 2` of raw FNV-1a is not a coin
 * flip. The multiplier (0x01000193) is odd, so multiplying never changes the low
 * bit, and the whole hash collapses to
 *
 *     low bit = parity(offset basis) XOR parity(c1) XOR ... XOR parity(cn)
 *
 * — i.e. "does this string contain an odd number of odd-valued characters?".
 * Measured on production data before this changed: the arm agreed with that
 * parity on 500 of 500 session ids, with no cross-cells at all.
 *
 * Two consequences, one harmless and one not:
 *
 *   - Balance was FINE (50.24% over 200k random uuids), because that parity is
 *     itself unbiased for a random uuid. So the split was valid.
 *   - The SALT DID NOTHING. Changing it can only flip the parity wholesale, so it
 *     re-labels the two groups without re-drawing them. Measured: changing the salt
 *     moved 0.00% of 200,000 ids between buckets. A second test seeded from the same
 *     session id would therefore have produced the identical split, or its exact
 *     complement, and the two experiments would have been impossible to tell apart
 *     afterwards.
 *
 * `fmix32` is murmur3's finalizer, whose entire job is to make every output bit
 * depend on every input bit. With it, changing the salt moves 50.04% of ids —
 * a genuinely independent draw. Picking a different single bit of the unfinished
 * hash (the top one balances and salts fine too) would have worked by luck rather
 * than by construction, which is the same mistake one bit over.
 */
export function sessionArmHash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return fmix32(h);
}

/** murmur3's 32-bit finalizer. Mirrored exactly by `c13_arm()` in SQL. */
function fmix32(input: number): number {
  let h = input;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
