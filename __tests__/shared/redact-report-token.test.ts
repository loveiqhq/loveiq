/**
 * `analytics_event` must never hold a report token.
 *
 * It held 2,424 of them across five event types, from 2026-05-22 until this
 * guard, and was still writing daily. The 2026-09-20 decision accepted the
 * token in PostHog's URLs and explicitly excluded the database; that fix closed
 * `ux_finding` and never looked at this table. The leak is `metadata.pathname`,
 * which is `location.pathname + location.search` — on a report that is
 * `/report/rpt_…`.
 *
 * Nothing analytical is lost: every row already carries survey_submission_id.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { redactReportToken, redactReportTokensDeep } from "@shared/format/redact-report-token";

/** The shape the five leaking event types actually wrote. */
const REAL_ROW = {
  pathname: "/report/rpt_a9LY0Obbla1FVsclJ1nM?from=email",
  max_scroll_pct: 100,
  landing_variant: "white",
};

const LEAKS = /rpt_[A-Za-z0-9]{6,}/;

describe("redactReportToken", () => {
  it("removes the token and keeps the rest of the URL", () => {
    expect(redactReportToken("/report/rpt_a9LY0Obbla1FVsclJ1nM")).toBe("/report/<redacted>");
    // The query string is where the campaign attribution lives, and the
    // fragment names the section — both are the analytical value of the field.
    expect(redactReportToken("/report/rpt_abc123?from=email")).toBe(
      "/report/<redacted>?from=email"
    );
    expect(redactReportToken("/report/rpt_abc#typical_sexual_fantasy")).toBe(
      "/report/<redacted>#typical_sexual_fantasy"
    );
  });

  it("stops at whitespace instead of eating the rest of the line", () => {
    // `[^/?#]+` ended only at a URL delimiter, so on free text it swallowed
    // everything after the token. A real path has no space in it.
    expect(redactReportToken("tapped at /report/rpt_aaaaaaaaaa and left")).toBe(
      "tapped at /report/<redacted> and left"
    );
  });

  it("catches the token as a QUERY PARAMETER, not just in the path", () => {
    /**
     * 403 of the 2,424 leaked rows are this shape. A guard keyed on `/report/`
     * leaves every one of them and every future checkout event, while the
     * clean-up reports success — which is how a partial fix gets recorded as a
     * closed one.
     */
    expect(redactReportToken("/checkout?plan=all_reports&token=rpt_a9LY0Obbla1FVsclJ1nM")).toBe(
      "/checkout?plan=all_reports&token=rpt_<redacted>"
    );
    // The plan is the analytical value of that row and must survive.
    expect(
      redactReportToken("/checkout?plan=all_reports&token=rpt_a9LY0Obbla1FVsclJ1nM")
    ).toContain("plan=all_reports");
    // Bare, with no URL around it at all.
    expect(redactReportToken("report_token=in.(rpt_aaaaaaaaaaaaaaaaaaaa)")).toBe(
      "report_token=in.(rpt_<redacted>)"
    );
  });

  it("leaves every other path alone", () => {
    // Over-redacting blinds the "where did this happen" question, which is the
    // entire reason the field is stored.
    for (const p of [
      "/survey",
      "/",
      "/reports/overview",
      "/report",
      "/reporting/x",
      // A checkout WITHOUT a token must be untouched — the new bare pattern
      // must not fire on the page itself.
      "/checkout?plan=all_reports",
      // Short enough not to be a token; must not be swallowed.
      "rpt_x",
    ]) {
      expect(redactReportToken(p)).toBe(p);
    }
  });
});

describe("redactReportTokensDeep", () => {
  it("cleans the row shape that actually leaked", () => {
    const out = redactReportTokensDeep(REAL_ROW);
    expect(JSON.stringify(out)).not.toMatch(LEAKS);
    expect(out.pathname).toBe("/report/<redacted>?from=email");
    // Everything that is not the credential survives untouched.
    expect(out.max_scroll_pct).toBe(100);
    expect(out.landing_variant).toBe("white");
  });

  it("is not keyed on the field name that happened to leak", () => {
    // The schema accepts any flat object the client sends. A guard that only
    // knew `pathname` would be wrong the first time somebody added `referrer`.
    const out = redactReportTokensDeep({
      referrer: "https://x.test/report/rpt_bbbbbbbbbb",
      nested: { deep: ["/report/rpt_cccccccccc"] },
      url: "/report/rpt_dddddddddd",
    });
    expect(JSON.stringify(out)).not.toMatch(LEAKS);
  });

  it("keeps an array an array", () => {
    /**
     * Arrays ARE objects, so dropping the Array.isArray branch still redacts —
     * Object.entries walks the indices — but hands back `{0: …, 1: …}`. The
     * payload is stored as jsonb and read back by the admin timeline, so a list
     * that silently becomes a keyed object is a corrupted row, not a cosmetic
     * difference. Caught by mutation: without this the branch could be deleted
     * and every other assertion still passed.
     */
    const out = redactReportTokensDeep({ steps: ["/report/rpt_eeeeeeeeee", "/survey"] });
    expect(Array.isArray(out.steps)).toBe(true);
    expect(out.steps).toEqual(["/report/<redacted>", "/survey"]);

    const bare = redactReportTokensDeep(["/report/rpt_ffffffffff"]);
    expect(Array.isArray(bare)).toBe(true);
    expect(bare).toEqual(["/report/<redacted>"]);
  });

  it("passes non-strings through unharmed", () => {
    const input = { a: 1, b: true, c: null, d: undefined, e: [1, 2] };
    expect(redactReportTokensDeep(input)).toEqual(input);
    expect(redactReportTokensDeep({})).toEqual({});
  });

  it("returns the SAME object when there is nothing to redact", () => {
    // Not cosmetic: the common path is every non-report page, and a guard that
    // rebuilt every payload would be paid for on every event.
    const clean = { pathname: "/survey", n: 1 };
    expect(redactReportTokensDeep(clean)).toBe(clean);
  });
});

describe("the route actually applies it", () => {
  it("redacts the metadata it writes", () => {
    // The function existing proves nothing — the ledger fix shipped a working
    // redactor and left a second column unredacted for a day. Pin the call at
    // the write site, with comments stripped so a mention in prose cannot
    // satisfy it.
    const src = readFileSync(resolve(process.cwd(), "app/api/analytics-event/route.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    const writes = src.match(/metadata: /g) ?? [];
    expect(writes.length, "there should be a metadata write to check").toBeGreaterThan(0);
    expect(src).toMatch(/metadata: redactReportTokensDeep\(/);
  });
});
