/**
 * The paywall countdown's price consequence.
 *
 * The report shows a three-minute countdown ("Time left to secure this price"). Until
 * now nothing happened when it reached 00:00 — the price was identical either side of
 * it, and `PaywallCountdown` said so in its own docstring. This is the rule that makes
 * the clock mean something: once the window has passed, every plan costs two euros
 * more, on the report AND at checkout.
 *
 * Kept as a pure module, separate from the pricing engine, for three reasons:
 *   - it is the only place the amount and the comparison live, so the price the reader
 *     sees and the price Stripe charges cannot drift apart;
 *   - the engine's own price is monotonically NON-INCREASING by design
 *     (`reportPricing.ts`, `Math.min(previousCurrentPriceCents, …)`), so a surcharge
 *     can never be folded into `current_price` — it has to be added at the edges, and
 *     that addition needs a home;
 *   - it makes the whole feature reversible: with the flag off the surcharge is 0 and
 *     every number matches what shipped before it.
 */

/** Two euros, in cents. */
export const URGENCY_SURCHARGE_CENTS = 200;

export interface UrgencyState {
  /** ISO timestamp. `null` when the reader has not reached the paywall yet. */
  deadlineAt: string | null;
}

/**
 * Has the window closed?
 *
 * `false` while it is still running AND when there is no deadline at all: a reader who
 * has not reached the paywall yet has not used up anything, so they get the base price.
 * The boundary is exclusive — exactly ON the deadline is not yet expired, which matches
 * the visible timer, whose `expired` flips at `remainingMs <= 0`.
 */
export function isUrgencyExpired(deadlineAt: string | null | undefined, now = Date.now()): boolean {
  if (!deadlineAt) return false;
  const deadline = Date.parse(deadlineAt);
  if (Number.isNaN(deadline)) return false;
  return now > deadline;
}

/**
 * The surcharge to add to a base price. `0` unless the flag is on AND the window has
 * closed — so a missed call site under-charges rather than over-charges, which is the
 * safe direction to fail in.
 */
export function urgencySurchargeCents({
  deadlineAt,
  enabled,
  now = Date.now(),
}: {
  deadlineAt: string | null | undefined;
  enabled: boolean;
  now?: number;
}): number {
  if (!enabled) return 0;
  return isUrgencyExpired(deadlineAt, now) ? URGENCY_SURCHARGE_CENTS : 0;
}

/** Read the stored deadline off a quote row's jsonb, tolerating anything shaped wrong. */
export function readUrgencyDeadline(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return null;
  const raw = (metadata as { urgency?: unknown }).urgency;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const deadlineAt = (raw as Record<string, unknown>).deadlineAt;
  if (typeof deadlineAt !== "string" || Number.isNaN(Date.parse(deadlineAt))) return null;
  return deadlineAt;
}

/**
 * Merge a deadline into a quote row's jsonb, ONCE.
 *
 * Idempotent on purpose: an existing deadline is returned untouched, even when it has
 * already elapsed. Re-arming would hand a reader a fresh discount window by reopening
 * the report, and extending one would make the countdown a lie. Same contract as the
 * client-side `getReportPaywallDeadline`, which keeps an elapsed deadline rather than
 * minting a new one.
 */
export function mergeUrgencyDeadline(
  metadata: Record<string, unknown> | null | undefined,
  deadlineAt: string
): { metadata: Record<string, unknown>; deadlineAt: string } {
  const next =
    typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)
      ? { ...metadata }
      : {};
  const existing = readUrgencyDeadline(next);
  if (existing) {
    return { metadata: next, deadlineAt: existing };
  }
  next.urgency = { deadlineAt };
  return { metadata: next, deadlineAt };
}
