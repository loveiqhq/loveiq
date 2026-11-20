# features/mira

**Purpose:** Mira, the AI coach for body confidence in sex. Beta MVP agreed in the AI Mira Synch (17 Nov 2026), built from Marcus's canvas "AI coach chat" (page "MVP Scope", the green row) and Sanjin's conversation design.

**Entry:**

- `app/mira/page.tsx` → `ui/MiraChat.tsx`: boards 01 (anonymous chat), 01b (free limit), 03 (coaching style) and 08a (chats, signed in).
- `app/mira/start` → `ui/SignUpFlow.tsx`: boards 04, 05, 06 (email code; no WhatsApp step).
- `app/mira/home` → `ui/MiraHome.tsx`: boards 08 and 08b. `app/mira/settings` → `ui/MiraSettings.tsx`: board 08c, cut for the beta. `app/mira/feedback` → `ui/MiraFeedback.tsx`: board 10. `app/mira/privacy`: Mira's privacy notice.
- API: `app/api/mira/chat`, `auth`, `me`, `chats/[id]`, `event` (see `docs/api.md`).
- Tables: `mira_user`, `mira_chat`, `mira_message`, `mira_event` (`supabase/migrations/20261118120000_mira_mvp.sql`).

**What Mira reads (`content/`):** `system-prompt.ts` (Sanjin's rules, voice, safety rails, compiled 18 Nov), `mira-config.json` (opening message, chips, intake questions, coaching-style scales, the fixed crisis and refusal messages), `evidence-cards.json` (the only research she may use), `crisis-lines.json` (Sanjin's draft for 9 countries). The prompt and the cards are cached by the model provider; the person's own context (style, name, gender, country, LoveIQ result) is added per message and never logged.

**Calls taken for the beta (Eman delegated them, 18 Nov 2026):**

- Anyone can open the chat, at `/mira` on loveiq.org, branded Applied Psychometrics. One domain keeps the sign-in simple; `app.appliedpsychometrics.org` can point here later.
- The free account is asked for when an anonymous person starts an 11th conversation (`ANON_FREE_CONVERSATIONS`, Marcus's "after 10 conversations"). Messages are capped at 50 a day per person (`DAILY_MESSAGES`; 300 a day per network for anonymous chats). A crisis message is never stopped by a limit.
- Mira's privacy notice lives here; Eman checked it on 20 Nov 2026.
- Model: Claude Sonnet, with Claude Haiku when it is down (Sanjin's coach config, board 09, RFD 18 Nov): `MIRA_LLM_KEY`, `MIRA_LLM_MODEL`, `MIRA_LLM_FALLBACK_MODEL`. The board asked for EU-only processing, which Anthropic's own API doesn't offer; Eman decided on 19 Nov to run on Anthropic's API (the privacy page says messages may be processed outside the EU).
- Sign-in by emailed code or with Google (`server/google.ts`, our own OAuth code flow with PKCE, scope `openid email`, trusted only for Gmail or Workspace addresses (`hd`) and never for `admin_users`, then the same Supabase user as the code; `MIRA_GOOGLE_CLIENT_ID` + `MIRA_GOOGLE_CLIENT_SECRET`, from the "Mira web" client in the Google Cloud project `loveiq-mira`, consent screen "Mira", External, In production; the console never shows the secret again, a copy is in Eman's Keychain). No Apple yet (it needs a paid Apple Developer account). Typing only (no spoken Talk), no session reminders yet, daily nudge emails built but off until `MIRA_NUDGES_ENABLED` is on (below), no admin screens (change `content/` instead).

**Safety:** a message plainly about suicide or self-harm gets Sanjin's message E and the support lines without a model call (`server/safety.ts`); the model ends a reply with `[[CRISIS]]` when a stop rail fires, which opens the panel. Rules never depend on the coaching style.

**Accounts:** Supabase Auth in the same project as the admin panel and Jarvis, under Mira's own cookie (`mira-auth`). A code is checked only if Mira emailed it to that address within the hour, with 5 guesses per code reserved atomically before the check (`mira_sign_in_code`, `mira_claim_code_attempt`), so the route can't be used to guess anyone else's code and a new code always works. Safe because nothing trusts "any signed-in user": admin routes check `admin_users`, Jarvis checks its members, no table grants the `authenticated` role anything.

**Sanjin's final coach config (board 09, Sanjin review; Marcus: "RFD for MVP", 18 Nov):** the greeting, the intake invitation with its two reply buttons (sent by the chat route after Mira's first reply, stored as its own message), 12 intake questions (age as a range first; gender comes from sign-up), the do and don't rules, the stop / refer / continue / hand-over table (Jonas for libido and Ana for asking a partner are not live: Mira says they are coming soon), the legal scope, the lessons from his five example chats, replies of at most 250 words, Sonnet with Haiku as fallback. The greeting is Sanjin's word for word (Eman's call, 18 Nov). Mira never promises a calendar invite (none can be sent yet).

**Daily nudges and memory (built 18 Nov, Eman: "build it"):** `server/nudges.ts` (who is due, which kinds fit, the model's body, the email), `server/nudge-prefs.ts`, `content/nudges.json` (Sanjin's six kinds and instructions), `app/api/cron/mira-nudges` (every 30 min, behind `MIRA_NUDGES_ENABLED`), `app/mira/nudges` + `app/api/mira/nudges/*` (Marcus's unsubscribe boards 2 to 4b, signed links, one-click unsubscribe), `app/api/mira/nudge` (the button: counts the click, opens the chat where the nudge is Mira's latest message). Settings: on or off, 8:00 / 19:00 / 21:30, time zone (from the browser at sign-up). Each person is due for the 60 minutes from their time, so every slot gets two of the half-hourly runs; the second sends to anyone the first did not reach or whose email failed (a failed email gives the day back and never reaches the chat). A run nudges 4 people at a time and starts nobody after 225 s of its 300 s, and a run that stopped early or had failures is recorded as an error. At most one a day, never the same kind twice in a row (counting only nudges that went), progress at most once a week (the first a week after sign-up), none while chatting (12 h) or for 14 days after a crisis, none to suppressed addresses, none without remembered chats. Subjects are neutral, the kind's teaser only with no suffix, and a hidden neutral line ("A short note for you.") is what an inbox preview shows (Eman, 20 Nov 2026, because the sign-up page promises a neutral sender name and subject line). `app/api/cron/mira-memory` deletes a person's chats 12 months after the last message they wrote (`mira_forget_old_memory`), and sign-in codes issued more than a day ago.

**Open, before production:**

- `MIRA_LLM_KEY` is set on both Vercel projects since 19 Nov (Claude Console workspace "Mira", paid by the Team plan's monthly API credits, workspace cap $500 a month). On loveiq-staging it is a Preview variable for the `staging` branch, because staging.loveiq.org is a preview deployment.
- Nudges: switch on with `MIRA_NUDGES_ENABLED=true` once the key is in; check the first day's sends in AP › Mira (beta) › Nudge emails. Legal check: nudges are on by default for new accounts (a service email with an easy stop in every email), told on the About you step.
- Weekly session invites and reminders: not built; Mira asks for a time but promises no invite.
- Sanjin checks the evidence cards; the 4 core books (C24 to C27) and C15 are not in; a lawful-copy mark per source.
- Crisis lines: team review of his 9 countries and of the Find A Helpline fallback.
- Legal: Eman checked the consent wording, the privacy notice and the legal scope, and approved them on 20 Nov 2026. Still open: the main privacy policy to name Mira.

**Does NOT belong:** the LoveIQ survey or report (Mira only reads the result, matched on the verified email), Jarvis (company brain).
