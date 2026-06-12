import { createHmac, timingSafeEqual } from "crypto";

// [Audit L5] New tokens embed a base36 creation timestamp and expire after this
// window, so a leaked/archived unsubscribe link can't be replayed forever.
// Long enough that legitimate mail-client one-click unsubscribe still works on
// recent sends; short enough to bound stale-archive replay.
const TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

function safeEqual(expectedB64: string, actualB64: string): boolean {
  const expected = Buffer.from(expectedB64);
  const actual = Buffer.from(actualB64);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export function generateUnsubscribeToken(email: string, secret: string): string {
  const encoded = Buffer.from(email).toString("base64url");
  const ts = Date.now().toString(36);
  const sig = sign(`${email}:${ts}`, secret);
  return `${encoded}.${ts}.${sig}`;
}

export function verifyUnsubscribeToken(token: string, secret: string): string | null {
  // base64url (email), base36 (ts) and base64url (sig) never contain ".", so
  // splitting on "." is unambiguous.
  const parts = token.split(".");
  try {
    if (parts.length === 3) {
      // Current format: encoded.ts.sig — signed over "email:ts" with a TTL.
      const [encoded, ts, sig] = parts;
      if (!encoded || !ts || !sig) return null;
      const email = Buffer.from(encoded, "base64url").toString("utf8");
      if (!safeEqual(sign(`${email}:${ts}`, secret), sig)) return null;
      const issuedAt = parseInt(ts, 36);
      if (!Number.isFinite(issuedAt) || issuedAt <= 0) return null;
      if (Date.now() - issuedAt > TOKEN_TTL_MS) return null;
      return email;
    }
    if (parts.length === 2) {
      // Legacy format: encoded.sig — signed over "email" only, no expiry. Still
      // accepted so one-click unsubscribe links already in recipients' inboxes
      // keep working during the transition. [Audit L5]
      const [encoded, sig] = parts;
      if (!encoded || !sig) return null;
      const email = Buffer.from(encoded, "base64url").toString("utf8");
      if (!safeEqual(sign(email, secret), sig)) return null;
      return email;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Campaign keys for unsubscribe attribution — the value an email sender passes
 * as the `campaign` arg below so the unsubscribe Slack ping can name the email
 * that triggered it. Carried on the link as a plain `&src=` query param: it is
 * NOT signed (the token still authenticates the email — see above), so it is
 * analytics-only. Nurture-sequence stages (`6h_no_view`…`78h_no_unlock`) and
 * invite reminders (`invite_reminder_1` / `_2`) pass their dynamic key directly.
 */
export const UNSUBSCRIBE_CAMPAIGNS = {
  surveyComplete: "survey_complete",
  surveyPaused: "survey_paused",
  invite: "invite",
  reportShared: "report_shared",
  reportUnlocked: "report_unlocked",
  chapterNudge: "chapter_nudge",
  postCallCoupon: "post_call_coupon",
} as const;

/**
 * Human labels for the Slack unsubscribe ping, keyed by sanitized campaign slug.
 * The fixed campaigns reuse UNSUBSCRIBE_CAMPAIGNS as keys so the call-site key
 * and its label can't drift apart; nurture stages / invite reminders are listed
 * as literal keys. An unknown key falls back to the raw slug (see campaignLabel).
 */
export const CAMPAIGN_LABELS: Record<string, string> = {
  [UNSUBSCRIBE_CAMPAIGNS.surveyComplete]: "Survey complete (report ready)",
  [UNSUBSCRIBE_CAMPAIGNS.surveyPaused]: "Survey paused",
  [UNSUBSCRIBE_CAMPAIGNS.invite]: "Partner invite",
  [UNSUBSCRIBE_CAMPAIGNS.reportShared]: "Report shared with you",
  [UNSUBSCRIBE_CAMPAIGNS.reportUnlocked]: "Report unlocked (purchase confirmation)",
  [UNSUBSCRIBE_CAMPAIGNS.chapterNudge]: "Chapter nudge drip",
  [UNSUBSCRIBE_CAMPAIGNS.postCallCoupon]: "Post-call 100% coupon",
  // Nurture-sequence stages
  "6h_no_view": "Nurture 6h (report ready)",
  "6h_no_unlock": "Nurture 6h (unlock nudge)",
  "30h_no_unlock": "Nurture 30h (50% off)",
  "54h_no_unlock": "Nurture 54h (75% off)",
  "78h_no_unlock": "Nurture 78h (call invite)",
  // Invite reminders
  invite_reminder_1: "Invite reminder #1",
  invite_reminder_2: "Invite reminder #2",
};

/**
 * Normalize a campaign slug arriving from a URL query param. It is
 * recipient-editable, so restrict to a safe lowercase slug and cap the length
 * before it ever reaches the DB or a Slack message. Returns "" when nothing
 * usable remains. All real campaign keys are already `[a-z0-9_]`, so this is a
 * no-op for legitimate links and a hard filter for tampered ones.
 */
export function sanitizeCampaign(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 40);
}

/**
 * Map a sanitized campaign slug to its human label, falling back to the slug.
 * Uses an own-property check: `sanitizeCampaign` permits `[a-z0-9_]`, which
 * includes `__proto__`/`constructor`, so a plain `CAMPAIGN_LABELS[campaign]`
 * could resolve an inherited (truthy, non-string) value and defeat the `??`
 * fallback. hasOwnProperty guarantees we only ever return a real label or the
 * raw slug — always a string.
 */
export function campaignLabel(campaign: string): string {
  if (Object.prototype.hasOwnProperty.call(CAMPAIGN_LABELS, campaign)) {
    // eslint-disable-next-line security/detect-object-injection -- guarded by hasOwnProperty above
    return CAMPAIGN_LABELS[campaign]!;
  }
  return campaign;
}

export function buildUnsubscribeUrl(
  email: string,
  siteUrl: string,
  secret: string,
  campaign?: string
): string {
  const token = generateUnsubscribeToken(email, secret);
  let url = `${siteUrl}/api/unsubscribe?token=${encodeURIComponent(token)}`;
  const src = sanitizeCampaign(campaign);
  if (src) url += `&src=${encodeURIComponent(src)}`;
  return url;
}
