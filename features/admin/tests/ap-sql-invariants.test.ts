import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { TOUR_STEP_IDS } from "@features/report/logic/guidedTour";

// The AP readers' rules that only the SQL text holds: a test against a database would need
// one with the migrations applied, so these read the migration itself.
const SQL = readFileSync("supabase/migrations/20261014130000_ap_tracking.sql", "utf8");
const ROLLBACK = readFileSync("supabase/rollbacks/20261014130000_ap_tracking_down.sql", "utf8");
const READERS = ["ap_facts", "ap_survey_steps", "ap_report_extras", "ap_question_answers"];

const count = (s: string, re: RegExp) => s.match(new RegExp(re, "g"))?.length ?? 0;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const signatures = (s: string) =>
  [...s.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(([^)]*)\)/g)]
    .map((m) => `${m[1]}(${m[2]})`)
    .sort();

describe("AP readers' SQL", () => {
  it("casts a wizard slide number only when it is 0 to 5", () => {
    // A slide outside the wizard's six would fail the whole page's cast, or count as a slide.
    for (const key of ["to_slide", "from_slide"]) {
      const field = esc(`(a.metadata->>'${key}')`);
      const casts = count(SQL, new RegExp(`${field}::int`));
      const guarded = count(
        SQL,
        new RegExp(`CASE WHEN ${field} ~ '\\^\\[0-5\\]\\$' THEN ${field}::int`)
      );
      expect(casts).toBeGreaterThan(0);
      expect(guarded).toBe(casts);
    }
  });

  it("reads a visit's time only under 4 hours, and at most 30 minutes of it", () => {
    expect(SQL).toMatch(
      /sum\(least\(extract\(epoch FROM s\.ended_at - s\.started_at\), 1800\) \* 1000\)\s+FILTER \(WHERE s\.ended_at > s\.started_at AND s\.ended_at - s\.started_at < interval '4 hours'\)/
    );
    // The visits the time is averaged over, by the same rule.
    expect(SQL).toMatch(
      /count\(\*\) FILTER \(WHERE s\.ended_at > s\.started_at AND s\.ended_at - s\.started_at < interval '4 hours'\) AS closed/
    );
  });

  it("counts an email's opens and clicks only once it is known delivered", () => {
    for (const kind of ["opened", "clicked"]) {
      expect(SQL).toMatch(
        new RegExp(
          `WHERE m\\.event_type = '${kind}'\\s+AND EXISTS \\(SELECT 1 FROM email_message_event d WHERE d\\.resend_id = m\\.resend_id AND d\\.event_type = 'delivered'\\)\\s+\\) AS ${kind}`
        )
      );
    }
  });

  it("marks a finisher who bought a full unlock (Full, Full All or Core) at any point, not only first", () => {
    expect(SQL).toMatch(
      /coalesce\(bool_or\(p\.metadata->>'plan' IN \('full_report', 'all_reports', 'core'\)\) FILTER \(WHERE p\.amount > 0\), false\) AS full_paid/
    );
    expect(SQL).toMatch(/'full', coalesce\(x\.full_paid, false\)/);
  });

  it("reads a report as opened from its first sign, so no later step outnumbers the opens", () => {
    expect(SQL).toMatch(
      /coalesce\(r\.opened_at, least\(q\.paywall_at, c\.at, q\.checkout_at, p\.paid_at\)\) AS opened_at/
    );
    // The prices table counts people at every step, sales too.
    expect(SQL).toMatch(/count\(DISTINCT qu\.sid\) FILTER \(WHERE qs\.sales > 0\) AS sales/);
  });

  it("leaves a Skip Intro on slide 4 out of going on and of the slide's time", () => {
    expect(SQL).toMatch(/FILTER \(WHERE s4\.visitor_id IS NULL\) AS went_on/);
    expect(SQL).toMatch(/> f\.first_seen AND s4\.visitor_id IS NULL\), '\{\}'\) AS ms/);
    expect(SQL).toMatch(/s4\.event_type = 'intro_skip_4'/);
  });

  it("runs each reader as its owner, on a fixed search path, for the service role only", () => {
    for (const fn of READERS) {
      const start = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
      expect(start).toBeGreaterThanOrEqual(0);
      const head = SQL.slice(start, SQL.indexOf("$function$", start));
      expect(head).toMatch(/SECURITY DEFINER/);
      expect(head).toMatch(/SET search_path TO 'public', 'pg_temp'/);
      expect(SQL).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`
        )
      );
      expect(SQL).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO service_role;`)
      );
    }
  });

  it("has a rollback that puts back the same four readers, reading nothing the new tables add", () => {
    expect(signatures(ROLLBACK)).toEqual(signatures(SQL));
    expect(signatures(SQL)).toHaveLength(READERS.length);
    expect(ROLLBACK).not.toMatch(/is_tablet|email_message_event|intro_skip_4/);
  });
});

describe("the guided tour's SQL (ap_report_tour)", () => {
  const TOUR = readFileSync("supabase/migrations/20261018210100_ap_report_tour.sql", "utf8");
  const TOUR_DOWN = readFileSync(
    "supabase/rollbacks/20261018210100_ap_report_tour_down.sql",
    "utf8"
  );

  it("knows the tour's own stops, and places a run only when every stop it carries is one", () => {
    const known = /coalesce\(x->>'id', ''\) NOT IN \(([^)]*)\)/.exec(TOUR)?.[1] ?? "";
    expect(known.split(",").map((s) => s.trim().replace(/'/g, ""))).toEqual([...TOUR_STEP_IDS]);
  });

  it("casts a stop's time and Back presses only once they are whole numbers", () => {
    for (const key of ["ms", "back"]) {
      const field = esc(`(x.value->>'${key}')`);
      const casts = count(TOUR, new RegExp(`${field}::`));
      const guarded = count(
        TOUR,
        new RegExp(`CASE WHEN x\\.value->>'${key}' ~ '\\^\\[0-9\\]\\{1,\\d+\\}\\$' THEN ${field}::`)
      );
      expect(casts).toBeGreaterThan(0);
      expect(guarded).toBe(casts);
    }
  });

  it("reads first runs' starts and ends alone, staff out, for the service role only", () => {
    expect(TOUR).toMatch(
      /a\.event_type IN \('tour_started', 'tour_completed', 'tour_skipped', 'tour_left'\)\s+AND a\.metadata->>'trigger' = 'auto'/
    );
    expect(TOUR).toMatch(/NOT EXISTS \(SELECT 1 FROM staff WHERE staff\.id = s\.user_id\)/);
    const head = TOUR.slice(TOUR.indexOf("CREATE OR REPLACE FUNCTION"), TOUR.indexOf("$function$"));
    expect(head).toMatch(/SECURITY DEFINER/);
    expect(head).toMatch(/SET search_path TO 'public', 'pg_temp'/);
    expect(TOUR).toMatch(
      /REVOKE ALL ON FUNCTION public\.ap_report_tour\(date, date\) FROM PUBLIC, anon, authenticated;/
    );
    expect(TOUR).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.ap_report_tour\(date, date\) TO service_role;/
    );
    expect(TOUR_DOWN).toMatch(/DROP FUNCTION IF EXISTS public\.ap_report_tour\(date, date\);/);
  });
});
