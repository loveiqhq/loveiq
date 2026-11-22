import miraConfig from "../content/mira-config.json";
import { supabaseFetch } from "@features/admin/server/supabase";

/**
 * The body check: the Body Appreciation Scale-2 (Tylka & Wood-Barcalow 2015, Body Image 12:53-67)
 * at the start and after four weeks, for Marcus's "Body image improvement" (MVP success board:
 * "a validated scale asked in the chat at week 0 and week 4, only with consent"). Signed-in
 * people only, and only when they start it. The scale is free to use, and its authors ask that
 * its items are not changed: they are mira-config.json's bodyCheck, word for word. Its score is
 * the mean of the ten answers, which the table computes (supabase/migrations/20261120050000).
 */

export const BODY_CHECK_ITEMS: readonly string[] = miraConfig.bodyCheck.items;
/** The second check is offered from this many days after the first. */
export const FOLLOW_UP_DAYS = 28;
const DAY_MS = 24 * 60 * 60 * 1000;

export type BodyCheckDue = "baseline" | "week4" | null;

/** What is due, from the times of the checks already done (any order). */
export function bodyCheckDue(taken: string[], now: Date): BodyCheckDue {
  if (taken.length === 0) return "baseline";
  if (taken.length > 1) return null;
  return now.getTime() - Date.parse(taken[0]!) >= FOLLOW_UP_DAYS * DAY_MS ? "week4" : null;
}

const enc = encodeURIComponent;

/** The account's checks, oldest first. */
export async function listBodyChecks(
  userId: string
): Promise<Array<{ score: number; created_at: string }>> {
  const res = await supabaseFetch(
    `/rest/v1/mira_body_check?user_id=eq.${enc(userId)}&select=score,created_at&order=created_at.asc`
  );
  if (!res.ok) throw new Error(`mira body check read failed (${res.status})`);
  return (await res.json()) as Array<{ score: number; created_at: string }>;
}

/** Every body check of the account (the under-18 stop: health answers a minor's account keeps no more). */
export async function deleteBodyChecks(userId: string): Promise<void> {
  const res = await supabaseFetch(`/rest/v1/mira_body_check?user_id=eq.${enc(userId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`mira body check delete failed (${res.status})`);
}

export async function addBodyCheck(userId: string, answers: number[]): Promise<void> {
  const res = await supabaseFetch("/rest/v1/mira_body_check", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, answers }),
  });
  if (!res.ok) throw new Error(`mira body check insert failed (${res.status})`);
}
