# features/brain

The company brain (the team calls it Jarvis): everything LoveIQ writes down, searchable
by Claude over MCP at `/api/mcp`, with a link to every source. Claude (claude.ai and
Claude Code) is the door people use; the operator's guide is
`docs/runbooks/COMPANY_BRAIN.md`.

## What belongs here

- `server/ingest/` — one reader per source (Gmail, Drive, Notion, calendar, WhatsApp,
  analytics, GA4 and Search Console through `google.ts`, Clarity, evidence, report voice,
  domain vocabulary, skills, people) plus `upsert.ts`, the shared write path. That path refuses
  credentials and masks one-time links, and it holds the exclusions every source shares
  (`isJobApplication`, `isLegalInstrument`).
- `server/retrieve.ts` — calls the `brain_search` RPC (lexical plus vector arm), dedupes by
  parent, and caps how much of a result any one source may take.
- `server/embed.ts` — query embeddings through the `brain-embed` edge function.
- `server/llm.ts`, `answer.ts`, `brief.ts`, `decisions.ts` — the server-side model call, the
  daily brief, and the decision miner's helpers.
- `server/copy-gate.ts` — the Copy Gate behind `check_copy`: the report-copy rules (em dashes,
  machine-written phrases, absolute claims, reading level, lines that fit every archetype or
  repeat another chapter) plus `voice.ts`'s per-chapter checks, run on a draft or on shipped copy.
- `server/context-pack.ts` — `get_context_pack`: only what drafting one chapter for one archetype
  needs, inside a fixed size (Mark: "be crazy careful with the context window").
- `server/comment-asks.ts` — `comment_asks`: asks in Figma comments (read from the Figma API, mentions from
  the "@Name" in the plain message) and Google Docs comments (from notification emails, checked against the
  Drive API as the person asked), each with its live open/answered/resolved status.
- `server/crm-calls.ts` — `file_call_notes` and the `brain-crm` job: recorded calls with people on the
  Notion board "Therapists & Coaches" filed into "Feedback Sessions" (matched by invite email or transcript
  speaker), and "Last touch" moved forward.
- `server/self-report.ts` — `brain_health`: the brain's report on itself (use, weak and empty searches,
  errors, speed, the weekly batteries from `cron_run`, job health from the stall watcher's table), also
  written weekly as a notice by `app/api/cron/brain-health`.
- `server/night-shift.ts` — the Night Shift: `queue_research` writes a `research` record, and the
  nightly `brain-night-shift` job (GitHub Actions) answers it with Claude Code, the brain's read-only
  tools over MCP (`RESEARCH_TOOLS`) and the web; every writing tool is denied (`WRITE_TOOLS`).
- `server/whats-new.ts` — `whats_new`: notices, research answers and decisions since a time. Also
  what `scripts/jarvis-overnight.mjs` (a SessionStart hook) shows when a Claude Code session starts.
- `server/jumps.ts` — `explain_change` and the daily "Unusual numbers" notice: each metric against its
  28-day median and spread, the move split by source, channel and rate halves, and day-level rules
  (engagement, GA4 against our count, spend, campaigns, shipped, decided). No model writes a cause.
- `server/promises.ts` — `meeting_promises`: every "Next steps" item in the meeting notes, parsed
  by code and grouped by owner, each looked up on the Notion board by `boardMatcher` (owner, then
  rare shared words). The `track_promises` prompt drafts board tasks for the untracked ones.
- `server/notice.ts`, `related.ts`, `people.ts`, `periods.ts`, `reconcile.ts`, `voice.ts`,
  `vocabulary.ts` — proactive notices, "what else was going on", one name per colleague,
  date handling, the compute-twice reconciler, and the house-voice checks.
- `server/act/` — the five tools that write (Slack, email drafts, Notion, Google Docs; decisions
  go through `record_decision` in the route). `server/see/` — Figma frames and page
  screenshots as pixels.
- `tests/` — one file per concern; `scripts/brain-battery.ts` is the retrieval and MCP
  battery that runs against real data.

## What does NOT belong here

- **The routes.** `app/api/mcp/route.ts` is the MCP server (tools, gateway, masking);
  `app/api/cron/brain-*/` are the ingest and proactive jobs; `app/api/slack/events/route.ts`
  is the legacy Slack door, used once and not being extended.
- **Repository docs ingestion.** `scripts/brain-ingest-repo.mjs` runs in the `brain-ingest`
  GitHub Action on push, because only there is the checkout on disk. Git commits and Jira
  are no longer sources.
- **The brief and miner schedules.** `brain-daily.yml` runs them in GitHub Actions through
  `scripts/brain-cron.ts`, because the model is `claude -p` on the Team subscription
  (`BRAIN_LLM_CLI`) and Vercel has no `claude` binary. They are not in `vercel.json`.
- **Live state.** Payments, email delivery, PostHog, Stripe, Vercel and the product
  database are read at ask time through tools, never indexed: an indexed state is a stale
  state. DATED history is the exception (`analytics`, `ga4`, `gsc`), because "1,000 visits
  on 2026-08-19" stays true. Index history, call live tools for state.

## Things that are easy to get wrong here

- `brain_search` ORs the query's lexemes. `plainto_tsquery` and `websearch_to_tsquery` AND
  them, which returned zero rows for a plainly answerable question.
- Everything a tool returns from the corpus is UNTRUSTED DATA (anyone can email the company)
  and is fenced as such. Never let corpus text become an instruction.
- Bumping a source's builder version re-fetches everything and blocks that source's sweep
  until the rebuild completes. Drive fetches newest-first, so new documents do not queue behind it.
- A sweep may only judge what the walk actually listed: an incomplete walk never deletes.
