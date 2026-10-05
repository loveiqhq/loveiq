import pino, { type LogFn } from "pino";
import { notifySlack } from "@shared/observability/slack";

// Best-effort fire-and-forget queue. We can't import `next/server`'s
// `after()` here because this module is imported by middleware + every
// server module, and `after()` is forbidden in middleware/client bundles.
// On Vercel the function sandbox typically finishes in-flight I/O for
// ~100–300 ms after the response is returned, which is enough for the
// fetch to complete in the common case. The dedup in notifySlack
// limits damage if a few errors slip through and re-fire. Routes that
// need stronger guarantees should call `notifySlack` themselves with
// `await` (or via `scheduleAfterResponse`) from their catch block.

// Pre-resolved at module load for cheap branch in the hook hot path.
const SLACK_MIRROR_ENABLED =
  process.env.NODE_ENV === "production" && Boolean(process.env.SLACK_OPS_WEBHOOK_URL);

/**
 * Does this error line come from the company brain?
 *
 * Matched on the message because the mirror below sees only what was logged, and
 * threading a channel through every `logger.error` in the brain would be a larger diff
 * than the routing is worth. Anchored at the start so an unrelated error that happens to
 * mention the brain in passing is not rerouted. A miss is harmless: the message lands in
 * `ops` exactly as it does today.
 */
/**
 * The keys worth waking someone for, and ONLY those.
 *
 * Every alert reached Slack as the message alone, because the context object —
 * the first argument to `logger.error({ … }, "…")` — was read to check
 * `slack: false` and then thrown away. So
 *
 *     :rotating_light: api_5xx — supabase: write REJECTED — the row was not
 *     written and no error was thrown
 *
 * arrived with no way to tell WHICH write. That message comes from
 * `warnIfWriteRejected`, which logs `path`, `method`, `status` and `code`
 * beside it; none of it was forwarded, and on 2026-09-23 that cost an hour of
 * guessing at candidate tables without finding the row.
 *
 * AN ALLOWLIST, not a dump. Log context routinely carries a reader's email, a
 * report token or a Stripe id, and Slack is a wider audience than the log
 * store. These are diagnostic identifiers with no personal data in them;
 * anything else stays where it was.
 */
const ALERT_CONTEXT_KEYS = [
  "path",
  "method",
  "status",
  "code",
  "table",
  "event_type",
  "scanner",
  "cron",
  "job",
  "route",
  "reason",
] as const;

export function diagnosticSuffix(ctx: Record<string, unknown> | null): string {
  if (!ctx) return "";
  const parts: string[] = [];
  for (const k of ALERT_CONTEXT_KEYS) {
    const v = ctx[k];
    if (v === undefined || v === null || v === "") continue;
    // Primitives only: an object here would be a payload, and a payload is
    // exactly the thing that carries somebody's data.
    if (typeof v === "object") continue;
    parts.push(`${k}=${String(v).slice(0, 80)}`);
  }
  return parts.length ? ` · ${parts.join(" ")}` : "";
}

export function isBrainMessage(msg: string): boolean {
  return /^(brain[-_: ]|mcp )/i.test(msg);
}

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  redact: {
    paths: [
      "email",
      "*.email",
      "adminEmail",
      "*.adminEmail",
      "userEmail",
      "*.userEmail",
      "partnerEmail",
      "*.partnerEmail",
      "recipientEmail",
      "*.recipientEmail",
      "customerEmail",
      "*.customerEmail",
      "ip",
      "*.ip",
      "phone",
      "*.phone",
      "firstName",
      "*.firstName",
      "lastName",
      "*.lastName",
      "name",
      "*.name",
      // Tokens are not strictly secrets but appear in URLs and grant access
      // when leaked; redact defensively across all common shapes.
      "token",
      "*.token",
      "reportToken",
      "*.reportToken",
      "ownerToken",
      "*.ownerToken",
      "shareToken",
      "*.shareToken",
      "csrfToken",
      "*.csrfToken",
      // Webhook URLs carry shared secrets in their path.
      "webhookUrl",
      "*.webhookUrl",
      "slackWebhookUrl",
      "*.slackWebhookUrl",
    ],
    censor: "[REDACTED]",
  },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  hooks: {
    logMethod(this, args, method, level) {
      // Mirror error/fatal logs to the ops Slack channel so silent prod
      // failures get caught. Skipped when the log entry carries
      // `slack: false` (slack.ts uses this to break the recursion loop
      // when notifySlack itself fails).
      if (SLACK_MIRROR_ENABLED && (level === 50 || level === 60)) {
        const first = args[0];
        const ctx =
          first && typeof first === "object" && !Array.isArray(first)
            ? (first as Record<string, unknown>)
            : null;
        const optedOut = ctx && ctx.slack === false;

        if (!optedOut) {
          const msg = typeof first === "string" ? first : String(args[1] ?? "(no message)");
          const kind = level === 60 ? "fatal" : "api_5xx";
          // The company brain is the chattiest thing in this codebase and none of it is
          // a site outage. Send its failures to their own channel so #prod-alerts stays
          // a channel somebody reads. `brain` falls back to `ops` when its webhook is
          // unset, so this never silences anything.
          const channel = isBrainMessage(msg) ? "brain" : "ops";
          // Best-effort fire-and-forget. See file-top comment for why we
          // can't use next/server's `after()` here. Errors inside
          // notifySlack are swallowed and (with slack:false) won't recurse.
          void notifySlack({
            channel,
            kind,
            text: `:rotating_light: *${kind}* — ${msg}${diagnosticSuffix(ctx)}`,
            username: "ops_alerts",
          }).catch(() => {});
        }
      }

      return (method as LogFn).apply(this, args);
    },
  },
});

export default logger;
