/**
 * R-11: CSP violation report receiver.
 *
 * Browsers POST a JSON report when a CSP directive blocks content. Both the
 * legacy `report-uri` and the new Reporting API `report-to` end up here.
 * The reports are not authenticated (the browser sends them automatically;
 * there's no user session) so the endpoint must accept anonymous POSTs.
 *
 * Defenses against abuse:
 *   - rate-limited per IP (50/min — a single page can fire 10-15 reports);
 *     this is the spam ceiling. Per-instance in-memory dedup was considered
 *     but is unreliable on ephemeral serverless instances, so the rate limit
 *     plus the daily-digest aggregation (below) is the deliberate design.
 *   - silently truncates payloads >32KB
 *   - never echoes the report back; only logs to pino → Vercel logs
 *
 * Why no Slack ping on every report: CSP reports are noisy. A misconfigured
 * browser extension or ad-blocker generates dozens per pageload. The right
 * surface is the daily tech-digest aggregating top blocked URIs.
 */

import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 32_768;

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "csp-report",
    limit: 50,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    // Drop silently; do not emit a 429 because the browser will keep
    // retrying the report.
    return new NextResponse(null, { status: 204 });
  }

  const raw = await request.text().catch(() => "");
  if (!raw || raw.length > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const body = JSON.parse(raw) as unknown;
    // Legacy format: { "csp-report": { ... } }
    // Reporting API format: [{ type: "csp-violation", body: { ... } }]
    const report =
      Array.isArray(body) && body[0] && typeof body[0] === "object" && body[0] !== null
        ? (body[0] as { body?: Record<string, unknown> }).body
        : (body as { "csp-report"?: Record<string, unknown> })["csp-report"];

    if (report && typeof report === "object") {
      logger.warn(
        {
          cspViolation: true,
          documentUri: report["document-uri"] ?? report["documentURL"],
          blockedUri: report["blocked-uri"] ?? report["blockedURL"],
          violatedDirective: report["violated-directive"] ?? report["effectiveDirective"],
          disposition: report["disposition"],
          // user-agent is a reasonable correlator (mostly extension noise)
          // but not PII-sensitive.
          userAgent: request.headers.get("user-agent") ?? null,
        },
        "CSP violation reported"
      );
    }
  } catch {
    // Malformed report — drop quietly. Don't surface to ops; the source is
    // unauthenticated and any 5xx echo is noise.
  }

  return new NextResponse(null, { status: 204 });
}
