import { createHmac, timingSafeEqual } from "crypto";

// [Audit L5] New tokens embed a base36 creation timestamp and expire after this
// window, so a leaked/archived unsubscribe link can't be replayed forever.
// Long enough that legitimate mail-client one-click unsubscribe still works on
// recent sends; short enough to bound stale-archive replay.
const TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

// Deploy instant of commit e1d5261 (Jun 12 2026 17:10 +02:00 = 15:10 UTC), which
// shipped unsubscribe source attribution. Tokens issued before this predate
// tracking — a missing campaign on such a link is expected backlog, not a bug,
// so the Slack ping labels it as such instead of an alarming "unknown".
export const SOURCE_TRACKING_SINCE = Date.UTC(2026, 5, 12, 15, 10, 0);

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

function safeEqual(expectedB64: string, actualB64: string): boolean {
  const expected = Buffer.from(expectedB64);
  const actual = Buffer.from(actualB64);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export interface UnsubscribeTokenResult {
  /** The verified recipient email. */
  email: string;
  /** Sanitized campaign slug baked into the token, or "" if none / legacy. */
  campaign: string;
  /** Token creation time (ms epoch), or null for legacy tokens with no timestamp. */
  issuedAt: number | null;
}

/**
 * Mint an unsubscribe token. When a `campaign` is supplied it is sanitized and
 * embedded INSIDE the signed payload (4-part token), so attribution survives
 * even if a mail client strips the trailing `&src=` query param from the link.
 * With no campaign the 3-part format is unchanged.
 */
export function generateUnsubscribeToken(email: string, secret: string, campaign?: string): string {
  const encoded = Buffer.from(email).toString("base64url");
  const ts = Date.now().toString(36);
  const src = sanitizeCampaign(campaign);
  if (src) {
    const sig = sign(`${email}:${ts}:${src}`, secret);
    const campEncoded = Buffer.from(src).toString("base64url");
    return `${encoded}.${ts}.${campEncoded}.${sig}`;
  }
  const sig = sign(`${email}:${ts}`, secret);
  return `${encoded}.${ts}.${sig}`;
}

export function verifyUnsubscribeToken(
  token: string,
  secret: string
): UnsubscribeTokenResult | null {
  // base64url (email/campaign), base36 (ts) and base64url (sig) never contain
  // ".", so splitting on "." is unambiguous.
  const parts = token.split(".");
  try {
    if (parts.length === 4) {
      // Campaign-bearing format: encoded.ts.campaign.sig — signed over
      // "email:ts:campaign" with a TTL. The campaign rides inside the signature,
      // so it is both tamper-proof and immune to query-param stripping.
      const [encoded, ts, campEncoded, sig] = parts;
      if (!encoded || !ts || !campEncoded || !sig) return null;
      const email = Buffer.from(encoded, "base64url").toString("utf8");
      const campaign = sanitizeCampaign(Buffer.from(campEncoded, "base64url").toString("utf8"));
      if (!safeEqual(sign(`${email}:${ts}:${campaign}`, secret), sig)) return null;
      const issuedAt = parseInt(ts, 36);
      if (!Number.isFinite(issuedAt) || issuedAt <= 0) return null;
      if (Date.now() - issuedAt > TOKEN_TTL_MS) return null;
      return { email, campaign, issuedAt };
    }
    if (parts.length === 3) {
      // Campaign-less format: encoded.ts.sig — signed over "email:ts" with a TTL.
      const [encoded, ts, sig] = parts;
      if (!encoded || !ts || !sig) return null;
      const email = Buffer.from(encoded, "base64url").toString("utf8");
      if (!safeEqual(sign(`${email}:${ts}`, secret), sig)) return null;
      const issuedAt = parseInt(ts, 36);
      if (!Number.isFinite(issuedAt) || issuedAt <= 0) return null;
      if (Date.now() - issuedAt > TOKEN_TTL_MS) return null;
      return { email, campaign: "", issuedAt };
    }
    if (parts.length === 2) {
      // Legacy format: encoded.sig — signed over "email" only, no expiry. Still
      // accepted so one-click unsubscribe links already in recipients' inboxes
      // keep working during the transition. [Audit L5]
      const [encoded, sig] = parts;
      if (!encoded || !sig) return null;
      const email = Buffer.from(encoded, "base64url").toString("utf8");
      if (!safeEqual(sign(email, secret), sig)) return null;
      return { email, campaign: "", issuedAt: null };
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

/**
 * Slack-ready description of where an unsubscribe came from, given the campaign
 * resolved from the link and the token's creation time. Distinguishes a genuine
 * gap (a new email with no campaign — worth investigating) from benign backlog
 * (a link minted before source tracking shipped — see SOURCE_TRACKING_SINCE).
 * Pure + escape-free: the caller escapes `label` for Slack; notes are static.
 */
export type UnsubscribeSource =
  | { attributed: true; label: string }
  | { attributed: false; note: string };

export function describeUnsubscribeSource(
  campaign: string,
  issuedAt: number | null
): UnsubscribeSource {
  if (campaign) return { attributed: true, label: campaignLabel(campaign) };
  if (issuedAt === null) return { attributed: false, note: "(legacy link — source unavailable)" };
  if (issuedAt < SOURCE_TRACKING_SINCE) {
    return { attributed: false, note: "(sent before source tracking)" };
  }
  return { attributed: false, note: "(source missing — investigate)" };
}

export function buildUnsubscribeUrl(
  email: string,
  siteUrl: string,
  secret: string,
  campaign?: string
): string {
  // Campaign is baked into the signed token (robust attribution) AND kept as a
  // readable `&src=` fallback for in-flight 3-part tokens / analytics.
  const token = generateUnsubscribeToken(email, secret, campaign);
  let url = `${siteUrl}/api/unsubscribe?token=${encodeURIComponent(token)}`;
  const src = sanitizeCampaign(campaign);
  if (src) url += `&src=${encodeURIComponent(src)}`;
  return url;
}
