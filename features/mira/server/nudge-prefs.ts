import { supabaseFetch } from "@features/admin/server/supabase";
import { NUDGE_PAUSE_DAYS, nextNudgeAt, type NudgeTime, type NudgeType } from "./nudges";
import { logMiraEvent } from "./store";

/** One person's nudge settings, read and changed through the signed link in every nudge. */
export type NudgePrefs = {
  nudges_on: boolean;
  nudge_time: NudgeTime;
  time_zone: string;
  nudge_frequency: "daily" | "twice_weekly";
  nudge_types: NudgeType[] | null;
  nudges_paused_until: string | null;
  nudges_stopped_at: string | null;
};

const COLS =
  "nudges_on,nudge_time,time_zone,nudge_frequency,nudge_types,nudges_paused_until,nudges_stopped_at";

export async function getNudgePrefs(userId: string): Promise<NudgePrefs | null> {
  const res = await supabaseFetch(
    `/rest/v1/mira_user?id=eq.${encodeURIComponent(userId)}&select=${COLS}&limit=1`
  );
  if (!res.ok) throw new Error(`mira nudge prefs read failed (${res.status})`);
  return ((await res.json()) as NudgePrefs[])[0] ?? null;
}

async function patch(userId: string, body: Record<string, unknown>): Promise<void> {
  const res = await supabaseFetch(`/rest/v1/mira_user?id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`mira nudge prefs update failed (${res.status})`);
}

/** Marcus's board 2: lighter options first. Each also turns nudges back on if they were off. */
export async function saveNudgeChoice(
  userId: string,
  choice: { kind: "twice_weekly" } | { kind: "pause" } | { kind: "types"; types: NudgeType[] },
  now = new Date()
): Promise<void> {
  const on = { nudges_on: true, nudges_stopped_at: null, nudge_stop_reason: null };
  if (choice.kind === "twice_weekly") {
    await patch(userId, { ...on, nudge_frequency: "twice_weekly", nudges_paused_until: null });
  } else if (choice.kind === "pause") {
    const until = new Date(now.getTime() + NUDGE_PAUSE_DAYS * 86_400_000).toISOString();
    await patch(userId, { ...on, nudges_paused_until: until });
  } else {
    await patch(userId, { ...on, nudge_types: choice.types, nudges_paused_until: null });
  }
  logMiraEvent("nudge_prefs_saved", { userId }, { choice: choice.kind });
}

/** Boards 3 and 4a: stop every nudge, with the optional one-tap reason and note. */
export async function stopNudges(
  userId: string,
  reason: string | null,
  source: "page" | "one-click" | "settings"
): Promise<void> {
  await patch(userId, {
    nudges_on: false,
    nudges_stopped_at: new Date().toISOString(),
    nudge_stop_reason: reason,
  });
  logMiraEvent("nudge_stopped", { userId }, { reason, source });
}

export async function resumeNudges(userId: string): Promise<void> {
  await patch(userId, {
    nudges_on: true,
    nudges_stopped_at: null,
    nudge_stop_reason: null,
    nudges_paused_until: null,
  });
  logMiraEvent("nudge_resumed", { userId });
}

/** What the "saved" screen shows: how often, which kinds, when, and the next one. */
export function describePrefs(p: NudgePrefs, now = new Date()) {
  const next = nextNudgeAt(p, now);
  const weekday = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    timeZone: p.time_zone,
  }).format(next);
  return {
    frequency: p.nudge_frequency === "twice_weekly" ? "2 per week" : "Every day",
    kinds: p.nudge_types?.length ? `${p.nudge_types.length} kinds` : "All kinds",
    time: p.nudge_time,
    next: p.nudges_on ? `${weekday}, ${p.nudge_time} your time` : null,
    paused: Boolean(p.nudges_paused_until && Date.parse(p.nudges_paused_until) > now.getTime()),
    stopped: !p.nudges_on,
  };
}
