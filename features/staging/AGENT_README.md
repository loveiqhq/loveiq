# features/staging

**Purpose:** Staging-environment password gate at `/login`. Posts to `/api/staging-login` / `/api/staging-logout`.

**Entry:** `ui/StagingLoginForm.tsx` (form); routes are inline in `app/api/staging-login/route.ts` + `app/api/staging-logout/route.ts`.

**Belongs:** staging-gate UI + tests.

**Does NOT belong:** end-user authentication (this site has no end-user auth — staging gate only).
