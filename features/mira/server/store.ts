import { supabaseFetch } from "@features/admin/server/supabase";
import { scheduleAfterResponse } from "@shared/http/after-response";
import logger from "@shared/observability/logger";
import type { CitedSource } from "./safety";
import type { CoachingStyle } from "./prompt";

/**
 * Mira's database reads and writes (supabase/migrations/20261118120000_mira_mvp.sql), all with
 * the service role from API routes. Every read of a chat or message is scoped to the signed-in
 * account's id, so one person can never reach another's chats by guessing an id.
 */

export type MiraProfile = {
  id: string;
  email: string;
  name: string | null;
  country: string | null;
  gender: string | null;
  style: CoachingStyle;
  remember_chats: boolean;
  use_assessment: boolean;
  consent_at: string;
  consent_version: string;
  nudges_on: boolean;
  nudge_time: "08:00" | "19:00" | "21:30";
  time_zone: string;
};

export type ChatSummary = { id: string; title: string; updated_at: string };
export type StoredMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  sources: CitedSource[] | null;
  rating: number | null;
};

const enc = encodeURIComponent;
const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

async function rows<T>(path: string): Promise<T[]> {
  const res = await supabaseFetch(path);
  if (!res.ok) throw new Error(`mira read failed (${res.status})`);
  return (await res.json()) as T[];
}

const PROFILE_COLS =
  "id,email,name,country,gender,style,remember_chats,use_assessment,consent_at,consent_version,nudges_on,nudge_time,time_zone";

export async function getProfile(id: string): Promise<MiraProfile | null> {
  const found = await rows<MiraProfile>(
    `/rest/v1/mira_user?id=eq.${enc(id)}&select=${PROFILE_COLS}&limit=1`
  );
  return found[0] ?? null;
}

/** Created (or its consent renewed) at every sign-in; the rest of the profile is kept. */
export async function upsertProfileAtSignIn(
  id: string,
  email: string,
  consentVersion: string
): Promise<MiraProfile | null> {
  const res = await supabaseFetch("/rest/v1/mira_user?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      id,
      email,
      consent_at: new Date().toISOString(),
      consent_version: consentVersion,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`mira profile upsert failed (${res.status})`);
  const out = (await res.json()) as MiraProfile[];
  return out[0] ?? null;
}

export type ProfilePatch = Partial<
  Pick<
    MiraProfile,
    | "name"
    | "country"
    | "gender"
    | "style"
    | "remember_chats"
    | "use_assessment"
    | "nudges_on"
    | "nudge_time"
    | "time_zone"
  > & { nudges_stopped_at: string | null; nudge_stop_reason: string | null }
>;

export async function updateProfile(id: string, patch: ProfilePatch): Promise<void> {
  const res = await supabaseFetch(`/rest/v1/mira_user?id=eq.${enc(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`mira profile update failed (${res.status})`);
}

export async function listChats(userId: string): Promise<ChatSummary[]> {
  return rows<ChatSummary>(
    `/rest/v1/mira_chat?user_id=eq.${enc(userId)}&select=id,title,updated_at&order=updated_at.desc&limit=50`
  );
}

export async function ownsChat(userId: string, chatId: string): Promise<boolean> {
  if (!isUuid(chatId)) return false;
  const found = await rows<{ id: string }>(
    `/rest/v1/mira_chat?id=eq.${enc(chatId)}&user_id=eq.${enc(userId)}&select=id&limit=1`
  );
  return found.length > 0;
}

/** The newest `limit` messages of a chat the account owns, oldest first. */
export async function getMessages(
  userId: string,
  chatId: string,
  limit = 200
): Promise<StoredMessage[]> {
  if (!(await ownsChat(userId, chatId))) return [];
  const newest = await rows<StoredMessage>(
    `/rest/v1/mira_message?chat_id=eq.${enc(chatId)}&select=id,role,content,sources,rating&order=id.desc&limit=${limit}`
  );
  return newest.reverse();
}

export async function createChat(userId: string, title: string): Promise<string> {
  const res = await supabaseFetch("/rest/v1/mira_chat", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ user_id: userId, title: title.slice(0, 120) || "New chat" }),
  });
  if (!res.ok) throw new Error(`mira chat create failed (${res.status})`);
  const out = (await res.json()) as Array<{ id: string }>;
  return out[0]!.id;
}

export async function addMessages(
  chatId: string,
  messages: Array<{ role: "user" | "assistant"; content: string; sources?: CitedSource[] | null }>
): Promise<number[]> {
  const res = await supabaseFetch("/rest/v1/mira_message?select=id", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(
      messages.map((m) => ({
        chat_id: chatId,
        role: m.role,
        content: m.content,
        sources: m.sources ?? null,
      }))
    ),
  });
  if (!res.ok) throw new Error(`mira message insert failed (${res.status})`);
  await supabaseFetch(`/rest/v1/mira_chat?id=eq.${enc(chatId)}`, {
    method: "PATCH",
    body: JSON.stringify({ updated_at: new Date().toISOString() }),
  });
  return ((await res.json()) as Array<{ id: number }>).map((r) => r.id);
}

/** A thumbs up or down on one of the account's own stored replies. */
export async function rateMessage(
  userId: string,
  messageId: number,
  rating: 1 | -1
): Promise<boolean> {
  const found = await rows<{ id: number }>(
    `/rest/v1/mira_message?id=eq.${messageId}&role=eq.assistant&select=id,mira_chat!inner(user_id)&mira_chat.user_id=eq.${enc(userId)}&limit=1`
  );
  if (found.length === 0) return false;
  const res = await supabaseFetch(`/rest/v1/mira_message?id=eq.${messageId}`, {
    method: "PATCH",
    body: JSON.stringify({ rating }),
  });
  return res.ok;
}

export async function deleteChats(userId: string): Promise<void> {
  const res = await supabaseFetch(`/rest/v1/mira_chat?user_id=eq.${enc(userId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`mira chat delete failed (${res.status})`);
}

/** Deletes the auth user; the database cascades to the profile, chats and messages. */
export async function deleteAccount(userId: string): Promise<void> {
  const res = await supabaseFetch(`/auth/v1/admin/users/${enc(userId)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`mira account delete failed (${res.status})`);
}

export type MiraEventName =
  | "chat_opened"
  | "consent_given"
  | "chat_started"
  | "message_sent"
  | "reply_shown"
  | "crisis_shown"
  | "gate_shown"
  | "signup_code_sent"
  | "signup_completed"
  | "rating"
  | "feedback"
  | "notify_me"
  | "settings_saved"
  | "chats_deleted"
  | "account_deleted"
  | "nudge_sent"
  | "nudge_clicked"
  | "nudge_prefs_saved"
  | "nudge_stopped"
  | "nudge_resumed"
  | "nps";

/** The KPI log. Written after the response, so it never slows a reply; a lost row is logged. */
export function logMiraEvent(
  name: MiraEventName,
  who: { anonId?: string | null; userId?: string | null },
  props: Record<string, unknown> = {}
): void {
  scheduleAfterResponse(`mira-event:${name}`, async () => {
    const res = await supabaseFetch("/rest/v1/mira_event", {
      method: "POST",
      body: JSON.stringify({
        name,
        anon_id: who.anonId ?? null,
        user_id: who.userId ?? null,
        props,
      }),
    });
    if (!res.ok) logger.warn({ status: res.status, name }, "mira: an event row was refused");
  });
}

export type AssessmentResult = { archetype: string; takenAt: string; reportPath: string | null };

/**
 * The person's latest finished LoveIQ survey, matched on their VERIFIED account email only
 * (the code proved they own it), so nobody can pull up someone else's result.
 */
export async function findAssessment(email: string): Promise<AssessmentResult | null> {
  const users = await rows<{ id: number }>(`/rest/v1/app_user?email=eq.${enc(email)}&select=id`);
  if (users.length === 0) return null;
  const ids = users.map((u) => u.id).join(",");
  const subs = await rows<{ id: number; updated_date_time: string }>(
    `/rest/v1/survey_submission?user_id=in.(${ids})&status=eq.completed&select=id,updated_date_time&order=updated_date_time.desc&limit=1`
  );
  const sub = subs[0];
  if (!sub) return null;
  const [score] = await rows<{
    v5_primary_archetype: string | null;
    primary_archetype: string | null;
  }>(
    `/rest/v1/scoring_result?survey_submission_id=eq.${sub.id}&select=v5_primary_archetype,primary_archetype&order=scored_at.desc&limit=1`
  );
  const archetype = score?.v5_primary_archetype || score?.primary_archetype;
  if (!archetype) return null;
  const [token] = await rows<{ token: string }>(
    `/rest/v1/report_access_token?survey_submission_id=eq.${sub.id}&select=token&order=created_at.desc&limit=1`
  );
  return {
    archetype,
    takenAt: sub.updated_date_time,
    reportPath: token ? `/report/${token.token}` : null,
  };
}

/** Guesses one emailed code gets, and how long it lives (Supabase's own code lifetime). */
export const CODE_MAX_ATTEMPTS = 5;
export const CODE_TTL_SECONDS = 3600;

/**
 * Written when Mira emails a code: a new code resets the guesses. Without this row the verify
 * route checks no code at all, so it can never be used to guess a code Mira did not send
 * (the admin panel and Jarvis share this Supabase project). See the migration
 * 20261118130000_mira_sign_in_code.sql.
 */
export async function recordCodeIssued(email: string): Promise<void> {
  const res = await supabaseFetch("/rest/v1/mira_sign_in_code?on_conflict=email", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ email, issued_at: new Date().toISOString(), attempts: 0 }),
  });
  if (!res.ok) throw new Error(`mira code record failed (${res.status})`);
}

/** Reserves one guess for the address's current code, atomically, before it is checked. */
export async function claimCodeAttempt(email: string): Promise<boolean> {
  const res = await supabaseFetch("/rest/v1/rpc/mira_claim_code_attempt", {
    method: "POST",
    body: JSON.stringify({
      p_email: email,
      p_max: CODE_MAX_ATTEMPTS,
      p_ttl_seconds: CODE_TTL_SECONDS,
    }),
  });
  if (!res.ok) return false; // fail closed
  return (await res.json()) === true;
}

/** A used code's row goes, so it cannot be guessed at again. */
export async function consumeCode(email: string): Promise<void> {
  await supabaseFetch(`/rest/v1/mira_sign_in_code?email=eq.${enc(email)}`, { method: "DELETE" });
}
