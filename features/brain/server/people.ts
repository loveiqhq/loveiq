import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

/**
 * One name per person, across every source.
 *
 * WHY THIS EXISTS. Each ingester records identity in its own field and its own spelling,
 * and nothing joins them: `author` on a commit, `participants` on an email, `owner` on a
 * Drive file, `assignee` on a Notion task, `speakers` on a WhatsApp burst, `organizer` and
 * `attendees` on a calendar event. Measured 2026-09-09, one colleague appears as
 * "Eman Cickusic", "Eman", "ec@loveiq.org" and "eman.cickusic@loveiq.org" depending only
 * on where they were typing. So "what has X decided about pricing" could not be answered
 * by filtering — no field meant "X" — and asking by name matched only the chunks that
 * happen to spell it in their body, which for commits is close to none.
 *
 * `meta.people` is written by the shared upsert path, so every source gains it at once and
 * no ingester has to remember.
 *
 * EXACT MATCHING, NEVER FUZZY. This corpus contains "Mark Oldenburg" and "Marcus Börner",
 * and separately "Eman" and "Iman" — who were verified to be different people by their
 * appearing together in 11 WhatsApp bursts, which one person renamed could never do.
 * Anything looser merges two colleagues' histories into one, which is worse than having
 * no field at all: a wrong join is invisible at the point of use.
 */

export interface Person {
  canonical: string;
  kind: "person" | "bot" | "shared";
}

/** Scalar identity fields. Notion joins several assignees with ", ", so values are split. */
const SCALAR_FIELDS = ["author", "assignee", "owner", "organizer"] as const;
/** Array identity fields. */
const ARRAY_FIELDS = ["participants", "speakers", "attendees"] as const;

/**
 * `null` = the registry could not be read, which is NOT the same as "nobody matched".
 * A failed read must leave `meta.people` unset rather than empty, or one bad request
 * would quietly strip the field from every chunk the run touches and look like a corpus
 * where nobody wrote anything.
 */
let cache: { at: number; byAlias: Map<string, Person> } | null = null;
const TTL_MS = 5 * 60_000;

export function clearPeopleCache(): void {
  cache = null;
}

export async function loadPeople(): Promise<Map<string, Person> | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.byAlias;
  try {
    const res = await supabaseFetch("/rest/v1/brain_person?select=canonical,aliases,kind");
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{
      canonical: string;
      aliases: string[] | null;
      kind: Person["kind"];
    }>;
    if (!Array.isArray(rows)) return null;
    const byAlias = new Map<string, Person>();
    for (const r of rows) {
      const person: Person = { canonical: r.canonical, kind: r.kind };
      // The canonical name resolves to itself even when it is not listed as an alias.
      byAlias.set(r.canonical.toLowerCase(), person);
      for (const a of r.aliases ?? []) byAlias.set(a.toLowerCase(), person);
    }
    cache = { at: Date.now(), byAlias };
    return byAlias;
  } catch (err) {
    logger.warn({ err }, "brain: could not read the person registry");
    return null;
  }
}

/** "Marcus Börner <mb@loveiq.org>" -> both halves; a bare value -> itself. */
function candidates(raw: string): string[] {
  const out: string[] = [];
  const angled = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(raw);
  if (angled) {
    if (angled[1]?.trim()) out.push(angled[1].trim());
    if (angled[2]?.trim()) out.push(angled[2].trim());
  } else {
    out.push(raw.trim());
  }
  return out.filter(Boolean);
}

function rawIdentities(meta: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const f of SCALAR_FIELDS) {
    const v = meta[f];
    // Notion writes several assignees as one comma-joined string.
    if (typeof v === "string") out.push(...v.split(",").flatMap(candidates));
  }
  for (const f of ARRAY_FIELDS) {
    const v = meta[f];
    if (Array.isArray(v)) {
      for (const item of v) if (typeof item === "string") out.push(...candidates(item));
    }
  }
  return out;
}

/**
 * The canonical names this chunk's metadata names, or `undefined` when the registry is
 * unreadable or nobody matched.
 *
 * Undefined rather than `[]` on purpose: an empty array asserts "no people here", and a
 * chunk whose only speaker is someone not yet in the registry would then read as an
 * unattributed one. Absent means unknown, which is true.
 */
export function peopleIn(
  meta: Record<string, unknown>,
  byAlias: Map<string, Person> | null
): string[] | undefined {
  if (!byAlias) return undefined;
  const found = new Set<string>();
  for (const raw of rawIdentities(meta)) {
    const hit = byAlias.get(raw.toLowerCase());
    // Bots and shared mailboxes are deliberately excluded. `dependabot[bot]` authors many
    // commit chunks and `teamwork@loveiq.org` owns thousands of Drive chunks; counting
    // either as a colleague makes "who has written the most" answer with a robot.
    if (hit && hit.kind === "person") found.add(hit.canonical);
  }
  return found.size > 0 ? [...found].sort() : undefined;
}
