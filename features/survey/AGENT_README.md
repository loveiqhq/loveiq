# features/survey

**Purpose:** The assessment funnel at `/survey` — intro wizard → consent → question engine → submission → pre-report wizard.

**Entry:**

- `ui/SurveyPage.tsx` — orchestrator (intro → wizard → consent → engine).
- `ui/SurveyEngine.tsx` — question loop + completion phases.
- `ui/PreReportWizard.tsx` — 5-slide post-submission wizard.
- `ui/SurveyConfirmation.tsx` — processing/success/error screens.
- `ui/questions/` — question type components (SingleChoice, Scale, etc.).
- `ui/hooks/` — survey state, submission, tracking hooks (`useSurveyState`, `useSubmitSurvey`, `useSurveyTracking`).
- `server/` — types, utils, server-side helpers.
- API routes inline at `app/api/survey/route.ts`, `app/api/survey-partial/route.ts`, `app/api/survey-tracking/route.ts`.

**Belongs:** survey UI, hooks, server helpers, submission validation, type definitions.

**Does NOT belong:**

- Scoring (use `features/scoring/`).
- Invite modal (was misplaced here previously; now at `features/invite/`).
- Report rendering (use `features/report/`).

**Related:**

- `data/survey-data.ts` (generated, ~129KB, tracked) from `data/survey-source.csv` via `scripts/update-survey.js`.
- Submission triggers scoring (`features/scoring/logic`) and Slack notification.
