import pino from "pino";

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
    ],
    censor: "[REDACTED]",
  },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export default logger;
