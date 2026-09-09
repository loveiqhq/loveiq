import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";

/**
 * Writing into Notion.
 *
 * WHY THIS IS NOT A THIN WRAPPER. This workspace holds 35 databases whose schemas have
 * nothing in common — 5 properties in one, 42 in another — and two of them are called
 * "Board" and "Board ", differing by a trailing space, both with 100+ rows in them. So a
 * tool that takes a database name and a bag of values has to read the live schema before
 * it can write anything, or it will either fail with Notion's own unhelpful errors or,
 * worse, write a valid-looking row into the wrong place with the wrong fields filled in.
 *
 * Every refusal here lists what WOULD have worked — the databases that exist, the
 * properties this one has, the values a select accepts — because the caller cannot see
 * the schema and guessing twice is worse than guessing once.
 *
 * Reversible, unlike the Slack tool: a page created here can be archived, and the tool
 * result says how.
 */

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

/** Notion's own limits. Exceeding either is a 400 with a message about "body.children". */
const MAX_BLOCKS_PER_REQUEST = 100;
const MAX_TEXT_PER_BLOCK = 2000;

export class NotionTargetError extends Error {}

export interface NotionProperty {
  type: string;
  options?: string[];
}
export interface NotionDatabase {
  id: string;
  title: string;
  /** Property name -> its type and, for select-like types, the values it accepts. */
  schema: Map<string, NotionProperty>;
  titleProperty: string;
}

function headers(): Record<string, string> {
  const t = process.env.NOTION_TOKEN?.trim();
  if (!t) throw new Error("NOTION_TOKEN is unset");
  return {
    authorization: `Bearer ${t}`,
    "Notion-Version": NOTION_VERSION,
    "content-type": "application/json",
  };
}

async function notion(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<Record<string, unknown>> {
  const res = await fetchWithTimeout(`${NOTION_API}${path}`, {
    method: init.method ?? "GET",
    headers: headers(),
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    timeoutMs: 15_000,
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(json.message ?? `notion_${res.status}`));
  }
  return json;
}

type RawProp = { type: string } & Record<string, { options?: Array<{ name: string }> }>;

function readSchema(properties: Record<string, RawProp>): {
  schema: Map<string, NotionProperty>;
  titleProperty: string;
} {
  const schema = new Map<string, NotionProperty>();
  let titleProperty = "";
  for (const [name, raw] of Object.entries(properties)) {
    const type = raw.type;
    if (type === "title") titleProperty = name;
    const options = raw[type]?.options?.map((o) => o.name);
    schema.set(name, options ? { type, options } : { type });
  }
  return { schema, titleProperty };
}

let cache: { at: number; dbs: NotionDatabase[] } | null = null;
const TTL_MS = 5 * 60_000;

export function clearNotionCache(): void {
  cache = null;
}

async function databases(): Promise<NotionDatabase[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.dbs;
  const dbs: NotionDatabase[] = [];
  let cursor: string | undefined;
  // Paged rather than capped: a workspace that grows past one page would otherwise
  // silently lose the databases at the end of it.
  for (let page = 0; page < 10; page++) {
    const res = await notion("/search", {
      method: "POST",
      body: {
        filter: { property: "object", value: "database" },
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      },
    });
    for (const d of (res.results ?? []) as Array<{
      id: string;
      title?: Array<{ plain_text: string }>;
      properties: Record<string, RawProp>;
    }>) {
      const { schema, titleProperty } = readSchema(d.properties ?? {});
      dbs.push({
        id: d.id,
        title: (d.title ?? []).map((t) => t.plain_text).join("") || "(untitled)",
        schema,
        titleProperty,
      });
    }
    if (res.has_more !== true) break;
    cursor = typeof res.next_cursor === "string" ? res.next_cursor : undefined;
  }
  cache = { at: Date.now(), dbs };
  return dbs;
}

/** Notion ids are UUIDs, with or without dashes. */
const NOTION_ID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

export async function resolveDatabase(nameOrId: string): Promise<NotionDatabase> {
  const given = nameOrId.trim();
  if (!given) throw new NotionTargetError("Name the database to add to.");
  const all = await databases();

  if (NOTION_ID.test(given)) {
    const bare = given.replace(/-/g, "").toLowerCase();
    const byId = all.find((d) => d.id.replace(/-/g, "").toLowerCase() === bare);
    if (byId) return byId;
    throw new NotionTargetError(`No database with id ${given} is shared with this integration.`);
  }

  /**
   * THE STORED TITLE IS TRIMMED TOO, and that is not cosmetic.
   *
   * This workspace contains a database called "Board" and another called "Board " — with
   * a trailing space. Different strings, identical to a human. The input was already
   * trimmed and the STORED TITLE was not, so "Board" never matched "Board ": the second
   * database was unreachable by name entirely, and the ambiguity check below was dead
   * code that could not fire on any real data.
   */
  const key = given.toLowerCase();
  const matches = all.filter((d) => d.title.trim().toLowerCase() === key);
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) {
    /**
     * "Board" AND "Board " ARE BOTH LIVE — 100+ rows each, checked. So this is not a
     * tidy-up case where one is obviously the real one and the other is abandoned:
     * picking either silently puts a task where a different set of people are looking,
     * and nothing downstream would show it. The write succeeds, the row exists, and it
     * is in the wrong place.
     */
    throw new NotionTargetError(
      `More than one database is called "${given}". They differ only in punctuation or ` +
        `spacing, and both are in use — pass the id of the one you mean:\n` +
        matches.map((d) => `  ${d.id}  "${d.title}"  (${d.schema.size} properties)`).join("\n")
    );
  }
  throw new NotionTargetError(
    `No database called "${given}". These exist:\n` +
      // Quoted, so a name whose only oddity is a trailing space is visible rather than
      // looking like a duplicate line.
      all
        .map((d) => `  "${d.title}"`)
        .sort()
        .join("\n")
  );
}

/** Types Notion computes itself; writing to one is always a caller mistake. */
const READ_ONLY_TYPES = new Set([
  "created_time",
  "created_by",
  "last_edited_time",
  "last_edited_by",
  "formula",
  "rollup",
  "unique_id",
]);

/**
 * A plain `{name: value}` object, checked against the live schema and converted into
 * Notion's typed shape. Every rejection names the thing that would have worked.
 */
export function buildProperties(
  db: NotionDatabase,
  title: string,
  given: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (db.titleProperty) {
    out[db.titleProperty] = { title: [{ text: { content: title.slice(0, MAX_TEXT_PER_BLOCK) } }] };
  }

  for (const [name, value] of Object.entries(given)) {
    if (name === db.titleProperty) continue; // already set from `title`
    const prop = db.schema.get(name);
    if (!prop) {
      throw new NotionTargetError(
        `"${db.title}" has no property called "${name}". It has: ` +
          `${[...db.schema.keys()].join(", ")}.`
      );
    }
    if (READ_ONLY_TYPES.has(prop.type)) {
      throw new NotionTargetError(
        `"${name}" is a ${prop.type} — Notion fills it in itself and it cannot be written.`
      );
    }
    const text = String(value);

    switch (prop.type) {
      case "select":
      case "status": {
        // Notion silently accepts an unknown `select` by CREATING the option, which
        // quietly pollutes a board's vocabulary one typo at a time. `status` rejects it
        // outright. Refusing both, with the list, is the only behaviour that is right
        // for either.
        if (prop.options && !prop.options.includes(text)) {
          throw new NotionTargetError(
            `"${name}" does not accept "${text}". It accepts: ${prop.options.join(" | ")}.`
          );
        }
        out[name] = { [prop.type]: { name: text } };
        break;
      }
      case "multi_select": {
        const values = Array.isArray(value) ? value.map(String) : [text];
        const unknown = prop.options ? values.filter((v) => !prop.options!.includes(v)) : [];
        if (unknown.length > 0) {
          throw new NotionTargetError(
            `"${name}" does not accept ${unknown.map((u) => `"${u}"`).join(", ")}. ` +
              `It accepts: ${prop.options!.join(" | ")}.`
          );
        }
        out[name] = { multi_select: values.map((v) => ({ name: v })) };
        break;
      }
      case "date": {
        if (!/^\d{4}-\d{2}-\d{2}/.test(text)) {
          throw new NotionTargetError(`"${name}" is a date — write it as 2026-09-09.`);
        }
        out[name] = { date: { start: text } };
        break;
      }
      case "checkbox":
        out[name] = { checkbox: value === true || text === "true" };
        break;
      case "number": {
        const n = Number(value);
        if (!Number.isFinite(n)) {
          throw new NotionTargetError(`"${name}" is a number and "${text}" is not one.`);
        }
        out[name] = { number: n };
        break;
      }
      case "url":
      case "email":
      case "phone_number":
        out[name] = { [prop.type]: text };
        break;
      case "rich_text":
        out[name] = { rich_text: [{ text: { content: text.slice(0, MAX_TEXT_PER_BLOCK) } }] };
        break;
      default:
        // `people` and `relation` take Notion ids that a caller has no way to know, and
        // a wrong id assigns work to the wrong person. Refused rather than guessed.
        throw new NotionTargetError(
          `"${name}" is a ${prop.type}, which this tool cannot set — it needs Notion's ` +
            `internal ids. Set it in Notion.`
        );
    }
  }
  return out;
}

/**
 * Plain text to Notion blocks: blank lines separate paragraphs, long ones are split.
 *
 * Returns what was DROPPED as well as what was kept. Notion takes at most 100 blocks in
 * one create, and silently sending the first 100 would write a page that looks complete
 * and is not — the failure mode this whole server is written against.
 */
export function toBlocks(content: string): {
  blocks: Array<Record<string, unknown>>;
  dropped: number;
} {
  const all: Array<Record<string, unknown>> = [];
  for (const p of content
    .split(/\n\s*\n/)
    .map((x) => x.trim())
    .filter(Boolean)) {
    for (let i = 0; i < p.length; i += MAX_TEXT_PER_BLOCK) {
      all.push({
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: [{ text: { content: p.slice(i, i + MAX_TEXT_PER_BLOCK) } }] },
      });
    }
  }
  return {
    blocks: all.slice(0, MAX_BLOCKS_PER_REQUEST),
    dropped: Math.max(0, all.length - MAX_BLOCKS_PER_REQUEST),
  };
}

export interface CreatedPage {
  id: string;
  url: string | null;
  parentLabel: string;
  /** Paragraphs Notion's 100-block-per-create limit left out. Said, never swallowed. */
  droppedBlocks: number;
}

export async function createNotionPage(input: {
  /** A database name or id, or a page id to nest under. */
  parent: string;
  title: string;
  content?: string;
  properties?: Record<string, unknown>;
}): Promise<CreatedPage> {
  const given = input.parent.trim();
  const { blocks, dropped } = input.content ? toBlocks(input.content) : { blocks: [], dropped: 0 };

  // A bare id could be either a database or a page. Databases are tried first because
  // that is what "add a task to X" means, and a page id simply will not be among them.
  let db: NotionDatabase | null = null;
  try {
    db = await resolveDatabase(given);
  } catch (err) {
    if (!NOTION_ID.test(given)) throw err;
  }

  const body = db
    ? {
        parent: { database_id: db.id },
        properties: buildProperties(db, input.title, input.properties ?? {}),
        ...(blocks.length ? { children: blocks } : {}),
      }
    : {
        parent: { page_id: given },
        properties: { title: [{ text: { content: input.title.slice(0, MAX_TEXT_PER_BLOCK) } }] },
        ...(blocks.length ? { children: blocks } : {}),
      };

  if (!db && input.properties && Object.keys(input.properties).length > 0) {
    // A page has no properties but a title, so silently dropping them would lose the
    // status or due date the caller believed they had set.
    throw new NotionTargetError(
      `Properties only apply to a database row. "${given}" is a page, which has a title ` +
        `and nothing else — put the detail in \`content\`.`
    );
  }

  const page = await notion("/pages", { method: "POST", body });
  return {
    id: String(page.id ?? ""),
    url: typeof page.url === "string" ? page.url : null,
    parentLabel: db ? `${db.title} (database)` : "page",
    droppedBlocks: dropped,
  };
}
