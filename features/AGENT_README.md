# features

**Purpose:** Domain-first organization of all feature code. Every feature is its own `features/<name>/` folder with the same predictable cell structure.

**Conventions:**

- `ui/` — React components for that feature.
- `server/` (or `logic/` for pure-logic shared features) — server-side handlers, helpers, types.
- `data/` — feature-owned data files (when present).
- `emails/` — feature-owned email templates (when present).
- `tests/` — Vitest unit/integration tests for that feature.
- `AGENT_README.md` — what belongs and what does not.

**Domains:**

| Feature       | Role                                                                                |
| ------------- | ----------------------------------------------------------------------------------- |
| `landing/`    | `/` marketing page + shared nav/footer                                              |
| `about/`      | `/about`                                                                            |
| `glossary/`   | `/glossary` + `/glossary/[slug]`                                                    |
| `legal/`      | shared chrome for legal pages                                                       |
| `trust-zone/` | `/trust-zone`                                                                       |
| `not-found/`  | 404                                                                                 |
| `staging/`    | staging password gate                                                               |
| `survey/`     | assessment funnel `/survey` + submission                                            |
| `report/`     | `/report` + `/report/[token]` (paywalled)                                           |
| `checkout/`   | Stripe checkout for report purchases                                                |
| `pricing/`    | report pricing math + quote snapshots                                               |
| `scoring/`    | V4+V5 archetype scoring engine                                                      |
| `invite/`     | partner invite UI + send/track + reminders                                          |
| `contact/`    | `/contact` form pipeline                                                            |
| `cron/`       | scheduled jobs (invite reminders, fulfillment sweep, discount email, survey-paused) |
| `analytics/`  | client tracking + server event ingest                                               |
| `admin/`      | internal operator panel (≥280 files, preserves internal subdomain structure)        |

**Does NOT belong:** cross-feature infrastructure (use `shared/`), Next.js routing files (use `app/`), Supabase migrations (use `supabase/`).

**Path aliases:** import within features as `@features/<name>/<cell>/<file>`.
