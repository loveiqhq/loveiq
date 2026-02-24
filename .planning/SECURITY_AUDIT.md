# Security Hardening Plan - LoveIQ Web

**Audit Date:** 2026-01-15
**Auditor:** Security Review
**Status:** AWAITING APPROVAL

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
| Google Analytics ID       | Public                  | `app/layout.tsx:115`              | LOW        |
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

| Entry Point          | Type            | Authentication                 | File Location                         |
| -------------------- | --------------- | ------------------------------ | ------------------------------------- |
| `/api/waitlist` POST | Form submission | None (rate-limited + honeypot) | `app/api/waitlist/route.ts:82`        |
| `/api/contact` POST  | Form submission | reCAPTCHA v2                   | `app/api/contact/route.ts:105`        |
| `/api/health` GET    | Health check    | None                           | `app/api/health/route.ts:3`           |
| Landing page forms   | Client UI       | None                           | `app/waitlist/page.tsx`               |
| Contact form         | Client UI       | reCAPTCHA widget               | `components/about/ContactSection.tsx` |

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

| Data                             | Location                | Justification                 |
| -------------------------------- | ----------------------- | ----------------------------- |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | `ContactSection.tsx:41` | Required for reCAPTCHA widget |
| `NEXT_PUBLIC_SITE_URL`           | `layout.tsx:6`          | Public URL, no secret         |
| Google Analytics ID              | `layout.tsx:115`        | Public tracking ID            |

---

## 3. ATTACK SURFACE REVIEW

### 3.1 Client-Side Security

| Component                    | Finding             | Severity | Evidence                                         |
| ---------------------------- | ------------------- | -------- | ------------------------------------------------ |
| No `dangerouslySetInnerHTML` | ✅ SAFE             | N/A      | Grep search: no matches in `app/`, `components/` |
| No `eval()` usage            | ✅ SAFE             | N/A      | Only `window.setTimeout` in `HeroSection.tsx:14` |
| No localStorage PII          | ✅ SAFE             | N/A      | No sensitive data stored                         |
| Client-side validation       | ⚠️ DEFENSE-IN-DEPTH | LOW      | Server validates with Zod - OK                   |

### 3.2 Server-Side / API Routes

#### `/api/waitlist/route.ts` (Lines 1-177)

| Check               | Status                          | Evidence                                         |
| ------------------- | ------------------------------- | ------------------------------------------------ |
| Input validation    | ✅ Zod schema (lines 16-21)     | `z.string().email().max(320)`                    |
| Rate limiting       | ⚠️ In-memory only (lines 26-27) | Resets on deploy/restart                         |
| Honeypot            | ✅ Present (line 20)            | `website: z.string().max(0)`                     |
| Email normalization | ✅ (line 95)                    | `email.trim().toLowerCase()`                     |
| SQL injection       | ✅ No raw SQL                   | Uses Supabase REST API with `encodeURIComponent` |
| Idempotency         | ✅ (lines 122-138)              | Prevents email enumeration                       |
| Error messages      | ✅ Generic                      | No internal details leaked                       |
| PII masking (Slack) | ✅ (line 60)                    | Email masked in notifications                    |

#### `/api/contact/route.ts` (Lines 1-149)

| Check               | Status                           | Evidence               |
| ------------------- | -------------------------------- | ---------------------- |
| Input validation    | ✅ Zod schema (lines 13-20)      | All fields validated   |
| Rate limiting       | ⚠️ In-memory only (line 11)      | Same issue as waitlist |
| CAPTCHA             | ✅ Server-verified (lines 36-66) | reCAPTCHA v2           |
| Message length      | ✅ (line 18)                     | Max 1000 chars         |
| Reply-To header     | ⚠️ RISK (line 130)               | User email in reply-to |
| PII masking (Slack) | ❌ MISSING (lines 81-86)         | Phone/email unmasked   |

#### `/api/health/route.ts` (Lines 1-6)

| Check                  | Status | Evidence                      |
| ---------------------- | ------ | ----------------------------- |
| Information disclosure | ⚠️ LOW | Exposes service name (line 4) |

### 3.3 Database Layer (Supabase)

| Check                  | Status          | Evidence                               |
| ---------------------- | --------------- | -------------------------------------- |
| Direct SQL             | ✅ SAFE         | Uses REST API, not raw SQL             |
| Query parameterization | ✅ (line 123)   | `encodeURIComponent()` used            |
| Service role key       | ⚠️ POWERFUL     | Bypasses RLS entirely                  |
| RLS policies           | ❓ UNKNOWN      | No evidence of RLS configuration       |
| Audit logging          | ⚠️ NOT VERIFIED | SECURITY.md mentions but not confirmed |

### 3.4 Third-Party Integrations

| Service          | Security Status         | Concerns                                                         |
| ---------------- | ----------------------- | ---------------------------------------------------------------- |
| Supabase         | ✅ Secrets server-only  | RLS policy status unknown                                        |
| Resend           | ✅ Secrets server-only  | Email template properly escaped (`lib/emails/waitlist.ts:76-83`) |
| Slack webhooks   | ✅ Secrets server-only  | Contact form doesn't mask PII                                    |
| reCAPTCHA        | ✅ Properly verified    | No score threshold (v2 checkbox)                                 |
| Google Analytics | ✅ Public ID acceptable | No PII should be sent                                            |

### 3.5 Security Headers (`next.config.js:15-46`)

| Header                 | Value                                          | Status                           |
| ---------------------- | ---------------------------------------------- | -------------------------------- |
| X-Frame-Options        | `DENY`                                         | ✅ Clickjacking protected        |
| X-Content-Type-Options | `nosniff`                                      | ✅ MIME-sniffing prevented       |
| Referrer-Policy        | `strict-origin-when-cross-origin`              | ✅ Good                          |
| HSTS                   | `max-age=63072000; includeSubDomains; preload` | ✅ 2-year preload                |
| frame-ancestors        | `'none'`                                       | ✅ Extra clickjacking protection |
| base-uri               | `'self'`                                       | ✅ Base tag injection prevented  |
| form-action            | `'self'`                                       | ✅ Form target restricted        |
| **CSP script-src**     | `'unsafe-inline'`                              | ❌ **WEAKENS XSS PROTECTION**    |
| **CSP style-src**      | `'unsafe-inline'`                              | ⚠️ Common but suboptimal         |

### 3.6 Supply Chain / Dependencies

**NPM Audit Results:**

| Vulnerability      | Severity        | Package                         | Status                    |
| ------------------ | --------------- | ------------------------------- | ------------------------- |
| glob CLI injection | HIGH (CVSS 7.5) | `glob` via `eslint-config-next` | DEV-ONLY but needs update |

**Suspicious Files:**

| File           | Issue                                                     | Severity |
| -------------- | --------------------------------------------------------- | -------- |
| `tmp_index.js` | Build artifact tracked in git (14,000+ lines minified JS) | MEDIUM   |

---

## 4. TOP RISKS WITH EVIDENCE

### CRITICAL Risks

#### RISK-C1: CSP `'unsafe-inline'` Allows XSS Bypass

- **Location:** `next.config.js:32`
- **Evidence:** `script-src 'self' 'unsafe-inline'...`
- **Impact:** Any XSS vulnerability can execute arbitrary JavaScript
- **Root Cause:** Google Analytics inline script in `app/layout.tsx:117-124`

### HIGH Risks

#### RISK-H1: In-Memory Rate Limiting

- **Location:** `app/api/waitlist/route.ts:26-27`, `app/api/contact/route.ts:11`
- **Evidence:**
  ```typescript
  const ipHits = new Map<string, number[]>();
  const emailLast = new Map<string, number>();
  ```
- **Impact:** Rate limits reset on server restart/redeploy, enabling abuse bursts
- **Attack:** Attacker monitors for deployments, then floods during reset window

#### RISK-H2: X-Forwarded-For Header Spoofing

- **Location:** `app/api/waitlist/route.ts:29-33`
- **Evidence:**
  ```typescript
  const getClientIp = (req: Request) => {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  ```
- **Impact:** Attacker can bypass IP-based rate limiting by spoofing header
- **Mitigation:** Vercel automatically strips untrusted headers, but verification needed

#### RISK-H3: npm Dependency Vulnerability

- **Location:** `package.json:24` → `eslint-config-next` → `glob`
- **Evidence:** `npm audit` shows HIGH severity (CVSS 7.5) command injection
- **Impact:** Dev-only but could compromise build pipeline

### MEDIUM Risks

#### RISK-M1: User Email in Reply-To Header

- **Location:** `app/api/contact/route.ts:130`
- **Evidence:**
  ```typescript
  await resend.emails.send({
    from,
    to: contactToEmail,
    replyTo: email,  // User-controlled
  ```
- **Impact:** Could be used in email header injection attacks
- **Attack:** Malicious user submits email with newlines/headers

#### RISK-M2: Unmasked PII in Slack Contact Notifications

- **Location:** `app/api/contact/route.ts:81-86`
- **Evidence:**
  ```typescript
  `• *Email:* ${payload.email}\n` +
  (payload.phone ? `• *Phone:* ${payload.phone}\n` : "") +
  ```
- **Impact:** PII visible to anyone with Slack channel access
- **Contrast:** Waitlist route masks email at line 60

#### RISK-M3: No CSRF Tokens on State-Changing Endpoints

- **Location:** Both API routes
- **Evidence:** No CSRF token validation
- **Mitigation:** SameSite cookie defaults + CSP form-action help, but explicit tokens recommended

#### RISK-M4: Build Artifact in Git (`tmp_index.js`)

- **Location:** Repository root
- **Evidence:** `git ls-files --cached | grep tmp_index.js` returns match
- **Impact:** Repository bloat, potential secret exposure in bundled code

#### RISK-M5: No Request Timeout on External Calls

- **Location:** `app/api/contact/route.ts:48-53` (reCAPTCHA verify)
- **Evidence:** `fetch()` without timeout
- **Impact:** Slow external service could hang API response

### LOW Risks

#### RISK-L1: Health Endpoint Information Disclosure

- **Location:** `app/api/health/route.ts:4`
- **Evidence:** `{ ok: true, service: "loveiq", ts: new Date().toISOString() }`
- **Impact:** Minor reconnaissance value

#### RISK-L2: Hardcoded Fallback Email

- **Location:** `app/api/contact/route.ts:7`
- **Evidence:** `const contactToEmail = process.env.CONTACT_TO_EMAIL || "hello@loveiq.org";`
- **Impact:** Source code reveals contact email (public anyway)

#### RISK-L3: No Subresource Integrity (SRI)

- **Location:** `app/layout.tsx:115`
- **Evidence:** External scripts loaded without integrity hashes
- **Impact:** CDN compromise could inject malicious code

---

## 5. REMEDIATION PLAN

### Phase 1: CRITICAL (Immediate - Before Next Deploy)

#### 1.1 Remove `'unsafe-inline'` from CSP

**File:** `next.config.js:32`
**Change:**

```javascript
// Before
`script-src 'self' 'unsafe-inline'...`;

// After - use nonce-based CSP
// 1. Create middleware to generate nonce
// 2. Pass nonce to Script components
// 3. CSP becomes: `script-src 'self' 'nonce-{generated}'...`
```

**Verification:** Browser console shows no CSP violations; XSS test payloads are blocked

#### 1.2 Update Vulnerable Dependencies

**File:** `package.json`
**Change:**

```bash
npm update eslint-config-next
# OR for major version:
npm install eslint-config-next@latest
```

**Verification:** `npm audit` shows 0 high/critical vulnerabilities

#### 1.3 Remove Build Artifact from Git

**Files:** `tmp_index.js`, `.gitignore`
**Change:**

```bash
# Add to .gitignore
tmp_index.js
tmp_*.js

# Remove from git (keep local)
git rm --cached tmp_index.js
git commit -m "chore: remove build artifact from version control"
```

**Verification:** `git ls-files | grep tmp_index` returns no results

---

### Phase 2: HIGH (Within 1 Week)

#### 2.1 Implement Persistent Rate Limiting

**File:** `app/api/waitlist/route.ts`, `app/api/contact/route.ts`
**Change:** Replace in-memory Map with Supabase-backed rate limiting

```typescript
// Create new file: lib/ratelimit.ts
// Use Supabase to store rate limit hits
// Alternative: Use Vercel KV or Upstash Redis

async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const { data, error } = await supabase
    .from("rate_limits")
    .select("hits, window_start")
    .eq("key", key)
    .single();
  // ... implement sliding window logic
}
```

**Verification:** Rate limit persists across server restarts; test with multiple deploys

#### 2.2 Validate X-Forwarded-For Header

**File:** `app/api/waitlist/route.ts:29-33`, `app/api/contact/route.ts:22-25`
**Change:**

```typescript
// Use Vercel's recommended approach
const getClientIp = (req: Request) => {
  // Vercel sets x-real-ip from the client
  // x-forwarded-for can contain proxy chain - use last trusted value
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    // In Vercel, first IP is the actual client
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return "unknown";
};
```

**Verification:** Test with curl spoofed headers; verify rate limiting still works

#### 2.3 Mask PII in Contact Slack Notifications

**File:** `app/api/contact/route.ts:81-86`
**Change:**

```typescript
const maskedEmail = payload.email.replace(/^(.).+(@.+)$/, "$1***$2");
const maskedPhone = payload.phone
  ? payload.phone.slice(0, 3) + "***" + payload.phone.slice(-2)
  : null;

const text =
  `📩 *New contact request*\n` +
  `• *Name:* ${payload.firstName} ${payload.lastName}\n` +
  `• *Email:* ${maskedEmail}\n` +
  (maskedPhone ? `• *Phone:* ${maskedPhone}\n` : "") +
  `• *Message:* ${payload.message.slice(0, 100)}${payload.message.length > 100 ? "..." : ""}`;
```

**Verification:** Check Slack channel; PII is masked

#### 2.4 Sanitize Reply-To Header

**File:** `app/api/contact/route.ts:130`
**Change:**

```typescript
// Sanitize email before using in header
const sanitizedReplyTo = email.replace(/[\r\n]/g, "").trim();
// Or use a fixed reply-to and store user email in body
```

**Verification:** Test with email containing newlines; verify rejection

---

### Phase 3: MEDIUM (Within 1 Month)

#### 3.1 Add Request Timeouts

**File:** `app/api/contact/route.ts:48-53`
**Change:**

```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 5000);

try {
  const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    signal: controller.signal,
    cache: "no-store",
  });
  clearTimeout(timeoutId);
  // ... rest of handler
} catch (err) {
  if (err.name === "AbortError") {
    return NextResponse.json({ error: "Service timeout" }, { status: 503 });
  }
  throw err;
}
```

**Verification:** Simulate slow network; verify timeout behavior

#### 3.2 Implement CSRF Protection

**Files:** Create `lib/csrf.ts`, update API routes
**Change:**

- Generate CSRF token on page load (stored in session/cookie)
- Include token in form submission
- Validate token server-side
- Next.js 14+ has built-in Server Actions with CSRF protection - consider migration

**Verification:** Replay attack with old/missing token fails

#### 3.3 Configure Supabase RLS Policies

**Location:** Supabase Dashboard
**Change:**

```sql
-- Create RLS policies for waitlist_signups table
ALTER TABLE waitlist_signups ENABLE ROW LEVEL SECURITY;

-- Service role can insert
CREATE POLICY "Service can insert waitlist" ON waitlist_signups
  FOR INSERT TO service_role
  WITH CHECK (true);

-- Service role can select for idempotency check
CREATE POLICY "Service can select waitlist" ON waitlist_signups
  FOR SELECT TO service_role
  USING (true);

-- No delete/update for anyone
```

**Verification:** Test direct API access with anon key fails; service role works

#### 3.4 Add Request Logging/Monitoring

**Files:** Create middleware
**Change:**

```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const ip = request.ip || request.headers.get("x-real-ip");
  const path = request.nextUrl.pathname;

  // Log to your monitoring service
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      ip,
      path,
      method: request.method,
      userAgent: request.headers.get("user-agent"),
    })
  );

  return NextResponse.next();
}
```

**Verification:** Check Vercel logs; requests are logged

#### 3.5 Add Subresource Integrity (SRI)

**File:** `app/layout.tsx:115`
**Change:**

```tsx
// Calculate integrity hash for Google Analytics
// Note: GTM/GA may not support SRI due to dynamic content
// Consider self-hosting analytics.js with pinned version
```

**Verification:** Browser loads scripts only with matching hash

---

### Phase 4: LOW (Ongoing Maintenance)

#### 4.1 Simplify Health Endpoint

**File:** `app/api/health/route.ts`
**Change:**

```typescript
export async function GET() {
  return NextResponse.json({ ok: true });
}
```

**Verification:** Response contains only `{ ok: true }`

#### 4.2 Remove Hardcoded Fallback

**File:** `app/api/contact/route.ts:7`
**Change:**

```typescript
const contactToEmail = process.env.CONTACT_TO_EMAIL;
if (!contactToEmail) {
  console.error("CONTACT_TO_EMAIL not configured");
  return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
}
```

**Verification:** Missing env var returns 503, not hardcoded email

#### 4.3 Regular Security Audits

**Process:**

- Run `npm audit` in CI/CD pipeline
- Block deploys on high/critical vulnerabilities
- Quarterly dependency updates
- Annual penetration testing

---

## 6. SECURITY VERIFICATION CHECKLIST

After implementing all changes, verify:

| Check                 | Command/Test                                 | Expected Result                 |
| --------------------- | -------------------------------------------- | ------------------------------- |
| CSP working           | Browser DevTools Console                     | No CSP violations on normal use |
| XSS blocked           | Submit `<script>alert(1)</script>` in forms  | Script not executed             |
| Rate limit persists   | Deploy twice, test rate limit                | Limits carry over               |
| IP spoofing blocked   | `curl -H "X-Forwarded-For: fake"` + requests | Still rate limited              |
| CSRF protected        | Replay old form submission                   | Rejected                        |
| Secrets not in client | View page source / network tab               | No secrets visible              |
| Slack PII masked      | Submit contact form                          | Email/phone masked              |
| Dependencies clean    | `npm audit`                                  | 0 high/critical                 |
| Build artifacts clean | `git ls-files \| grep tmp`                   | No results                      |

---

## 7. ONGOING SECURITY REQUIREMENTS

All future changes MUST pass these checks:

1. **No secrets in client code** - Use only `NEXT_PUBLIC_*` for client-safe values
2. **All input validated server-side** - Never trust client validation alone
3. **No `dangerouslySetInnerHTML`** - If needed, sanitize with DOMPurify
4. **No `eval()` or `Function()`** - Block dynamic code execution
5. **CSP nonce for inline scripts** - No `'unsafe-inline'`
6. **Rate limiting on all POST endpoints** - Persistent storage required
7. **PII masked in logs/notifications** - No plain emails/phones in Slack
8. **Dependency audit on every PR** - `npm audit` in CI
9. **No build artifacts in git** - Only source code

---

## APPROVAL REQUEST

This security audit identifies **1 critical**, **3 high**, **5 medium**, and **3 low** severity issues.

**Recommended immediate actions:**

1. Update npm dependencies to fix HIGH vulnerability
2. Remove `tmp_index.js` from git
3. Plan CSP nonce implementation

**Request:** Please review this plan and reply "GO" to proceed with implementation, or provide feedback on priorities/scope.

---

_Document generated: 2026-01-15_
