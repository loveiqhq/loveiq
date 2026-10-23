/**
 * A tablet: "iPad" in the User-Agent, a Mac User-Agent with touch (iPadOS Safari), or Android
 * without "Mobile". `touch` is the browser's own "more than one touch point", which tells an
 * iPad from a Mac, as both send a Mac User-Agent. Shared by the survey tracking (is_tablet,
 * migration 20261014120100) and the unlock-feedback answer (device).
 */
export function isTablet(userAgent: string, touch: boolean | undefined): boolean {
  const ua = userAgent.toLowerCase();
  return (
    ua.includes("ipad") ||
    (ua.includes("macintosh") && touch === true) ||
    (ua.includes("android") && !ua.includes("mobile"))
  );
}
