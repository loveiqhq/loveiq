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

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  redact: {
    paths: [
      "email",
      "*.email",
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
          // Best-effort fire-and-forget. See file-top comment for why we
          // can't use next/server's `after()` here. Errors inside
          // notifySlack are swallowed and (with slack:false) won't recurse.
          void notifySlack({
            channel: "ops",
            kind,
            text: `:rotating_light: *${kind}* — ${msg}`,
            username: "ops_alerts",
          }).catch(() => {});
        }
      }

      return (method as LogFn).apply(this, args);
    },
  },
});

export default logger;
