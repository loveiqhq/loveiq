import { supabaseFetch } from "@features/admin/server/supabase";
import { coachIdFor, COACHES, type CoachId } from "@features/mira/content/coaches";
import miraConfig from "@features/mira/content/mira-config.json";

/**
 * What Home's "Picked for you" and "Your coaches" know about one person: only the rows of Mira's
 * KPI log (mira_event) that the server wrote under their account (user_id), never a browser id's.
 * A browser id is the client's and can be shared (a borrowed device, someone else before sign-up),
 * so another person's chats must never shape this account's picks. A chat carried into the
 * account at sign-up therefore feeds no pick: its topic was logged under the browser.
 *
 * - their chats' topics (chat_topic, the [[TOPIC:id]] marker: an id, never words), newest first,
 *   none from before their last "Delete all chats"
 * - the coming-soon coaches they asked to hear about (notify_me), Home's older labels included
 */
type Row = { name: string; props: Record<string, unknown> | null; created_at: string };

const TOPICS = new Set(miraConfig.topics.map((t) => t.id));
const SOON = new Set(COACHES.filter((c) => !c.live).map((c) => c.id));
const mine = (userId: string) => `/rest/v1/mira_event?user_id=eq.${encodeURIComponent(userId)}`;

export async function readCoachState(
  userId: string
): Promise<{ topics: string[]; notified: CoachId[] }> {
  const res = await supabaseFetch(
    `${mine(userId)}&name=in.(chat_topic,chats_deleted,notify_me)` +
      "&select=name,props,created_at&order=id.desc&limit=500"
  );
  if (!res.ok) throw new Error(`mira coaches read failed (${res.status})`);
  const own = (await res.json()) as Row[];
  const at = (r: Row) => Date.parse(r.created_at);
  const cut = Math.max(-Infinity, ...own.filter((r) => r.name === "chats_deleted").map(at));
  const topics = own
    .filter((r) => r.name === "chat_topic" && at(r) > cut)
    .sort((a, b) => at(b) - at(a))
    .map((r) => String(r.props?.topic ?? ""))
    .filter((t) => TOPICS.has(t));
  const notified = own
    .filter((r) => r.name === "notify_me")
    .map((r) => coachIdFor(String(r.props?.coach ?? "")))
    .filter((id): id is CoachId => id !== null && SOON.has(id));
  return { topics: [...new Set(topics)], notified: [...new Set(notified)] };
}

/**
 * "Notify me" taken back for one coach: the account's requests for it go, under its id or Home's
 * older label (read as readCoachState reads them), so nothing is kept of a challenge the person
 * no longer wants to hear about, and no event records that they stopped.
 */
export async function stopNotify(userId: string, coach: CoachId): Promise<void> {
  const res = await supabaseFetch(`${mine(userId)}&name=eq.notify_me&select=id,props&limit=500`);
  if (!res.ok) throw new Error(`mira notify-me read failed (${res.status})`);
  const ids = ((await res.json()) as Array<{ id: number; props: Row["props"] }>)
    .filter((r) => coachIdFor(String(r.props?.coach ?? "")) === coach)
    .map((r) => r.id);
  if (!ids.length) return;
  const del = await supabaseFetch(`${mine(userId)}&id=in.(${ids.join(",")})`, {
    method: "DELETE",
  });
  if (!del.ok) throw new Error(`mira notify-me delete failed (${del.status})`);
}

/**
 * Forgets the account's Notify me requests and which coach the finder suggested (finder_done),
 * at the under-18 stop (minor.ts): nobody under 18 is ever told a coach for sex is ready, and
 * nothing is kept of what they were looking for.
 */
export async function forgetNotify(userId: string): Promise<void> {
  const res = await supabaseFetch(`${mine(userId)}&name=in.(notify_me,finder_done)`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`mira notify-me delete failed (${res.status})`);
}
