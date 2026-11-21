import miraConfig from "@features/mira/content/mira-config.json";

/** The rating line and the quote under Mira's welcome (Mark's board V2, variant D, 21 Nov 2026). */
export type SocialProof = {
  rating: number;
  people: number;
  quote: string;
  name: string;
  photo: string | null;
};

/**
 * The board's own sample, for staging and previews only, so the team can judge the look. The
 * live site never shows it: invented ratings and testimonials are banned outright in the EU
 * (UWG Annex Nos. 23b and 23c). Real numbers and a real, consented quote go into
 * mira-config.json `socialProof` once Mira has them; she already collects the thumbs and the
 * 0 to 10 question.
 */
export const SAMPLE_PROOF: SocialProof = {
  rating: 4.9,
  people: 1240,
  quote: "Mira supported me to find potential solutions & interventions that gave me hope.",
  name: "Maria",
  photo: "/images/mira/maria-sample.webp",
};

/** What the welcome shows: the real figures when set; else the sample, but never in production. */
export function pickSocialProof(
  configured: SocialProof | null,
  vercelEnv: string | undefined
): SocialProof | null {
  return configured ?? (vercelEnv === "production" ? null : SAMPLE_PROOF);
}

export function socialProof(): SocialProof | null {
  return pickSocialProof(
    (miraConfig as { socialProof?: SocialProof | null }).socialProof ?? null,
    process.env.VERCEL_ENV
  );
}
