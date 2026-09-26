-- Who made each Jarvis call, from the caller's own sign-in (decision:2026-09-26-3b76af89e8).
-- A member's @loveiq.org address, or 'shared' for the token the unattended jobs use.
-- Nullable: older rows, and the Slack question path, have no caller to name.
alter table public.brain_query add column if not exists actor text;
comment on column public.brain_query.actor is 'Who made the call: a member''s @loveiq.org address from their own Jarvis sign-in, or ''shared'' for the shared token the unattended jobs use. Null on rows written before 2026-09-26 and on the Slack question path.';
