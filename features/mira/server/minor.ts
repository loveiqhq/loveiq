import { cookies } from "next/headers";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";
import { forgetNotify } from "./coaches";
import { deleteChecks } from "./checks";
import { MINOR_COOKIE } from "./config";
import { deleteGoals } from "./goals";
import { refreshPublicReviews, withdrawReview } from "./reviews";
import { removePasskeys } from "./passkeys";
import { forgetJournal } from "./journal";
import { deleteChats, forgetEventText, updateProfile } from "./store";
import { deleteRecordings } from "./voice";
import { deleteSlot } from "./weekly-sessions";
import { deleteBodyChecks } from "./body-check";
import { dropPendingChange } from "./email-change";

/**
 * Rail 15 (under 18), kept by the app once it fires. When Mira ends a reply with [[MINOR]]
 * (safety.ts parseReply), the person said or clearly showed they are under 18: from then on
 * their browser (a cookie, a year) and their account (mira_user.minor_at) get message G without
 * the model. A crisis message still gets the crisis reply and the lines, because the chat route
 * reads crisis words first. The account's nudges go off, its chats are deleted and no longer
 * kept, and its Settings choices (reply language, appearance) are cleared, as are its self-check results
 * (server/checks.ts); the browser forgets its
 * own chat (MiraChat). Its Notify me requests for coming-soon coaches and the coach finder's
 * outcomes go too (22 Nov 2026), so nobody under 18 is told a coach for sex is ready.
 *
 * Sign-in & security (22 Nov 2026): the account's passkeys go too, like the nudges a way back in,
 * and none can be added again (the passkey, email and Google-connect routes answer 403). Its
 * signed-in devices stay, as the stop signs nobody out; Settings can still sign them out. A booked
 * weekly session is deleted without any email, and the session routes refuse the account
 * (weekly-sessions.ts).
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

/** How new a Mira profile must be to count as made by this sign-in (clocks may differ a little). */
const NEW_ACCOUNT_MS = 5 * 60_000;

/**
 * A sign-in from a browser Mira stopped as under 18 (the stop came while signed out, so only its
 * cookie has it). A Mira account this sign-in made takes the stop, as it has nothing of its own
 * yet. An existing one is never stopped or wiped on the cookie alone: it may be someone else's on
 * a shared browser, and the cookie isn't signed. This browser stays stopped (isMinor) and the
 * account stays as it was. True when the browser is stopped, so the caller keeps none of its chat.
 */
export async function carryMinorStop(
  userId: string,
  profileCreatedAt: string | undefined
): Promise<boolean> {
  if ((await cookies()).get(MINOR_COOKIE)?.value !== "1") return false;
  if (Date.now() - Date.parse(profileCreatedAt ?? "") < NEW_ACCOUNT_MS) {
    await stopForMinor(userId);
  }
  return true;
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
  // Each step on its own, so one that fails, even at once, never stops the others.
  const steps: Array<() => Promise<unknown>> = [
    () =>
      updateProfile(userId, {
        minor_at: new Date().toISOString(),
        nudges_on: false,
        remember_chats: false,
        // Settings' choices go too (21 Nov 2026): an under-18 stop keeps nothing it needn't.
        reply_language: null,
        theme: null,
        text_size: null,
      }),
    () => deleteChats(userId),
    // Their beta feedback (its words, and their address if they allowed a follow-up) and the
    // note on their nudge stop, as account deletion removes them (round-2 DATA-5).
    () => forgetEventText(userId, true),
    () => forgetNotify(userId),
    // Challenges & goals: their goals and ticks go too.
    () => deleteGoals(userId),
    // Their rating and words go too, approved or not: a minor's words are never shown.
    () => withdrawReview(userId, "all"),
    // Voice sessions (22 Nov 2026): their key points too, not only their words.
    () => deleteRecordings(userId),
    () => removePasskeys(userId),
    // Its self-check results too (health data a minor's account must not keep); the check
    // routes refuse it from then on (403).
    () => deleteChecks(userId),
    // The daily journal goes too, with Mira's reading of it and its reminder (server/journal.ts).
    () => forgetJournal(userId),
    // A weekly session goes too, silently: no cancellation, reminder or invite is ever sent.
    () => deleteSlot(userId),
    // The body check too, as the other self-checks, and any change of email still pending.
    () => deleteBodyChecks(userId),
    () => dropPendingChange(userId),
  ];
  const done = await Promise.allSettled(steps.map(async (step) => step()));
  for (const r of done) {
    if (r.status === "rejected") {
      logger.error({ err: r.reason }, "mira: an under-18 stop was not saved in full");
    }
  }
  // Whatever failed above, the account's mark keeps them off Mira's pages from the next request.
  refreshPublicReviews();
}
