/**
 * The data catalog of AP-Analytics (Marcus's "Data sources" artboard): every source the pages
 * read, its tables and what each field holds. Production's tables and fields come from the live
 * schema (PostgREST's description of itself, the read the team export makes), limited to the
 * tables that export copies. A field's description is the team's note when there is one
 * (admin_field_note, edited in place), else a draft (field-drafts.ts), else the database's own
 * comment. Privacy is the team export's masking rule, so the catalog and the raw data explorer
 * say the same thing about a field.
 */
import { supabaseFetch } from "@features/admin/server/supabase";
import { columnPrivacy, isExported, unclassifiedColumns } from "@features/admin/server/team-export";

import { DRAFTS } from "./field-drafts";
import { rangeLabel, SURVEY_TRACKING_FROM } from "./filters";
import { ADS_FROM, GA4_FROM, GA4_PARAMS_FROM, GSC_FROM } from "./google-live";
import { POSTHOG_FROM } from "./posthog";

/**
 * The brain's Google Analytics days, refreshed every 15 minutes: the channel table rides on them
 * (`meta.channels`), and so do Google Ads' spend and campaigns (`meta.ads_campaigns`).
 */
// eslint-disable-next-line no-secrets/no-secrets -- a PostgREST query path, not a secret
export const GA4_DAYS = "/rest/v1/brain_chunk?source=eq.ga4&meta->>grain=eq.day";

/** The last day the brain's Google Analytics copy holds, or the last with Google Ads campaigns. */
export async function lastGaDay(ads: boolean): Promise<string | null> {
  const res = await supabaseFetch(
    `${GA4_DAYS}${ads ? "&meta->>ads_campaigns=not.is.null" : ""}&select=period_end,window_to:meta->>window_to,ad_window_to:meta->>ad_window_to&order=period_end.desc&limit=1`
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{
    period_end: string;
    window_to?: string | null;
    ad_window_to?: string | null;
  }>;
  const day = rows[0]?.period_end?.slice(0, 10) ?? null;
  const read = (ads ? rows[0]?.ad_window_to : rows[0]?.window_to)?.slice(0, 10) ?? null;
  return day && read && read < day ? read : day;
}

export type SourceKey = "production" | "posthog" | "ga4" | "ads" | "gsc";
export const SOURCE_KEYS: SourceKey[] = ["production", "posthog", "ga4", "ads", "gsc"];

export type Privacy = "masked" | "partly" | null;
export type Origin = "team" | "draft" | "database" | "none";

export interface CatalogField {
  name: string;
  type: string;
  pk: boolean;
  /** `app_user.id` for a foreign key. */
  joins: string | null;
  description: string;
  origin: Origin;
  editedBy: string | null;
  editedAt: string | null;
  privacy: Privacy;
  /** Looks personal but is in none of the team copy's lists: masked whole, to be safe. */
  unlisted?: boolean;
  /**
   * Free text kept as typed (not masked, in the explorer or the team copy) that can hold a
   * name: tagged Partly PII in the catalog only, so the explorer's rules stay the copy's.
   */
  freeText?: boolean;
}

export interface CatalogTable {
  source: SourceKey;
  name: string;
  group: string;
  description: string;
  origin: Origin;
  editedBy: string | null;
  editedAt: string | null;
  key: string[];
  fields: CatalogField[];
  /**
   * The tables it joins, both ways: those its own fields point to, then those whose fields
   * point to it. A product table leaves the admin tools out.
   */
  joins: string[];
  /** How it is fed: "live", "live · Stripe webhooks", "by hand", "read live"… */
  feed: string;
  /** Date fields a range can filter on, the default first. */
  dateFields: string[];
  /** Why the raw data explorer does not open this table, when it does not. */
  closed?: string;
}

export interface CatalogSource {
  key: SourceKey;
  name: string;
  status: string;
  ok: boolean;
  description: string;
  fresh: string;
  tables: number;
}

export interface CatalogPayload {
  sources: CatalogSource[];
  tables: CatalogTable[];
  generatedAt: string;
}

interface SchemaField {
  name: string;
  type: string;
  pk: boolean;
  joins: string | null;
  comment: string;
}
interface SchemaTable {
  name: string;
  comment: string;
  fields: SchemaField[];
}

const TYPE_NAMES: Record<string, string> = {
  "timestamp with time zone": "timestamptz",
  "timestamp without time zone": "timestamp",
  "double precision": "float8",
  "character varying": "text",
};

/** PostgREST's column notes, without its own key markers. */
export function cleanComment(text: string | undefined): string {
  return (text ?? "")
    .replace(/<pk\/>|<fk [^>]*\/>/g, "")
    .replace(/Note:\s*This is a (Primary|Foreign) Key( to `[^`]*`)?\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type OpenApiDefinitions = Record<
  string,
  {
    description?: string;
    properties?: Record<string, { type?: string; format?: string; description?: string }>;
  }
>;

/** The exported tables of the schema, read from PostgREST's description of itself. */
export function schemaOf(definitions: OpenApiDefinitions): SchemaTable[] {
  return Object.entries(definitions)
    .filter(([name]) => isExported(name))
    .map(([name, def]) => ({
      name,
      comment: cleanComment(def.description),
      fields: Object.entries(def.properties ?? {}).map(([field, p]) => {
        const fk = /<fk table='([^']+)' column='([^']+)'\/>/.exec(p.description ?? "");
        const raw = p.format ?? p.type ?? "unknown";
        return {
          name: field,
          type: TYPE_NAMES[raw] ?? raw.replace(/^public\./, ""),
          pk: (p.description ?? "").includes("<pk/>"),
          joins: fk ? `${fk[1]}.${fk[2]}` : null,
          comment: cleanComment(p.description),
        };
      }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

let schemaCache: { at: number; value: Promise<SchemaTable[]> } | null = null;

/** The production schema, cached for ten minutes: PostgREST builds it slowly (about 500 KB). */
export function productionSchema(): Promise<SchemaTable[]> {
  const now = Date.now();
  if (schemaCache && now - schemaCache.at < 10 * 60_000) return schemaCache.value;
  const value = (async () => {
    const res = await supabaseFetch("/rest/v1/", {
      headers: { Accept: "application/openapi+json" },
      timeoutMs: 60_000,
    });
    if (!res.ok) throw new Error(`schema ${res.status}`);
    const spec = (await res.json()) as { definitions?: OpenApiDefinitions };
    const tables = schemaOf(spec.definitions ?? {});
    if (!tables.some((t) => t.name === "survey_submission"))
      throw new Error("schema read came back short");
    return tables;
  })();
  schemaCache = { at: now, value };
  value.catch(() => {
    if (schemaCache?.value === value) schemaCache = null;
  });
  return value;
}

/** The catalog's groups, first match wins. */
const GROUPS: Array<[RegExp, string]> = [
  [
    /^(payment|payment_item|payment_webhook_event|report_price_quote|report_price_quote_arm_history|prepaid_report_access)$/,
    "Revenue",
  ],
  [/^(survey|survey_.*|answer_option|scoring_result)$/, "Survey"],
  [/^(report|report_.*|personal_report.*)$/, "Report"],
  [/^(funnel_event|analytics_event|user_interactions)$/, "Traffic"],
  [
    /^(app_user|ap_team_user|user_profile|waitlist_.*|invite_event|booking_event|email_.*|resend_webhook_event|unlock_feedback)$/,
    "People & email",
  ],
  [/^marketing_spend$/, "Spend"],
];

const ADMIN = "Admin & tools";

export function groupOf(table: string): string {
  return GROUPS.find(([re]) => re.test(table))?.[1] ?? ADMIN;
}

/**
 * The tables the "Data sources" design lists, first and in its order; then the rest by group,
 * the product's before the tracking and the admin tools last, A to Z within a group.
 */
const MAIN_TABLES = [
  "survey_submission",
  "survey_submission_answer",
  "funnel_event",
  "payment",
  "report_price_quote",
  "report_section_feedback",
];
const GROUP_ORDER = ["Survey", "Report", "Revenue", "People & email", "Traffic", "Spend", ADMIN];
const placeOf = (t: { name: string; group: string }) =>
  MAIN_TABLES.includes(t.name)
    ? MAIN_TABLES.indexOf(t.name)
    : MAIN_TABLES.length + GROUP_ORDER.indexOf(t.group);

/**
 * How a production table is fed where "live" (written as people use the site) would mislead,
 * checked against the code and each table's newest row on 21 Oct 2026.
 */
const STRIPE = "live · Stripe webhooks";
const RESEND = "live · Resend webhooks";
const BY_HAND = "by hand";
/** Nothing writes it now: a retired feature, or one built and never used. */
const UNUSED = "not in use";
const FEEDS: Record<string, string> = {
  payment: STRIPE,
  payment_item: STRIPE,
  payment_webhook_event: STRIPE,
  email_message_event: RESEND,
  email_experiment_event: RESEND,
  resend_webhook_event: RESEND,
  admin_submission_facts: "rebuilt every 5 minutes",
  ux_finding: "scheduled jobs",
  ux_walk_record: "scheduled jobs",
  ...Object.fromEntries(
    ["survey", "survey_question", "survey_question_mapping", "answer_option", "admin_users"].map(
      (t) => [t, BY_HAND]
    )
  ),
  ...Object.fromEntries(
    [
      // Empty: report and report_section were never filled, marketing_spend only read.
      "report",
      "report_section",
      "marketing_spend",
      "booking_event",
      "prepaid_report_access",
      "waitlist_signups",
      "waitlist_user",
      "user_interactions",
      "personal_report_section",
      "report_access_email",
      "report_section_rating",
      "report_section_kpi",
      "survey_question_kpi",
      "survey_submission_answer_history",
      "submission_tag",
      "submission_tag_assignment",
      "product_changelog",
      "digest_recommendation_history",
      "admin_action_item",
      "admin_alert_rule",
      "admin_chart_annotation",
      "admin_competitive_watch",
      "admin_dashboard_subscription",
      "admin_decision_entry",
      "admin_export_preset",
      "admin_goals",
      "admin_investigation_case",
      "admin_metric_benchmark",
      "admin_metric_dependency",
      "admin_metric_registry",
      "admin_metric_status",
      "admin_note",
      "admin_research_repository_entry",
      "admin_research_taxonomy_term",
      "admin_resource_comment",
      "admin_review_request",
      "admin_saved_view",
      "admin_segment",
      "admin_strategy_bet",
      "admin_strategy_initiative",
      "admin_tag_rules",
    ].map((t) => [t, UNUSED])
  ),
};

/** Free text kept as typed that can hold a name: Partly PII in the catalog (table.field). */
const FREE_TEXT = new Set(["report_section_feedback.comment"]);

/**
 * The tables a table joins, both ways: those its own fields point to (in field order), then
 * those whose fields point to it (A to Z), each once. A product table leaves the admin tools out.
 */
function joinsOf(t: SchemaTable, pointing: Map<string, Set<string>>): string[] {
  const own = t.fields.map((f) => f.joins?.split(".")[0]).filter((x): x is string => !!x);
  const back = [...(pointing.get(t.name) ?? [])].sort();
  const admin = groupOf(t.name) === ADMIN;
  return [...new Set([...own, ...back])].filter(
    (x) => x !== t.name && (admin || groupOf(x) !== ADMIN)
  );
}

const DATE_PREFERENCE = [
  "created_date_time",
  "created_at",
  "event_time",
  "started_at",
  "day",
  "date",
  "payment_date_time",
  "saved_at",
];

export function dateFieldsOf(fields: Array<{ name: string; type: string }>): string[] {
  const dates = fields
    .filter((f) => f.type === "timestamptz" || f.type === "timestamp" || f.type === "date")
    .map((f) => f.name);
  const first = DATE_PREFERENCE.find((d) => dates.includes(d));
  return first ? [first, ...dates.filter((d) => d !== first)] : dates;
}

export interface FieldNote {
  source: string;
  relation: string;
  field: string;
  description: string;
  updated_by: string;
  updated_at: string;
}

export async function fetchNotes(): Promise<FieldNote[]> {
  const res = await supabaseFetch(
    "/rest/v1/admin_field_note?select=source,relation,field,description,updated_by,updated_at&order=source.asc,relation.asc,field.asc&limit=5000"
  );
  if (!res.ok) throw new Error(`field notes ${res.status}`);
  return (await res.json()) as FieldNote[];
}

type Described = Pick<CatalogField, "description" | "origin" | "editedBy" | "editedAt">;

function describe(
  note: FieldNote | undefined,
  draft: string | undefined,
  comment: string
): Described {
  if (note)
    return {
      description: note.description,
      origin: "team",
      editedBy: note.updated_by.split("@")[0]!,
      editedAt: note.updated_at,
    };
  if (draft) return { description: draft, origin: "draft", editedBy: null, editedAt: null };
  if (comment) return { description: comment, origin: "database", editedBy: null, editedAt: null };
  return { description: "", origin: "none", editedBy: null, editedAt: null };
}

type OutsideTable = Omit<
  CatalogTable,
  keyof Described | "dateFields" | "fields" | "joins" | "feed"
> & {
  description: string;
  fields: Array<{ name: string; type: string; description: string; privacy?: Privacy }>;
};

const day = {
  name: "date",
  type: "date",
  description: "The day (the property's and the account's days are Berlin days).",
};
/** What every live Google Analytics table says about whom it counts. */
/** What every live Google Analytics table says about whom it counts, read from `from`. */
const ga4Who = (from = GA4_FROM) =>
  `Read live from Google Analytics for the range asked (from ${rangeLabel(from, from)}). Sessions, users and page views count nearly every visitor, whatever they chose on the cookie banner (Google's tag loads before it is answered; ad blockers hide some). Our own events (the survey's, unlock_click, begin_checkout, purchase, and so the key events) reached it only from visitors who accepted cookies until ${rangeLabel(SURVEY_TRACKING_FROM, SURVEY_TRACKING_FROM)}, from everyone since. Our own traffic is in it: the scheduled site checks from US data centres (Des Moines, Phoenix, Cheyenne and others; about a third of recent sessions and half the key events) and the team's visits from Bosnia and Herzegovina; /admin and /__stub_stripe__ are ours too.`;
const GA4_WHO = ga4Who();
const ADS_WHO = `Read live from the Google Ads account for the range asked (from ${rangeLabel(ADS_FROM, ADS_FROM)}). Recent days can still change: conversions count on the day of the ad click.`;
const adsCost = [
  { name: "impressions", type: "int", description: "Ad impressions." },
  { name: "clicks", type: "int", description: "Ad clicks." },
  { name: "cost_eur", type: "numeric", description: "Spend in euros." },
  {
    name: "conversions",
    type: "numeric",
    description:
      'Conversions Google attributes (nearly all "Survey completed": a finished survey by an ad visitor who accepted cookies; see conversion_action_daily).',
  },
];

/** Google Analytics' tables beyond the brain's copy: read live (google-live.ts). */
const GA4_LIVE: OutsideTable[] = [
  {
    source: "ga4",
    name: "site_daily",
    group: "Traffic",
    description: `The whole site per day: sessions, users, page views, engagement, events. ${GA4_WHO} Purchases are GA4's: it has about half of the real sales and counts tests and free unlocks too (35 on 7-8 Sep 2026), so the payment ledger is the truth.`,
    key: ["date"],
    fields: [
      day,
      { name: "sessions", type: "int", description: "Sessions started." },
      { name: "users", type: "int", description: "Users (totalUsers)." },
      { name: "new_users", type: "int", description: "Users on their first visit." },
      { name: "page_views", type: "int", description: "Page and screen views." },
      {
        name: "engaged_sessions",
        type: "int",
        description: "Sessions over 10 seconds, with 2+ pages or a key event.",
      },
      {
        name: "bounce_rate",
        type: "numeric",
        description: "Share of sessions not engaged (0 to 1).",
      },
      {
        name: "avg_session_seconds",
        type: "numeric",
        description: "Average session length, seconds.",
      },
      { name: "events", type: "int", description: "Every event GA4 received." },
      {
        name: "key_events",
        type: "int",
        description:
          "Key events: purchase, and from 28 Aug 2026 unlock_click and begin_checkout too.",
      },
      {
        name: "purchases",
        type: "int",
        description: "GA4's purchase events (lossy: cookies, blockers).",
      },
    ],
  },
  {
    source: "ga4",
    name: "acquisition_daily",
    group: "Traffic",
    description: `Sessions per day by where they came from (channel, source / medium, campaign), the device and the country. ${GA4_WHO}`,
    key: ["date", "channel", "source_medium", "campaign", "device", "country"],
    fields: [
      day,
      {
        name: "channel",
        type: "text",
        description: "GA4's default channel group: Paid Search, Direct, Organic Search…",
      },
      {
        name: "source_medium",
        type: "text",
        description: "The session's source / medium, as google / cpc.",
      },
      {
        name: "campaign",
        type: "text",
        description: "The session's campaign name; (direct) and (organic) where none.",
      },
      { name: "device", type: "text", description: "mobile, desktop or tablet." },
      { name: "country", type: "text", description: "Where Google placed the visit." },
      { name: "sessions", type: "int", description: "Sessions started." },
      { name: "users", type: "int", description: "Active users." },
      { name: "new_users", type: "int", description: "Users on their first visit." },
      {
        name: "engaged_sessions",
        type: "int",
        description: "Sessions over 10 seconds, with 2+ pages or a key event.",
      },
      {
        name: "engagement_seconds",
        type: "numeric",
        description: "Total seconds the site was in the foreground.",
      },
      {
        name: "key_events",
        type: "int",
        description:
          "Key events: purchase, and from 28 Aug 2026 unlock_click and begin_checkout too.",
      },
      { name: "page_views", type: "int", description: "Page and screen views." },
    ],
  },
  {
    source: "ga4",
    name: "landing_pages_daily",
    group: "Traffic",
    description: `Sessions per day by the page they began on. A report link holds its reader's access token, so every one is written /report/[token]. ${GA4_WHO}`,
    key: ["date", "landing_page"],
    fields: [
      day,
      { name: "landing_page", type: "text", description: "The first page's path." },
      { name: "sessions", type: "int", description: "Sessions started there." },
      { name: "engaged_sessions", type: "int", description: "Of those, engaged." },
      { name: "new_users", type: "int", description: "Users on their first visit." },
      { name: "key_events", type: "int", description: "Key events in those sessions." },
    ],
  },
  {
    source: "ga4",
    name: "pages_daily",
    group: "Traffic",
    description: `Views per day by page. A report link is written /report/[token]. ${GA4_WHO}`,
    key: ["date", "page"],
    fields: [
      day,
      { name: "page", type: "text", description: "The page's path." },
      { name: "views", type: "int", description: "Page views." },
      { name: "users", type: "int", description: "Active users who viewed it." },
      {
        name: "engagement_seconds",
        type: "numeric",
        description: "Total foreground seconds on it.",
      },
    ],
  },
  {
    source: "ga4",
    name: "events_daily",
    group: "Product events",
    description: `Every event GA4 received, per day and name: page views, our own events (survey_answer, unlock_click…) and Google's. ${GA4_WHO}`,
    key: ["date", "event"],
    fields: [
      day,
      { name: "event", type: "text", description: "The event's name." },
      { name: "events", type: "int", description: "How many times it fired." },
      { name: "users", type: "int", description: "Users who fired it." },
      { name: "key_events", type: "int", description: "Of them, counted as key events." },
    ],
  },
  {
    source: "ga4",
    name: "hours_daily",
    group: "Traffic",
    description: `Sessions per day and hour of the day (Berlin time, the property's). A session that spans two values (two hours, a change of city) counts in each, so these rows add up to a little more than site_daily's sessions. ${GA4_WHO}`,
    key: ["date", "hour"],
    fields: [
      day,
      { name: "hour", type: "int", description: "The hour, 0 to 23, Berlin time." },
      { name: "sessions", type: "int", description: "Sessions started in that hour." },
      { name: "users", type: "int", description: "Users (totalUsers)." },
      { name: "engaged_sessions", type: "int", description: "Of the sessions, engaged." },
      { name: "key_events", type: "int", description: "Key events in that hour." },
      { name: "page_views", type: "int", description: "Page views." },
    ],
  },
  {
    source: "ga4",
    name: "tech_daily",
    group: "Traffic",
    description: `Sessions per day by device type, operating system and browser. A session that spans two values (two hours, a change of city) counts in each, so these rows add up to a little more than site_daily's sessions. ${GA4_WHO}`,
    key: ["date", "device", "os", "browser"],
    fields: [
      day,
      { name: "device", type: "text", description: "mobile, desktop or tablet (Google's)." },
      { name: "os", type: "text", description: "The operating system: iOS, Android, Windows…" },
      { name: "browser", type: "text", description: "The browser: Safari, Chrome…" },
      { name: "sessions", type: "int", description: "Sessions." },
      { name: "users", type: "int", description: "Users (totalUsers)." },
      { name: "engaged_sessions", type: "int", description: "Of the sessions, engaged." },
      { name: "key_events", type: "int", description: "Key events in those sessions." },
    ],
  },
  {
    source: "ga4",
    name: "landing_sources_daily",
    group: "Traffic",
    description: `Sessions per day by the page they began on, where they came from and the device. A report link is written /report/[token]. A session that spans two values (two hours, a change of city) counts in each, so these rows add up to a little more than site_daily's sessions. ${GA4_WHO}`,
    key: ["date", "landing_page", "source_medium", "device"],
    fields: [
      day,
      { name: "landing_page", type: "text", description: "The first page's path." },
      {
        name: "source_medium",
        type: "text",
        description: "Where the session came from, as GA4 writes it (google / cpc…).",
      },
      { name: "device", type: "text", description: "mobile, desktop or tablet (Google's)." },
      { name: "sessions", type: "int", description: "Sessions started there." },
      { name: "engaged_sessions", type: "int", description: "Of those, engaged." },
      { name: "new_users", type: "int", description: "Users on their first visit." },
      { name: "key_events", type: "int", description: "Key events in those sessions." },
    ],
  },
  {
    source: "ga4",
    name: "page_events_daily",
    group: "Product events",
    description: `Every event per day, name and the page it fired on. A report link is written /report/[token]. ${GA4_WHO}`,
    key: ["date", "event", "page"],
    fields: [
      day,
      { name: "event", type: "text", description: "The event's name." },
      { name: "page", type: "text", description: "The page's path." },
      { name: "events", type: "int", description: "How many times it fired there." },
      {
        name: "users",
        type: "int",
        description: "Users who fired it there (report links added up across readers).",
      },
    ],
  },
  {
    source: "ga4",
    name: "cities_daily",
    group: "Traffic",
    description: `Sessions per day by country and city, as Google places the visit. A session that spans two values (two hours, a change of city) counts in each, so these rows add up to a little more than site_daily's sessions. ${GA4_WHO}`,
    key: ["date", "country", "city"],
    fields: [
      day,
      { name: "country", type: "text", description: "The country, in English." },
      { name: "city", type: "text", description: "The city, or (not set)." },
      { name: "sessions", type: "int", description: "Sessions." },
      { name: "users", type: "int", description: "Users (totalUsers)." },
      { name: "engaged_sessions", type: "int", description: "Of the sessions, engaged." },
      { name: "key_events", type: "int", description: "Key events in those sessions." },
    ],
  },
  {
    source: "ga4",
    name: "new_returning_daily",
    group: "Traffic",
    description: `Sessions per day by whether GA4 had seen the visitor before. A visitor who declined cookies has no lasting id, so reads as new each time. ${GA4_WHO}`,
    key: ["date", "visitor"],
    fields: [
      day,
      { name: "visitor", type: "text", description: "new, returning or (not set)." },
      { name: "sessions", type: "int", description: "Sessions." },
      { name: "users", type: "int", description: "Users (totalUsers)." },
      { name: "engaged_sessions", type: "int", description: "Of the sessions, engaged." },
      { name: "key_events", type: "int", description: "Key events in those sessions." },
    ],
  },
  {
    source: "ga4",
    name: "event_params_daily",
    group: "Product events",
    description: `Our events per day by the parameters our tags send with them (GA4's custom dimensions): the pricing arm, plan, price bucket, report section, archetype, landing version and the rest, one parameter per row. Events without the parameter are left out. GA4 reports these parameters from 27 Aug 2026, when they were set up. ${ga4Who(GA4_PARAMS_FROM)}`,
    key: ["date", "event", "parameter", "value"],
    fields: [
      day,
      { name: "event", type: "text", description: "The event's name." },
      {
        name: "parameter",
        type: "text",
        description:
          "The parameter: Pricing arm, Plan, Price bucket, Section, Archetype… (user) ones belong to the visitor, not the event.",
      },
      { name: "value", type: "text", description: "Its value." },
      { name: "events", type: "int", description: "Events with that value." },
      { name: "users", type: "int", description: "Users who sent them." },
    ],
  },
];

/** Google Ads' tables beyond the brain's copy: read live (google-live.ts). */
const ADS_LIVE: OutsideTable[] = [
  {
    source: "ads",
    name: "conversion_action_daily",
    group: "Spend",
    description: `Google Ads' conversions per day, campaign and action: "Survey completed" (a finished survey by an ad visitor who accepted cookies: its tag fires only then) and "Purchase", both goals bidding counts, are separate. ${ADS_WHO}`,
    key: ["date", "campaign_id", "conversion_action"],
    fields: [
      day,
      { name: "campaign_id", type: "text", description: "Google Ads' id for the campaign." },
      { name: "campaign_name", type: "text", description: "The campaign's name in Google Ads." },
      {
        name: "conversion_action",
        type: "text",
        description: "The conversion action: Survey completed, Purchase…",
      },
      { name: "conversions", type: "numeric", description: "Conversions counted for bidding." },
      {
        name: "all_conversions",
        type: "numeric",
        description: "Every conversion, including those not used for bidding.",
      },
      {
        name: "conversion_value",
        type: "numeric",
        description:
          "Their value as the action reports it: Survey completed is a fixed €1 each (so it reads as a count), Purchase the amount paid.",
      },
    ],
  },
  {
    source: "ads",
    name: "search_term_daily",
    group: "Spend",
    description: `What people actually searched when a Search ad showed, per day, campaign and ad group: the words, not the keyword they matched. Terms too rare to show are left out by Google. ${ADS_WHO}`,
    key: ["date", "campaign_name", "ad_group", "search_term"],
    fields: [
      day,
      { name: "campaign_name", type: "text", description: "The campaign." },
      { name: "ad_group", type: "text", description: "The ad group." },
      { name: "search_term", type: "text", description: "The words searched." },
      ...adsCost,
    ],
  },
  {
    source: "ads",
    name: "keyword_daily",
    group: "Spend",
    description: `Each Search keyword per day, with its match type: what the Traffic page's keyword rows are tagged with (utm_term). ${ADS_WHO}`,
    key: ["date", "campaign_name", "ad_group", "keyword", "match_type"],
    fields: [
      day,
      { name: "campaign_name", type: "text", description: "The campaign." },
      { name: "ad_group", type: "text", description: "The ad group." },
      { name: "keyword", type: "text", description: "The keyword." },
      { name: "match_type", type: "text", description: "exact, phrase or broad." },
      ...adsCost,
    ],
  },
  {
    source: "ads",
    name: "ad_group_daily",
    group: "Spend",
    description: `Each ad group (Search) and asset group (Performance Max) per day. ${ADS_WHO}`,
    key: ["date", "campaign_name", "kind", "group_name"],
    fields: [
      day,
      { name: "campaign_name", type: "text", description: "The campaign." },
      { name: "kind", type: "text", description: "Ad group or Asset group." },
      { name: "group_name", type: "text", description: "Its name." },
      ...adsCost,
    ],
  },
  {
    source: "ads",
    name: "device_daily",
    group: "Spend",
    description: `Each campaign per day and device. ${ADS_WHO}`,
    key: ["date", "campaign_name", "device"],
    fields: [
      day,
      { name: "campaign_name", type: "text", description: "The campaign." },
      { name: "device", type: "text", description: "mobile, desktop, tablet or connected tv." },
      ...adsCost,
    ],
  },
  {
    source: "ads",
    name: "geo_daily",
    group: "Spend",
    description: `Each campaign per day and country (where people were, or showed interest in). ${ADS_WHO}`,
    key: ["date", "campaign_name", "country"],
    fields: [
      day,
      { name: "campaign_name", type: "text", description: "The campaign." },
      { name: "country", type: "text", description: "The country." },
      ...adsCost,
    ],
  },
  {
    source: "ads",
    name: "demographics_daily",
    group: "Spend",
    description: `Each Search ad group per day by age band and by gender (two kinds of row): Google's estimate of who saw the ads. Performance Max reports neither. ${ADS_WHO}`,
    key: ["date", "campaign_name", "ad_group", "kind", "value"],
    fields: [
      day,
      { name: "campaign_name", type: "text", description: "The campaign." },
      { name: "ad_group", type: "text", description: "The ad group." },
      { name: "kind", type: "text", description: "Age or Gender." },
      { name: "value", type: "text", description: "18–24 … 65+, Male, Female or Unknown." },
      ...adsCost,
    ],
  },
  {
    source: "ads",
    name: "impression_share_daily",
    group: "Spend",
    description: `Each Search campaign per day: the share of the searches it could have shown on that it did, and why it missed the rest. Google reports under 10% as 0.0999 and over 90% as 0.9001 or 1. ${ADS_WHO}`,
    key: ["date", "campaign_name"],
    fields: [
      day,
      { name: "campaign_name", type: "text", description: "The campaign." },
      {
        name: "impression_share",
        type: "numeric",
        description: "Impressions ÷ the impressions it was eligible for (0 to 1).",
      },
      { name: "top_share", type: "numeric", description: "Of those, shown above the results." },
      {
        name: "absolute_top_share",
        type: "numeric",
        description: "Of those, shown first.",
      },
      {
        name: "lost_to_budget",
        type: "numeric",
        description: "The share missed because the budget ran out.",
      },
      {
        name: "lost_to_rank",
        type: "numeric",
        description: "The share missed because the ad ranked too low (bid, quality).",
      },
    ],
  },
  {
    source: "ads",
    name: "ads_hours_daily",
    group: "Spend",
    description: `Each campaign per day and hour of the day (the account's time, Berlin). ${ADS_WHO}`,
    key: ["date", "hour", "campaign_name"],
    fields: [
      day,
      { name: "hour", type: "int", description: "The hour, 0 to 23, Berlin time." },
      { name: "campaign_name", type: "text", description: "The campaign." },
      ...adsCost,
    ],
  },
  {
    source: "ads",
    name: "search_ads_daily",
    group: "Spend",
    description: `Each Search ad per day, with its headlines and where it leads. Performance Max builds its ads from assets and reports them by asset group (ad_group_daily). ${ADS_WHO}`,
    key: ["date", "ad_id"],
    fields: [
      day,
      { name: "campaign_name", type: "text", description: "The campaign." },
      { name: "ad_group", type: "text", description: "The ad group." },
      { name: "ad_id", type: "text", description: "Google Ads' id for the ad." },
      { name: "ad_type", type: "text", description: "responsive search ad, …" },
      { name: "status", type: "text", description: "enabled, paused or removed (today's)." },
      {
        name: "headlines",
        type: "text",
        description: "The headlines Google mixes the ad from, separated by |.",
      },
      { name: "final_url", type: "text", description: "Where the ad leads." },
      ...adsCost,
    ],
  },
  {
    source: "ads",
    name: "pmax_search_categories",
    group: "Spend",
    description: `What people searched before a Performance Max ad showed, as Google groups the searches into categories (it never gives Performance Max's search terms one by one): per campaign and month, cut to the range (date is the month's first day in it). No spend per category: Google reports none. ${ADS_WHO}`,
    key: ["date", "campaign_name", "category"],
    fields: [
      { ...day, description: "The month's first day in the range." },
      { name: "month_to", type: "date", description: "The month's last day in the range." },
      { name: "campaign_name", type: "text", description: "The Performance Max campaign." },
      {
        name: "category",
        type: "text",
        description: "Google's search category, or Uncategorized.",
      },
      { name: "impressions", type: "int", description: "Ad impressions." },
      { name: "clicks", type: "int", description: "Ad clicks." },
      {
        name: "conversions",
        type: "numeric",
        description: 'Conversions Google attributes (nearly all "Survey completed").',
      },
    ],
  },
  {
    source: "ads",
    name: "change_history",
    group: "Spend",
    description: `Every change made to the Ads account (budgets, bids, keywords, ads, targeting), by whom and when: the last 30 days only, as Google keeps them. Who is shown by organization (loveiq.org, the agency), never by person.`,
    key: ["change_id"],
    fields: [
      { ...day, description: "The day of the change (the account's days are Berlin days)." },
      { name: "change_id", type: "text", description: "Google Ads' id for the change." },
      { name: "time", type: "text", description: "Its time, Berlin." },
      {
        name: "changed_by",
        type: "text",
        description: "The organization of the person who made it: the domain of their address.",
      },
      {
        name: "client",
        type: "text",
        description: "Where it was made: google ads web client, google ads api, …",
      },
      {
        name: "resource",
        type: "text",
        description: "What changed: campaign, ad group criterion…",
      },
      { name: "operation", type: "text", description: "create, update or remove." },
      {
        name: "changed_fields",
        type: "text",
        description: "The fields changed (Google's names).",
      },
      { name: "campaign_name", type: "text", description: "The campaign it belongs to." },
    ],
  },
];

/** Search Console, read live: how LoveIQ shows up in Google Search. */
const GSC_LIVE: OutsideTable[] = [
  {
    source: "gsc",
    name: "search_console_daily",
    group: "Traffic",
    description: `Google Search per day by the search and the page it showed: clicks, impressions and position, read live from Search Console (from ${rangeLabel(GSC_FROM, GSC_FROM)}). Search Console's days are Pacific time, and its last two or three days still fill in. Rare searches are left out of a breakdown by search to protect searchers' privacy, so these rows add up to less than the site's totals. A report link is written /report/[token].`,
    key: ["date", "query", "page"],
    fields: [
      { ...day, description: "The day (Pacific time, as Search Console keeps it)." },
      { name: "query", type: "text", description: "What was searched." },
      { name: "page", type: "text", description: "The page Google showed." },
      { name: "clicks", type: "int", description: "Clicks to the site." },
      { name: "impressions", type: "int", description: "Times it was shown." },
      { name: "ctr", type: "numeric", description: "Clicks ÷ impressions." },
      {
        name: "position",
        type: "numeric",
        description: "Average position in the results (1 is the top).",
      },
    ],
  },
];

/** The sources we read but do not own, as the pages read them. */
const OUTSIDE: OutsideTable[] = [
  {
    source: "posthog",
    name: "events",
    group: "Product events",
    description: `Every event PostHog captured on www.loveiq.org since ${rangeLabel(POSTHOG_FROM, POSTHOG_FROM)}: page views, clicks (autocapture) and our own events, plus the purchase events the server sends after a payment (no host; mostly €0 test or free unlocks, a few real sales). PostHog sees part of the visitors (blockers, bots it drops). Read through HogQL.`,
    key: ["uuid"],
    fields: [
      { name: "uuid", type: "uuid", description: "Event id." },
      { name: "timestamp", type: "timestamptz", description: "When it happened." },
      {
        name: "event",
        type: "text",
        description:
          "Event name: $pageview, $pageleave, $autocapture, or ours, such as landing_page_view, cta_click, survey_answer, section_seen.",
      },
      {
        name: "distinct_id",
        type: "text",
        description: "PostHog's id for the browser or person.",
        privacy: "partly",
      },
      {
        name: "$session_id",
        type: "text",
        description:
          "The visit (matches survey_submission.posthog_session_id). Masked unless unlocked, as in the team copy: it opens the visit's recording.",
        privacy: "masked",
      },
      { name: "properties.$pathname", type: "text", description: "The page." },
      { name: "properties.$device_type", type: "text", description: "Mobile, Desktop or Tablet." },
      { name: "properties.utm_source", type: "text", description: "The visit's utm_source tag." },
      {
        name: "properties.landing_variant",
        type: "text",
        description: "The landing arm (reliable from 7 Oct 2026).",
      },
      {
        name: "properties",
        type: "jsonb",
        description:
          "All of the event's properties as JSON: $current_url, $device_type, utm_* and the rest. Masked unless unlocked: it can hold a reader's email address and first name (sent when the survey is submitted) and report links.",
        privacy: "masked",
      },
      {
        name: "elements_chain",
        type: "text",
        description: "What was clicked, for autocapture events.",
      },
    ],
  },
  {
    source: "posthog",
    name: "persons",
    group: "Product events",
    description: "PostHog's people. Not opened here: their properties can hold an email.",
    key: ["id"],
    fields: [
      { name: "id", type: "uuid", description: "Person id." },
      { name: "created_at", type: "timestamptz", description: "First seen." },
      {
        name: "properties",
        type: "jsonb",
        description: "What PostHog knows about the person.",
        privacy: "masked",
      },
    ],
  },
  {
    source: "posthog",
    name: "sessions",
    group: "Product events",
    description: "PostHog's visits, with their entry page, duration and source.",
    key: ["session_id"],
    fields: [
      { name: "session_id", type: "text", description: "The visit." },
      { name: "$start_timestamp", type: "timestamptz", description: "When it started." },
      { name: "$session_duration", type: "int", description: "Seconds." },
      { name: "$entry_pathname", type: "text", description: "The first page." },
      {
        name: "$channel_type",
        type: "text",
        description: "PostHog's channel: Paid Search, Direct and so on.",
      },
    ],
  },
  {
    source: "ga4",
    name: "sessions_daily",
    group: "Traffic",
    description: `Google Analytics per day and channel, as the company brain copies it every 15 minutes (the other Google Analytics tables are read live). Sessions and users count nearly every visitor, whatever they chose on the cookie banner (Google's tag loads before it is answered; ad blockers hide some).`,
    key: ["date", "channel"],
    fields: [
      { name: "date", type: "date", description: "The day." },
      {
        name: "channel",
        type: "text",
        description:
          "Google Analytics' default channel group: Paid Search, Direct, Organic Search and so on.",
      },
      { name: "sessions", type: "int", description: "Sessions started." },
      { name: "users", type: "int", description: "Active users." },
      { name: "new_users", type: "int", description: "Users on their first visit." },
      {
        name: "engaged_sessions",
        type: "int",
        description:
          "Sessions that lasted over 10 seconds, viewed 2 or more pages or had a conversion.",
      },
      {
        name: "avg_engagement_time",
        type: "numeric",
        description: "Average seconds the site was in the foreground, per session.",
      },
    ],
  },
  {
    source: "ads",
    name: "campaign_daily",
    group: "Spend",
    description:
      "Google Ads per day and campaign, as the company brain copies it from the Ads account every 15 minutes (the other Google Ads tables are read live). Only campaigns that showed, were clicked or cost something that day.",
    key: ["date", "campaign_id"],
    fields: [
      { name: "date", type: "date", description: "The day." },
      { name: "campaign_id", type: "text", description: "Google Ads' id for the campaign." },
      { name: "campaign_name", type: "text", description: "The campaign's name in Google Ads." },
      { name: "impressions", type: "int", description: "Ad impressions." },
      { name: "clicks", type: "int", description: "Ad clicks." },
      { name: "cost_eur", type: "numeric", description: "Spend in euros." },
      {
        name: "conversions",
        type: "numeric",
        description:
          'Conversions Google attributes to the campaign, counted on the day of the ad click, so recent days can still rise. Nearly all are "Survey completed" (a finished survey by an ad visitor who accepted cookies), not purchases: conversion_action_daily splits them.',
      },
    ],
  },
  ...GA4_LIVE,
  ...ADS_LIVE,
  ...GSC_LIVE,
];

/**
 * The team copy's privacy rule for a column, and, like the copy, no trust in a column that looks
 * personal but no list classifies: the copy refuses to run, the explorer masks it whole.
 */
function privacyOf(table: string, column: string): Pick<CatalogField, "privacy" | "unlisted"> {
  const listed = columnPrivacy(table, column);
  if (listed) return { privacy: listed };
  return unclassifiedColumns([{ name: table, columns: [column], key: [] }]).length
    ? { privacy: "masked", unlisted: true }
    : { privacy: null };
}

/** Tables the raw data explorer never opens, and why. */
const CLOSED: Record<string, string> = {
  admin_audit_log:
    "Not opened in the explorer: it records the addresses of people who asked us to delete or export their data. Admins read it in the classic admin's audit log.",
};

/** Every table of every source, with the team's notes applied. */
export function buildCatalog(schema: SchemaTable[], notes: FieldNote[]): CatalogTable[] {
  const note = new Map(notes.map((n) => [`${n.source}|${n.relation}|${n.field}`, n]));
  // The tables whose own fields point to each table.
  const pointing = new Map<string, Set<string>>();
  for (const t of schema)
    for (const f of t.fields) {
      const to = f.joins?.split(".")[0];
      if (to) pointing.set(to, (pointing.get(to) ?? new Set<string>()).add(t.name));
    }
  const production: CatalogTable[] = schema.map((t) => {
    const draft = DRAFTS[t.name];
    const fields: CatalogField[] = t.fields.map((f) => ({
      name: f.name,
      type: f.type,
      pk: f.pk,
      joins: f.joins,
      ...privacyOf(t.name, f.name),
      ...(FREE_TEXT.has(`${t.name}.${f.name}`) ? { freeText: true } : {}),
      ...describe(note.get(`production|${t.name}|${f.name}`), draft?.fields[f.name], f.comment),
    }));
    return {
      source: "production",
      name: t.name,
      group: groupOf(t.name),
      key: t.fields.filter((f) => f.pk).map((f) => f.name),
      fields,
      joins: joinsOf(t, pointing),
      feed: FEEDS[t.name] ?? "live",
      dateFields: dateFieldsOf(fields),
      ...(CLOSED[t.name] ? { closed: CLOSED[t.name] } : {}),
      ...describe(note.get(`production|${t.name}|`), draft?.table, t.comment),
    };
  });
  const outside: CatalogTable[] = OUTSIDE.map((t) => {
    const fields: CatalogField[] = t.fields.map((f) => ({
      name: f.name,
      type: f.type,
      pk: t.key.includes(f.name),
      joins: null,
      privacy: f.privacy ?? null,
      ...describe(note.get(`${t.source}|${t.name}|${f.name}`), f.description, ""),
    }));
    return {
      source: t.source,
      name: t.name,
      group: t.group,
      key: t.key,
      fields,
      joins: [],
      // PostHog takes events as they happen; the brain copies two Google tables every 15
      // minutes; the rest are read from Google when asked.
      feed:
        t.source === "posthog"
          ? "live"
          : t.name === "sessions_daily" || t.name === "campaign_daily"
            ? "every 15 minutes"
            : t.source === "gsc"
              ? "read live, 2–3 days behind"
              : "read live",
      dateFields: dateFieldsOf(fields),
      ...(t.source === "posthog" && t.name !== "events"
        ? { closed: "Not opened in the explorer: only PostHog's events are, page by page." }
        : {}),
      ...describe(note.get(`${t.source}|${t.name}|`), t.description, ""),
    };
  });
  production.sort((a, b) => placeOf(a) - placeOf(b) || a.name.localeCompare(b.name));
  return [...production, ...outside];
}
