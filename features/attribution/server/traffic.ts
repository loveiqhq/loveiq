/**
 * Acquisition-channel classification from a stored `utm_tracker` blob.
 *
 * Moved here from `features/checkout/server/fulfillment.ts` (which still
 * re-exports it) so both the purchase notification and the survey-completion
 * notification can share one implementation instead of the survey side growing
 * a second, subtly different copy.
 */

// Paid-traffic media identifiers (utm_medium). Anything here, or any utm_campaign
// at all, classifies the visit as a paid acquisition.
const PAID_UTM_MEDIA = new Set(["cpc", "ppc", "paid", "paid_social", "ads", "display"]);

export type TrafficInfo = {
  bucket: "Direct" | "Referral" | "Paid" | "Organic";
  source: string | null;
  medium: string | null;
  campaign: string | null;
};

// Classify the visitor's acquisition channel from the survey_submission.utm_tracker
// JSON blob, for the Slack pings. utm_* values are user-controllable (they ride in
// on the landing URL), so callers MUST escape every string returned here before it
// reaches Slack. We deliberately ignore utm_content: invite links base64 the
// referrer's email into it, and that must never be echoed to Slack.
export function classifyTraffic(utmTracker: string | null): TrafficInfo {
  // Real utm values are short; cap each one so a padded/oversized tracker can't
  // blow past Slack's 3,000-char message limit (which would 400 the webhook).
  const MAX_UTM_LEN = 100;
  const str = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, MAX_UTM_LEN) : null;
  };

  let parsed: Record<string, unknown> = {};
  if (utmTracker?.trim()) {
    try {
      const json: unknown = JSON.parse(utmTracker);
      // Arrays are typeof "object" too — exclude them so we never read utm_* off
      // an array (which would silently mislabel as Direct).
      if (json !== null && typeof json === "object" && !Array.isArray(json)) {
        parsed = json as Record<string, unknown>;
      }
    } catch {
      // Malformed tracker — treat the raw string as the source so we still
      // surface something rather than silently dropping it.
      parsed = { utm_source: utmTracker };
    }
  }

  const source = str(parsed.utm_source);
  const medium = str(parsed.utm_medium);
  const campaign = str(parsed.utm_campaign);

  let bucket: TrafficInfo["bucket"];
  if (!source && !medium && !campaign) {
    bucket = "Direct";
  } else if (source?.toLowerCase() === "referral") {
    bucket = "Referral";
  } else if (campaign || (medium && PAID_UTM_MEDIA.has(medium.toLowerCase()))) {
    bucket = "Paid";
  } else {
    bucket = "Organic";
  }

  return { bucket, source, medium, campaign };
}

/**
 * Read the A/B arms stamped onto a submission's `utm_tracker` at submit time
 * (`app/api/survey/route.ts`). Returns the RAW stored values.
 *
 * Deliberately does NOT collapse unrecognised values to "control" the way
 * `recordVisit.ts`, the admin explorer and the `get_landing_variant_funnel` RPC
 * all do — that collapse is why round-2 `white_prev` traffic is currently
 * reported as the retired dark arm.
 */
export function readStampedArms(utmTracker: string | null): {
  landing: string | null;
  survey: string | null;
} {
  if (!utmTracker?.trim()) return { landing: null, survey: null };
  try {
    const json: unknown = JSON.parse(utmTracker);
    if (json === null || typeof json !== "object" || Array.isArray(json)) {
      return { landing: null, survey: null };
    }
    const blob = json as Record<string, unknown>;
    const pick = (value: unknown) =>
      typeof value === "string" && value.trim() ? value.trim() : null;
    return { landing: pick(blob.landing_variant), survey: pick(blob.survey_variant) };
  } catch {
    return { landing: null, survey: null };
  }
}
