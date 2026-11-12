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
| `loveiq-survey-sheets`             | `localStorage`   | [`rememberSheetShown()`](../features/survey/surveySheets.ts)                | Which sheets between questions this run has seen (`{ run, shown }`).              |
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
| 3     | `16016` | C9 — "Beyond sex, which of these…" (no limit)          | Thirteen collapsible categories, 53 topics.                           |
| 4     | `16017` | C10 — "Thinking about what you just picked…"           | Refers back to C9, so it always follows it.                           |
| 5     | `16018` | C12 — first access to the area picked                  | The waitlist opt-in.                                                  |
| 6     | `00000` | Email                                                  | Last but one since the email-position test (2026-08-16). See below.   |
| 7     | `16015` | Marketing opt-in                                       | Always the final question. A No opens the sheet below.                |

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

**Answers select in the scale's purple.** On a question screen every answer interaction uses the
1-7 scale's `#6b5b95`:

- the picked choice card (border, fill, radio dot or checkbox);
- the categories question's open or picked groups and their "N selected" badge;
- the typing line of "Other…" and of the open-text answers;
- the focus rings on the options, Previous and Pause.

Orange is kept for the Next button and the progress bar. The team agreed purple as the survey's
clickable color on 2026-11-02, and Hana asked on 2026-11-04 for the choice cards to follow it;
until then they were orange.

To read the answers, use the admin CSV export, which has one column per qId. The company brain
masks `answer_text`, per the decision of 2026-09-09.

### The email question

The email question lost more of the people who reached it than any other question, about
12%, and most of them left without typing anything (LoveIQ Sync, 2026-10-07). Marcus's
redesign, Figma `IdxyUUVvJSYRTpI9CYRtJI` node `11600:15119`, ran against the question of the
time as a 50/50 test named `survey-email-anonymous` (registry #7), and won: of the runs that
reached it, 91% went on to finish against 86% (+5.2%, 82% confidence, called on judgement in
the LoveIQ Sync of 2026-11-02). Since **2026-11-04** every free survey run is asked the
anonymous version:

|             | `control` (pay to start only)             | `anonymous` (everyone else)                                      |
| ----------- | ----------------------------------------- | ---------------------------------------------------------------- |
| Title       | What is your email?                       | What’s your email? Feel free to use an anonymous one.            |
| Guide       | "Use an inbox you actually check…"        | The same opening, then the case for an anonymous or private one. |
| Field       | The address, then "Confirm email address" | One underline field, no confirm box                              |
| Placeholder | `your@email.com`                          | `e.g. nickname@example.com`                                      |

Both keep the purple instruction and the Why row, and both refuse an address the server would
refuse (`isValidSurveyEmail`).

- **Who gets which.** A buyer who paid before the survey (pay to start) keeps `control`: "feel
  free to use an anonymous one" would part the survey's address from the one they paid with,
  and the purchase's continue link opens a report only under that one. Everyone else gets
  `anonymous` (`EMAIL_QUESTION_WINNER` in
  [`emailQuestionArm.ts`](../shared/experiments/emailQuestionArm.ts)). `?email=control` or
  `?email=anonymous` previews either on dev and staging, never on production.
- **The copy** lives in [`anonymousEmail.ts`](../features/survey/anonymousEmail.ts), not in
  `survey-data.ts`. `OpenResponseQuestion` draws the single field when it is given
  `emailArm="anonymous"`.
- **What is recorded.** The first time the email question shows on a page load,
  `experiment_exposure` fires (`surface: "survey_email_question"`) and the version goes onto
  PostHog and GA4 as `contact_question_arm`, now `anonymous` for every free run. A reload on or
  after the email question sends it again, so count people, not events. The server stamps the
  same key into `utm_tracker` on every partial save and submission
  ([API](api.md#post-apisurvey-partial)); a pay-to-start run gets no stamp. The key leaves out
  the word "email" on purpose: the admin's UTM filter matches any part of the tracker, and
  "email" is a UTM source our own links carry.
- **Reading the test.** It ran from **2026-10-08 09:12:46 UTC** (#539) to
  **`EMAIL_QUESTION_TEST_END`** (2026-11-04). Per arm, the runs that reached the email question
  against those that went on to submit, for runs begun inside that window only. While it ran,
  a run's arm was a pure function of its session id, which the readouts recompute for every
  session ever recorded, so a run begun before the start or after the end must be left out:
  before, everyone saw the old question; after, everyone sees the anonymous one and is stamped
  so. AP-Analytics' Traffic card reads 9 Oct to 3 Nov, the whole days in between.
- **On the KPI page.** _Survey Drop-off Rate per Question %_ in Notion shows, every morning, the
  drop-off at the email question per version over the test's window, marked ended
  (`kpi-dropoff`).

### The opt-in question and its "miss out" sheet

`16015`, "Would you like to receive free LoveIQ hints and insights?", is the last question. Its
Yes sets `survey_submission.marketing_opt_in`, and nothing is picked until the reader taps.
Mark's design of 2026-11-10 (Claude Design `NGyoLVAex5vSW4voVs7Tcc`, board "Opt-in · B · Sample
email sheet on Next") adds a second ask after a No:

- **When it opens.** A No followed by Next opens a bottom sheet, "Sure you want to _miss out_?",
  instead of submitting. Every way off the question (Next, Auto-advance, Enter, ArrowRight, a
  swipe) goes through `goNext`, which holds the submit there. It opens once per run:
  `loveiq-survey-optin-sheet` in localStorage holds the run's `startedAt`, so a reload, a pause
  or a Previous does not ask again, and the next run does.
- **What its buttons do.** "Yes, I want to keep learning" writes the question's own Yes, word
  for word, and submits. "Not now" submits the No in one tap. Tapping outside it, Esc or a swipe
  down closes it and leaves the reader on the question with the No still picked; the next Next
  submits. Back goes to the email question and the sheet closes with it, as the Pause dialog
  does. Taps in its first 400 ms are ignored and focus lands on the sheet, not on Yes, so a
  double tap on Next or a held Enter never gives consent.
- **What is recorded.** A Yes given in the sheet is sent as `marketingOptInVia: "sheet"`
  ([API](api.md#post-apisurvey)) and stored with the consent version
  `2026-10-14+sheet-2026-11-10` (`MARKETING_OPT_IN_SHEET_TERMS_VERSION`): that reader saw the
  question's words and the sheet's. A Yes on the question keeps `2026-10-14`. PostHog and GA4
  get `survey_optin_sheet_shown`, then `survey_optin_sheet_closed`, whose `outcome` (`yes`,
  `not_now`, `dismissed`) and `via` go to PostHog only.
- **The copy** lives in [`optInSheet.ts`](../features/survey/optInSheet.ts). A change there is a
  change to consent text: bump `OPT_IN_SHEET_COPY_VERSION` in the same commit.
- **The fine print's figure** is measured, not the design's 97%. On 2026-11-10, 2,551 addresses
  outside the team had taken the survey since 2026-03-24, and 108 of them had unsubscribed from
  our emails: 95.8% stayed, shown rounded down as 95%. The query sits beside the copy in
  `optInSheet.ts`; run it again before changing the number.

- **Measuring it.** From 2026-10-14 to 2026-11-10, 66 of 200 submissions opted in (33%). The
  16015 answer split is on AP-Analytics' Survey page; the sheet's own Yes rows are those whose
  `marketing_opt_in_terms_version` contains `+sheet-`.
- **Phones and wider.** Mark drew it for phones (390 px). From 640 px it stays a bottom sheet, at
  most 480 px wide.

### Sheets between questions

Mark's "Survey & Report Components" (Claude Design `NGyoLVAex5vSW4voVs7Tcc`, page "Survey –
Proposal 10.11.2026", posted 2026-11-11): six short cards at fixed points in the survey, each
with a "Keep going" that carries on. The rules are in
[`surveySheets.ts`](../features/survey/surveySheets.ts), the words in
[`surveySheetsCopy.ts`](../features/survey/surveySheetsCopy.ts), the drawing in
`features/survey/ui/sheets/`.

| Sheet           | Opens                                         | Says                                                             |
| --------------- | --------------------------------------------- | ---------------------------------------------------------------- |
| Science         | after 02004 (where the best sex starts)       | more people love to respond (36%) than to start (12%)            |
| Trustpilot      | after 03008                                   | the TrustScore and one real review, word for word                |
| Expert quote    | before 01005, never within the first 10       | an expert's words                                                |
| Halfway         | after 11003                                   | the steps ahead; the Core Archetype free, the Light Report €1.99 |
| State of Desire | after 16005 (where the reader's sexuality is) | "only 15% … steady", the report, and a tick box for a €5 code    |
| Report map      | after the question that leaves three to go    | the report's 6 parts and 17 chapters, and what is free or €1.99  |

- **Placed by question, not by position.** C13 asks the questions in two orders, and the
  reorder still to come moves them again. In today's control order 01005 is question 3, so the
  expert's sheet stays shut there; re-key it when the reorder lands.
- **When they open.** A sheet "after" a question holds the move: Next, Auto-advance, Enter,
  ArrowRight and a swipe all go through `goNext`, which opens it instead. One "before" a
  question rises over it as it arrives. Each opens once per run (`loveiq-survey-sheets`, keyed
  by the run's `startedAt`), never on Back, a resume or the jump menu, and one at most per move.
- **Closing.** Keep going carries on (a "before" sheet leaves the reader on its question).
  Tapping outside, Esc or a swipe down do the same: these sheets ask nothing. Back closes it and
  steps back. The map is a full screen with Previous (back to the question) and Next.
- **Switches.** One `system_flags` row per sheet (`survey_sheet_*`), read with the default off
  ([`sheetSwitches.ts`](../features/survey/server/sheetSwitches.ts)); no row is seeded. On dev,
  previews and staging `?sheets=all` (or `?sheets=science,halfway`) shows them without a
  switch; production ignores it. A reader who paid before the survey never sees a sheet with a
  price (Halfway, State of Desire, the map). The Trustpilot sheet needs the site's Trustpilot
  switch and numbers, or it is skipped.
- **Before production.** All six stay off until the C13 check-in (2026-11-20), since they land
  at different points in its two orders. Halfway and the map describe the €1.99 change still to
  come (the Core Archetype free), so they wait for it. The State of Desire tick box records
  nothing yet: what it promises waits on the report's delivery and the €5 code, and keeping the
  tick needs its own consent, written up as a new activity. The expert's words need her written
  agreement.
- **The numbers.** Sheet 1's shares (respond 36%, start 12%, naturally 44%, plan 6%) and sheet
  5's 15% are measured on finished surveys without the team's own runs, rounded down; the
  queries sit beside the copy. The design's "Most people love to respond" was not true (most
  say it happens naturally), so the sheet says "More people love to respond", with 36% against
  12% in the line under it. It is one message for every reader (Mark's review, 12 Nov); the
  answer-by-answer headlines are gone.
- **Measuring them.** PostHog and GA4 get `survey_sheet_shown` and `survey_sheet_closed`
  (`sheet`, `question_id`); how it closed, how long it was open and the tick go to PostHog only.
  AP-Analytics' question funnel shows the drop-off right after each sheet, before and after its
  switch goes on.

#### Their motion

Researched 2026-11-12 (NN/g on durations, Material 3 and Carbon motion, WCAG 2.2 2.3.3, the
goal-gradient and endowed-progress studies of 2006, web.dev on animation cost):

- Content fades up 8px over 240ms on the house curve `cubic-bezier(0.16, 1, 0.3, 1)`, groups
  50ms apart from 120ms. Each sheet has one moment of its own: the share counting up (Science,
  and State of Desire's 15%), "Excellent" and the stars arriving one after another
  (Trustpilot), the three steps arriving one after another (Halfway), a phrase turning to the
  brand gradient (Expert), the map building part by part.
- Mark's review (12 Nov) slowed the moments down: numbers count up over 1.2s from 400ms, the
  halfway steps arrive 320ms apart over 420ms each, the stars 110ms apart. The slowest sheet has
  settled by about 1.7s, and no single animation runs longer than 450ms. Keep going works from
  the first frame; the only guard is the 400ms that keeps a double tap on Next from skipping a
  sheet unseen.
- Only transform and opacity move, plus a check's stroke and one phrase's color. Nothing loops,
  nothing overshoots, no confetti, no countdowns, and nothing moves on a price or a lock.
  Trustpilot's stars keep their shape, colors and fill (its brand rules): they only arrive.
- Under reduced motion nothing moves: numbers stand at their value and the check is drawn. The
  rules are a test (`features/survey/tests/sheetsMotion.test.tsx`); the end-to-end spec
  (`e2e/survey-sheets.spec.ts`) checks the timings in a real browser.

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
