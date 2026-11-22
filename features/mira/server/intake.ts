import { supabaseFetch } from "@features/admin/server/supabase";
import miraConfig from "../content/mira-config.json";

const enc = encodeURIComponent;

/**
 * Whether one of the account's saved chats already holds Sanjin's intake invitation. It is
 * offered once, in the first chat, not in every new one (round-2 audit CHAT-2): Mira carries no
 * answers from one chat to the next, so each new chat asked the same 12 questions again. With
 * "Remember our conversations" off nothing is saved, so every chat is a first one.
 */
export async function invitationShown(userId: string): Promise<boolean> {
  const res = await supabaseFetch(
    `/rest/v1/mira_message?role=eq.assistant&content=eq.${enc(miraConfig.intakeInvitation)}&select=id,mira_chat!inner(user_id)&mira_chat.user_id=eq.${enc(userId)}&limit=1`
  );
  if (!res.ok) throw new Error(`mira intake read failed (${res.status})`);
  return ((await res.json()) as unknown[]).length > 0;
}
