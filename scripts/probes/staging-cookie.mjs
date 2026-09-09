import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

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
  let password = process.env.STAGING_PASSWORD;
  if (!password) {
    try {
      const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
      password = env
        .match(/^STAGING_PASSWORD=(.*)$/m)?.[1]
        ?.trim()
        .replace(/^["']|["']$/g, "");
    } catch {
      /* no local env — a deployed target may not need the cookie at all */
    }
  }
  if (!password) return [];
  return [
    {
      name: "staging_session",
      value: createHash("sha256").update(password).digest("hex"),
      domain: hostname,
      path: "/",
      expires: -1,
      httpOnly: true,
      // http on localhost drops a Secure cookie, so this must follow the target.
      secure: protocol === "https:",
      sameSite: "Strict",
    },
  ];
}
