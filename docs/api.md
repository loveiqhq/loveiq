# Public API Reference

> Owner: CODEOWNERS default
> Last verified: 2026-04-05
> Verified against: `app/api/**/route.ts` outside `app/api/admin/**`

All routes in this document live under `/api/` and exclude the authenticated admin surface. Mutating routes require a CSRF token in the `x-csrf-token` header unless the route explicitly supports a body fallback for `sendBeacon`.

Survey product-flow details such as step orchestration, storage, autosave, and retry behavior live in [survey.md](survey.md).

## Route Inventory

| Route                                 | Methods     | Notes                                                                                |
| ------------------------------------- | ----------- | ------------------------------------------------------------------------------------ |
| `/api/contact`                        | `POST`      | Contact form submission.                                                             |
| `/api/cron/invite-reminders`          | `GET`       | Scheduled job: send invite reminder emails. Authenticated via `CRON_SECRET`.         |
| `/api/cron/payment-fulfillment-sweep` | `GET`       | Scheduled job: rescue paid-but-locked reports. Authenticated via `CRON_SECRET`.      |
| `/api/cron/report-discount-email`     | `GET`       | Scheduled job: send report-pricing discount nudges. Authenticated via `CRON_SECRET`. |
| `/api/cron/survey-paused`             | `GET`       | Scheduled job: nudge users who paused the survey. Authenticated via `CRON_SECRET`.   |
| `/api/analytics-event`                | `POST`      | Persist allowlisted report-engagement events to `analytics_event` (FK-validated).    |
| `/api/health`                         | `GET`       | Service health check with dependency status.                                         |
| `/api/invite`                         | `POST`      | Invite email request with async delivery/tracking.                                   |
| `/api/invite-tracking`                | `POST`      | Invite share tracking.                                                               |
| `/api/price`                          | `GET`       | Returns the dynamic price quote for a viewer's session.                              |
| `/api/report`                         | `GET`       | Returns the personal report payload for a token or session ID.                       |
| `/api/report-feedback`                | `POST`      | Records thumbs-up / thumbs-down feedback per report section.                         |
| `/api/report/share`                   | `GET, POST` | Lists or creates report-share grants for the report owner.                           |
| `/api/report/share/[id]`              | `DELETE`    | Revokes a single report-share grant by ID.                                           |
| `/api/report/share/verify`            | `POST`      | Validates a share token + recipient email; sets the share viewer cookie.             |
| `/api/staging-login`                  | `POST`      | Password gate login for staging.                                                     |
| `/api/staging-logout`                 | `POST`      | Clears the staging cookie and redirects to `/login`.                                 |
| `/api/stripe/checkout-session`        | `POST`      | Creates a Stripe Checkout session for a report purchase plan.                        |
| `/api/stripe/checkout-session-status` | `GET`       | Polls the status of a Stripe Checkout session and the user's resulting access plan.  |
| `/api/stripe/webhook`                 | `POST`      | Stripe webhook receiver. Verified via Stripe signature header (no CSRF).             |
| `/api/survey`                         | `POST`      | Completed survey submission.                                                         |
| `/api/survey-partial`                 | `POST`      | Partial survey autosave.                                                             |
| `/api/survey-tracking`                | `POST`      | Survey behavior event batch ingest.                                                  |
| `/api/waitlist`                       | `POST`      | Waitlist signup with async email and Slack notification.                             |

## Shared Behavior

- `POST` routes use IP-based rate limiting and return `Retry-After` on `429`.
- `POST /api/survey-partial` and `POST /api/survey-tracking` also accept `_csrf` in the request body for `sendBeacon` compatibility.
- `POST /api/invite` returns success before downstream email delivery and tracking complete. The side effects run after the response.

## POST /api/waitlist

Adds an email to the waitlist.

**Rate limit:** 5 requests per minute per IP, plus a 1 minute cooldown per email.

**Request body:**

```json
{
  "email": "user@example.com",
  "source": "landing-modal",
  "firstName": "Jane",
  "website": "",
  "utmTracker": "{\"utm_source\":\"newsletter\"}"
}
```

| Field        | Type   | Required | Notes                                                                  |
| ------------ | ------ | -------- | ---------------------------------------------------------------------- |
| `email`      | string | Yes      | Valid email, max 320 chars.                                            |
| `source`     | string | No       | Source label, max 120 chars. Defaults to `landing-modal` when omitted. |
| `firstName`  | string | No       | Max 80 chars.                                                          |
| `website`    | string | No       | Honeypot field and must stay empty.                                    |
| `utmTracker` | string | No       | JSON string stored when it parses successfully. Max 500 chars.         |

**Responses:**

| Status | Body                                              | Meaning                                                         |
| ------ | ------------------------------------------------- | --------------------------------------------------------------- |
| 200    | `{ "success": true }`                             | Signup saved.                                                   |
| 200    | `{ "success": true, "already": true }`            | Email already existed or a concurrent insert won the race.      |
| 400    | `{ "error": "Invalid input" }`                    | Validation failed or honeypot was filled.                       |
| 403    | `{ "error": "Invalid request." }`                 | Missing or invalid CSRF token.                                  |
| 429    | `{ "error": "Please try again later." }`          | IP rate limit hit.                                              |
| 429    | `{ "error": "Please wait before retrying." }`     | Email cooldown still active.                                    |
| 500    | `{ "error": "Unable to process request." }`       | Supabase request failed after configuration checks passed.      |
| 503    | `{ "error": "Service unavailable." }`             | Required Supabase config is missing.                            |
| 503    | `{ "error": "Service temporarily unavailable." }` | Supabase circuit breaker is open or the backend is unavailable. |

## POST /api/contact

Submits a contact request. The route verifies reCAPTCHA before sending email.

**Rate limit:** 5 requests per minute per IP.

**Request body:**

```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "phone": "+1234567890",
  "email": "user@example.com",
  "message": "I'd like to learn more about LoveIQ.",
  "captcha": "reCAPTCHA-response-token"
}
```

| Field       | Type   | Required | Notes                       |
| ----------- | ------ | -------- | --------------------------- |
| `firstName` | string | Yes      | 1 to 120 chars.             |
| `lastName`  | string | Yes      | 1 to 120 chars.             |
| `phone`     | string | Yes      | 4 to 40 chars.              |
| `email`     | string | Yes      | Valid email, max 320 chars. |
| `message`   | string | Yes      | 10 to 1000 chars.           |
| `captcha`   | string | Yes      | reCAPTCHA response token.   |

**Responses:**

| Status | Body                                                       | Meaning                                        |
| ------ | ---------------------------------------------------------- | ---------------------------------------------- |
| 200    | `{ "success": true }`                                      | Email accepted and queued to send.             |
| 400    | `{ "error": "Invalid input." }`                            | Validation failed.                             |
| 400    | `{ "error": "Captcha failed. Please try again." }`         | reCAPTCHA verification failed.                 |
| 400    | `{ "error": "Invalid email format." }`                     | Header-injection-safe email validation failed. |
| 403    | `{ "error": "Invalid request." }`                          | Missing or invalid CSRF token.                 |
| 429    | `{ "error": "Please try again later." }`                   | IP rate limit hit.                             |
| 500    | `{ "error": "Unable to send message. Please try later." }` | Resend failed or timed out.                    |
| 503    | `{ "error": "Service unavailable." }`                      | `CONTACT_TO_EMAIL` is missing.                 |

## POST /api/survey

Submits a completed survey and schedules downstream scoring/notification work after the response.

**Rate limit:** 3 requests per minute per IP, plus a 5 minute cooldown per email.

**Request body:**

```json
{
  "email": "user@example.com",
  "firstName": "Jane",
  "answers": { "q1": "answer", "q2": ["a", "b"], "q3": 5 },
  "startedAt": "2026-01-01T00:00:00.000Z",
  "durationMs": 120000,
  "utmTracker": "{\"utm_source\":\"referral\"}",
  "sessionId": "11111111-1111-1111-1111-111111111111",
  "website": ""
}
```

| Field        | Type   | Required | Notes                                                             |
| ------------ | ------ | -------- | ----------------------------------------------------------------- |
| `email`      | string | Yes      | Valid email, max 320 chars.                                       |
| `firstName`  | string | Yes      | Max 80 chars.                                                     |
| `answers`    | object | Yes      | Record of question ID to string, string array, or integer 1 to 7. |
| `startedAt`  | string | Yes      | ISO 8601 datetime.                                                |
| `durationMs` | number | Yes      | Integer from `0` to `86,400,000`.                                 |
| `utmTracker` | string | No       | Max 500 chars.                                                    |
| `sessionId`  | string | No       | UUID-like submission/session identifier.                          |
| `website`    | string | No       | Honeypot field and must stay empty.                               |

**Responses:**

| Status | Body                                                                          | Meaning                                                 |
| ------ | ----------------------------------------------------------------------------- | ------------------------------------------------------- |
| 200    | `{ "success": true }`                                                         | Submission accepted.                                    |
| 200    | `{ "success": true, "primaryArchetype": "..." }`                              | Submission accepted with scoring metadata included.     |
| 200    | `{ "success": true, "primaryArchetype": "...", "v5PrimaryArchetype": "..." }` | Submission accepted with both scoring outputs included. |
| 400    | `{ "error": "Invalid input" }`                                                | Validation failed or honeypot was filled.               |
| 403    | `{ "error": "Invalid request." }`                                             | Missing or invalid CSRF token.                          |
| 429    | `{ "error": "Please try again later." }`                                      | IP rate limit hit.                                      |
| 429    | `{ "error": "Please wait before retrying." }`                                 | Email cooldown still active.                            |
| 500    | `{ "error": "Unable to process request." }`                                   | Survey RPC failed after configuration checks passed.    |
| 503    | `{ "error": "Service unavailable." }`                                         | Required Supabase config is missing.                    |
| 503    | `{ "error": "Service temporarily unavailable." }`                             | Backend submission path is temporarily unavailable.     |

## POST /api/survey-partial

Autosaves partial survey progress using an upsert keyed by `sessionId`.

**Rate limit:** 20 requests per minute per IP.

**Request body:**

```json
{
  "sessionId": "11111111-1111-1111-1111-111111111111",
  "answers": { "q1": "answer", "q2": ["a", "b"] },
  "currentIndex": 5,
  "startedAt": "2026-01-01T00:00:00.000Z",
  "utmTracker": "utm_source=referral",
  "_csrf": "token"
}
```

| Field          | Type   | Required | Notes                                                             |
| -------------- | ------ | -------- | ----------------------------------------------------------------- |
| `sessionId`    | string | Yes      | UUID.                                                             |
| `answers`      | object | Yes      | Record of question ID to string, string array, or integer 1 to 7. |
| `currentIndex` | number | Yes      | Integer from `0` to `200`.                                        |
| `startedAt`    | string | Yes      | ISO 8601 datetime.                                                |
| `utmTracker`   | string | No       | Max 500 chars.                                                    |
| `_csrf`        | string | No       | Body fallback for `sendBeacon` when the header is not available.  |

**Responses:**

| Status | Body                                              | Meaning                                                   |
| ------ | ------------------------------------------------- | --------------------------------------------------------- |
| 200    | `{ "success": true }`                             | Draft saved.                                              |
| 400    | `{ "error": "Invalid input" }`                    | Validation failed.                                        |
| 403    | `{ "error": "Invalid request." }`                 | CSRF validation failed in both header and body fallback.  |
| 429    | `{ "error": "Please try again later." }`          | IP rate limit hit.                                        |
| 500    | `{ "error": "Unable to process request." }`       | Supabase upsert failed after configuration checks passed. |
| 503    | `{ "error": "Service unavailable." }`             | Required Supabase config is missing.                      |
| 503    | `{ "error": "Service temporarily unavailable." }` | Partial-save backend is temporarily unavailable.          |

## POST /api/survey-tracking

Stores a batch of survey behavior events.

**Rate limit:** 30 requests per minute per IP.

**Request body:**

```json
{
  "events": [
    {
      "sessionId": "11111111-1111-1111-1111-111111111111",
      "qId": "q1",
      "chapter": "Attraction",
      "questionIndex": 0,
      "timeSpentMs": 3200,
      "answered": true,
      "direction": "forward",
      "timestamp": "2026-01-01T00:00:00.000Z"
    }
  ],
  "_csrf": "token"
}
```

**Responses:**

| Status | Body                                              | Meaning                                                   |
| ------ | ------------------------------------------------- | --------------------------------------------------------- |
| 200    | `{ "success": true }`                             | Events recorded.                                          |
| 400    | `{ "error": "Invalid input" }`                    | Validation failed.                                        |
| 403    | `{ "error": "Invalid request." }`                 | CSRF validation failed in both header and body fallback.  |
| 429    | `{ "error": "Please try again later." }`          | IP rate limit hit.                                        |
| 500    | `{ "error": "Unable to process request." }`       | Supabase insert failed after configuration checks passed. |
| 503    | `{ "error": "Service unavailable." }`             | Required Supabase config is missing.                      |
| 503    | `{ "error": "Service temporarily unavailable." }` | Tracking backend is temporarily unavailable.              |

## POST /api/invite

Queues an invite email and related tracking side effects.

**Rate limit:** 5 requests per minute per IP.

**Request body:**

```json
{
  "recipientEmail": "friend@example.com",
  "referrerEmail": "user@example.com",
  "referrerName": "Jane"
}
```

| Field            | Type   | Required | Notes                                                           |
| ---------------- | ------ | -------- | --------------------------------------------------------------- |
| `recipientEmail` | string | Yes      | Valid email, max 320 chars.                                     |
| `referrerEmail`  | string | No       | Valid email, max 320 chars. Used to build referral attribution. |
| `referrerName`   | string | No       | Max 100 chars.                                                  |

**Responses:**

| Status | Body                                     | Meaning                               |
| ------ | ---------------------------------------- | ------------------------------------- |
| 200    | `{ "success": true }`                    | Invite accepted for async processing. |
| 400    | `{ "error": "Invalid input" }`           | Validation failed.                    |
| 403    | `{ "error": "Invalid request." }`        | Missing or invalid CSRF token.        |
| 429    | `{ "error": "Please try again later." }` | IP rate limit hit.                    |
| 503    | `{ "error": "Service unavailable." }`    | `RESEND_API_KEY` is missing.          |

## POST /api/invite-tracking

Tracks a share action for the invite flow.

**Rate limit:** 10 requests per minute per IP.

**Request body:**

```json
{
  "method": "whatsapp",
  "referrerEmail": "user@example.com"
}
```

| Field           | Type   | Required | Notes                                                                                              |
| --------------- | ------ | -------- | -------------------------------------------------------------------------------------------------- |
| `method`        | string | Yes      | One of `email`, `copy_link`, `whatsapp`, `twitter`, `facebook`, `sms`, `telegram`, `email_client`. |
| `referrerEmail` | string | No       | Valid email, max 320 chars.                                                                        |

**Responses:**

| Status | Body                                              | Meaning                                                   |
| ------ | ------------------------------------------------- | --------------------------------------------------------- |
| 200    | `{ "success": true }`                             | Event recorded.                                           |
| 400    | `{ "error": "Invalid input" }`                    | Validation failed.                                        |
| 403    | `{ "error": "Invalid request." }`                 | Missing or invalid CSRF token.                            |
| 429    | `{ "error": "Please try again later." }`          | IP rate limit hit.                                        |
| 500    | `{ "error": "Unable to process request." }`       | Supabase insert failed after configuration checks passed. |
| 503    | `{ "error": "Service unavailable." }`             | Required Supabase config is missing.                      |
| 503    | `{ "error": "Service temporarily unavailable." }` | Tracking backend is temporarily unavailable.              |

## POST /api/staging-login

Creates a `staging_session` cookie when the submitted password matches `STAGING_PASSWORD`.

**Rate limit:** 5 requests per minute per IP.

**Request body:**

```json
{
  "password": "secret-password"
}
```

**Responses:**

| Status | Body                                     | Meaning                                                             |
| ------ | ---------------------------------------- | ------------------------------------------------------------------- |
| 200    | `{ "success": true }`                    | Authenticated and `staging_session` cookie set.                     |
| 400    | `{ "error": "Invalid input." }`          | Password missing or not a string.                                   |
| 401    | `{ "error": "Incorrect password." }`     | Password did not match.                                             |
| 403    | `{ "error": "Invalid request." }`        | Missing or invalid CSRF token.                                      |
| 404    | `{ "error": "Not found." }`              | Staging protection is disabled because `STAGING_PASSWORD` is unset. |
| 429    | `{ "error": "Please try again later." }` | IP rate limit hit.                                                  |

## POST /api/staging-logout

Clears the `staging_session` cookie and redirects to `/login`.

## GET /api/health

Returns a lightweight health payload for core dependencies.

**Healthy response:**

```json
{
  "ok": true,
  "checks": {
    "supabase": "ok",
    "resend": "configured",
    "env": "ok"
  }
}
```

**Degraded response example:**

```json
{
  "ok": false,
  "checks": {
    "supabase": "error",
    "resend": "unconfigured",
    "env": "missing: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY"
  }
}
```

**Status behavior:**

- Returns `200` only when all required env vars are present and Supabase is reachable.
- Returns `503` for missing required env vars or Supabase connectivity failures.
