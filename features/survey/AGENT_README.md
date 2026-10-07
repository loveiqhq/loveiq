# features/survey

**Purpose:** The assessment funnel at `/survey` — intro wizard → consent → question engine → submission → pre-report wizard.

**Entry:**

- `ui/SurveyPage.tsx` — orchestrator (intro → wizard → consent → engine).
- `ui/SurveyEngine.tsx` — question loop + completion phases.
- `ui/PreReportWizard.tsx` — 6-slide post-submission wizard (Figma 1071:2092); slide 2, the report map, is `ui/wizard/WizardReportMap.tsx`, its copy `ui/wizard/wizardContent.ts`; its deep-dive tiles step on a vertical swipe and on a tap on the tile peeking in below (pointer shortcuts: the arrows stay the keyboard's way). A phone draws every slide at Figma's 345 x 640, scaled by one factor to fit the screen (`ui/wizard/wizardFit.ts`, measured by `ui/wizard/useWizardFit.ts`: the frame, the safe area, the cookie banner's `--liq-consent-h`), with the footer pinned to the bottom and nothing scrolling; below 0.6 (a phone on its side, or a short one while the cookie banner is up) the slide scrolls at 0.6. From 1024px `ui/wizard/wizard-desktop.css` lays the slides out for a desktop, on `wz-*` hooks inside one media query, so a phone keeps the 393 design. Off production `/wizard-preview` (`app/wizard-preview/`) shows the wizard alone, tracking nothing and starting over at its end, so it can be checked without submitting a survey.
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
