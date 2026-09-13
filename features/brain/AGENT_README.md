# features/brain

The company brain: ask a question in Slack, get an answer from LoveIQ's own
documentation, git history and Jira, with a link to every source.

## What belongs here

- `server/retrieve.ts` — calls the `brain_search` RPC, then dedupes by parent and
  caps how much of a result set any one source may take
- `server/llm.ts` — one `fetch` to an OpenAI-compatible endpoint (Gemini by default)
- `server/answer.ts` — prompt construction, Slack mrkdwn conversion, citations
- `server/slack.ts` — Slack request-signature verification and reply transport
- `server/log.ts` — `brain_query` writes: the Slack dedupe claim and the daily quota ledger
- `tests/` — signature verification, retrieval shaping, ADF flattening

## What does NOT belong here

- **The route.** `app/api/slack/events/route.ts` is thin on purpose: verify, ack,
  defer. Slack retries anything not acknowledged within 3 seconds.
- **Ingestion.** Docs and commits come from `scripts/brain-ingest-repo.mjs` (run by
  the `brain-ingest` GitHub Action on push, because only there are the files and
  the git history actually on disk). Jira, GA4, Search Console and the funnel
  rollup all come from `app/api/cron/brain-ingest/route.ts`.
- **Live state.** PostHog, Stripe and Vercel are not indexed, and neither is
  anything phrased as a current value ("the conversion rate"). Those belong in a
  live tool-call layer, because an indexed _state_ is a stale state.

  DATED HISTORY IS THE EXCEPTION, and it is why `ga4`, `gsc` and `analytics`
  chunks exist. "2026-08-19: 1,000 visits, 17 signups, EUR 12 spend" does not rot
  — it is a fact about a day that stays true — and no live tool can answer "how
  did July compare to August" without it. The line to hold is: **index history,
  call live tools for state.** An earlier version of this file forbade indexing
  metrics outright, which the GA4, GSC and funnel ingest jobs then contradicted.

## Things that are easy to get wrong here

- `brain_search` ORs the query's lexemes. `plainto_tsquery` and
  `websearch_to_tsquery` both AND them, which requires a document to contain every
  word of the question — measured, that returned zero rows for a plainly
  answerable question. See the migration comment for the numbers.
- The Slack signature covers the **exact** request bytes. Parse the raw string,
  never an object that was parsed and re-encoded.
- The reply must not be answered inline. Ack first, answer in
  `scheduleAfterResponse`, or Slack's retry produces duplicate answers and burns
  the daily quota three times over.
- Filter `bot_id` and `subtype` on inbound events. The brain's own reply in a DM
  arrives back as a new `message.im`, and without the guard it answers itself
  until the quota is gone.
