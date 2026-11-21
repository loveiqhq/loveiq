import { supabaseFetch } from "@features/admin/server/supabase";
import { coachIdFor, COACHES, type CoachId } from "@features/mira/content/coaches";
import miraConfig from "@features/mira/content/mira-config.json";

/**
 * What Home's "Picked for you" and "Your coaches" know about one person, read from their own
 * rows of Mira's KPI log (mira_event), never anyone else's:
 *
 * - their chats' topics (chat_topic, the [[TOPIC:id]] marker: an id, never words), newest first,
 *   the chat they began in this browser before signing up included (signup_completed links the
 *   browser id, as AP › Mira does), and none from before their last "Delete all chats"
 * - the coming-soon coaches they asked to hear about (notify_me), Home's older labels included
 */
type Row = {
  name: string;
  anon_id: string | null;
  props: Record<string, unknown> | null;
  created_at: string;
};

const TOPICS = new Set(miraConfig.topics.map((t) => t.id));
const SOON = new Set(COACHES.filter((c) => !c.live).map((c) => c.id));
/** A browser id as anonId() makes it: anything else never enters a query. */
const BROWSER_ID = /^[\w-]{16,64}$/;
const COLS = "select=name,anon_id,props,created_at&order=id.desc";

async function rows(path: string): Promise<Row[]> {
  const res = await supabaseFetch(path);
  if (!res.ok) throw new Error(`mira coaches read failed (${res.status})`);
  return (await res.json()) as Row[];
}

export async function readCoachState(
  userId: string
): Promise<{ topics: string[]; notified: CoachId[] }> {
  const own = await rows(
    `/rest/v1/mira_event?user_id=eq.${encodeURIComponent(userId)}` +
      `&name=in.(chat_topic,chats_deleted,notify_me,signup_completed)&${COLS}&limit=500`
  );
  const browsers = [
    ...new Set(
      own
        .filter((r) => r.name === "signup_completed")
        .map((r) => r.anon_id)
        .filter((id): id is string => typeof id === "string" && BROWSER_ID.test(id))
    ),
  ];
  const before = browsers.length
    ? await rows(
        `/rest/v1/mira_event?anon_id=in.(${browsers.join(",")})&name=eq.chat_topic&${COLS}&limit=100`
      )
    : [];
  const at = (r: Row) => Date.parse(r.created_at);
  const cut = Math.max(-Infinity, ...own.filter((r) => r.name === "chats_deleted").map(at));
  const topics = [...own, ...before]
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
