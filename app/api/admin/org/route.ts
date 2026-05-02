import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { supabaseFetch } from "@/lib/admin/supabase";
import { buildTrustDescriptor, hoursSince } from "@/lib/admin/next-level";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

type AssetStatus = "healthy" | "watch" | "risk";

interface AssetConfig {
  key: string;
  label: string;
  href: string;
  volumePath: string;
  latestPath: string;
  latestField: string;
  ownerPath?: string;
  ownerField?: string;
  staleAfterHours?: number;
  emptyWarning?: string;
  description: string;
}

const ASSETS: AssetConfig[] = [
  {
    key: "submissions",
    label: "Submissions & Answers",
    href: "/admin/submissions",
    volumePath: "/rest/v1/survey_submission?select=id&limit=1",
    latestPath:
      "/rest/v1/survey_submission?select=created_date_time&order=created_date_time.desc&limit=1",
    latestField: "created_date_time",
    staleAfterHours: 72,
    description: "Survey starts, completions, answer payloads, and admin review activity.",
  },
  {
    key: "growth",
    label: "Growth & Pipeline",
    href: "/admin/growth",
    volumePath: "/rest/v1/waitlist_user?select=id&limit=1",
    latestPath:
      "/rest/v1/waitlist_user?select=created_date_time&order=created_date_time.desc&limit=1",
    latestField: "created_date_time",
    staleAfterHours: 72,
    description: "Waitlist demand, recovery, channel quality, and acquisition diagnostics.",
  },
  {
    key: "strategy",
    label: "Strategy Hub",
    href: "/admin/strategy",
    volumePath: "/rest/v1/admin_goals?select=id&limit=1",
    latestPath: "/rest/v1/admin_goals?select=updated_at&order=updated_at.desc&limit=1",
    latestField: "updated_at",
    ownerPath: "/rest/v1/admin_goals?select=admin_email&order=updated_at.desc&limit=1",
    ownerField: "admin_email",
    staleAfterHours: 168,
    emptyWarning: "No active goals are configured yet.",
    description: "North-star metrics, queue pressure, forecasts, opportunities, and guardrails.",
  },
  {
    key: "experiments",
    label: "Experiments",
    href: "/admin/experiments",
    volumePath: "/rest/v1/admin_experiment?select=id&limit=1",
    latestPath: "/rest/v1/admin_experiment?select=updated_at&order=updated_at.desc&limit=1",
    latestField: "updated_at",
    ownerPath: "/rest/v1/admin_experiment?select=owner_email&order=updated_at.desc&limit=1",
    ownerField: "owner_email",
    staleAfterHours: 168,
    emptyWarning: "No experiments are registered yet.",
    description: "Experiment registry, owners, decision dates, and guardrail metrics.",
  },
  {
    key: "scoring",
    label: "Scoring & Question Quality",
    href: "/admin/scoring",
    volumePath: "/rest/v1/scoring_result?select=id&limit=1",
    latestPath: "/rest/v1/scoring_result?select=scored_at&order=scored_at.desc&limit=1",
    latestField: "scored_at",
    staleAfterHours: 72,
    description: "Scoring output, disagreement review, lifecycle changes, and trust signals.",
  },
  {
    key: "benchmarks",
    label: "Benchmarks",
    href: "/admin/benchmarks",
    volumePath: "/rest/v1/admin_metric_benchmark?select=id&limit=1",
    latestPath: "/rest/v1/admin_metric_benchmark?select=updated_at&order=updated_at.desc&limit=1",
    latestField: "updated_at",
    ownerPath: "/rest/v1/admin_metric_benchmark?select=admin_email&order=updated_at.desc&limit=1",
    ownerField: "admin_email",
    staleAfterHours: 720,
    emptyWarning: "Benchmark packs are empty.",
    description: "Internal, category, competitive, and historical benchmark references.",
  },
  {
    key: "decision-journal",
    label: "Decision Journal",
    href: "/admin/changelog",
    volumePath: "/rest/v1/admin_decision_entry?select=id&limit=1",
    latestPath: "/rest/v1/admin_decision_entry?select=updated_at&order=updated_at.desc&limit=1",
    latestField: "updated_at",
    ownerPath: "/rest/v1/admin_decision_entry?select=owner_email&order=updated_at.desc&limit=1",
    ownerField: "owner_email",
    staleAfterHours: 720,
    emptyWarning: "No structured decisions have been logged yet.",
    description: "Release decisions, scoring governance, rationale, and observed effects.",
  },
  {
    key: "replay",
    label: "Replay & Recovery",
    href: "/admin/replay",
    volumePath: "/rest/v1/survey_behavior_event?select=id&limit=1",
    latestPath: "/rest/v1/survey_behavior_event?select=event_time&order=event_time.desc&limit=1",
    latestField: "event_time",
    staleAfterHours: 72,
    description: "Behavior events, replay clusters, abandonment, and recovery checkpoints.",
  },
  {
    key: "reports-revenue",
    label: "Reports & Revenue",
    href: "/admin/revenue",
    volumePath: "/rest/v1/personal_report?select=id&limit=1",
    latestPath:
      "/rest/v1/personal_report?select=created_date_time&order=created_date_time.desc&limit=1",
    latestField: "created_date_time",
    staleAfterHours: 168,
    emptyWarning: "No report or payment activity has been captured yet.",
    description: "Report engagement, payments, monetization, and attribution layers.",
  },
];

async function fetchExactCount(path: string): Promise<number> {
  const res = await supabaseFetch(path, {
    method: "HEAD",
    headers: { Prefer: "count=exact" },
  });
  if (!res.ok) return 0;
  const range = res.headers.get("content-range");
  return range ? parseInt(range.split("/")[1] || "0", 10) : 0;
}

async function fetchLatest(path: string, field: string): Promise<string | null> {
  const res = await supabaseFetch(path, { headers: { Range: "0-0" } });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<Record<string, string | null>>;
  const row = rows[0];
  if (!row) return null;
  return new Map(Object.entries(row)).get(field) ?? null;
}

async function fetchOwner(
  path: string | undefined,
  field: string | undefined
): Promise<string | null> {
  if (!path || !field) return null;
  const res = await supabaseFetch(path, { headers: { Range: "0-0" } });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<Record<string, string | null>>;
  const row = rows[0];
  if (!row) return null;
  return new Map(Object.entries(row)).get(field) ?? null;
}

function statusFromAsset(asset: {
  volume: number;
  freshnessHours: number | null;
  staleAfterHours: number;
  owner: string | null;
  emptyWarning?: string;
}): { status: AssetStatus; flags: string[] } {
  const flags: string[] = [];
  if (asset.volume === 0 && asset.emptyWarning) {
    flags.push(asset.emptyWarning);
  }
  if (asset.freshnessHours != null && asset.freshnessHours > asset.staleAfterHours) {
    flags.push(`Stale for ${asset.freshnessHours}h.`);
  }
  if (!asset.owner) {
    flags.push("No clear owner.");
  }

  const status: AssetStatus =
    flags.length >= 2 || (asset.volume === 0 && !!asset.emptyWarning)
      ? "risk"
      : flags.length === 1
        ? "watch"
        : "healthy";

  return { status, flags };
}

export async function GET(request: Request) {
  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "viewer")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-org-directory",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    const assets = await Promise.all(
      ASSETS.map(async (config) => {
        const [volume, lastUpdated, owner] = await Promise.all([
          fetchExactCount(config.volumePath),
          fetchLatest(config.latestPath, config.latestField),
          fetchOwner(config.ownerPath, config.ownerField),
        ]);

        const trust = buildTrustDescriptor({
          source: config.key,
          mode: "derived",
          sampleSize: volume,
          lastUpdated,
          staleAfterHours: config.staleAfterHours ?? 72,
        });
        const freshnessHours = hoursSince(lastUpdated);
        const { status, flags } = statusFromAsset({
          volume,
          freshnessHours,
          staleAfterHours: config.staleAfterHours ?? 72,
          owner,
          emptyWarning: config.emptyWarning,
        });

        return {
          key: config.key,
          label: config.label,
          href: config.href,
          description: config.description,
          volume,
          owner,
          lastUpdated,
          freshnessHours,
          status,
          flags,
          trust,
        };
      })
    );

    const riskAssets = assets.filter((asset) => asset.status === "risk");
    const watchAssets = assets.filter((asset) => asset.status === "watch");
    const ownerGaps = assets.filter((asset) => !asset.owner).length;
    const staleAssets = assets.filter(
      (asset) =>
        asset.freshnessHours != null &&
        asset.freshnessHours >
          (ASSETS.find((item) => item.key === asset.key)?.staleAfterHours ?? 72)
    ).length;

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      summary: {
        totalAssets: assets.length,
        healthy: assets.filter((asset) => asset.status === "healthy").length,
        watch: watchAssets.length,
        risk: riskAssets.length,
        staleAssets,
        ownerGaps,
      },
      highlights: [...riskAssets, ...watchAssets].slice(0, 6).map((asset) => ({
        label: asset.label,
        href: asset.href,
        status: asset.status,
        note: asset.flags[0] ?? "Needs review.",
      })),
      assets,
    });
  } catch (err) {
    logger.error({ err }, "Admin org directory error");
    return NextResponse.json({ error: "Unable to load org directory." }, { status: 500 });
  }
}
