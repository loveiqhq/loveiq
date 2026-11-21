import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { MIRA_AUTH_COOKIE } from "./config";

/**
 * A Mira account's session: Supabase Auth, the same project as the admin panel and Jarvis, but
 * under its OWN cookie name. So signing in to Mira never signs a teammate out of the admin
 * panel or Jarvis, and the admin gate (proxy.ts) never even sees a Mira session.
 *
 * Mira accounts are public sign-ups, so they sit in the same auth.users table as staff. That is
 * safe because nothing trusts "any signed-in user": every admin route checks admin_users
 * (verifyAdminSession / apGuard), Jarvis checks its member list, and no database policy grants
 * the `authenticated` role anything (every table is service-role only). Checked 18 Nov 2026.
 */
export async function createMiraSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        name: MIRA_AUTH_COOKIE,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try {
              cookieStore.set(name, value, options); // nosemgrep: options carry sameSite=lax + secure, set above
            } catch {
              // Read-only in a server component; the next API call refreshes the session.
            }
          });
        },
      },
    }
  );
}

export type MiraAccount = { id: string; email: string };

/** Mira's own signed-in pages, spelt exactly, and a chat by its id (`/mira?chat=<id>`). */
const NEXT_PAGES = new Set([
  "/mira",
  "/mira/home",
  "/mira/settings",
  "/mira/feedback",
  // The self-checks (22 Nov 2026, app/mira/assessments).
  "/mira/assessments",
  "/mira/assessments/anxiety",
  "/mira/assessments/mood",
  "/mira/assessments/loneliness",
  "/mira/assessments/body",
]);
const CHAT_ID = /^[0-9a-fA-F-]{36}$/;

/**
 * Where a sign-in may send the person on to (`next`, e.g. the chat a nudge opened while they
 * were signed out), or null for Home. Only those exact paths, so `next` can never lead off the
 * site (`//host`, `/\host`, a scheme), up a level (`..`) or anywhere but Mira.
 */
export function safeNext(next: unknown): string | null {
  if (typeof next !== "string") return null;
  if (NEXT_PAGES.has(next)) return next;
  const chat = next.startsWith("/mira?chat=") ? next.slice("/mira?chat=".length) : "";
  return CHAT_ID.test(chat) ? next : null;
}

/** The signed-in Mira account, checked with Supabase Auth (not just the cookie), or null. */
export async function getMiraAccount(): Promise<MiraAccount | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    return null;
  try {
    const supabase = await createMiraSupabase();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.email) return null;
    return { id: data.user.id, email: data.user.email.toLowerCase() };
  } catch {
    return null;
  }
}
