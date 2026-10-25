import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { TOUR_STEP_IDS } from "@features/report/logic/guidedTour";

// The AP readers' rules that only the SQL text holds: a test against a database would need
// one with the migrations applied, so these read the migration itself.
const FIRST = readFileSync("supabase/migrations/20261014130000_ap_tracking.sql", "utf8");
const ROLLBACK = readFileSync("supabase/rollbacks/20261014130000_ap_tracking_down.sql", "utf8");
// 20261024160000 replaces all four readers: every rule here holds for both bodies.
const LATEST = readFileSync(
  "supabase/migrations/20261024160000_ap_reads_what_was_shown.sql",
  "utf8"
);
const LATEST_ROLLBACK = readFileSync(
  "supabase/rollbacks/20261024160000_ap_reads_what_was_shown_down.sql",
  "utf8"
);
const READERS = ["ap_facts", "ap_survey_steps", "ap_report_extras", "ap_question_answers"];
// 20261024160000 also replaces these two, for the team's accounts (ap_team_user) alone, and the
// question funnel's runs (get_survey_dropoff_runs: each run's questions in its order).
const TEAM_ONLY = ["ap_report_tour", "ap_unlock_feedback"];
const ORIGIN: Record<string, string> = {
  get_survey_dropoff_runs: readFileSync(
    "supabase/migrations/20261012093000_survey_event_device.sql",
    "utf8"
  ),
  ap_report_tour: readFileSync("supabase/migrations/20261018210100_ap_report_tour.sql", "utf8"),
  ap_unlock_feedback: readFileSync(
    "supabase/migrations/20261018210200_ap_unlock_feedback.sql",
    "utf8"
  ),
};

const count = (s: string, re: RegExp) => s.match(new RegExp(re, "g"))?.length ?? 0;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const signatures = (s: string) =>
  [...s.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(([^)]*)\)/g)]
    .map((m) => `${m[1]}(${m[2]})`)
    .sort();

describe.each([
  ["20261014130000", FIRST],
  ["20261024160000", LATEST],
])("AP readers' SQL (%s)", (_migration, SQL) => {
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
    for (const fn of SQL === LATEST ? [...READERS, ...TEAM_ONLY] : READERS) {
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
});

describe("AP readers' rollbacks", () => {
  it("20261014130000's puts back the same four readers, reading nothing the new tables add", () => {
    expect(signatures(ROLLBACK)).toEqual(signatures(FIRST));
    expect(signatures(FIRST)).toHaveLength(READERS.length);
    expect(ROLLBACK).not.toMatch(/is_tablet|email_message_event|intro_skip_4/);
  });

  it("20261024160000's puts back the same six readers as production ran them, then the view goes", () => {
    expect(signatures(LATEST_ROLLBACK)).toEqual(signatures(LATEST));
    expect(signatures(LATEST)).toEqual(
      [
        ...signatures(FIRST),
        "ap_report_tour(p_from date, p_to date)",
        "ap_unlock_feedback(p_from date, p_to date)",
        "get_survey_dropoff_runs(since_ts timestamp with time zone, until_ts timestamp with time zone)",
      ].sort()
    );
    // Each body as the migration that last wrote it left it.
    const body = (s: string, fn: string) => {
      const start = s.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
      const open = s.indexOf("$function$", start) + "$function$".length;
      return s.slice(open, s.indexOf("$function$", open)).trim();
    };
    const dollar = (s: string, fn: string) => {
      const m = s.match(
        new RegExp(`FUNCTION public\\.${fn}\\([^)]*\\)[\\s\\S]*?AS (\\$\\w*\\$)([\\s\\S]*?)\\1`)
      );
      return m![2]!.trim();
    };
    for (const fn of READERS) expect(body(LATEST_ROLLBACK, fn)).toBe(body(FIRST, fn));
    for (const fn of [...TEAM_ONLY, "get_survey_dropoff_runs"])
      expect(body(LATEST_ROLLBACK, fn)).toBe(dollar(ORIGIN[fn]!, fn));
    // The readers are back before the view they read is dropped.
    expect(LATEST_ROLLBACK.indexOf("DROP VIEW IF EXISTS public.ap_team_user;")).toBeGreaterThan(
      LATEST_ROLLBACK.lastIndexOf("CREATE OR REPLACE FUNCTION")
    );
  });
});

describe("AP readers' SQL, as 20261024160000 reads", () => {
  const body = (fn: string) => {
    const start = LATEST.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
    const open = LATEST.indexOf("$function$", start) + "$function$".length;
    return LATEST.slice(open, LATEST.indexOf("$function$", open));
  };

  it("takes the team from one view, in every reader: an @loveiq.org account or the team's test code", () => {
    const view = LATEST.slice(
      LATEST.indexOf("CREATE OR REPLACE VIEW public.ap_team_user"),
      LATEST.indexOf("CREATE OR REPLACE FUNCTION")
    );
    expect(view).toMatch(/WITH \(security_invoker = true\)/);
    expect(view).toMatch(
      /SELECT u\.id FROM app_user u WHERE u\.email ~\* '@loveiq\\\.org\$'\s+UNION/
    );
    expect(view).toMatch(/p\.metadata->>'couponName' = '100%test' AND s\.user_id IS NOT NULL/);
    expect(view).toMatch(/REVOKE ALL ON public\.ap_team_user FROM PUBLIC, anon, authenticated;/);
    expect(view).toMatch(/GRANT SELECT ON public\.ap_team_user TO service_role;/);
    for (const fn of [...READERS, ...TEAM_ONLY]) {
      const b = body(fn);
      expect(b).toMatch(/\bap_team_user\b/);
      // No reader judges an account by its address alone; an invite's sender has only one.
      expect(
        b.replace(/coalesce\(i\.referrer_email, ''\) !~\* '@loveiq\\\.org\$'/, "")
      ).not.toMatch(/@loveiq/);
    }
  });

  it("gives the question funnel each run's questions in the order it was asked them, and when it last moved", () => {
    const runs = body("get_survey_dropoff_runs");
    expect(runs).toMatch(
      /array_agg\(x\.q_id ORDER BY x\.first_idx, x\.first_at, x\.q_id\) AS reached/
    );
    expect(runs).toMatch(/min\(e\.question_index\) AS first_idx/);
    expect(runs).toMatch(/'last_at',\s+l\.created_at/);
    // Google Ads as AP's sources read a visit: a click id, or tagged google / cpc.
    expect(runs).toMatch(
      /lower\(tracker_arm\(t\.tracker, 'utm_source'\)\) = 'google'\s+AND lower\(tracker_arm\(t\.tracker, 'utm_medium'\)\) IN \('cpc', 'ppc', 'paid', 'ads'\)/
    );
    const steps = body("ap_survey_steps");
    expect(steps).toMatch(/first_asked AS \(/);
    expect(steps).toMatch(
      /'first_asked', \(SELECT coalesce\(json_object_agg\(f\.q_id, f\.at\), '\{\}'::json\) FROM first_asked f\)/
    );
    // The deployed page still reads exits until the new one ships: kept.
    expect(steps).toMatch(/'exits', \(SELECT/);
  });

  it("places a run that walked back out of the questions where the walk began, and counts no Went back or stay for it", () => {
    // The browser's Back, pressed again and again from question 14, records a Back on every
    // question down to 1 in a second: the run left at 14, and went back from none of them.
    const runs = body("get_survey_dropoff_runs");
    expect(runs).toMatch(/walk AS \(/);
    expect(runs).toMatch(
      /e\.direction = 'back'[\s\S]*NOT EXISTS \(SELECT 1 FROM survey_behavior_event o[\s\S]*o\.direction IN \('forward', 'complete'\)\s+AND \(o\.created_at, o\.id\) > \(e\.created_at, e\.id\)\)\s+ORDER BY e\.session_id, e\.created_at, e\.id/
    );
    expect(runs).toMatch(/THEN coalesce\(wk\.q_id, l\.q_id\) END/);
    const steps = body("ap_survey_steps");
    expect(steps).toMatch(/FILTER \(WHERE direction = 'back' AND NOT walking_out\) AS went_back/);
    expect(steps).toMatch(/FILTER \(WHERE ms IS NOT NULL AND NOT after_walk\) AS median_ms/);
    // From the walk's first Back on no Back is Went back; after it, no step is a stay.
    expect(steps).toMatch(
      /coalesce\(\(e\.created_at, e\.id\) >= \(w\.created_at, w\.id\), false\) AS walking_out/
    );
    expect(steps).toMatch(
      /coalesce\(\(e\.created_at, e\.id\) > \(w\.created_at, w\.id\), false\) AS after_walk/
    );
    // The intro's Backs likewise count only before question 1.
    const facts = body("ap_facts");
    expect(facts).toMatch(
      /count\(\*\) FILTER \(WHERE qb\.visitor_id IS NULL OR qb\.first_seen > f\.first_seen\) AS n/
    );
  });

  it("dates a question's first asking by anyone but the team, who try questions before release", () => {
    const fa = body("ap_survey_steps").split("first_asked AS (")[1]!.split("\n  )")[0]!;
    expect(fa).toMatch(
      /NOT EXISTS \(SELECT 1 FROM staff_sessions t WHERE t\.session_id = e\.session_id\)/
    );
    expect(fa).toMatch(/e\.client_ip IN \(SELECT client_ip FROM staff_ips\)/);
    expect(fa).toMatch(/NOT EXISTS \(SELECT 1 FROM ap_team_user t WHERE t\.id = s\.user_id\)/);
  });

  it("leaves the team's unfinished runs out of the starts and the question steps", () => {
    const facts = body("ap_facts");
    expect(facts).toMatch(/staff_ips AS \(/);
    expect(facts).toMatch(
      /AND \(sb\.status = 'completed' OR NOT \(COALESCE\(ev\.staff_ip, false\) OR COALESCE\(dr\.staff_ip, false\)\)\)/
    );
    const steps = body("ap_survey_steps");
    expect(steps).toMatch(/e\.session_id NOT IN \(SELECT session_id FROM team_sessions\)/);
    expect(steps).toMatch(
      /'staff', \(SELECT coalesce\(json_agg\(DISTINCT x\.session_id\), '\[\]'::json\) FROM team_sessions x\)/
    );
  });

  it("leaves runs begun before the range out of the question steps, and lists them", () => {
    const steps = body("ap_survey_steps");
    // Begun earlier by any of the three marks a start is dated by: a step, the draft, the survey.
    expect(steps).toMatch(/earlier AS \(/);
    for (const mark of [
      /FROM survey_behavior_event e\s+WHERE e\.session_id = w\.session_id AND e\.created_at < b\.since_ts/,
      /FROM survey_partial_save d\s+WHERE d\.session_id = w\.session_id AND d\.started_at < b\.since_ts/,
      /FROM survey_submission s\s+WHERE s\.session_id = w\.session_id AND s\.start_date_time < b\.since_ts/,
    ])
      expect(steps).toMatch(mark);
    expect(steps).toMatch(/e\.session_id NOT IN \(SELECT session_id FROM earlier\)/);
    expect(steps).toMatch(
      /'earlier', \(SELECT coalesce\(json_agg\(DISTINCT x\.session_id\), '\[\]'::json\) FROM earlier x\)/
    );
  });

  it("takes a survey as pay to start's only when a completed purchase claimed it, as its page does", () => {
    const facts = body("ap_facts");
    expect(facts).toMatch(
      /pts_subs AS \(\s+SELECT DISTINCT p\.consumed_submission_id AS sid\s+FROM prepaid_report_access p\s+WHERE p\.consumed_submission_id IS NOT NULL AND p\.offer IS NOT NULL\s+AND p\.paid_at IS NOT NULL AND p\.status IN \('succeeded', 'refunded'\)/
    );
    // On every finisher, start, payment, refund, checkout, quote and lifetime sale; never a
    // tracker's label.
    expect(count(facts, /IN \(SELECT sid FROM pts_subs\)/)).toBe(7);
    expect(facts).toMatch(/'pts', s\.id IN \(SELECT sid FROM pts_subs\)\)/);
    // The report's checkouts only: pay to start's own purchase is its page's (written once paid).
    expect(facts).toMatch(
      /AND coalesce\(p\.metadata->>'journey', ''\) <> 'pay_to_start'\s+AND o\.opened >= b\.since_ts/
    );
    expect(facts).not.toMatch(/journey'?, ''\) = 'pay_to_start'|pay_to_start_submission/);
  });

  it("dates a payment by when it was paid, not when its row was written (a claimed pay-to-start purchase)", () => {
    const facts = body("ap_facts");
    const paid = "coalesce(p.payment_date_time, p.created_date_time)";
    // The money's and the refunds' day and range, and each finisher's first paid sale.
    expect(
      count(facts, new RegExp(esc(`(${paid} AT TIME ZONE 'Europe/Berlin')::date AS day`)))
    ).toBe(2);
    expect(
      count(facts, new RegExp(esc(`AND ${paid} >= b.since_ts AND ${paid} < b.until_ts`)))
    ).toBe(2);
    expect(facts).toMatch(new RegExp(esc(`min(${paid}) FILTER (WHERE p.amount > 0) AS paid_at`)));
  });

  it("never takes a reader's device from a quote a reminder job made", () => {
    // The finisher's, the payments', the checkouts' and the quotes' device all skip them.
    expect(count(body("ap_facts"), /q2?\.id NOT IN \(SELECT id FROM cron_q\)/)).toBe(4);
    expect(body("ap_facts")).toMatch(/WHEN q\.id IN \(SELECT id FROM cron_q\)/);
    expect(body("ap_question_answers")).toMatch(/q2\.id NOT IN \(SELECT id FROM cron_q\)/);
  });

  it("keeps a pre-2.0 quote's price only where a real payment was made on it", () => {
    expect(body("ap_facts")).toMatch(
      /EXISTS \(SELECT 1 FROM payment p WHERE p\.pricing_quote_id = q\.id AND p\.status = 'succeeded'\s+AND coalesce\(p\.is_test, false\) = false AND p\.amount > 0\)/
    );
    expect(body("ap_facts")).not.toMatch(/q\.purchased_at IS NOT NULL/);
  });

  it("reads gender, relationship and country from the survey's own answers first", () => {
    expect(body("ap_facts")).toMatch(/coalesce\(o\.gender, up\.gender\) AS gender/);
    expect(body("ap_question_answers")).toMatch(/'gender', coalesce\(own\.gender, up\.gender\)/);
  });

  it("tells tablets apart only in ranges from 17 Oct 2026, in every reader", () => {
    for (const fn of ["ap_facts", "ap_question_answers"]) {
      const b = body(fn);
      const flags = count(b, /e\.is_tablet\)/) + count(b, /t\.is_tablet\)/);
      expect(flags).toBeGreaterThan(0);
      expect(count(b, /p_from >= DATE '2026-10-17'/)).toBeGreaterThanOrEqual(
        fn === "ap_facts" ? 5 : 1
      );
    }
  });

  it("lets the 78h call invite, which had no report link, end no email's window", () => {
    expect(body("ap_report_extras")).toMatch(/y\.stage <> '78h_no_unlock'/);
    expect(body("ap_report_extras")).not.toMatch(/lead\(x\.sent_at\)/);
  });

  it("lets the catalog keep notes on Search Console's tables, and its rollback drop them", () => {
    expect(LATEST).toMatch(/'ads'::text, 'gsc'::text\]\)\)/);
    expect(LATEST_ROLLBACK).toMatch(/DELETE FROM public\.admin_field_note WHERE source = 'gsc';/);
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
