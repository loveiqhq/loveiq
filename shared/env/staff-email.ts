/**
 * Which email addresses are ours.
 *
 * This started life inside the admin bulk-delete tool, where it decided whether
 * a survey submission looked like a test. It now also decides whether a PAYMENT
 * is a test, which makes it load-bearing for revenue reporting — so it lives
 * here rather than under `features/admin`, which is excluded from coverage
 * gating.
 *
 * Source: `ADMIN_TEST_EMAIL_REGEX`, defaulting to `^.+@loveiq\.org$`. The name
 * is kept for backwards compatibility with the existing env var.
 */

let cachedRegex: RegExp | null | undefined;

/**
 * The configured staff email regex, or null when unset or invalid.
 *
 * A blank value disables the rule entirely — which means "treat nobody as
 * staff", i.e. count everything as real. That is the safe direction to fail for
 * revenue: it never hides money, it only stops hiding tests.
 */
export function getStaffEmailRegex(): RegExp | null {
  if (cachedRegex !== undefined) return cachedRegex;
  const raw = process.env.ADMIN_TEST_EMAIL_REGEX ?? "^.+@loveiq\\.org$";
  if (!raw.trim()) {
    cachedRegex = null;
    return cachedRegex;
  }
  try {
    // The pattern comes from server-side env (ADMIN_TEST_EMAIL_REGEX) and is
    // only matched against email strings — no untrusted input.
    // eslint-disable-next-line security/detect-non-literal-regexp
    cachedRegex = new RegExp(raw, "i");
  } catch {
    cachedRegex = null;
  }
  return cachedRegex;
}

/** True when this address belongs to us, so anything it does is internal. */
export function isStaffEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const regex = getStaffEmailRegex();
  return !!regex && regex.test(email);
}

/** Reset the cached regex — for tests only. */
export function __resetStaffEmailRegexForTests(): void {
  cachedRegex = undefined;
}
