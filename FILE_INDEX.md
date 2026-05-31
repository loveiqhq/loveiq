# FILE_INDEX.md — Task-Based File Lookup

> Find the right file in one step: pick your task, find the file.

---

## Forms & User Input

| Task                        | Files                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| Contact form UI             | `features/about/ui/ContactSection.tsx` (embedded in About page)                               |
| Contact form API endpoint   | `app/api/contact/route.ts`                                                                    |
| Survey UI & question flow   | `features/survey/ui/SurveyEngine.tsx`, `features/survey/ui/SurveyPage.tsx`                    |
| Survey completion wizard    | `features/survey/ui/PreReportWizard.tsx`                                                      |
| Survey confirmation UI      | `features/survey/ui/SurveyConfirmation.tsx`                                                   |
| Survey question types       | `features/survey/ui/questions/*.tsx` (SingleChoice, Scale, MultipleChoice, etc.)              |
| Survey submission logic     | `features/survey/ui/hooks/useSubmitSurvey.ts`                                                 |
| Survey API endpoint         | `app/api/survey/route.ts`                                                                     |
| Survey behavioral tracking  | `features/survey/ui/hooks/useSurveyTracking.ts`, `app/api/survey-tracking/route.ts`           |
| Survey answer state         | `features/survey/ui/hooks/useSurveyState.ts`                                                  |
| Survey questions data       | `data/survey-data.ts` (compiled from `data/survey-source.csv` via `scripts/update-survey.js`) |
| Country dropdown data       | `data/countries.ts`                                                                           |
| Invite email sending        | `app/api/invite/route.ts`                                                                     |
| Invite share tracking       | `app/api/invite-tracking/route.ts`                                                            |
| Survey partial save (draft) | `app/api/survey-partial/route.ts`                                                             |

## Scoring Engine

| Task                      | Files                                                        |
| ------------------------- | ------------------------------------------------------------ |
| Scoring algorithm         | `features/scoring/logic/engine.ts`                           |
| Scoring types             | `features/scoring/logic/types.ts`                            |
| Scoring config loader     | `features/scoring/logic/config.ts`                           |
| Scoring public API        | `features/scoring/logic/index.ts`                            |
| Scoring config data       | `data/scoring-config.ts` (auto-generated — do not hand-edit) |
| Scoring config CSVs       | `data/scoring-config/*.csv` (12 source files)                |
| Regenerate scoring config | `node scripts/update-scoring-config.js`                      |
| Scoring DB migration      | `supabase/migrations/20260310164528_scoring_result.sql`      |

## Security

| Task                     | Files                                |
| ------------------------ | ------------------------------------ |
| CSRF server verification | `shared/http/csrf.ts`                |
| CSRF client token reader | `shared/http/csrf-client.ts`         |
| Rate limiting            | `shared/http/ratelimit.ts`           |
| CSP headers / middleware | `proxy.ts`                           |
| CSRF cookie setup        | `proxy.ts` (generates + sets cookie) |
| Security documentation   | `docs/runbooks/SECURITY.md`          |
| Security checklist       | `.github/SECURITY_CHECKLIST.md`      |
| Incident response        | `.github/INCIDENT_RESPONSE_AGENT.md` |

## Admin Panel

| Task                                        | Files                                                                                                                                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin route router                          | `docs/admin/AGENT_README.md`, `docs/admin/domains/AGENT_README.md`                                                                                                                 |
| Admin shell and command center              | `docs/admin/domains/command-center.md`, `app/admin/AGENT_README.md`, `app/api/admin/AGENT_README.md`, `features/admin/ui/AGENT_README.md`, `features/admin/server/AGENT_README.md` |
| Admin submissions and moderation            | `docs/admin/domains/submissions.md`                                                                                                                                                |
| Admin scoring, profiles, reports, and stats | `docs/admin/domains/scoring.md`                                                                                                                                                    |
| Admin growth, funnels, journey, and revenue | `docs/admin/domains/growth.md`                                                                                                                                                     |
| Admin research, strategy, and intelligence  | `docs/admin/domains/research.md`                                                                                                                                                   |
| Admin health and operational diagnostics    | `docs/admin/domains/health.md`                                                                                                                                                     |
| Admin auth entrypoints                      | `features/admin/ui/AdminLoginForm.tsx`, `app/admin/login/page.tsx`, `app/api/admin/login/route.ts`, `app/api/admin/logout/route.ts`, `app/admin/auth/callback/route.ts`            |

## Landing Page

| Task                     | Files                                      |
| ------------------------ | ------------------------------------------ |
| Landing page composition | `features/landing/ui/LandingPage.tsx`      |
| Navigation               | `features/landing/ui/NavSection.tsx`       |
| Footer                   | `features/landing/ui/FooterSection.tsx`    |
| Scroll animations        | `features/landing/ui/ScrollAnimator.tsx`   |
| Hero section             | `features/landing/ui/S01Hero.tsx`          |
| How It Works             | `features/landing/ui/S02HowItWorks.tsx`    |
| Perfect For              | `features/landing/ui/S03PerfectFor.tsx`    |
| Value Features           | `features/landing/ui/S05ValueFeatures.tsx` |
| Archetypes               | `features/landing/ui/S06Archetypes.tsx`    |
| Sample Profile           | `features/landing/ui/S07SampleProfile.tsx` |
| Language                 | `features/landing/ui/S07Language.tsx`      |
| Academic Board           | `features/landing/ui/S08AcademicBoard.tsx` |
| Report Preview           | `features/landing/ui/S09Report.tsx`        |
| Pillars                  | `features/landing/ui/S10Pillars.tsx`       |
| Why We Created           | `features/landing/ui/S12WhyWeCreated.tsx`  |
| FAQ                      | `features/landing/ui/S13FAQ.tsx`           |
| CTA                      | `features/landing/ui/S14CTA.tsx`           |
| Testimonials             | `features/landing/ui/S15Testimonials.tsx`  |

## About Page

| Task                   | Files                                          |
| ---------------------- | ---------------------------------------------- |
| About page composition | `features/about/ui/AboutPage.tsx`              |
| About navigation       | `features/about/ui/AboutNavSection.tsx`        |
| About hero             | `features/about/ui/HeroSection.tsx`            |
| Challenge & Vision     | `features/about/ui/ChallengeVisionSection.tsx` |
| Solution               | `features/about/ui/SolutionSection.tsx`        |
| Process                | `features/about/ui/ProcessSection.tsx`         |
| Team                   | `features/about/ui/TeamSection.tsx`            |
| Publications           | `features/about/ui/PublicationsSection.tsx`    |
| Contact form           | `features/about/ui/ContactSection.tsx`         |

## Styling

| Task                                  | Files                |
| ------------------------------------- | -------------------- |
| CSS custom properties / design tokens | `app/globals.css`    |
| Tailwind config (extends tokens)      | `tailwind.config.js` |

## Email Templates

| Task                   | Files                                              |
| ---------------------- | -------------------------------------------------- |
| Admin magic link email | `features/admin/server/emails/admin-magic-link.ts` |
| Invite email template  | `features/invite/emails/invite.ts`                 |

## Glossary

| Task                | Files                                                                    |
| ------------------- | ------------------------------------------------------------------------ |
| Glossary data       | `data/glossary-data.ts` (auto-generated from `data/glossary-source.csv`) |
| Regenerate glossary | `node scripts/update-glossary.js`                                        |
| Glossary index page | `features/glossary/ui/GlossaryPage.tsx`                                  |
| Glossary term page  | `features/glossary/ui/GlossaryTermPage.tsx`                              |
| Glossary navigation | `features/glossary/ui/GlossaryNavSection.tsx`                            |

## Database

| Task                         | Files                                      |
| ---------------------------- | ------------------------------------------ |
| Supabase migrations          | `supabase/migrations/*.sql`                |
| Supabase middleware client   | `shared/auth/supabase-middleware.ts`       |
| Supabase admin server client | `features/admin/server/supabase-server.ts` |
| Supabase admin REST helper   | `features/admin/server/supabase.ts`        |

## Testing

| Task             | Files                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| Unit test config | `vitest.config.ts`                                                    |
| Unit test setup  | `__tests__/setup.ts`                                                  |
| Unit tests       | colocated `*/tests/` + `__tests__/` (see `__tests__/AGENT_README.md`) |
| E2E test config  | `playwright.config.ts`                                                |
| E2E tests        | `e2e/*.spec.ts`                                                       |

## CI/CD & Infrastructure

| Task                              | Files                                     |
| --------------------------------- | ----------------------------------------- |
| CI pipeline (build + lint + test) | `.github/workflows/ci.yml`                |
| Security scanning                 | `.github/workflows/security.yml`          |
| CodeQL analysis                   | `.github/workflows/codeql.yml`            |
| Health monitoring                 | `.github/workflows/health-monitor.yml`    |
| Lighthouse CI                     | `.github/workflows/lighthouse.yml`        |
| Load testing                      | `.github/workflows/load-test.yml`         |
| Release workflow                  | `.github/workflows/release.yml`           |
| Documentation truth validation    | `.github/workflows/docs-truth.yml`        |
| Commit Slack notifications        | `.github/workflows/slack-commits.yml`     |
| Visual regression testing         | `.github/workflows/visual-regression.yml` |

## Miscellaneous

| Task                   | Files                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------- |
| Staging login gate     | `features/staging/ui/StagingLoginForm.tsx`, `app/api/staging-login/route.ts`        |
| 404 page               | `features/not-found/ui/NotFoundPage.tsx`                                            |
| Trust Zone page        | `features/trust-zone/ui/TrustZonePage.tsx`                                          |
| Legal page navigation  | `features/legal/ui/LegalNavSection.tsx`                                             |
| Analytics helpers      | `features/analytics/client.ts`                                                      |
| Structured logging     | `shared/observability/logger.ts`                                                    |
| Circuit breaker        | `shared/http/circuit-breaker.ts`                                                    |
| Fetch with timeout     | `shared/http/fetch-with-timeout.ts`                                                 |
| UTM parameter handling | `shared/url/utm.ts`                                                                 |
| Nonce provider (CSP)   | `shared/ui/NonceProvider.tsx`                                                       |
| Hydration marker       | `shared/ui/HydrationMarker.tsx`                                                     |
| Smooth scroll          | `shared/ui/SmoothScroll.tsx`                                                        |
| Favicon / icons        | `public/favicon.svg`, `public/apple-touch-icon.png`, `public/images/LoveiqLogo.svg` |

## Documentation

| Task                       | Files                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public API docs            | `docs/api.md`, `app/api/**/route.ts` outside `app/api/admin/**`                                                                                                    |
| Survey flow docs           | `docs/survey.md`, `app/survey/page.tsx`, `features/survey/ui/**`, `app/api/survey/route.ts`, `app/api/survey-partial/route.ts`, `app/api/survey-tracking/route.ts` |
| Admin domain router        | `docs/admin/AGENT_README.md`, `docs/admin/domains/AGENT_README.md`                                                                                                 |
| Admin API docs             | `docs/admin-api.md`, `app/api/admin/**/route.ts`, `features/admin/server/roles.ts`                                                                                 |
| Admin shell/dashboard docs | `docs/admin-dashboard.md`, `app/admin/**`, `features/admin/ui/**`, `app/api/admin/os/route.ts`, `app/api/admin/stats/route.ts`                                     |
| Pinned versions            | `docs/versions.md`, `package.json`, `.github/workflows/ci.yml`                                                                                                     |
| Doc inventory              | `docs/doc-inventory.md`, `.github/CODEOWNERS`                                                                                                                      |
| Documentation ledger       | `docs/knowledge-ledger.md`                                                                                                                                         |
| Docs truth automation      | `scripts/check-docs-truth.mjs`, `.github/workflows/docs-truth.yml`                                                                                                 |
| Docs impact PR gate        | `scripts/check-docs-impact.sh`, `.github/workflows/ci.yml`, `.github/pull_request_template.md`                                                                     |
