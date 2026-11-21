import { cookies } from "next/headers";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";
import { MINOR_COOKIE } from "./config";
import { deleteChats, updateProfile } from "./store";
import { deleteRecordings } from "./voice";

/**
 * Rail 15 (under 18), kept by the app once it fires. When Mira ends a reply with [[MINOR]]
 * (safety.ts parseReply), the person said or clearly showed they are under 18: from then on
 * their browser (a cookie, a year) and their account (mira_user.minor_at) get message G without
 * the model. A crisis message still gets the crisis reply and the lines, because the chat route
 * reads crisis words first. The account's nudges go off, and its chats are deleted and no longer
 * kept; the browser forgets its own chat (MiraChat).
 */

/** This browser or this account said its person is under 18. */
export async function isMinor(userId: string | null): Promise<boolean> {
  if ((await cookies()).get(MINOR_COOKIE)?.value === "1") return true;
  if (!userId) return false;
  const res = await supabaseFetch(
    `/rest/v1/mira_user?id=eq.${encodeURIComponent(userId)}&minor_at=not.is.null&select=id&limit=1`
  );
  if (!res.ok) throw new Error(`mira minor read failed (${res.status})`);
  return ((await res.json()) as unknown[]).length > 0;
}

/** Remembers the stop on this browser and the account. A failed write is logged, never shown. */
export async function stopForMinor(userId: string | null): Promise<void> {
  (await cookies()).set(MINOR_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  if (!userId) return;
  const done = await Promise.allSettled([
    updateProfile(userId, {
      minor_at: new Date().toISOString(),
      nudges_on: false,
      remember_chats: false,
    }),
    deleteChats(userId),
    // Voice sessions (22 Nov 2026): their key points too, not only their words.
    deleteRecordings(userId),
  ]);
  for (const r of done) {
    if (r.status === "rejected") {
      logger.error({ err: r.reason }, "mira: an under-18 stop was not saved in full");
    }
  }
}
