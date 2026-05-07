# components/

All React UI components, organized by page or domain in subdirectories.

## Key Conventions

- Landing sections are numbered `S01Hero.tsx` through `S14CTA.tsx`. Add new landing sections in order and wire them into `LandingPage.tsx`.
- Root-level files such as `NonceProvider.tsx`, `HydrationMarker.tsx`, and `SmoothScroll.tsx` are cross-cutting layout utilities. Page- or domain-specific UI belongs in a subdirectory.
- The admin surface is large enough that it has its own local router: use [`admin/AGENT_README.md`](admin/AGENT_README.md) instead of scanning this file.

## Subdirectory Manifest

| Directory     | Files | Entry point                                 | Route                           |
| ------------- | ----- | ------------------------------------------- | ------------------------------- |
| `landing/`    | 18    | `LandingPage.tsx`                           | `/`                             |
| `about/`      | 9     | `AboutPage.tsx`                             | `/about`                        |
| `survey/`     | 26    | `SurveyPage.tsx`                            | `/survey`                       |
| `admin/`      | 170   | `admin/AGENT_README.md`                     | `/admin/*`                      |
| `glossary/`   | 3     | `GlossaryPage.tsx` / `GlossaryTermPage.tsx` | `/glossary`, `/glossary/[slug]` |
| `staging/`    | 1     | `StagingLoginForm.tsx`                      | `/login`                        |
| `not-found/`  | 1     | `NotFoundPage.tsx`                          | 404 page                        |
| `trust-zone/` | 1     | `TrustZonePage.tsx`                         | `/trust-zone`                   |
| `legal/`      | 1     | `LegalNavSection.tsx`                       | Shared legal-page navigation    |

### `landing/` key files

| File                          | Purpose                                                |
| ----------------------------- | ------------------------------------------------------ |
| `LandingPage.tsx`             | Composition component that orders the landing sections |
| `NavSection.tsx`              | Site navigation                                        |
| `FooterSection.tsx`           | Site footer                                            |
| `ScrollAnimator.tsx`          | Scroll animation orchestrator                          |
| `S01Hero.tsx` to `S14CTA.tsx` | Individual landing sections                            |

### `survey/` key files

| File                         | Purpose                                    |
| ---------------------------- | ------------------------------------------ |
| `SurveyPage.tsx`             | Top-level survey page wrapper              |
| `SurveyEngine.tsx`           | Question navigation and state orchestrator |
| `hooks/useSurveyState.ts`    | Survey answer state management             |
| `hooks/useSubmitSurvey.ts`   | Survey submission to the API               |
| `hooks/useSurveyTracking.ts` | Behavioral analytics                       |
| `questions/*.tsx`            | Question type renderers                    |

### `admin/` key files

Use [`admin/AGENT_README.md`](admin/AGENT_README.md) for domain-local lookup across dashboards, tab groups, hooks, and shared admin controls.
