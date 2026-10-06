/**
 * An alert you cannot act on is half an alert.
 *
 * Every error reaching Slack was the message alone: the context object — the
 * first argument to `logger.error({ … }, "…")` — was read to check
 * `slack: false` and then discarded. On 2026-09-23 that produced
 *
 *     :rotating_light: api_5xx — supabase: write REJECTED — the row was not
 *     written and no error was thrown
 *
 * with no way to tell WHICH write, and an hour of guessing at candidate tables
 * did not find it. `warnIfWriteRejected` logs path, method, status and code
 * right beside that message.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { diagnosticSuffix } from "@shared/observability/logger";

describe("what an alert carries with it", () => {
  it("names the write, so the next one takes seconds instead of an hour", () => {
    const out = diagnosticSuffix({
      path: "/rest/v1/report_section_feedback",
      method: "POST",
      status: 400,
      code: "42P10",
    });
    expect(out).toContain("path=/rest/v1/report_section_feedback");
    expect(out).toContain("method=POST");
    expect(out).toContain("status=400");
    expect(out).toContain("code=42P10");
  });

  it("is an allowlist, because Slack is a wider audience than the log store", () => {
    /**
     * Log context routinely carries a reader's email, a report token or a
     * Stripe id. A dump of the context would put all of it in a channel that
     * more people can read than can read the logs.
     */
    const out = diagnosticSuffix({
      path: "/rest/v1/payment",
      email: "someone@example.com",
      report_token: "rpt_ZZZZZZZZ",
      stripe_customer_id: "cus_123",
      message: "Key (email)=(someone@example.com) already exists",
    });
    expect(out).toContain("path=");
    expect(out).not.toContain("example.com");
    expect(out).not.toContain("rpt_");
    expect(out).not.toContain("cus_");
  });

  it("never expands an object, which is where payloads hide", () => {
    // The object must sit on an ALLOWLISTED key, or the guard is never reached
    // and the test passes on an unrelated path — a `body` key is filtered out
    // by the allowlist long before the type check runs.
    const out = diagnosticSuffix({ path: { href: "/x", email: "a@b.com" }, status: 500 });
    expect(out).toBe(" · status=500");
    expect(out).not.toContain("a@b.com");
  });

  it("is actually attached to the alert, not merely exported", () => {
    /**
     * The function passing its own unit tests proves nothing about whether the
     * Slack text calls it. Dropping `${diagnosticSuffix(ctx)}` from the
     * template left every test in this file green while alerts went back to
     * being unactionable — the exact "a predicate can be tested and never
     * called" failure this repo has paid for before.
     */
    const src = readFileSync(resolve(process.cwd(), "shared/observability/logger.ts"), "utf8");
    expect(src).toMatch(
      /text: `:rotating_light: \*\$\{kind\}\* — \$\{msg\}\$\{diagnosticSuffix\(ctx\)\}`/
    );
  });

  it("adds nothing when there is nothing to add", () => {
    expect(diagnosticSuffix(null)).toBe("");
    expect(diagnosticSuffix({})).toBe("");
    // Empty strings are not detail either.
    expect(diagnosticSuffix({ path: "", code: undefined })).toBe("");
  });

  it("truncates, so one enormous value cannot flood the channel", () => {
    const out = diagnosticSuffix({ path: "/".repeat(500) });
    expect(out.length).toBeLessThan(120);
  });
});
