import { isProbeRequest } from "./probe-cookie";

/**
 * The cookie that marks a teammate's browser, so what it does stays out of the numbers.
 *
 * The team tests Mira from personal Gmail accounts and anonymous browsers, which counted as real
 * people until 21 Nov 2026. Set by an AP sign-in (app/admin/auth/callback) and by AP › Mira's
 * "This browser counts as team" (app/api/admin/ap/team-browser); read by Mira's routes
 * (features/mira/server/attribution.ts), which flag the browser's events and accounts as team.
 * Our own probes' `loveiq_probe=1` counts the same. httpOnly: the page asks the server.
 * Nothing about access reads it, so a visitor who forged it would only leave our numbers.
 */
export const TEAM_COOKIE = "loveiq_team";

/** Two years; browsers cap a cookie at 400 days, and every AP sign-in sets it again. */
export const TEAM_COOKIE_MAX_AGE = 2 * 365 * 24 * 60 * 60;

export const teamCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: TEAM_COOKIE_MAX_AGE,
});

/** Anchored on a cookie boundary and `=1` exactly, as isProbeRequest is. */
const TEAM_RE = new RegExp(`(?:^|;\\s*)${TEAM_COOKIE}=1(?:;|$)`);

/** Is this request from a teammate's browser (`loveiq_team=1`) or one of our probes? */
export const isTeamBrowser = (cookieHeader: string | null | undefined): boolean =>
  TEAM_RE.test(cookieHeader ?? "") || isProbeRequest(cookieHeader);
