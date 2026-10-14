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
    `${GA4_DAYS}${ads ? "&meta->>ads_campaigns=not.is.null" : ""}&select=period_end&order=period_end.desc&limit=1`
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ period_end: string }>;
  return rows[0]?.period_end?.slice(0, 10) ?? null;
}

export type SourceKey = "production" | "posthog" | "ga4" | "ads";
export const SOURCE_KEYS: SourceKey[] = ["production", "posthog", "ga4", "ads"];

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
  /** The tables its own fields point to, as the design lists them: no admin tables, three at most. */
  joins: string[];
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
    /^(payment|payment_item|payment_webhook_event|report_price_quote|prepaid_report_access)$/,
    "Revenue",
  ],
  [/^(survey|survey_.*|answer_option|scoring_result)$/, "Survey"],
  [/^(report|report_.*|personal_report.*)$/, "Report"],
  [/^(funnel_event|analytics_event|user_interactions)$/, "Traffic"],
  [
    /^(app_user|user_profile|waitlist_.*|invite_event|booking_event|email_.*|resend_webhook_event)$/,
    "People & email",
  ],
  [/^marketing_spend$/, "Spend"],
];

export function groupOf(table: string): string {
  return GROUPS.find(([re]) => re.test(table))?.[1] ?? "Admin & tools";
}

/** The tables the "Data sources" design lists, first and in its order; the rest by name. */
const MAIN_TABLES = [
  "survey_submission",
  "survey_submission_answer",
  "funnel_event",
  "payment",
  "report_price_quote",
  "report_section_feedback",
];
const placeOf = (table: string) =>
  MAIN_TABLES.includes(table) ? MAIN_TABLES.indexOf(table) : MAIN_TABLES.length;

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

/** The sources we read but do not own, as the pages read them. */
const OUTSIDE: Array<
  Omit<CatalogTable, keyof Described | "dateFields" | "fields" | "joins"> & {
    description: string;
    fields: Array<{ name: string; type: string; description: string; privacy?: Privacy }>;
  }
> = [
  {
    source: "posthog",
    name: "events",
    group: "Product events",
    description: `Every event PostHog captured on www.loveiq.org since ${POSTHOG_FROM}: page views, clicks (autocapture) and our own events. PostHog sees part of the visitors (blockers, bots it drops). Read through HogQL.`,
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
    description: `Google Analytics per day and channel, as the company brain copies it every 15 minutes. Before ${rangeLabel(SURVEY_TRACKING_FROM, SURVEY_TRACKING_FROM)} only visitors who accepted cookies; from then also cookieless visits, which Google counts only as far as its own modelling does, so it reads below our own visit log.`,
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
      "Google Ads per day and campaign, read from the Ads account every 15 minutes. Only campaigns that showed, were clicked or cost something that day.",
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
          "Conversions Google attributes to the campaign, counted on the day of the ad click, so recent days can still rise.",
      },
    ],
  },
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
  const production: CatalogTable[] = schema.map((t) => {
    const draft = DRAFTS[t.name];
    const fields: CatalogField[] = t.fields.map((f) => ({
      name: f.name,
      type: f.type,
      pk: f.pk,
      joins: f.joins,
      ...privacyOf(t.name, f.name),
      ...describe(note.get(`production|${t.name}|${f.name}`), draft?.fields[f.name], f.comment),
    }));
    return {
      source: "production",
      name: t.name,
      group: groupOf(t.name),
      key: t.fields.filter((f) => f.pk).map((f) => f.name),
      fields,
      // Its own foreign keys in field order, not the tables pointing back at it.
      joins: [
        ...new Set(
          t.fields
            .map((f) => f.joins?.split(".")[0])
            .filter((x): x is string => !!x && x !== t.name && !x.startsWith("admin_"))
        ),
      ].slice(0, 3),
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
      dateFields: dateFieldsOf(fields),
      ...(t.source === "posthog" && t.name !== "events"
        ? { closed: "Not opened in the explorer: only PostHog's events are, page by page." }
        : {}),
      ...describe(note.get(`${t.source}|${t.name}|`), t.description, ""),
    };
  });
  production.sort((a, b) => placeOf(a.name) - placeOf(b.name) || a.name.localeCompare(b.name));
  return [...production, ...outside];
}
