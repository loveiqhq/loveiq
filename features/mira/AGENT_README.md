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
- The free account is asked for after 10 free replies (`ANON_REPLY_LIMIT`), about when the intake is done.
- Mira's privacy notice is drafted here; legal review before production.
- EU-only processing is not required for the beta: Anthropic's API, `MIRA_LLM_KEY`, `MIRA_LLM_MODEL`.
- Email code only (no Apple or Google), typing only (no spoken Talk), no nudge emails or session reminders yet, no admin screens (change `content/` instead).

**Safety:** a message plainly about suicide or self-harm gets Sanjin's message E and the support lines without a model call (`server/safety.ts`); the model ends a reply with `[[CRISIS]]` when a stop rail fires, which opens the panel. Rules never depend on the coaching style.

**Accounts:** Supabase Auth in the same project as the admin panel and Jarvis, under Mira's own cookie (`mira-auth`). A code is checked only if Mira emailed it to that address within the hour, with 5 guesses per code reserved atomically before the check (`mira_sign_in_code`, `mira_claim_code_attempt`), so the route can't be used to guess anyone else's code and a new code always works. Safe because nothing trusts "any signed-in user": admin routes check `admin_users`, Jarvis checks its members, no table grants the `authenticated` role anything.

**Open, before production:**

- `MIRA_LLM_KEY` (an Anthropic Console key with billing) on the Vercel projects.
- Sanjin checks the evidence cards; the 4 core books (C24 to C27) and C15 are not in; a lawful-copy mark per source.
- Crisis lines: team review, country coverage, a fallback for other countries, lines after messages D and G (eating disorder, under 18).
- Legal review of the consent wording and the privacy notice; the main privacy policy to name Mira.
- Open content points from the 18 Nov compile: the voice guide (not reachable), the greeting (Sanjin's shortlist of five), the intake list, age (left out, per Sanjin), the "When do you feel it most?" and food questions, follow-up chips.
- AP-Analytics page for Mira's KPIs (Marcus's "MVP success" boards), reading `mira_event`, `mira_user`, `mira_message`.

**Does NOT belong:** the LoveIQ survey or report (Mira only reads the result, matched on the verified email), Jarvis (company brain).
