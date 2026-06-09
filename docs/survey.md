# Survey Flow

> Owner: CODEOWNERS default
> Last verified: 2026-05-31
> Verified against: `app/survey/page.tsx`, `features/survey/ui/**`, `app/api/survey/route.ts`, `app/api/survey-partial/route.ts`, `app/api/survey-tracking/route.ts`, `shared/url/utm.ts`
> Canonical source: Product-flow reference for `/survey`; request and response details live in [api.md](api.md).

This document covers the client-side survey experience at `/survey`: entry points, step orchestration, persistence, autosave, tracking, submission recovery, and the post-submit handoff.

## Entry Points

| Surface                    | Backing file(s)                                                                 | Notes                                                                          |
| -------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `/survey` route            | [`app/survey/page.tsx`](../app/survey/page.tsx)                                 | Exports page metadata and renders `SurveyPage`.                                |
| Survey orchestrator        | [`features/survey/ui/SurveyPage.tsx`](../features/survey/ui/SurveyPage.tsx)     | Controls intro, prep slides, consent, and the handoff into `SurveyEngine`.     |
| Question engine            | [`features/survey/ui/SurveyEngine.tsx`](../features/survey/ui/SurveyEngine.tsx) | Renders questions, post-submit states, and retry/start-over behavior.          |
| Question order and content | [`data/survey-data.ts`](../data/survey-data.ts)                                 | Canonical question list used for progress, question order, and chapter labels. |

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

## Related Coverage

- End-to-end flow: [`e2e/survey.spec.ts`](../e2e/survey.spec.ts)
- Survey engine: [`features/survey/tests/SurveyEngine.test.tsx`](../features/survey/tests/SurveyEngine.test.tsx)
- Partial save hook: [`features/survey/tests/hooks/usePartialSave.test.ts`](../features/survey/tests/hooks/usePartialSave.test.ts)
- Submit hook: [`features/survey/tests/hooks/useSubmitSurvey.test.ts`](../features/survey/tests/hooks/useSubmitSurvey.test.ts)
- Tracking hook: [`features/survey/tests/hooks/useSurveyTracking.test.ts`](../features/survey/tests/hooks/useSurveyTracking.test.ts)
- Survey API routes: [`features/survey/tests/survey-handler.test.ts`](../features/survey/tests/survey-handler.test.ts), [`features/survey/tests/survey-partial.test.ts`](../features/survey/tests/survey-partial.test.ts), [`features/survey/tests/survey-tracking.test.ts`](../features/survey/tests/survey-tracking.test.ts)
