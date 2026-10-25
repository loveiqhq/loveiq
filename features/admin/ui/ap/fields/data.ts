/**
 * The Data sources catalog's table facts (Key, Joins, Rows, Fresh, Fields) and the raw data
 * explorer's row count. Each query was run read-only on 21 Oct 2026 and gave the page's own
 * figure (scratchpad impl/data/checks.md).
 */
import type { FieldRegistry, FieldTable } from "./types";

const WHOLE = "None: the catalog shows the whole table, whatever the filter bar says";
const SUBMISSIONS: FieldTable = {
  source: "production",
  table: "survey_submission",
  columns: "",
  filters: WHOLE,
};
const EVENTS: FieldTable = {
  source: "posthog",
  table: "events",
  columns: "",
  filters: WHOLE,
  watch:
    "PostHog records part of the visitors: ad blockers hide some, and it drops the bots it spots.",
};
const EXPLORER_FILTERS =
  "The explorer's own: its date field, From and To (Berlin days) and its filters. The filter bar of the other pages does not apply.";

export const fields: FieldRegistry = {
  "data.key": {
    label: "Key",
    what: "The field, or fields together, that tell one row of the table from every other: use it to find a row again or to count each row once.",
    stat: "Field names",
    per: "per table",
    formula: { num: "The fields the database marks as the table's primary key" },
    caveat:
      "Read from the database's own description of itself, not typed by hand. A rebuilt copy such as admin_submission_facts has no key of its own: the database takes it from the table it copies (its submission_id is survey_submission's id). PostHog's events are keyed by their event id; a Google table by its day and its breakdown (channel, campaign…), so each day repeats once per breakdown. \"none\": no field is unique.",
    tables: [{ ...SUBMISSIONS, columns: "The field marked as its primary key (id)" }],
    query: {
      lang: "SQL",
      text: `-- The page reads the key from the database's description of itself (PostgREST's
-- schema: the fields marked as the primary key). The same in SQL, for survey_submission:
SELECT a.attname AS key_field
FROM pg_index i
JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
WHERE i.indrelid = 'public.survey_submission'::regclass
  AND i.indisprimary;
-- A rebuilt copy keeps one row per key through a unique index instead:
--   ... WHERE i.indrelid = 'public.admin_submission_facts'::regclass AND i.indisunique;`,
    },
    related: ["data.joins", "data.rows"],
  },

  "data.joins": {
    label: "Joins",
    what: "The other tables this one links to: first those its own fields point to (survey_submission's user_id points to app_user), then those whose fields point to it (personal_report and scoring_result each point to their survey). Join on these to combine tables.",
    stat: "Table names",
    per: "per table",
    formula: {
      num: "Tables this table's link fields point to, then the tables whose link fields point to it",
    },
    caveat:
      "Read from the links the database itself enforces (foreign keys), so a link nobody declared is missing: report_section_feedback's section_id is plain text, not a link to report_section. A rebuilt copy (admin_submission_facts) shows the links of the table it copies. A product table leaves out the admin tools that point to it (admin_… tables, submission tags, the UX checks). Each field's own link is written under its name in the field list.",
    tables: [
      {
        ...SUBMISSIONS,
        columns:
          "Its link fields (user_id, survey_id) and those of the tables that point to it (survey_submission_id…)",
      },
    ],
    query: {
      lang: "SQL",
      text: `-- Joins of survey_submission, both ways: the tables its link fields point to, then the
-- tables whose link fields point to it, without the admin tools.
SELECT other_table, min(way) AS way
FROM (
  SELECT '1 points to' AS way, confrelid::regclass::text AS other_table
  FROM pg_constraint
  WHERE contype = 'f' AND conrelid = 'public.survey_submission'::regclass
  UNION ALL
  SELECT '2 pointed to by', conrelid::regclass::text
  FROM pg_constraint
  WHERE contype = 'f' AND confrelid = 'public.survey_submission'::regclass
) AS links
WHERE other_table <> 'survey_submission'
  AND other_table NOT LIKE 'admin\\_%'
  AND other_table NOT IN ('submission_tag', 'submission_tag_assignment', 'product_changelog',
                          'digest_recommendation_history', 'ux_finding', 'ux_walk_record')
GROUP BY other_table
ORDER BY way, other_table;
-- A rebuilt copy has no links of its own here: for admin_submission_facts the page shows the
-- one PostgREST carries over from survey_submission (user_id points to app_user).`,
    },
    related: ["data.key", "data.rows"],
  },

  "data.rows": {
    label: "Rows",
    what: "How many rows the table holds today, all of them: the size of the table, not a figure for a period. Every row written and not deleted counts.",
    stat: "Count",
    per: "per table (every row it holds)",
    formula: { num: "Every row in the table, today" },
    caveat:
      "Counts everything, the team's own surveys, tests and automated checks included, so it is larger than the dashboards' figures, which leave staff out. No date and no filter narrows it. PostHog's events: those on www.loveiq.org since 23 Aug 2026, plus the purchase events our server sends. A Google table holds a row per day and breakdown (channel, campaign…), not one per visit, and a live one is read from Google when the page opens. Masking hides values, never rows.",
    tables: [
      { ...SUBMISSIONS, columns: "Every row (counted; nothing is read)" },
      {
        ...EVENTS,
        columns: "Every event on www.loveiq.org, and the purchase events the server sends",
      },
    ],
    query: {
      lang: "SQL",
      text: `-- What the page asks the database (PostgREST), for the table picked:
--   GET /rest/v1/survey_submission?select=*      with   Prefer: count=exact
-- The same count in SQL:
SELECT count(*) AS rows
FROM survey_submission;

-- PostHog's events, in HogQL:
--   SELECT count() FROM events
--   WHERE properties.$host = 'www.loveiq.org'
--      OR (event = 'purchase' AND coalesce(properties.$host, '') = '')`,
    },
    related: ["data.fresh", "data.showing"],
  },

  "data.fresh": {
    label: "Fresh",
    what: "How the table is fed (live as people use the site, by Stripe's or Resend's messages, by hand, copied every 15 minutes, read live from Google…) and its newest row: the latest time in its main date field. An old newest row on a live table means nothing new happened there.",
    stat: "Latest time",
    per: "per table",
    formula: { num: "How the table is fed · the newest value of its main date field" },
    caveat:
      'The main date field is the first in the explorer\'s Date field list (created_date_time, created_at, event_time… whichever the table has). "not in use": nothing writes the table now (a retired feature, or one built and never used), so its newest row is its last. "rebuilt every 5 minutes": admin_submission_facts, a copy of the finished surveys, can trail survey_submission by a few minutes. Berlin time; the year is left out when it is this one. Not shown for the audit log or for a personal date (a birthday).',
    tables: [
      { ...SUBMISSIONS, columns: "created_date_time, its main date field" },
      { ...EVENTS, columns: "timestamp" },
    ],
    query: {
      lang: "SQL",
      text: `-- What the page asks (PostgREST): the main date field, newest first, one row:
--   GET /rest/v1/survey_submission?select=created_date_time
--       &order=created_date_time.desc.nullslast&limit=1
SELECT max(created_date_time) AS newest_row
FROM survey_submission;

-- PostHog's events, in HogQL: SELECT max(timestamp) FROM events WHERE (the filter of Rows)`,
    },
    related: ["data.rows", "data.showing"],
  },

  "data.showing": {
    label: "Showing … of N rows",
    what: 'N is how many rows match the query: the table picked, its date field from From to To (Berlin days) and every filter. The page shows them a page at a time, newest first unless you sort; with "no date range", every row that passes the filters.',
    stat: "Count",
    per: "per query (rows matching the dates and filters)",
    formula: {
      num: "Rows whose date field falls from From to To and that pass every filter",
    },
    caveat:
      "Every row counts, the team's own and test surveys included, so it can be larger than a dashboard's figure for the same days (the dashboards leave staff out). Masking changes what a row shows, never which rows count: emails read as a code, names and links as [masked]. admin_submission_facts is rebuilt every 5 minutes, so today's last few minutes can be missing; up to yesterday it matches survey_submission. PostHog counts the events that match; a Google table its rows (one per day and breakdown).",
    tables: [
      {
        source: "production",
        table: "admin_submission_facts",
        columns: "The columns picked; counted on the date field picked (created_date_time)",
        filters: EXPLORER_FILTERS,
      },
      {
        source: "production",
        table: "survey_submission",
        columns: "The columns picked; counted on the date field picked (created_date_time)",
        filters: EXPLORER_FILTERS,
      },
    ],
    query: {
      lang: "SQL",
      text: `-- What the page asks (PostgREST), for the table, date field, range and filters picked:
--   GET /rest/v1/admin_submission_facts?select=<the columns>
--       &created_date_time=gte.<From, 00:00 Berlin>
--       &created_date_time=lt.<the day after To, 00:00 Berlin>
--       &order=created_date_time.desc.nullslast    with   Prefer: count=exact, Range: 0-11
-- N in SQL (each filter adds an AND):
SELECT count(*) AS rows
FROM admin_submission_facts
WHERE created_date_time >= (DATE :from)::timestamp AT TIME ZONE 'Europe/Berlin'
  AND created_date_time <  (DATE :to + 1)::timestamp AT TIME ZONE 'Europe/Berlin';`,
    },
    related: ["data.rows", "data.fresh"],
  },
};
