import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { ANON_COOKIE } from "./config";

const VALID = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * The anonymous visitor's random id (a cookie, a year). It counts the free conversations and links
 * anonymous KPI events; it carries no IP, address or chat text. Set here on first use.
 */
export async function anonId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(ANON_COOKIE)?.value;
  if (existing && VALID.test(existing)) return existing;
  const fresh = randomBytes(18).toString("base64url");
  store.set(ANON_COOKIE, fresh, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return fresh;
}
