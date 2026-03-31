export const ADMIN_REVIEW_RESOURCE_TYPES = [
  "metric-registry",
  "alert-policy",
  "decision-entry",
  "release-entry",
  "experiment",
  "benchmark",
  "strategy-initiative",
  "strategy-bet",
  "competitive-watch",
  "metric-dependency",
  "research-entry",
  "general",
] as const;

export type AdminReviewResourceType = (typeof ADMIN_REVIEW_RESOURCE_TYPES)[number];
