# FILE_INDEX.md — Task-Based File Lookup

> Find the right file in one step: pick your task, find the file.

---

## Forms & User Input

| Task                        | Files                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| Waitlist signup UI          | `components/waitlist/WaitlistPage.tsx`                                                        |
| Waitlist API endpoint       | `app/api/waitlist/route.ts`                                                                   |
| Waitlist confirmation email | `lib/emails/waitlist.ts`                                                                      |
| Contact form UI             | `components/about/ContactSection.tsx` (embedded in About page)                                |
| Contact form API endpoint   | `app/api/contact/route.ts`                                                                    |
| Survey UI & question flow   | `components/survey/SurveyEngine.tsx`, `components/survey/SurveyPage.tsx`                      |
| Survey completion wizard    | `components/survey/PreReportWizard.tsx`                                                       |
| Survey confirmation UI      | `components/survey/SurveyConfirmation.tsx`                                                    |
| Survey question types       | `components/survey/questions/*.tsx` (SingleChoice, Scale, MultipleChoice, etc.)               |
| Survey submission logic     | `components/survey/hooks/useSubmitSurvey.ts`                                                  |
| Survey API endpoint         | `app/api/survey/route.ts`                                                                     |
| Survey behavioral tracking  | `components/survey/hooks/useSurveyTracking.ts`, `app/api/survey-tracking/route.ts`            |
| Survey answer state         | `components/survey/hooks/useSurveyState.ts`                                                   |
| Survey questions data       | `data/survey-data.ts` (compiled from `data/survey-source.csv` via `scripts/update-survey.js`) |
| Country dropdown data       | `data/countries.ts`                                                                           |
| Invite email sending        | `app/api/invite/route.ts`                                                                     |
| Invite share tracking       | `app/api/invite-tracking/route.ts`                                                            |
| Survey partial save (draft) | `app/api/survey-partial/route.ts`                                                             |

## Scoring Engine

| Task                      | Files                                                        |
| ------------------------- | ------------------------------------------------------------ |
| Scoring algorithm         | `lib/scoring/engine.ts`                                      |
| Scoring types             | `lib/scoring/types.ts`                                       |
| Scoring config loader     | `lib/scoring/config.ts`                                      |
| Scoring public API        | `lib/scoring/index.ts`                                       |
| Scoring config data       | `data/scoring-config.ts` (auto-generated — do not hand-edit) |
| Scoring config CSVs       | `data/scoring-config/*.csv` (12 source files)                |
| Regenerate scoring config | `node scripts/update-scoring-config.js`                      |
| Scoring DB migration      | `supabase/migrations/20260310_scoring_result.sql`            |

## Security

| Task                     | Files                                |
| ------------------------ | ------------------------------------ |
| CSRF server verification | `lib/csrf.ts`                        |
| CSRF client token reader | `lib/csrf-client.ts`                 |
| Rate limiting            | `lib/ratelimit.ts`                   |
| CSP headers / middleware | `proxy.ts`                           |
| CSRF cookie setup        | `proxy.ts` (generates + sets cookie) |
| Security documentation   | `SECURITY.md`                        |
| Security checklist       | `.github/SECURITY_CHECKLIST.md`      |
| Incident response        | `.github/INCIDENT_RESPONSE_AGENT.md` |

## Admin Panel

| Task                                        | Files                                                                                                                                                                  |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin route router                          | `docs/admin/AGENT_README.md`, `docs/admin/domains/AGENT_README.md`                                                                                                     |
| Admin shell and command center              | `docs/admin/domains/command-center.md`, `app/admin/AGENT_README.md`, `app/api/admin/AGENT_README.md`, `components/admin/AGENT_README.md`, `lib/admin/AGENT_README.md`  |
| Admin submissions and moderation            | `docs/admin/domains/submissions.md`                                                                                                                                    |
| Admin scoring, profiles, reports, and stats | `docs/admin/domains/scoring.md`                                                                                                                                        |
| Admin growth, funnels, journey, and revenue | `docs/admin/domains/growth.md`                                                                                                                                         |
| Admin research, strategy, and intelligence  | `docs/admin/domains/research.md`                                                                                                                                       |
| Admin health and operational diagnostics    | `docs/admin/domains/health.md`                                                                                                                                         |
| Admin auth entrypoints                      | `components/admin/AdminLoginForm.tsx`, `app/admin/login/page.tsx`, `app/api/admin/login/route.ts`, `app/api/admin/logout/route.ts`, `app/admin/auth/callback/route.ts` |

## Landing Page

| Task                     | Files                                     |
| ------------------------ | ----------------------------------------- |
| Landing page composition | `components/landing/LandingPage.tsx`      |
| Navigation               | `components/landing/NavSection.tsx`       |
| Footer                   | `components/landing/FooterSection.tsx`    |
| Scroll animations        | `components/landing/ScrollAnimator.tsx`   |
| Hero section             | `components/landing/S01Hero.tsx`          |
| How It Works             | `components/landing/S02HowItWorks.tsx`    |
| Perfect For              | `components/landing/S03PerfectFor.tsx`    |
| Trusted By               | `components/landing/S04TrustedBy.tsx`     |
| Value Features           | `components/landing/S05ValueFeatures.tsx` |
| Archetypes               | `components/landing/S06Archetypes.tsx`    |
| Sample Profile           | `components/landing/S07SampleProfile.tsx` |
| Academic Board           | `components/landing/S08AcademicBoard.tsx` |
| Report Preview           | `components/landing/S09Report.tsx`        |
| Pillars                  | `components/landing/S10Pillars.tsx`       |
| Testimonials             | `components/landing/S11Testimonials.tsx`  |
| Why We Created           | `components/landing/S12WhyWeCreated.tsx`  |
| FAQ                      | `components/landing/S13FAQ.tsx`           |
| CTA                      | `components/landing/S14CTA.tsx`           |

## About Page

| Task                   | Files                                         |
| ---------------------- | --------------------------------------------- |
| About page composition | `components/about/AboutPage.tsx`              |
| About navigation       | `components/about/AboutNavSection.tsx`        |
| About hero             | `components/about/HeroSection.tsx`            |
| Challenge & Vision     | `components/about/ChallengeVisionSection.tsx` |
| Solution               | `components/about/SolutionSection.tsx`        |
| Process                | `components/about/ProcessSection.tsx`         |
| Team                   | `components/about/TeamSection.tsx`            |
| Publications           | `components/about/PublicationsSection.tsx`    |
| Contact form           | `components/about/ContactSection.tsx`         |

## Styling

| Task                                  | Files                |
| ------------------------------------- | -------------------- |
| CSS custom properties / design tokens | `app/globals.css`    |
| Tailwind config (extends tokens)      | `tailwind.config.js` |

## Email Templates

| Task                        | Files                            |
| --------------------------- | -------------------------------- |
| Waitlist confirmation email | `lib/emails/waitlist.ts`         |
| Admin magic link email      | `lib/emails/admin-magic-link.ts` |
| Invite email template       | `lib/emails/invite.ts`           |

## Glossary

| Task                | Files                                                                    |
| ------------------- | ------------------------------------------------------------------------ |
| Glossary data       | `data/glossary-data.ts` (auto-generated from `data/glossary-source.csv`) |
| Regenerate glossary | `node scripts/update-glossary.js`                                        |
| Glossary index page | `components/glossary/GlossaryPage.tsx`                                   |
| Glossary term page  | `components/glossary/GlossaryTermPage.tsx`                               |
| Glossary navigation | `components/glossary/GlossaryNavSection.tsx`                             |

## Database

| Task                         | Files                          |
| ---------------------------- | ------------------------------ |
| Supabase migrations          | `supabase/migrations/*.sql`    |
| Supabase middleware client   | `lib/supabase-middleware.ts`   |
| Supabase admin server client | `lib/admin/supabase-server.ts` |
| Supabase admin REST helper   | `lib/admin/supabase.ts`        |

## Testing

| Task             | Files                                                                     |
| ---------------- | ------------------------------------------------------------------------- |
| Unit test config | `vitest.config.ts`                                                        |
| Unit test setup  | `__tests__/setup.ts`                                                      |
| Unit tests       | `__tests__/` (mirrors source structure — see `__tests__/AGENT_README.md`) |
| E2E test config  | `playwright.config.ts`                                                    |
| E2E tests        | `e2e/*.spec.ts`                                                           |

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
| Visual regression testing         | `.github/workflows/visual-regression.yml` |

## Miscellaneous

| Task                   | Files                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------- |
| Staging login gate     | `components/staging/StagingLoginForm.tsx`, `app/api/staging-login/route.ts`         |
| 404 page               | `components/not-found/NotFoundPage.tsx`                                             |
| Trust Zone page        | `components/trust-zone/TrustZonePage.tsx`                                           |
| Legal page navigation  | `components/legal/LegalNavSection.tsx`                                              |
| Analytics helpers      | `lib/analytics.ts`                                                                  |
| Structured logging     | `lib/logger.ts`                                                                     |
| Circuit breaker        | `lib/circuit-breaker.ts`                                                            |
| Fetch with timeout     | `lib/fetch-with-timeout.ts`                                                         |
| UTM parameter handling | `lib/utm.ts`                                                                        |
| Nonce provider (CSP)   | `components/NonceProvider.tsx`                                                      |
| Hydration marker       | `components/HydrationMarker.tsx`                                                    |
| Smooth scroll          | `components/SmoothScroll.tsx`                                                       |
| Favicon / icons        | `public/favicon.svg`, `public/apple-touch-icon.png`, `public/images/LoveiqLogo.svg` |

## Documentation

| Task                       | Files                                                                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public API docs            | `docs/api.md`, `app/api/**/route.ts` outside `app/api/admin/**`                                                                                                   |
| Survey flow docs           | `docs/survey.md`, `app/survey/page.tsx`, `components/survey/**`, `app/api/survey/route.ts`, `app/api/survey-partial/route.ts`, `app/api/survey-tracking/route.ts` |
| Admin domain router        | `docs/admin/AGENT_README.md`, `docs/admin/domains/AGENT_README.md`                                                                                                |
| Admin API docs             | `docs/admin-api.md`, `app/api/admin/**/route.ts`, `lib/admin/roles.ts`                                                                                            |
| Admin shell/dashboard docs | `docs/admin-dashboard.md`, `app/admin/**`, `components/admin/**`, `app/api/admin/os/route.ts`, `app/api/admin/stats/route.ts`                                     |
| Pinned versions            | `docs/versions.md`, `package.json`, `.github/workflows/ci.yml`                                                                                                    |
| Doc inventory              | `docs/doc-inventory.md`, `.github/CODEOWNERS`                                                                                                                     |
| Documentation ledger       | `docs/knowledge-ledger.md`                                                                                                                                        |
| Docs truth automation      | `scripts/check-docs-truth.mjs`, `.github/workflows/docs-truth.yml`                                                                                                |
| Docs impact PR gate        | `scripts/check-docs-impact.sh`, `.github/workflows/ci.yml`, `.github/pull_request_template.md`                                                                    |
