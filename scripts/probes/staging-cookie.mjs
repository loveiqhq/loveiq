import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * Name the server checks before writing a `report_session` row.
 *
 * WHY. The probes open `/report/<token>` on every run, and the server records a
 * row per open. Measured 2026-09-21: 73% of `report_session` over 30 days is
 * internal traffic, 1,505 rows of it on the single report the probes hammer —
 * and the share is climbing (52% all time, 63% over 90 days, 73% over 30) as
 * this pipeline runs more often. Eight admin routes read that table for
 * retention, journey, flow and embed performance, and none of them filter.
 *
 * NOT DETECTABLE ANY OTHER WAY. The probes emulate real devices, so their user
 * agent is a real phone's by design — only 328 of those rows look headless. The
 * account cannot be used either: the team legitimately reads its own reports in
 * a real browser, and that is a visit.
 *
 * A cookie rather than a header because 27 of the 34 probes already call this
 * one function, so they are all covered by it without touching each file. It
 * suppresses a telemetry row and nothing else, so a visitor who forged it would
 * only remove themselves from our own analytics.
 */
// Kept byte-identical to shared/http/probe-cookie.ts, which the server reads.
// A test asserts the two agree — scripts/ is outside the Next build, so this
// cannot simply import it.
export const PROBE_COOKIE = "loveiq_probe";

/**
 * Past the staging gate on a locally-built production server.
 *
 * `proxy.ts` gates every route whenever STAGING_PASSWORD is set — and it is set
 * in .env.local, so `npm run build && npm start` on this machine is gated too.
 * The middleware only compares a cookie against sha256(STAGING_PASSWORD), so the
 * session can be minted directly instead of driving the login form.
 */
export function stagingCookies(origin) {
  const { hostname, protocol } = new URL(origin);
  const secure = protocol === "https:";
  /**
   * ALWAYS returned, unlike the staging cookie below.
   *
   * That one is skipped when no password is set — which is exactly the
   * production case, and exactly where this marker is needed. Returning them
   * together from the same early-exit would have shipped a marker that is
   * dropped on the only target that matters.
   */
  const probe = {
    name: PROBE_COOKIE,
    value: "1",
    domain: hostname,
    path: "/",
    expires: -1,
    httpOnly: true,
    secure,
    sameSite: "Strict",
  };
  let password = process.env.STAGING_PASSWORD;
  if (!password) {
    try {
      // ../../ — this file is scripts/probes/, so one level up is scripts/.
      // It was ../ and silently read nothing; production is not gated, so the
      // empty cookie list looked fine until a probe pointed at local dev.
      const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
      password = env
        .match(/^STAGING_PASSWORD=(.*)$/m)?.[1]
        ?.trim()
        .replace(/^["']|["']$/g, "");
    } catch {
      /* no local env — a deployed target may not need the cookie at all */
    }
  }
  if (!password) return [probe];
  return [
    probe,
    {
      name: "staging_session",
      value: createHash("sha256").update(password).digest("hex"),
      domain: hostname,
      path: "/",
      expires: -1,
      httpOnly: true,
      // http on localhost drops a Secure cookie, so this must follow the target.
      secure,
      sameSite: "Strict",
    },
  ];
}
