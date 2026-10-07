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

## The Closing Questions: Content Asks and the Demand Block

The last seven questions are asked in this order, in both C13 arms:

| Asked | qId     | Question                                               | Notes                                                                 |
| ----- | ------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| 1     | `16019` | A learning or insight that changed your sexuality      | Optional, multi-line. Feeds the report's Learn and Practice sections. |
| 2     | `16020` | Books, articles, blogs or YouTube channels that helped | Optional, multi-line. Same purpose.                                   |
| 3     | `16016` | C9 — "Beyond sex, which of these…" (up to three)       | Thirteen collapsible categories, 53 topics.                           |
| 4     | `16017` | C10 — "Thinking about what you just picked…"           | Refers back to C9, so it always follows it.                           |
| 5     | `16018` | C12 — first access to the area picked                  | The waitlist opt-in.                                                  |
| 6     | `00000` | Email                                                  | Last but one since the email-position test (2026-08-16). See below.   |
| 7     | `16015` | Marketing opt-in                                       | Always the final question.                                            |

All five survey-content ids sit above `16015`, because every free id below it is live or
retired-but-still-holding-answers. The generator sorts by qId, so the order above exists only
at render time, in `orderAskedQuestions` ([`questionOrder.ts`](../features/survey/ui/questionOrder.ts)).

**C9's categories** live in [`optionGroups.ts`](../features/survey/optionGroups.ts), not in
the CSV, for the reason in ADR 0004 §4. One category is open at a time. The category order and
each category's topics are both shuffled, and the order recorded against the submission is
their flattened, category-by-category order (ADR 0004 §5). A grouping that stops covering
C9's options exactly makes the question fall back to one flat list, and fails
`optionGroups.test.ts`.

**The content asks are optional.** A question is optional when its "Answer format guidance"
begins with "Optional"; `scripts/update-survey.js` reads `required: false` off that subtitle,
the same way it reads a selection cap off "Select up to three options.". So:

- Next works with the box empty.
- The API drops a blank answer before `submit_survey`, so a skipped question stores no row.
- `isCompletionReady` counts required answers only, and never waits on these two.
- The boxes carry `data-clarity-mask="true"`, the one exception to the unmasked survey (see
  DPIA §6), because this is where people type free text about their own sexuality.

**The "Answer format guidance" column is shown.** Every question draws it in purple under its
guide, as the answer instruction (Figma 11303:174), so editing it changes what the respondent
reads, not only how the question behaves. The 1-7 scales carry "Select how true this statement
is for you." (10004, the comfort scale: "Select how comfortable you are with this.").

To read the answers, use the admin CSV export, which has one column per qId. The company brain
masks `answer_text`, per the decision of 2026-09-09.

### The email question test

The email question loses more of the people who reach it than any other question, about
12%, and most of them leave without typing anything (LoveIQ Sync, 2026-10-07). Marcus's
redesign, Figma `IdxyUUVvJSYRTpI9CYRtJI` node `11600:15119`, runs against today's question
as a 50/50 test named `survey-email-anonymous`:

|             | `control` (today)                         | `anonymous`                                                      |
| ----------- | ----------------------------------------- | ---------------------------------------------------------------- |
| Title       | What is your email?                       | What’s your email? Feel free to use an anonymous one.            |
| Guide       | "Use an inbox you actually check…"        | The same opening, then the case for an anonymous or private one. |
| Field       | The address, then "Confirm email address" | One underline field, no confirm box                              |
| Placeholder | `your@email.com`                          | `e.g. nickname@example.com`                                      |

Both arms keep the purple instruction and the Why row, and both refuse an address the server
would refuse (`isValidSurveyEmail`).

- **The arm** is a pure function of the survey session id, salted with the test's name so it
  splits independently of C13 ([`emailQuestionArm.ts`](../shared/experiments/emailQuestionArm.ts)).
  No session id means control. `?email=control` or `?email=anonymous` previews an arm on dev
  and staging, never on production.
- **The copy** lives in [`anonymousEmail.ts`](../features/survey/anonymousEmail.ts), not in
  `survey-data.ts`, so ending the test is one deletion. `OpenResponseQuestion` draws the field
  when it is given `emailArm="anonymous"`.
- **What is recorded.** The first time the email question shows, `experiment_exposure` fires
  once (`surface: "survey_email_question"`) and the arm goes onto PostHog and GA4 as
  `email_question_arm`. Both go to PostHog and GA4 only: there is no submission yet to attach
  a stored event to. The server stamps the same key into `utm_tracker` on every partial save
  and submission ([API](api.md#post-apisurvey-partial)).
- **Reading it.** Per arm, the sessions that reached the email question against those that
  went on to submit. Always filter by the production start date: the arm is defined for every
  session ever recorded, including all the ones that only ever saw today's question.
- **Status.** On staging since 2026-10-07, not yet on production. Record the production start
  date here when it ships.

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
