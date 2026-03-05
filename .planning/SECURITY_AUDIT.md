# Security Hardening Plan - LoveIQ Web

**Audit Date:** 2026-01-15
**Auditor:** Security Review
**Status:** PARTIALLY IMPLEMENTED
**Last Updated:** 2026-03-05

---

## 1. THREAT MODEL

### 1.1 Assets

| Asset                     | Classification          | Location                          | Risk Level |
| ------------------------- | ----------------------- | --------------------------------- | ---------- |
| Waitlist emails           | PII / Business-Critical | Supabase `waitlist_signups` table | HIGH       |
| Contact form submissions  | PII                     | Resend email + Slack webhook      | MEDIUM     |
| Supabase service role key | Secret                  | `.env.local` / Vercel env vars    | CRITICAL   |
| Resend API key            | Secret                  | `.env.local` / Vercel env vars    | HIGH       |
| reCAPTCHA secret key      | Secret                  | `.env.local` / Vercel env vars    | MEDIUM     |
| Slack webhook URLs        | Secret                  | `.env.local` / Vercel env vars    | MEDIUM     |
| Google Analytics ID       | Public                  | `app/layout.tsx`                  | LOW        |
| Source code               | Intellectual Property   | Git repository                    | MEDIUM     |

### 1.2 Potential Attackers

| Attacker              | Motivation                            | Capability |
| --------------------- | ------------------------------------- | ---------- |
| Spammers/Bots         | Pollute waitlist, abuse email service | LOW-MEDIUM |
| Competitors           | Scrape waitlist data, DoS             | MEDIUM     |
| Malicious users       | XSS injection, data enumeration       | MEDIUM     |
| Supply chain attacker | Compromise dependencies               | HIGH       |
| Insider threat        | Data exfiltration                     | MEDIUM     |

### 1.3 Entry Points

| Entry Point          | Type            | Authentication                     | File Location                         |
| -------------------- | --------------- | ---------------------------------- | ------------------------------------- |
| `/api/waitlist` POST | Form submission | CSRF + rate-limited + honeypot     | `app/api/waitlist/route.ts`           |
| `/api/contact` POST  | Form submission | CSRF + reCAPTCHA v2 + rate-limited | `app/api/contact/route.ts`            |
| `/api/health` GET    | Health check    | None                               | `app/api/health/route.ts`             |
| Landing page forms   | Client UI       | None                               | `app/waitlist/page.tsx`               |
| Contact form         | Client UI       | reCAPTCHA widget                   | `components/about/ContactSection.tsx` |

---

## 2. DATA CLASSIFICATION

### 2.1 Data That Must NEVER Reach Client Bundle

| Data                         | Current Status | Risk if Exposed       |
| ---------------------------- | -------------- | --------------------- |
| `SUPABASE_SERVICE_ROLE_KEY`  | ✅ Server-only | Full DB access        |
| `RESEND_API_KEY`             | ✅ Server-only | Email abuse           |
| `RECAPTCHA_SECRET_KEY`       | ✅ Server-only | CAPTCHA bypass        |
| `SLACK_WAITLIST_WEBHOOK_URL` | ✅ Server-only | Notification spoofing |
| `SLACK_CONTACT_WEBHOOK_URL`  | ✅ Server-only | Notification spoofing |
| Waitlist email list          | ✅ Server-only | Privacy breach        |

### 2.2 Data Safe for Client

| Data                             | Location             | Justification                 |
| -------------------------------- | -------------------- | ----------------------------- |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | `ContactSection.tsx` | Required for reCAPTCHA widget |
| `NEXT_PUBLIC_SITE_URL`           | `layout.tsx`         | Public URL, no secret         |
| Google Analytics ID              | `layout.tsx`         | Public tracking ID            |

---

## 3. ATTACK SURFACE REVIEW

### 3.1 Client-Side Security

| Component                    | Finding             | Severity | Evidence                                         |
| ---------------------------- | ------------------- | -------- | ------------------------------------------------ |
| No `dangerouslySetInnerHTML` | ✅ SAFE             | N/A      | Grep search: no matches in `app/`, `components/` |
| No `eval()` usage            | ✅ SAFE             | N/A      | Only `window.setTimeout` in `HeroSection.tsx`    |
| No localStorage PII          | ✅ SAFE             | N/A      | No sensitive data stored                         |
| Client-side validation       | ⚠️ DEFENSE-IN-DEPTH | LOW      | Server validates with Zod - OK                   |

### 3.2 Server-Side / API Routes

#### `/api/waitlist/route.ts`

| Check               | Status             | Evidence                                         |
| ------------------- | ------------------ | ------------------------------------------------ |
| Input validation    | ✅ Zod schema      | `z.string().email().max(320)`                    |
| CSRF protection     | ✅ IMPLEMENTED     | `verifyCsrfToken()` from `lib/csrf.ts`           |
| Rate limiting       | ✅ Supabase-backed | `checkRateLimit()` from `lib/ratelimit.ts`       |
| Honeypot            | ✅ Present         | `website: z.string().max(0)`                     |
| Email normalization | ✅                 | `email.trim().toLowerCase()`                     |
| SQL injection       | ✅ No raw SQL      | Uses Supabase REST API with `encodeURIComponent` |
| Idempotency         | ✅                 | Prevents email enumeration                       |
| Error messages      | ✅ Generic         | No internal details leaked                       |
| PII masking (Slack) | ✅                 | Email masked in notifications                    |

#### `/api/contact/route.ts`

| Check               | Status             | Evidence               |
| ------------------- | ------------------ | ---------------------- |
| Input validation    | ✅ Zod schema      | All fields validated   |
| CSRF protection     | ✅ IMPLEMENTED     | `verifyCsrfToken()`    |
| Rate limiting       | ✅ Supabase-backed | `checkRateLimit()`     |
| CAPTCHA             | ✅ Server-verified | reCAPTCHA v2           |
| Message length      | ✅                 | Max 1000 chars         |
| Reply-To header     | ⚠️ RISK            | User email in reply-to |
| PII masking (Slack) | ❌ MISSING         | Phone/email unmasked   |

#### `/api/health/route.ts`

| Check                  | Status | Evidence             |
| ---------------------- | ------ | -------------------- |
| Information disclosure | ⚠️ LOW | Exposes service name |

### 3.3 Database Layer (Supabase)

| Check                  | Status          | Evidence                               |
| ---------------------- | --------------- | -------------------------------------- |
| Direct SQL             | ✅ SAFE         | Uses REST API, not raw SQL             |
| Query parameterization | ✅              | `encodeURIComponent()` used            |
| Service role key       | ⚠️ POWERFUL     | Bypasses RLS entirely                  |
| RLS policies           | ❓ UNKNOWN      | No evidence of RLS configuration       |
| Audit logging          | ⚠️ NOT VERIFIED | SECURITY.md mentions but not confirmed |

### 3.4 Third-Party Integrations

| Service          | Security Status         | Concerns                                                   |
| ---------------- | ----------------------- | ---------------------------------------------------------- |
| Supabase         | ✅ Secrets server-only  | RLS policy status unknown                                  |
| Resend           | ✅ Secrets server-only  | Email template properly escaped (`lib/emails/waitlist.ts`) |
| Slack webhooks   | ✅ Secrets server-only  | Contact form doesn't mask PII                              |
| reCAPTCHA        | ✅ Properly verified    | No score threshold (v2 checkbox)                           |
| Google Analytics | ✅ Public ID acceptable | No PII should be sent                                      |
| CookieYes        | ✅ External script      | Consent banner integration                                 |

### 3.5 Security Headers (`proxy.ts`)

| Header                 | Value                                          | Status                           |
| ---------------------- | ---------------------------------------------- | -------------------------------- |
| X-Frame-Options        | `DENY`                                         | ✅ Clickjacking protected        |
| X-Content-Type-Options | `nosniff`                                      | ✅ MIME-sniffing prevented       |
| Referrer-Policy        | `strict-origin-when-cross-origin`              | ✅ Good                          |
| HSTS                   | `max-age=63072000; includeSubDomains; preload` | ✅ 2-year preload                |
| frame-ancestors        | `'none'`                                       | ✅ Extra clickjacking protection |
| base-uri               | `'self'`                                       | ✅ Base tag injection prevented  |
| form-action            | `'self'`                                       | ✅ Form target restricted        |

### 3.6 Supply Chain / Dependencies

**NPM Audit Results:**

| Vulnerability      | Severity        | Package                         | Status                    |
| ------------------ | --------------- | ------------------------------- | ------------------------- |
| glob CLI injection | HIGH (CVSS 7.5) | `glob` via `eslint-config-next` | DEV-ONLY but needs update |

---

## 4. TOP RISKS WITH EVIDENCE

### CRITICAL Risks

_None currently open — CSP nonce implementation still recommended for defense-in-depth._

### HIGH Risks

#### RISK-H1: In-Memory Rate Limiting — IMPLEMENTED ✅

- **Status:** RESOLVED (2026-01)
- **Fix:** Supabase-backed persistent rate limiting in `lib/ratelimit.ts`
- **Verification:** Rate limits persist across server restarts/redeploys

#### RISK-H2: X-Forwarded-For Header Spoofing

- **Location:** `lib/ratelimit.ts`
- **Impact:** Attacker can bypass IP-based rate limiting by spoofing header
- **Mitigation:** Vercel automatically strips untrusted headers, but verification needed

#### RISK-H3: npm Dependency Vulnerability

- **Location:** `package.json` → `eslint-config-next` → `glob`
- **Evidence:** `npm audit` shows HIGH severity (CVSS 7.5) command injection
- **Impact:** Dev-only but could compromise build pipeline

### MEDIUM Risks

#### RISK-M1: User Email in Reply-To Header

- **Location:** `app/api/contact/route.ts`
- **Impact:** Could be used in email header injection attacks

#### RISK-M2: Unmasked PII in Slack Contact Notifications

- **Location:** `app/api/contact/route.ts`
- **Impact:** PII visible to anyone with Slack channel access

#### RISK-M3: No CSRF Tokens on State-Changing Endpoints — IMPLEMENTED ✅

- **Status:** RESOLVED (2026-01)
- **Fix:** Double-submit cookie pattern in `lib/csrf.ts`, cookie set by `proxy.ts`
- **Verification:** All form endpoints verify CSRF token

#### RISK-M4: Build Artifact in Git (`tmp_index.js`) — IMPLEMENTED ✅

- **Status:** RESOLVED (2026-01)
- **Fix:** Files removed from git, patterns added to `.gitignore`

#### RISK-M5: No Request Timeout on External Calls — IMPLEMENTED ✅

- **Status:** RESOLVED (2026-01)
- **Fix:** `lib/fetch-with-timeout.ts` provides fetch wrapper with configurable timeout

### LOW Risks

#### RISK-L1: Health Endpoint Information Disclosure

- **Location:** `app/api/health/route.ts`
- **Impact:** Minor reconnaissance value

#### RISK-L2: Hardcoded Fallback Email

- **Location:** `app/api/contact/route.ts`
- **Impact:** Source code reveals contact email (public anyway)

#### RISK-L3: No Subresource Integrity (SRI)

- **Location:** `app/layout.tsx`
- **Impact:** CDN compromise could inject malicious code

---

## 5. REMAINING REMEDIATION

### Open Items (from original plan)

#### Mask PII in Contact Slack Notifications (RISK-M2)

**File:** `app/api/contact/route.ts`
**Priority:** MEDIUM

#### Configure Supabase RLS Policies

**Location:** Supabase Dashboard
**Priority:** MEDIUM

#### Add Subresource Integrity (RISK-L3)

**File:** `app/layout.tsx`
**Priority:** LOW — GTM/GA may not support SRI due to dynamic content

---

## 6. SECURITY VERIFICATION CHECKLIST

| Check                 | Command/Test                   | Status                     |
| --------------------- | ------------------------------ | -------------------------- |
| CSP working           | Browser DevTools Console       | ✅ Verified                |
| Rate limit persists   | Deploy twice, test rate limit  | ✅ Supabase-backed         |
| CSRF protected        | Replay old form submission     | ✅ Double-submit cookie    |
| Secrets not in client | View page source / network tab | ✅ Server-only             |
| Dependencies clean    | `npm audit`                    | ⚠️ 1 dev-only HIGH         |
| Build artifacts clean | `git ls-files \| grep tmp`     | ✅ Cleaned                 |
| Fetch timeouts        | Slow network simulation        | ✅ `fetch-with-timeout.ts` |

---

## 7. ONGOING SECURITY REQUIREMENTS

All future changes MUST pass these checks:

1. **No secrets in client code** - Use only `NEXT_PUBLIC_*` for client-safe values
2. **All input validated server-side** - Never trust client validation alone
3. **No `dangerouslySetInnerHTML`** - If needed, sanitize with DOMPurify
4. **No `eval()` or `Function()`** - Block dynamic code execution
5. **Rate limiting on all POST endpoints** - Supabase-backed storage required
6. **CSRF on all state-changing endpoints** - `verifyCsrfToken()` required
7. **PII masked in logs/notifications** - No plain emails/phones in Slack
8. **Dependency audit on every PR** - `npm audit` in CI
9. **No build artifacts in git** - Only source code

---

_Document generated: 2026-01-15_
_Last updated: 2026-03-05_
