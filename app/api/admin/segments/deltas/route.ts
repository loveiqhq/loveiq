import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
};

interface SubmissionRow {
  id: number;
  status: string;
  utm_tracker: string | null;
  created_date_time: string;
  scoring_result: { primary_archetype: string | null } | null;
}

function parseUtmSource(tracker: string | null): string {
  if (!tracker?.trim()) return "Direct";
  try {
    const parsed = JSON.parse(tracker);
    return parsed.utm_source || "Direct";
  } catch {
    return tracker.trim();
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

type Dimension = "source" | "archetype" | "status";
type BucketCounts = Record<Dimension, Map<string, number>>;

function createBuckets(): BucketCounts {
  return {
    source: new Map<string, number>(),
    archetype: new Map<string, number>(),
    status: new Map<string, number>(),
  };
}

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function getBucketMap(buckets: BucketCounts, dimension: Dimension): Map<string, number> {
  return dimension === "source"
    ? buckets.source
    : dimension === "archetype"
      ? buckets.archetype
      : buckets.status;
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
    bucket: "admin-segment-deltas",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const days = Math.max(1, parseInt(url.searchParams.get("days") || "30", 10));
  const currentSince = new Date(Date.now() - days * 86_400_000);
  const previousSince = new Date(Date.now() - days * 2 * 86_400_000);

  try {
    const res = await supabaseFetch(
      `/rest/v1/survey_submission?select=id,status,utm_tracker,created_date_time,scoring_result(primary_archetype)&created_date_time=gte.${previousSince.toISOString()}&order=created_date_time.desc`,
      { headers: { Range: "0-49999" } }
    );

    if (!res.ok) {
      logger.error({ status: res.status }, "Segment deltas query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const rows = (await res.json()) as SubmissionRow[];
    const currentBuckets = createBuckets();
    const previousBuckets = createBuckets();
    let currentTotal = 0;
    let previousTotal = 0;

    for (const row of rows) {
      const createdAt = new Date(row.created_date_time);
      if (Number.isNaN(createdAt.getTime())) continue;
      if (createdAt < previousSince) continue;

      const buckets = createdAt >= currentSince ? currentBuckets : previousBuckets;
      if (createdAt >= currentSince) currentTotal += 1;
      else previousTotal += 1;

      increment(buckets.source, parseUtmSource(row.utm_tracker));
      increment(buckets.archetype, row.scoring_result?.primary_archetype || "Unscored");
      increment(buckets.status, row.status || "unknown");
    }

    const watchlist = (["source", "archetype", "status"] as const)
      .flatMap((dimension) => {
        const currentBucket = getBucketMap(currentBuckets, dimension);
        const previousBucket = getBucketMap(previousBuckets, dimension);
        const keys = new Set([...currentBucket.keys(), ...previousBucket.keys()]);

        return [...keys].map((key) => {
          const currentCount = currentBucket.get(key) ?? 0;
          const previousCount = previousBucket.get(key) ?? 0;
          const currentShare = currentTotal > 0 ? round1((currentCount / currentTotal) * 100) : 0;
          const previousShare =
            previousTotal > 0 ? round1((previousCount / previousTotal) * 100) : 0;
          const deltaShare = round1(currentShare - previousShare);
          const totalCount = currentCount + previousCount;

          return {
            dimension,
            key,
            currentCount,
            previousCount,
            currentShare,
            previousShare,
            deltaShare,
            direction: deltaShare > 0 ? "up" : deltaShare < 0 ? "down" : "flat",
            confidence: totalCount >= 20 ? "high" : totalCount >= 8 ? "medium" : "low",
          };
        });
      })
      .filter((item) => item.currentCount > 0 || item.previousCount > 0)
      .filter(
        (item) => Math.abs(item.deltaShare) >= 1 || item.currentCount + item.previousCount >= 8
      )
      .sort(
        (a, b) =>
          Math.abs(b.deltaShare) - Math.abs(a.deltaShare) ||
          b.currentCount + b.previousCount - (a.currentCount + a.previousCount)
      )
      .slice(0, 15);

    const risers = watchlist.filter((item) => item.deltaShare > 0);
    const fallers = watchlist.filter((item) => item.deltaShare < 0);

    return NextResponse.json(
      {
        summary: {
          windowDays: days,
          currentTotal,
          previousTotal,
          biggestRiser: risers[0] != null ? `${risers[0].dimension}: ${risers[0].key}` : null,
          biggestFaller: fallers[0] != null ? `${fallers[0].dimension}: ${fallers[0].key}` : null,
        },
        watchlist,
        trust: {
          sampleSize: currentTotal + previousTotal,
          warning:
            currentTotal < 10 || previousTotal < 10
              ? "Segment movement is based on a small comparison window."
              : null,
        },
      },
      {
        headers: responseHeaders,
      }
    );
  } catch (err) {
    logger.error({ err }, "Segment deltas error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
