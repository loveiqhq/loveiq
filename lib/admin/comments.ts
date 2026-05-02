export const ADMIN_COMMENT_RESOURCE_TYPES = [
  "metric-registry",
  "release-entry",
  "decision-entry",
  "experiment",
  "chart-annotation",
  "strategy-initiative",
  "strategy-bet",
  "competitive-watch",
  "metric-dependency",
  "review-request",
  "alert-policy",
  "benchmark",
  "research-entry",
  "general",
] as const;

export type AdminCommentResourceType = (typeof ADMIN_COMMENT_RESOURCE_TYPES)[number];

export interface AdminResourceComment {
  id: number;
  admin_email: string;
  content: string;
  created_at: string;
  updated_at: string;
  is_mine: boolean;
}
