# features/mira

**Purpose:** Mira, the AI coach for body confidence in sex. Beta MVP agreed in the AI Mira Synch (17 Nov 2026), built from Marcus's canvas "AI coach chat" (page "MVP Scope", the green row) and Sanjin's conversation design.

**Entry:**

- `app/mira/page.tsx` → `ui/MiraChat.tsx`: boards 01 (anonymous chat), 01b (free limit), 03 (coaching style) and 08a (chats, signed in).
- `app/mira/start` → `ui/SignUpFlow.tsx`: boards 04, 05, 06 (email code; no WhatsApp step).
- `app/mira/home` → `ui/MiraHome.tsx`: boards 08 and 08b. `app/mira/settings` → `ui/MiraSettings.tsx`: board 08c, cut for the beta. `app/mira/feedback` → `ui/MiraFeedback.tsx`: board 10. `app/mira/privacy`: Mira's privacy notice (draft).
- API: `app/api/mira/chat`, `auth`, `me`, `chats/[id]`, `event` (see `docs/api.md`).
- Tables: `mira_user`, `mira_chat`, `mira_message`, `mira_event` (`supabase/migrations/20261118120000_mira_mvp.sql`).

**What Mira reads (`content/`):** `system-prompt.ts` (Sanjin's rules, voice, safety rails, compiled 18 Nov), `mira-config.json` (opening message, chips, intake questions, coaching-style scales, the fixed crisis and refusal messages), `evidence-cards.json` (the only research she may use), `crisis-lines.json` (Sanjin's draft for 9 countries). The prompt and the cards are cached by the model provider; the person's own context (style, name, gender, country, LoveIQ result) is added per message and never logged.

**Calls taken for the beta (Eman delegated them, 18 Nov 2026):**

- Anyone can open the chat, at `/mira` on loveiq.org, branded Applied Psychometrics. One domain keeps the sign-in simple; `app.appliedpsychometrics.org` can point here later.
- The free account is asked for when an anonymous person starts an 11th conversation (`ANON_FREE_CONVERSATIONS`, Marcus's "after 10 conversations"). Messages are capped at 50 a day per person (`DAILY_MESSAGES`; 300 a day per network for anonymous chats). A crisis message is never stopped by a limit.
- Mira's privacy notice is drafted here; legal review before production.
- Model: Claude Sonnet, with Claude Haiku when it is down (Sanjin's coach config, board 09, RFD 18 Nov): `MIRA_LLM_KEY`, `MIRA_LLM_MODEL`, `MIRA_LLM_FALLBACK_MODEL`. The board asks for EU-only processing, which Anthropic's own API doesn't offer (Google Cloud or Amazon Bedrock in the EU would): open, with the key decision.
- Email code only (no Apple or Google), typing only (no spoken Talk), no nudge emails or session reminders yet, no admin screens (change `content/` instead).

**Safety:** a message plainly about suicide or self-harm gets Sanjin's message E and the support lines without a model call (`server/safety.ts`); the model ends a reply with `[[CRISIS]]` when a stop rail fires, which opens the panel. Rules never depend on the coaching style.

**Accounts:** Supabase Auth in the same project as the admin panel and Jarvis, under Mira's own cookie (`mira-auth`). A code is checked only if Mira emailed it to that address within the hour, with 5 guesses per code reserved atomically before the check (`mira_sign_in_code`, `mira_claim_code_attempt`), so the route can't be used to guess anyone else's code and a new code always works. Safe because nothing trusts "any signed-in user": admin routes check `admin_users`, Jarvis checks its members, no table grants the `authenticated` role anything.

**Sanjin's final coach config (board 09, Sanjin review; Marcus: "RFD for MVP", 18 Nov):** the greeting, the intake invitation with its two reply buttons (sent by the chat route after Mira's first reply, stored as its own message), 12 intake questions (age as a range first; gender comes from sign-up), the do and don't rules, the stop / refer / continue / hand-over table (Jonas for libido and Ana for asking a partner are not live: Mira says they are coming soon), the legal scope, the lessons from his five example chats, replies of at most 250 words, Sonnet with Haiku as fallback. Changed on purpose: the greeting's "learned from 58 studies, 30 books and thousands of conversations" is not true yet (26 sources, no books, no conversations), so it says "I draw on research about body confidence" until it is; Mira never promises a calendar invite (none can be sent yet).

**Open, before production:**

- `MIRA_LLM_KEY` on the Vercel projects (on hold by Eman's decision). EU-only processing, as the board asks, needs Google Cloud or Amazon Bedrock in the EU instead of Anthropic's own API.
- Daily nudge emails (6 types on board 09) and the unsubscribe flow (5 unsubscribe boards, 18 Nov): not built; each nudge is written by the model, so they wait for the key.
- Memory "kept for 12 months after the last chat" (board 09): not enforced yet; the privacy notice says chats are kept until deleted, which is what happens.
- Weekly session invites and reminders: not built; Mira asks for a time but promises no invite.
- Sanjin checks the evidence cards; the 4 core books (C24 to C27) and C15 are not in; a lawful-copy mark per source.
- Crisis lines: team review of his 9 countries and of the Find A Helpline fallback.
- Legal review of the consent wording, the privacy notice and the legal scope; the main privacy policy to name Mira.

**Does NOT belong:** the LoveIQ survey or report (Mira only reads the result, matched on the verified email), Jarvis (company brain).
