import { describe, expect, it } from "vitest";
import {
  buildClarityRows,
  collapseByPage,
  redactUrl,
  worst,
} from "@features/brain/server/ingest/clarity";

/** One metric block in the shape Clarity's export actually returns — copied from the
 *  first real pull on 2026-09-17, not invented. */
const metric = (name: string, rows: Array<Record<string, unknown>>) => ({
  metricName: name,
  information: rows,
});
const row = (url: string, pct: number, sessions = 100) => ({
  Url: url,
  sessionsCount: sessions,
  sessionsWithMetricPercentage: pct,
  sessionsWithoutMetricPercentage: 100 - pct,
  pagesViews: 0,
  subTotal: 0,
});
const P = "https://www.loveiq.org";

describe("redactUrl", () => {
  it("removes the report token, which is an access credential", () => {
    /**
     * THE REASON THIS FUNCTION EXISTS. A report token grants access to that person's
     * report. Clarity records the full URL, so the raw feed carries live tokens, and the
     * corpus is read by the whole team and quoted back inside answers.
     */
    expect(redactUrl(`${P}/report/rpt_wOSRA1cmNHGhUDWjTi8n`)).toBe(`${P}/report/<token>`);
    expect(redactUrl(`${P}/report/rpt_g1aB9y2XnV5AFSOGUBHs?from=email&archetype=x`)).toBe(
      `${P}/report/<token>`
    );
    // The shape must survive a fragment too — the real feed carries #welcome anchors.
    expect(redactUrl(`${P}/report/rpt_FArXpxXGZaJQxUCT40ST?a=1#welcome`)).toBe(
      `${P}/report/<token>`
    );
  });

  it("never lets a token through in any position", () => {
    const out = redactUrl(`${P}/report/rpt_SECRETTOKEN123?utm=x#y`);
    expect(out).not.toContain("SECRETTOKEN123");
    expect(out).not.toContain("rpt_");
  });

  it("drops the query string, which fragments identical pages and carries campaign ids", () => {
    expect(redactUrl(`${P}/?utm_source=google&utm_medium=cpc&utm_campaign=price_time_test`)).toBe(
      `${P}/`
    );
  });
});

describe("collapseByPage", () => {
  it("keeps only the live host, so CI's localhost sessions cannot poison the corpus", () => {
    /**
     * Measured on the first pull: 177 of 711 sessions were `localhost:3000`, on exactly
     * the two paths Lighthouse CI probes — because CI builds with the production site URL
     * and then serves it on localhost, which makes `isProductionSite()` true there.
     */
    const out = collapseByPage([
      metric("DeadClickCount", [
        row("http://localhost:3000/", 90),
        row("http://localhost:3000/about", 87),
        row(`${P}/survey`, 22.6, 133),
      ]),
    ]);
    expect(out.map((p) => p.path)).toEqual(["/survey"]);
  });

  it("ignores volume metrics — GA4 covers those better", () => {
    const out = collapseByPage([
      metric("Traffic", [row(`${P}/pricing`, 100)]),
      metric("ScrollDepth", [row(`${P}/pricing`, 100)]),
    ]);
    expect(out).toEqual([]);
  });

  it("merges the pages that redaction made identical", () => {
    // Three different readers' report pages collapse to one row: 40 sessions each, so
    // (10 + 55 + 30) / 3 = 31.7% over 120 sessions.
    const out = collapseByPage([
      metric("DeadClickCount", [
        row(`${P}/report/rpt_aaa`, 10, 40),
        row(`${P}/report/rpt_bbb`, 55, 40),
        row(`${P}/report/rpt_ccc`, 30, 40),
      ]),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.path).toBe("/report/<token>");
    expect(out[0]!.sessions).toBe(120);
    expect(out[0]!.signals.DeadClickCount).toBe(31.7);
  });

  it("recombines merged rates as COUNTS, not as the largest percentage", () => {
    /**
     * THE BUG THIS EXISTS FOR, found by a dry run against the real feed and invisible to
     * every test above because they all used equal denominators.
     *
     * The homepage appears once per campaign query string. One of those had a single
     * session that bounced — 100% — and the bare homepage had 58 sessions at 0%. Keeping
     * the largest rate printed "/ — 58 sessions: 100.0% quick-backs", which never
     * happened: it was one session on one ad URL.
     *
     * The truth is one affected session in 59, which is 1.7%.
     */
    const out = collapseByPage([
      metric("QuickbackClick", [
        row(`${P}/`, 0, 58),
        row(`${P}/?utm_source=google&utm_campaign=performance_max`, 100, 1),
      ]),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.sessions).toBe(59);
    expect(out[0]!.signals.QuickbackClick).toBe(1.7);
  });

  it("counts zero-rate sessions into the denominator", () => {
    // Dropping them is the same bug wearing a different hat: 2 affected of 102 is 2.0%,
    // but ignoring the 100 clean sessions would report it as 100%.
    const out = collapseByPage([
      metric("RageClickCount", [row(`${P}/x`, 0, 100), row(`${P}/x?a=1`, 100, 2)]),
    ]);
    expect(out[0]!.sessions).toBe(102);
    expect(out[0]!.signals.RageClickCount).toBe(2);
  });

  it("carries every frustration signal for a page onto one row", () => {
    const out = collapseByPage([
      metric("DeadClickCount", [row(`${P}/survey`, 22.6, 133)]),
      metric("RageClickCount", [row(`${P}/survey`, 3.8, 133)]),
    ]);
    expect(out[0]!.signals).toEqual({ DeadClickCount: 22.6, RageClickCount: 3.8 });
    expect(worst(out[0]!)).toBe(22.6);
  });

  it("drops a page where the signal never fired, rather than listing it at zero", () => {
    const out = collapseByPage([metric("RageClickCount", [row(`${P}/about`, 0, 500)])]);
    expect(out).toEqual([]);
  });

  it("puts the worst page first", () => {
    const out = collapseByPage([
      metric("DeadClickCount", [row(`${P}/a`, 5, 100), row(`${P}/b`, 40, 100)]),
    ]);
    expect(out.map((p) => p.path)).toEqual(["/b", "/a"]);
  });
});

describe("buildClarityRows", () => {
  const pages = [
    { path: "/survey", sessions: 133, signals: { DeadClickCount: 22.6, RageClickCount: 3.8 } },
    { path: "/tiny", sessions: 1, signals: { DeadClickCount: 100 } },
  ];

  it("leaves out pages too small to mean anything", () => {
    /**
     * A single session with one dead click reads as 100% and is not evidence. Without
     * this the report's loudest line would always be its least reliable one.
     */
    const body = buildClarityRows(pages, "2026-09-16", "2026-09-17T05:40:00Z")[0]!.body;
    expect(body).toContain("/survey");
    expect(body).not.toContain("/tiny");
  });

  it("writes one dated row per window, not one per page", () => {
    const rows = buildClarityRows(pages, "2026-09-16", "2026-09-17T05:40:00Z");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.source).toBe("clarity");
    // Dated id, so re-running the same day overwrites instead of accumulating a second
    // opinion about the same three days.
    expect(rows[0]!.source_id).toBe("clarity:2026-09-16");
    expect(rows[0]!.period_end).toBe("2026-09-16");
  });

  it("says what a rate means, so the number cannot be read as a count", () => {
    const body = buildClarityRows(pages, "2026-09-16", "2026-09-17T05:40:00Z")[0]!.body;
    expect(body).toContain("share of that page's sessions");
    expect(body).toContain("22.6%");
    // In words, not jargon: the corpus is read by people who have never used Clarity.
    expect(body).toContain("looks clickable and is not");
  });

  it("writes nothing at all when nothing was frustrating", () => {
    // Silence rather than a row saying "no findings" — an empty finding still competes in
    // every search about the pages it would have named.
    expect(buildClarityRows([], "2026-09-16", "2026-09-17T05:40:00Z")).toEqual([]);
    expect(buildClarityRows([pages[1]!], "2026-09-16", "2026-09-17T05:40:00Z")).toEqual([]);
  });
});
