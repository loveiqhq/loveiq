# API Reference

All API routes are under `/api/`. Mutation endpoints require a CSRF token sent as the `x-csrf-token` header, matching the `__csrf` cookie set by the middleware.

## POST /api/waitlist

Add an email to the waitlist.

**Rate limit:** 5 requests/minute per IP + 1 minute cooldown per email.

**Request body:**

```json
{
  "email": "user@example.com",
  "source": "landing-modal",
  "firstName": "Jane",
  "website": ""
}
```

| Field       | Type   | Required | Notes                                   |
| ----------- | ------ | -------- | --------------------------------------- |
| `email`     | string | Yes      | Valid email, max 320 chars              |
| `source`    | string | No       | Signup source identifier, max 120 chars |
| `firstName` | string | No       | Max 80 chars                            |
| `website`   | string | No       | Honeypot field — must be empty          |

**Responses:**

| Status | Body                                        | Meaning                                   |
| ------ | ------------------------------------------- | ----------------------------------------- |
| 200    | `{ "success": true }`                       | Signup successful                         |
| 200    | `{ "success": true, "already": true }`      | Email already on waitlist (idempotent)    |
| 400    | `{ "error": "Invalid input" }`              | Validation failed or honeypot triggered   |
| 403    | `{ "error": "Invalid request." }`           | CSRF token missing or invalid             |
| 429    | `{ "error": "Please try again later." }`    | Rate limited (check `Retry-After` header) |
| 503    | `{ "error": "Service unavailable." }`       | Backend configuration issue               |
| 500    | `{ "error": "Unable to process request." }` | Server error                              |

## POST /api/contact

Submit a contact form inquiry.

**Rate limit:** 5 requests/minute per IP. Requires reCAPTCHA v2.

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
| `firstName` | string | Yes      | 1-120 chars                 |
| `lastName`  | string | Yes      | 1-120 chars                 |
| `phone`     | string | Yes      | 4-40 chars                  |
| `email`     | string | Yes      | Valid email, max 320 chars  |
| `message`   | string | Yes      | 10-1000 chars               |
| `captcha`   | string | Yes      | reCAPTCHA v2 response token |

**Responses:**

| Status | Body                                                       | Meaning                       |
| ------ | ---------------------------------------------------------- | ----------------------------- |
| 200    | `{ "success": true }`                                      | Message sent                  |
| 400    | `{ "error": "Invalid input." }`                            | Validation failed             |
| 400    | `{ "error": "Captcha failed. Please try again." }`         | reCAPTCHA verification failed |
| 403    | `{ "error": "Invalid request." }`                          | CSRF token missing or invalid |
| 429    | `{ "error": "Please try again later." }`                   | Rate limited                  |
| 500    | `{ "error": "Unable to send message. Please try later." }` | Server error                  |
| 503    | `{ "error": "Service unavailable." }`                      | Missing configuration         |

## POST /api/survey

Submit a completed survey.

**Rate limit:** 3 requests/minute per IP + 5 minute cooldown per email.

**Request body:**

```json
{
  "email": "user@example.com",
  "firstName": "Jane",
  "answers": { "q1": "answer", "q2": ["a", "b"], "q3": 5 },
  "startedAt": "2026-01-01T00:00:00.000Z",
  "durationMs": 120000,
  "website": ""
}
```

| Field        | Type   | Required | Notes                                            |
| ------------ | ------ | -------- | ------------------------------------------------ |
| `email`      | string | Yes      | Valid email, max 320 chars                       |
| `firstName`  | string | Yes      | Max 80 chars                                     |
| `answers`    | object | Yes      | Record of question ID → string, string[], or 1–7 |
| `startedAt`  | string | Yes      | ISO 8601 datetime                                |
| `durationMs` | number | Yes      | Time taken in ms (0–86,400,000)                  |
| `website`    | string | No       | Honeypot field — must be empty                   |

**Responses:**

| Status | Body                                              | Meaning                                 |
| ------ | ------------------------------------------------- | --------------------------------------- |
| 200    | `{ "success": true }`                             | Survey submitted successfully           |
| 400    | `{ "error": "Invalid input" }`                    | Validation failed or honeypot triggered |
| 403    | `{ "error": "Invalid request." }`                 | CSRF token missing or invalid           |
| 429    | `{ "error": "Please try again later." }`          | IP rate limited                         |
| 429    | `{ "error": "Please wait before retrying." }`     | Email cooldown active                   |
| 503    | `{ "error": "Service unavailable." }`             | Missing Supabase configuration          |
| 503    | `{ "error": "Service temporarily unavailable." }` | Circuit breaker open                    |
| 500    | `{ "error": "Unable to process request." }`       | Supabase RPC error                      |

## POST /api/survey-tracking

Track survey behavior events (question transitions, time spent).

**Rate limit:** 10 requests/minute per IP.

**Request body:** Array of tracking events (question views, transitions, timing).

**Responses:**

| Status | Body                                        | Meaning                       |
| ------ | ------------------------------------------- | ----------------------------- |
| 200    | `{ "success": true }`                       | Events recorded               |
| 400    | `{ "error": "Invalid input" }`              | Validation failed             |
| 403    | `{ "error": "Invalid request." }`           | CSRF token missing or invalid |
| 429    | `{ "error": "Please try again later." }`    | Rate limited                  |
| 500    | `{ "error": "Unable to process request." }` | Server error                  |

## POST /api/invite

Send an invite email to a friend with a UTM-tagged survey link.

**Rate limit:** 5 requests/minute per IP.

**Request body:**

```json
{
  "recipientEmail": "friend@example.com",
  "referrerEmail": "user@example.com",
  "referrerName": "Jane"
}
```

| Field            | Type   | Required | Notes                      |
| ---------------- | ------ | -------- | -------------------------- |
| `recipientEmail` | string | Yes      | Valid email, max 320 chars |
| `referrerEmail`  | string | No       | Valid email, max 320 chars |
| `referrerName`   | string | No       | Max 100 chars              |

**Responses:**

| Status | Body                                     | Meaning                       |
| ------ | ---------------------------------------- | ----------------------------- |
| 200    | `{ "success": true }`                    | Invite queued for sending     |
| 400    | `{ "error": "Invalid input" }`           | Validation failed             |
| 403    | `{ "error": "Invalid request." }`        | CSRF token missing or invalid |
| 429    | `{ "error": "Please try again later." }` | Rate limited                  |
| 503    | `{ "error": "Service unavailable." }`    | Missing Resend configuration  |

**Note:** Email sending and Supabase tracking happen asynchronously after the response is returned (via `after()`).

## POST /api/invite-tracking

Track an invite share event (copy link, social share, etc.).

**Rate limit:** 10 requests/minute per IP.

**Request body:**

```json
{
  "method": "whatsapp",
  "referrerEmail": "user@example.com"
}
```

| Field           | Type   | Required | Notes                                                                                              |
| --------------- | ------ | -------- | -------------------------------------------------------------------------------------------------- |
| `method`        | string | Yes      | One of: `email`, `copy_link`, `whatsapp`, `twitter`, `facebook`, `sms`, `telegram`, `email_client` |
| `referrerEmail` | string | No       | Valid email, max 320 chars                                                                         |

**Responses:**

| Status | Body                                              | Meaning                       |
| ------ | ------------------------------------------------- | ----------------------------- |
| 200    | `{ "success": true }`                             | Event recorded                |
| 400    | `{ "error": "Invalid input" }`                    | Validation failed             |
| 403    | `{ "error": "Invalid request." }`                 | CSRF token missing or invalid |
| 429    | `{ "error": "Please try again later." }`          | Rate limited                  |
| 500    | `{ "error": "Unable to process request." }`       | Supabase insert failed        |
| 503    | `{ "error": "Service unavailable." }`             | Missing Supabase config       |
| 503    | `{ "error": "Service temporarily unavailable." }` | Circuit breaker open          |

## POST /api/survey-partial

Auto-save partial survey progress (draft). Uses upsert on `session_id`.

**Rate limit:** 20 requests/minute per IP. Supports CSRF token in body `_csrf` field for `sendBeacon` compatibility.

**Request body:**

```json
{
  "sessionId": "uuid-v4",
  "answers": { "q1": "answer", "q2": ["a", "b"] },
  "currentIndex": 5,
  "startedAt": "2026-01-01T00:00:00.000Z",
  "utmTracker": "utm_source=referral&...",
  "_csrf": "token"
}
```

| Field          | Type   | Required | Notes                                            |
| -------------- | ------ | -------- | ------------------------------------------------ |
| `sessionId`    | string | Yes      | UUID v4                                          |
| `answers`      | object | Yes      | Record of question ID → string, string[], or 1–7 |
| `currentIndex` | number | Yes      | Current question index (0–200)                   |
| `startedAt`    | string | Yes      | ISO 8601 datetime                                |
| `utmTracker`   | string | No       | UTM parameters string, max 500 chars             |
| `_csrf`        | string | No       | CSRF token (body fallback for sendBeacon)        |

**Responses:**

| Status | Body                                              | Meaning                       |
| ------ | ------------------------------------------------- | ----------------------------- |
| 200    | `{ "success": true }`                             | Draft saved                   |
| 400    | `{ "error": "Invalid input" }`                    | Validation failed             |
| 403    | `{ "error": "Invalid request." }`                 | CSRF token missing or invalid |
| 429    | `{ "error": "Please try again later." }`          | Rate limited                  |
| 500    | `{ "error": "Unable to process request." }`       | Supabase upsert failed        |
| 503    | `{ "error": "Service unavailable." }`             | Missing Supabase config       |
| 503    | `{ "error": "Service temporarily unavailable." }` | Circuit breaker open          |

## GET /api/health

Health check endpoint.

**Response:**

```json
{ "ok": true }
```

## Admin API Routes

All admin routes require an active Supabase Auth session (magic link authentication). Requests without a valid session return 401.

### POST /api/admin/login

Request a magic link email for admin login.

**Request body:**

```json
{ "email": "admin@example.com" }
```

**Responses:**

| Status | Body                                        | Meaning                            |
| ------ | ------------------------------------------- | ---------------------------------- |
| 200    | `{ "success": true }`                       | Magic link email sent              |
| 400    | `{ "error": "..." }`                        | Invalid email                      |
| 403    | `{ "error": "..." }`                        | Email not in admin_users allowlist |
| 429    | `{ "error": "Please try again later." }`    | Rate limited                       |
| 500    | `{ "error": "Unable to process request." }` | Server error                       |

### POST /api/admin/logout

End the admin session.

### GET /api/admin/stats

Dashboard analytics (total submissions, time-range stats, charts).

### GET /api/admin/submissions

Paginated submission list with optional filters.

### GET /api/admin/submissions/[id]

Single submission detail.

### PATCH /api/admin/submissions/[id]

Update submission metadata (status, notes).

### DELETE /api/admin/submissions/[id]

Delete a submission.

### POST /api/admin/export

Export submissions as CSV.

### POST /api/admin/survey-status

Toggle survey active/closed state.

### GET /api/admin/product-kpis

Product KPI data (question-level and chapter-level metrics computed from survey tracking data).

**Query params:**

| Param  | Type   | Required | Notes                                           |
| ------ | ------ | -------- | ----------------------------------------------- |
| `days` | number | No       | Filter to last N days (0 or omitted = all time) |

**Rate limit:** 30 requests/minute per IP.

**Responses:**

| Status | Body                                                                 | Meaning                |
| ------ | -------------------------------------------------------------------- | ---------------------- |
| 200    | `{ "reportSections": [...], "questions": [...], "chapters": [...] }` | KPI data               |
| 401    | `{ "error": "Unauthorized." }`                                       | No valid admin session |
| 403    | `{ "error": "Forbidden." }`                                          | Insufficient role      |
| 429    | `{ "error": "Please try again later." }`                             | Rate limited           |
| 500    | `{ "error": "Unable to load KPI data." }`                            | Supabase RPC error     |
