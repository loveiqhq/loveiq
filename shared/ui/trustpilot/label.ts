/**
 * Trustpilot's own word for a TrustScore (its bands: 4.3 and up Excellent, 3.8 Great,
 * 2.8 Average, 1.8 Poor, below that Bad), so a card never says more than the score does.
 * Shared by the paygate exit page's card and the survey's Trustpilot sheet.
 */
export function trustpilotLabel(score: number): string {
  if (score >= 4.3) return "Excellent";
  if (score >= 3.8) return "Great";
  if (score >= 2.8) return "Average";
  if (score >= 1.8) return "Poor";
  return "Bad";
}
