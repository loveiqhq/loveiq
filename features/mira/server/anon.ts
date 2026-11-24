import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { ANON_COOKIE } from "./config";

const VALID = /^[A-Za-z0-9_-]{16,64}$/;

/** This browser's id when it has one; never makes one (a delete needs none made). */
export async function knownAnonId(): Promise<string | null> {
  const existing = (await cookies()).get(ANON_COOKIE)?.value;
  return existing && VALID.test(existing) ? existing : null;
}

/**
 * The anonymous visitor's random id (a cookie, a year). It counts the free messages, links
 * anonymous KPI events and, from 24 Nov 2026, the chat Mira keeps without an account (under the
 * consent that names it); it carries no IP or address. Set here on first use.
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
