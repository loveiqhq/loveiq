import { supabaseFetch } from "@features/admin/server/supabase";
import { memberByEmail } from "@features/brain/server/sign-in";
import { scheduleAfterResponse } from "@shared/http/after-response";
import logger from "@shared/observability/logger";
import { fromTeamBrowser, requestExtras } from "./attribution";
import { isStaffEmail } from "./google";
import type { CoachEvent } from "@features/mira/content/coaches";
import { refreshPublicReviews } from "./reviews";
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
  /**
   * Settings, 21 Nov 2026 (20261122060000_mira_settings.sql): the language Mira replies in (null:
   * the person's own), and how Mira looks (null: never chosen, this browser's own stays).
   */
  reply_language: string | null;
  theme: "light" | "dark" | "system" | null;
  text_size: "small" | "default" | "large" | null;
};

export type ChatSummary = { id: string; title: string; updated_at: string };
export type StoredMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  sources: CitedSource[] | null;
  rating: number | null;
  /** The intake question this reply of Mira's asked (its answers show as buttons). */
  ask: string | null;
};

const enc = encodeURIComponent;
const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

async function rows<T>(path: string): Promise<T[]> {
  const res = await supabaseFetch(path);
  if (!res.ok) throw new Error(`mira read failed (${res.status})`);
  return (await res.json()) as T[];
}

const PROFILE_COLS =
  "id,email,name,country,gender,style,remember_chats,use_assessment,consent_at,consent_version,nudges_on,nudge_time,time_zone,reply_language,theme,text_size";

export async function getProfile(id: string): Promise<MiraProfile | null> {
  const found = await rows<MiraProfile>(
    `/rest/v1/mira_user?id=eq.${enc(id)}&select=${PROFILE_COLS}&limit=1`
  );
  return found[0] ?? null;
}

/**
 * Created (or its consent renewed) at every sign-in, with the form's optional tick as given that
 * time (the LoveIQ result); the rest of the profile is kept. `share_rated_replies` is never set
 * any more (the box went on 21 Nov 2026; ratings are thumbs only).
 * Signed in from a team browser, the account is the team's from then on (is_team, never unset here).
 */
export async function upsertProfileAtSignIn(
  id: string,
  email: string,
  consentVersion: string,
  choices: { useAssessment: boolean }
): Promise<MiraProfile | null> {
  const team = await fromTeamBrowser();
  const res = await supabaseFetch("/rest/v1/mira_user?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      id,
      email,
      consent_at: new Date().toISOString(),
      consent_version: consentVersion,
      use_assessment: choices.useAssessment,
      updated_at: new Date().toISOString(),
      ...(team ? { is_team: true } : {}),
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
    | "reply_language"
    | "theme"
    | "text_size"
  > & {
    nudges_stopped_at: string | null;
    nudge_stop_reason: string | null;
    minor_at: string;
    /** "Mira may use my check results" (20261122090000_mira_checks.sql); written, not read here. */
    use_checks: boolean;
  } & { is_team: true; google_connected_at: string | null } // Sign-in & security (22 Nov 2026): a team browser's passkey sign-in, and Google's confirmation.
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
    `/rest/v1/mira_message?chat_id=eq.${enc(chatId)}&select=id,role,content,sources,rating,ask&order=id.desc&limit=${limit}`
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
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    sources?: CitedSource[] | null;
    ask?: string | null;
    /** A spoken turn's voice session (features/mira/server/voice.ts); only sent when there is one. */
    voiceSession?: string | null;
  }>
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
        ask: m.ask ?? null,
        ...(m.voiceSession ? { voice_session: m.voiceSession } : {}),
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

/**
 * The person's own words that the KPI log keeps on their events: the text of a reply they rated
 * when the reply itself wasn't stored, and with `all` their feedback (free text, and their
 * address if they agreed to be emailed) and the note they gave when stopping nudges. What the
 * staff page counts stays (a rating keeps its thumb). Run before the account goes: its events
 * then lose their user link and can't be found any more.
 */
async function forgetEventText(userId: string, all: boolean): Promise<void> {
  const mine = `/rest/v1/mira_event?user_id=eq.${enc(userId)}`;
  // The browsers the person signed up or in from: what they rated or wrote there before
  // signing in was logged under the browser id only (sign-in links the two).
  const linked = await supabaseFetch(`${mine}&name=eq.signup_completed&select=anon_id`);
  if (!linked.ok) throw new Error(`mira event cleanup failed (${linked.status})`);
  const anonIds = [
    ...new Set(
      ((await linked.json().catch(() => [])) as { anon_id: string | null }[])
        .map((r) => r.anon_id)
        .filter((id): id is string => typeof id === "string" && /^[\w-]{16,64}$/.test(id))
    ),
  ];
  const owners = [mine];
  if (anonIds.length) owners.push(`/rest/v1/mira_event?anon_id=in.(${anonIds.join(",")})`);
  const writes: Array<[string, string, unknown?]> = owners.flatMap((who) =>
    ([1, -1] as const).map((r): [string, string, unknown] => [
      "PATCH",
      `${who}&name=eq.rating&props->>rating=eq.${r}&props->>reply=not.is.null`,
      { props: { rating: r } },
    ])
  );
  if (all) {
    for (const who of owners) writes.push(["DELETE", `${who}&name=eq.feedback`]);
    writes.push([
      "PATCH",
      `${mine}&name=eq.nudge_stopped&props->>reason=not.is.null`,
      { props: {} },
    ]);
  }
  for (const [method, path, body] of writes) {
    const res = await supabaseFetch(path, {
      method,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw new Error(`mira event cleanup failed (${res.status})`);
  }
}

/** Deletes every stored chat (and so its messages), and the rated replies' text kept with them. */
export async function deleteChats(userId: string): Promise<void> {
  await forgetEventText(userId, false);
  const res = await supabaseFetch(`/rest/v1/mira_chat?user_id=eq.${enc(userId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`mira chat delete failed (${res.status})`);
}

/**
 * True when the login is also an admin panel or Jarvis login (admin_users, or an active member
 * of Jarvis's people registry), or when that can't be checked.
 */
export async function sharesLogin(email: string): Promise<boolean> {
  if (await isStaffEmail(email)) return true; // fails closed itself
  return memberByEmail(email).then(
    (member) => member !== null,
    () => true
  );
}

/**
 * Deletes the account: first what the KPI log and the sign-in codes keep about the person, and a
 * booked weekly session out of their calendar (a cancellation, best effort), then the account. Its login is a Supabase auth user, the same one the admin panel and Jarvis sign
 * in with, so for staff and Jarvis members only Mira's row goes (cascading to the chats,
 * messages and nudges) and the login stays. Everyone else's auth user goes, which cascades the
 * same way.
 */
export async function deleteAccount(account: { id: string; email: string }): Promise<void> {
  await forgetEventText(account.id, true);
  await consumeCode(account.email);
  // Imported here: the sessions' emails import this module (their KPI events).
  await import("./session-emails").then((m) => m.cancelSessionInvite(account, "account-deleted"));
  const res = (await sharesLogin(account.email))
    ? await supabaseFetch(`/rest/v1/mira_user?id=eq.${enc(account.id)}`, { method: "DELETE" })
    : await supabaseFetch(`/auth/v1/admin/users/${enc(account.id)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`mira account delete failed (${res.status})`);
  // Its rating and words went with it (ON DELETE CASCADE): off Mira's pages from the next request.
  refreshPublicReviews();
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
  | "nps"
  | "intake_answered"
  | "chat_topic"
  | "referred"
  | "reply_declined"
  | "minor_stop"
  | "body_check_offered"
  | "body_check_started"
  | "body_check_done"
  | "keep_card_shown"
  | "keep_card_keep"
  | "keep_card_not_now"
  | "style_tip_shown"
  | "style_tip_opened"
  | "style_saved"
  // Coaches, Home's picks and search, the guide's "Ask Mira about this" (22 Nov 2026).
  | CoachEvent
  // Settings, 21 Nov 2026: a changed appearance, text size or reply language (its id as `value`).
  | "theme_changed"
  | "text_size_changed"
  | "reply_language_changed"
  // Challenges & goals (22 Nov 2026): counts only, never a goal's words.
  | "goal_suggested"
  | "goal_set"
  | "goal_logged"
  | "goal_completed"
  | "goal_archived"
  | "goal_deleted"
  | "goals_deleted"
  // Ratings and quotes (features/mira/reviews.ts, 22 Nov 2026): the ask shown and put off in the
  // chat, a rating given ({ words }: with words for others) and taken back ({ what }). Never stars
  // or words: a rating taken back must leave nothing behind.
  | "review_prompt_shown"
  | "review_prompt_not_now"
  | "review_given"
  | "review_withdrawn"
  // Talking to Mira by voice (22 Nov 2026, server/voice.ts): ids and numbers only, and the
  // agreement to the browser's speech service with its notice's version.
  | "voice_session_ended"
  | "voice_points_opened"
  | "voice_notice_agreed"
  // Sign-in & security (22 Nov 2026): passkeys, the "Use Face ID next time?" offer, devices
  // signed out, email changes and Google connected (signup_completed's method "passkey" too).
  | "passkey_offer_shown"
  | "passkey_offer_accepted"
  | "passkey_added"
  | "passkey_removed"
  | "device_signed_out"
  | "signed_out_everywhere"
  | "email_changed"
  | "google_connected"
  // The self-checks (22 Nov 2026, content/checks.ts): started (the browser), finished (the
  // server: scale and retake only), the support lines opened by the mood check's question 9, and
  // "Delete my check results". Never answers, scores or bands.
  | "anxiety_check_started"
  | "anxiety_check_done"
  | "mood_check_started"
  | "mood_check_done"
  | "loneliness_check_started"
  | "loneliness_check_done"
  | "check_support_shown"
  | "checks_deleted"
  // A turn of "Mira may use my check results" ({ on, version }), from 22 Nov 2026.
  | "use_checks_set"
  // The daily journal (server/journal.ts): ids and numbers only, never ratings or words.
  | "journal_saved"
  | "journal_deleted"
  | "journal_share_set"
  | "journal_reminder_set"
  | "journal_reminder_sent"
  | "journal_reminder_stopped"
  // Weekly sessions (21 Nov 2026, server/weekly-sessions.ts): booked, moved, reminders paused or
  // back on, cancelled, a reminder sent, a reminded session opened within 30 minutes of its start.
  | "session_scheduled"
  | "session_changed"
  | "session_paused"
  | "session_resumed"
  | "session_cancelled"
  | "session_reminder_sent"
  | "session_attended";

/**
 * The KPI log. Written after the response, so it never slows a reply; a lost row is logged.
 * The request adds `team` and where the visit came from (attribution.ts), read while it lasts.
 */
export function logMiraEvent(
  name: MiraEventName,
  who: { anonId?: string | null; userId?: string | null },
  props: Record<string, unknown> = {}
): void {
  const extras = requestExtras(name);
  scheduleAfterResponse(`mira-event:${name}`, async () => {
    const res = await supabaseFetch("/rest/v1/mira_event", {
      method: "POST",
      body: JSON.stringify({
        name,
        anon_id: who.anonId ?? null,
        user_id: who.userId ?? null,
        props: { ...props, ...(await extras) },
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

/**
 * Guesses one emailed code gets, and how long it lives (Supabase's own code lifetime). 25 of
 * 10^8 codes is still nothing to an attacker; the low cap that matters is per address AND
 * network (the auth route's wrong-guess limit), so a stranger who knows the address can't burn
 * the real person's guesses from elsewhere.
 */
export const CODE_MAX_ATTEMPTS = 25;
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

/** A used code's row goes, so it cannot be guessed at again (and the address with it). */
export async function consumeCode(email: string): Promise<void> {
  const res = await supabaseFetch(`/rest/v1/mira_sign_in_code?email=eq.${enc(email)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`mira code delete failed (${res.status})`);
}
