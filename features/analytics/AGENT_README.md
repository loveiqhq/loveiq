# features/analytics

**Purpose:** Client-side GA4 event tracking + server-side analytics event ingest.

**Entry:**

- `client.ts` — public `track*` helpers (`trackStartSurvey`, `trackLandingPageView`, `trackReportViewed`, etc.). Imported across landing, survey, report, invite.
- API route still inline: `app/api/analytics-event/route.ts`.

**Belongs:** GA4 wrappers, custom event helpers, analytics-event ingest handler.

**Does NOT belong:**

- Product KPIs (those are admin domain).
- Hotjar / Contentsquare scripts (`shared/observability/hotjar.ts` + `shared/ui/GtmScript.tsx`).
