/**
 * Lightweight circuit breaker for serverless functions.
 *
 * State is per-module (per warm instance in Vercel serverless). On cold starts,
 * each circuit begins closed. Within a warm instance, the breaker prevents
 * hammering a failing upstream service on every request.
 *
 * States:
 *   closed   → requests pass through (normal operation)
 *   open     → requests fail immediately with CircuitOpenError (no network call)
 *   half-open → one probe request allowed; success closes, failure re-opens
 */

import logger from "@shared/observability/logger";
import { notifySlack } from "@shared/observability/slack";

// Best-effort fire-and-forget for circuit-state pings. We deliberately
// don't pull `after-response.ts` here because circuit-breaker is
// reachable from client-bundled paths (planAccess → ReportPage) and
// `next/server`'s `after()` is invalid in those bundles.

export class CircuitOpenError extends Error {
  constructor(service: string) {
    super(`Circuit open: ${service} is currently unavailable`);
    this.name = "CircuitOpenError";
  }
}

type State = "closed" | "open" | "half-open";

interface CircuitBreakerConfig {
  /** Consecutive failures before opening the circuit */
  failureThreshold: number;
  /** Milliseconds to wait in open state before probing (half-open) */
  resetTimeout: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  resetTimeout: 30_000,
};

class CircuitBreaker {
  private state: State = "closed";
  private failures = 0;
  private openedAt = 0;

  constructor(
    private readonly name: string,
    private readonly config: CircuitBreakerConfig
  ) {}

  async fire<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.openedAt >= this.config.resetTimeout) {
        this.state = "half-open";
        logger.warn({ service: this.name }, "[circuit-breaker] Half-open: probing service");
      } else {
        throw new CircuitOpenError(this.name);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess() {
    if (this.state === "half-open") {
      this.state = "closed";
      this.failures = 0;
      logger.info({ service: this.name }, "[circuit-breaker] Closed: service recovered");
      void notifySlack({
        channel: "ops",
        kind: "circuit_recovered",
        text: `:white_check_mark: Circuit recovered — *${this.name}* is back to healthy.`,
        username: "ops_alerts",
      }).catch(() => {});
    } else {
      this.failures = 0;
    }
  }

  private onFailure() {
    this.failures++;
    if (this.state === "half-open" || this.failures >= this.config.failureThreshold) {
      const wasOpen = this.state === "open";
      this.state = "open";
      this.openedAt = Date.now();
      // logger.error already mirrors to Slack via the pino hook (as api_5xx).
      // The circuit_open kind below is more specific — keep both with slack:false
      // on the logger.error so the pino hook doesn't double-fire.
      logger.error(
        { service: this.name, failures: this.failures, slack: false },
        "[circuit-breaker] Opened: too many consecutive failures"
      );
      if (!wasOpen) {
        void notifySlack({
          channel: "ops",
          kind: "circuit_open",
          text: `:rotating_light: Circuit *${this.name}* opened after ${this.failures} consecutive failures.`,
          username: "ops_alerts",
        }).catch(() => {});
      }
    }
  }
}

// Module-level singletons — persist for the lifetime of a warm serverless instance
const breakers = new Map<string, CircuitBreaker>();

export function getBreaker(
  name: string,
  config: Partial<CircuitBreakerConfig> = {}
): CircuitBreaker {
  if (!breakers.has(name)) {
    breakers.set(name, new CircuitBreaker(name, { ...DEFAULT_CONFIG, ...config }));
  }
  return breakers.get(name)!;
}
