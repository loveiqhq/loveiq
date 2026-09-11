# Survey Flow

> Owner: CODEOWNERS default
> Last verified: 2026-05-31
> Verified against: `app/survey/page.tsx`, `features/survey/ui/**`, `app/api/survey/route.ts`, `app/api/survey-partial/route.ts`, `app/api/survey-tracking/route.ts`, `shared/url/utm.ts`
> Canonical source: Product-flow reference for `/survey`; request and response details live in [api.md](api.md).

This document covers the client-side survey experience at `/survey`: entry points, step orchestration, persistence, autosave, tracking, submission recovery, and the post-submit handoff.

## Entry Points

| Surface                    | Backing file(s)                                                                 | Notes                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `/survey` route            | [`app/survey/page.tsx`](../app/survey/page.tsx)                                 | Exports page metadata and renders `SurveyPage`.                                               |
| Survey orchestrator        | [`features/survey/ui/SurveyPage.tsx`](../features/survey/ui/SurveyPage.tsx)     | Controls intro, prep slides, consent, and the handoff into `SurveyEngine`.                    |
| Question engine            | [`features/survey/ui/SurveyEngine.tsx`](../features/survey/ui/SurveyEngine.tsx) | Renders questions, post-submit states, and retry/start-over behavior.                         |
| Question order and content | [`data/survey-data.ts`](../data/survey-data.ts)                                 | Canonical question list used for progress, question order, and chapter labels.                |
| Removed questions          | [survey-removed-questions.md](survey-removed-questions.md)                      | Verbatim copies of retired questions, with restore steps. Their answers stay in the database. |

## Step Model

Top-level step orchestration lives in `SurveyPage`:

| Step value | Screen        | Backing component                                                                                  | Notes                                                     |
| ---------- | ------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `0`        | Intro         | `IntroScreen` inside [`features/survey/ui/SurveyPage.tsx`](../features/survey/ui/SurveyPage.tsx)   | Default first render for a new session.                   |
| `1` to `4` | Prep slides   | `SlideScreen` inside [`features/survey/ui/SurveyPage.tsx`](../features/survey/ui/SurveyPage.tsx)   | Four informational slides shown before consent.           |
| `5`        | Consent       | `ConsentScreen` inside [`features/survey/ui/SurveyPage.tsx`](../features/survey/ui/SurveyPage.tsx) | Users must agree before entering the question engine.     |
| `6`        | Survey engine | [`features/survey/ui/SurveyEngine.tsx`](../features/survey/ui/SurveyEngine.tsx)                    | Question loop, submission, retry, and pre-report handoff. |

Inside `SurveyEngine`, the completion path moves through three internal phases:

| Completion phase | Purpose                                                                     | Backing component    |
| ---------------- | --------------------------------------------------------------------------- | -------------------- |
| `processing`     | Animated handoff while submission state resolves.                           | `ProcessingSequence` |
| `wizard`         | Post-submit pre-report step.                                                | `PreReportWizard`    |
| `done`           | Final confirmation or retry state when submission failed or needs recovery. | `SurveyConfirmation` |

## Resume and Recovery Rules

`SurveyPage` restores state in this order:

1. If [`loadPendingCompletion()`](../features/survey/ui/hooks/surveyStorage.ts) returns data, the user resumes directly in the engine completion state instead of restarting the intro flow.
2. If `sessionStorage["loveiq-survey-step"]` exists, the same browser tab restores the current top-level step.
3. If `localStorage["loveiq-survey-answers"]` contains saved answers, the intro stack is skipped and the user returns to the engine.
4. Otherwise the survey starts at step `0`.

`SurveyEngine` itself restores question answers, `currentIndex`, and `startedAt` through [`useSurveyState`](../features/survey/ui/hooks/useSurveyState.ts). When a pending completion snapshot exists, that snapshot wins over the normal saved survey state.

## Persistence Keys

| Key                                | Storage          | Producer                                                                    | Purpose                                                                           |
| ---------------------------------- | ---------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `loveiq-survey-answers`            | `localStorage`   | [`useSurveyState`](../features/survey/ui/hooks/useSurveyState.ts)           | Stores `{ answers, currentIndex, startedAt }` for the in-progress survey.         |
| `loveiq-survey-pending-completion` | `localStorage`   | [`useSubmitSurvey`](../features/survey/ui/hooks/useSubmitSurvey.ts)         | Stores the final retryable completion snapshot before `/api/survey` succeeds.     |
| `loveiq-survey-step`               | `sessionStorage` | [`features/survey/ui/SurveyPage.tsx`](../features/survey/ui/SurveyPage.tsx) | Restores intro, slide, consent, or engine step after a same-tab refresh.          |
| `loveiq-survey-session`            | `sessionStorage` | [`getSessionId()`](../features/survey/ui/hooks/surveySession.ts)            | Per-tab UUID reused across partial saves and behavior events.                     |
| `loveiq-utm`                       | `localStorage`   | [`captureUtmFromUrl()`](../shared/url/utm.ts)                               | Current global UTM capture used by survey submission and partial-save flows.      |
| `loveiq-survey-utm`                | `localStorage`   | [`captureUtmFromUrl()`](../shared/url/utm.ts)                               | Legacy survey UTM key kept for backward compatibility.                            |
| `loveiq-survey-index`              | `localStorage`   | Legacy cleanup only                                                         | Cleared during reset, but not written by the current survey state implementation. |

## Network Behavior

| Behavior                           | Client source                                                           | Route                                                         | Notes                                                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Full submit                        | [`useSubmitSurvey`](../features/survey/ui/hooks/useSubmitSurvey.ts)     | [`POST /api/survey`](api.md#post-apisurvey)                   | Saves a retry snapshot locally, sends a best-effort completion snapshot to `/api/survey-partial`, then submits the final payload. |
| Partial save on forward navigation | [`usePartialSave`](../features/survey/ui/hooks/usePartialSave.ts)       | [`POST /api/survey-partial`](api.md#post-apisurvey-partial)   | Fires on question navigation while the page stays open.                                                                           |
| Partial save on tab hide or unload | [`usePartialSave`](../features/survey/ui/hooks/usePartialSave.ts)       | [`POST /api/survey-partial`](api.md#post-apisurvey-partial)   | Uses `navigator.sendBeacon()` with `_csrf` in the request body.                                                                   |
| Behavior tracking                  | [`useSurveyTracking`](../features/survey/ui/hooks/useSurveyTracking.ts) | [`POST /api/survey-tracking`](api.md#post-apisurvey-tracking) | Buffers events, flushes every 5 events or 15 seconds, and sends an `abandon` event on `visibilitychange` or `pagehide`.           |
| UTM propagation                    | [`useUtmCapture`](../features/survey/ui/hooks/useUtmCapture.ts)         | Survey submit and partial-save payloads                       | Reads the stored JSON tracker and forwards it with draft and final submissions.                                                   |

## Exit and Reset Behavior

- `onExit` from `SurveyEngine` saves a partial draft, records a pause/abandon event, clears only the top-level step marker, and redirects the user back to `/`.
- `onComplete` from `SurveyEngine` clears persisted survey state, pending completion data, and UTM/session survey keys before redirecting back to `/`.
- A successful `/api/survey` response also clears persisted storage from the client side, but the completion UI continues to render from in-memory state until the user leaves the flow.
- `SurveyConfirmation` exposes retry and start-over flows. Retry reuses the pending completion snapshot. Start over routes through the `onComplete` reset path.

## Answers That Drive Product Decisions

Three survey answers are computed on every submission and exposed on the scoring result
(`features/scoring/logic/types.ts`), rather than being left in the diagnostics bag where
nothing could reach them:

| Field          | Question                                                       | Shape                              | Null / empty means                |
| -------------- | -------------------------------------------------------------- | ---------------------------------- | --------------------------------- |
| `urgency`      | 16002 "Working on my sexuality is a priority for me right now" | `1`–`7`, the scale it was asked on | Not answered — **never** assume 4 |
| `focusPrimary` | 16001 "Which changes would actually improve your sex life…"    | The **first** option picked        | Not answered                      |
| `barrierTags`  | 16014 "What's actually getting in the way…"                    | Tag array (capped at one pick)     | Not answered                      |

`focusPrimary` is the first pick, which is only meaningful because 16001's options are
shown in a randomised, recorded order — with a fixed order it would largely mean
"whichever option we listed first". It holds because the answer array keeps click order
end to end: `MultipleChoiceQuestion` appends with `[...selected, option]`, and both
scoring paths (the live submit and the admin recovery) score the submitted JSON rather
than re-reading the fanned-out rows.

**Reading these back from the database.** `scoring_result` stores an explicit column list
and these three are not among its columns — they are computed per request. The values they
are derived from _are_ stored, inside the `diagnostics` JSON, and every scored row has all
three (1,960 of 1,960 as of 2026-09-11), so nothing needs backfilling. A consumer working
from the database reads:

| Field          | Where it lives in `scoring_result.diagnostics`                   |
| -------------- | ---------------------------------------------------------------- |
| `urgency`      | `overlaysScalar -> 'OVL_URGENCY'` (0–1; multiply by 6 and add 1) |
| `focusPrimary` | `overlaysText -> 'OVL_FOCUS_PRIMARY'`, first array element       |
| `barrierTags`  | `overlaysTags -> 'OVL_BARRIER_TAGS'`                             |

Note on the barrier: it does **not** predict which format someone would buy. Cross-tabbed
against 16007, "work with a professional" moves only between 4.8% and 12.3% around a 7.5%
baseline. Use the barrier for what an offer is _about_, and help style for what shape it
takes.

### Measuring CTA click-through by urgency band

This needs no instrumentation — `analytics_event` already carries `survey_submission_id`,
and the urgency answer is on the same submission, so it is a join. Deliberately kept as a
first-party query rather than an event property: 16002 is an answer about someone's sex
life, and attaching it to a client-side analytics payload would send special-category-
derived data to a third-party processor, which is the mistake `PRICING_SIGNAL_QIDS`
exists to prevent.

```sql
with urgency as (
  select ssa.survey_submission_id as sid, ssa.normalized_value as u
  from survey_submission_answer ssa
  join survey_question q on q.id = ssa.survey_question_id
  where q.frontend_qid = '16002' and ssa.normalized_value is not null
),
banded as (
  select sid,
         case when u >= 5 then 'high (5-7)' when u <= 3 then 'low (1-3)' else 'mid (4)' end as band
  from urgency
)
select b.band,
       count(distinct b.sid) as people,
       count(distinct ae.survey_submission_id) filter (where ae.event_type in
         ('sticky_unlock_clicked','lock_icon_clicked','paywall_initiated')) as clicked_cta,
       count(distinct ae.survey_submission_id) filter (where ae.event_type = 'begin_checkout')
         as began_checkout
from banded b
left join analytics_event ae on ae.survey_submission_id = b.sid
group by b.band order by b.band;
```

Run on 2026-09-11, this returned a real split — high-urgency readers clicked a paywall CTA
at 5.8% against 1.7% for low urgency, and began checkout at 9.1% against 6.6%. That is the
evidence the urgency-gated CTA was meant to rest on.

## Related Coverage

- End-to-end flow: [`e2e/survey.spec.ts`](../e2e/survey.spec.ts)
- Survey engine: [`features/survey/tests/SurveyEngine.test.tsx`](../features/survey/tests/SurveyEngine.test.tsx)
- Partial save hook: [`features/survey/tests/hooks/usePartialSave.test.ts`](../features/survey/tests/hooks/usePartialSave.test.ts)
- Submit hook: [`features/survey/tests/hooks/useSubmitSurvey.test.ts`](../features/survey/tests/hooks/useSubmitSurvey.test.ts)
- Tracking hook: [`features/survey/tests/hooks/useSurveyTracking.test.ts`](../features/survey/tests/hooks/useSurveyTracking.test.ts)
- Survey API routes: [`features/survey/tests/survey-handler.test.ts`](../features/survey/tests/survey-handler.test.ts), [`features/survey/tests/survey-partial.test.ts`](../features/survey/tests/survey-partial.test.ts), [`features/survey/tests/survey-tracking.test.ts`](../features/survey/tests/survey-tracking.test.ts)
