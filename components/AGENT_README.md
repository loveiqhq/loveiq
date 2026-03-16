# components/

All React UI components, organized by page/feature in subdirectories.

## Key Conventions

- Landing sections are numbered `S01Hero.tsx` through `S14CTA.tsx`. To add a new section, create `S##NewName.tsx` and import it in `LandingPage.tsx` in order.
- Root-level files (`NonceProvider.tsx`, `HydrationMarker.tsx`, `SmoothScroll.tsx`) are cross-cutting utilities used by the root layout. Page-specific components always go in a subdirectory.

## Subdirectory Manifest

| Directory     | Files | Entry Point                                 | Route                                                  |
| ------------- | ----- | ------------------------------------------- | ------------------------------------------------------ |
| `landing/`    | 16    | `LandingPage.tsx`                           | `/` (home page)                                        |
| `about/`      | 8     | `AboutPage.tsx`                             | `/about`                                               |
| `survey/`     | 12    | `SurveyPage.tsx`                            | `/survey`                                              |
| `admin/`      | 13    | — (each page imports directly)              | `/admin/*`                                             |
| `glossary/`   | 3     | `GlossaryPage.tsx` / `GlossaryTermPage.tsx` | `/glossary`, `/glossary/[slug]`                        |
| `waitlist/`   | 1     | `WaitlistPage.tsx`                          | `/waitlist`                                            |
| `staging/`    | 1     | `StagingLoginForm.tsx`                      | `/login` (staging gate)                                |
| `not-found/`  | 1     | `NotFoundPage.tsx`                          | 404 page                                               |
| `trust-zone/` | 1     | `TrustZonePage.tsx`                         | `/trust-zone`                                          |
| `legal/`      | 1     | `LegalNavSection.tsx`                       | Shared nav for all `/privacy-policy`, `/terms-*`, etc. |

### `landing/` key files

| File                         | Purpose                                                     |
| ---------------------------- | ----------------------------------------------------------- |
| `LandingPage.tsx`            | Composition component — imports and orders all S## sections |
| `NavSection.tsx`             | Site navigation (desktop + mobile hamburger)                |
| `FooterSection.tsx`          | Site footer with links                                      |
| `ScrollAnimator.tsx`         | IntersectionObserver orchestrator for scroll animations     |
| `S01Hero.tsx` – `S14CTA.tsx` | Individual landing page sections                            |

### `survey/` key files

| File                         | Purpose                                             |
| ---------------------------- | --------------------------------------------------- |
| `SurveyPage.tsx`             | Top-level survey page wrapper                       |
| `SurveyEngine.tsx`           | Question navigation and state orchestrator          |
| `hooks/useSurveyState.ts`    | Survey answer state management                      |
| `hooks/useSubmitSurvey.ts`   | Survey submission to API                            |
| `hooks/useSurveyTracking.ts` | Behavioral analytics (question timing, abandonment) |
| `questions/*.tsx`            | Question type renderers (SingleChoice, Scale, etc.) |

### `admin/` key files

| File                     | Purpose                                    |
| ------------------------ | ------------------------------------------ |
| `AdminDashboard.tsx`     | Dashboard with stats + charts              |
| `AdminLoginForm.tsx`     | Magic link login form                      |
| `AdminSidebar.tsx`       | Sidebar navigation + logout                |
| `SubmissionBrowser.tsx`  | Filterable submission list page            |
| `SubmissionDetail.tsx`   | Single submission view + actions           |
| `SubmissionTable.tsx`    | Submission data table                      |
| `SurveyStatus.tsx`       | Survey active/closed toggle                |
| `hooks/useAdminFetch.ts` | Generic data fetching hook for admin pages |
