import type {
  ArchetypeStat,
  BreakdownRow,
  CrossTab,
  ExplorerStats,
  Facets,
  ScaleSummary,
} from "@features/admin/server/explorer";
import type { TrendPoint } from "@features/admin/ui/explorer/TrendChart";

export interface RowView {
  submissionId: number;
  email: string | null;
  archetype: string | null;
  ageGroup: string | null;
  gender: string | null;
  country: string | null;
  device: string | null;
  plan: string | null;
  reportViewed: boolean;
  paid: boolean;
  paidAmount: number;
  createdAt: string;
}

export interface ExplorerResponse {
  range: { days: number; since: string | null };
  stats: ExplorerStats;
  facets: Facets;
  breakdown: BreakdownRow[];
  crossTab: CrossTab | null;
  trend: TrendPoint[];
  trendGranularity: "day" | "week";
  archetypeDistribution: ArchetypeStat[];
  scaleSummary: ScaleSummary | null;
  rows: RowView[];
  total: number;
  page: number;
  limit: number;
  capped: boolean;
}
