/**
 * What else was happening around this record, with the same people.
 *
 * SCOPED BY MEASUREMENT, NOT BY THE PLAN. Four edge kinds were designed — explicit
 * links, supersession, threads, and shared people. Measured on 2026-09-12, three of them
 * are already reachable or are not there at all:
 *
 *   links        1,316 chunks, and BIDIRECTIONAL (drive 1,233, calendar 83 — each side
 *                stores the other). Rendered as a `linked:` line on every search hit
 *                since Phase 1, so the id is already in view and `fetch_document` reads
 *                it. A tool to fetch what is already printed is a tool for nothing.
 *   supersession ZERO edges exist. No decision has replaced another yet. Traversal over
 *                an empty relation is machinery for data that is not there.
 *   thread       15,953 part-chunks across 2,901 documents, and `fetch_document` already
 *                reassembles every part of a document by id.
 *   PEOPLE       1,011 chunks name two or more colleagues, and there is NO path from one
 *                record to others around it. `meta:{people:"X"}` answers "everything X is
 *                named in"; it cannot answer "what else was going on that week, with
 *                these same people, around THIS".
 *
 * So this does one thing.
 *
 * AND IT IS A HEURISTIC, WHICH EVERY RESULT SAYS. Two people in a room on the same day
 * is a coincidence often enough to matter: `ingest/link.ts` makes the same point about
 * its own window, that a wrong link attributes one meeting's attendees to another
 * meeting's decisions, silently. So these are rendered as `possible`, never as links,
 * with the overlap and the day gap on every line so a reader can judge rather than trust.
 */
import { supabaseFetch } from "@features/admin/server/supabase";

/** Both must hold. One shared colleague in a company of five is not a signal. */
export const MIN_SHARED_PEOPLE = 2;
export const WINDOW_DAYS = 3;
/** Enough to see the shape of a week, few enough to read. */
export const MAX_RELATED = 12;

export interface RelatedRecord {
  sourceId: string;
  source: string;
  title: string;
  periodEnd: string | null;
  shared: string[];
  dayGap: number | null;
}

export interface RelatedResult {
  anchor: { sourceId: string; title: string; people: string[]; periodEnd: string | null };
  related: RelatedRecord[];
  /** Why there is nothing, when there is nothing. Never an unexplained empty list. */
  note: string;
}

const dayGap = (a: string | null, b: string | null): number | null =>
  a && b
    ? Math.round(Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000)
    : null;

export function pickRelated(
  anchorPeople: string[],
  anchorDay: string | null,
  anchorId: string,
  candidates: Array<{
    source_id: string;
    source: string;
    title: string | null;
    period_end: string | null;
    meta: Record<string, unknown> | null;
  }>
): RelatedRecord[] {
  const want = new Set(anchorPeople);
  return (
    candidates
      .filter((c) => `${c.source}/${c.source_id}` !== anchorId)
      .map((c) => {
        const people = Array.isArray(c.meta?.people) ? (c.meta.people as string[]) : [];
        const shared = people.filter((p) => want.has(p));
        const gap = dayGap(anchorDay, c.period_end);
        return { c, shared, gap };
      })
      .filter(
        ({ shared, gap }) =>
          shared.length >= MIN_SHARED_PEOPLE && gap !== null && gap <= WINDOW_DAYS
      )
      .sort((a, b) => b.shared.length - a.shared.length || (a.gap ?? 0) - (b.gap ?? 0))
      /**
       * THE SAME SUBJECT THREE TIMES IS ONE CONNECTION, NOT THREE.
       *
       * MEASURED on the first real run: the top six were all gmail, and three of them were
       * separate thread ids carrying the identical subject — one test blast, filling half
       * the answer. Deduped on the title rather than the id, because the ids genuinely
       * differ and it is the CONTENT that repeats.
       */
      .filter((x, _i, all) => all.findIndex((y) => y.c.title === x.c.title) === _i)
      /**
       * AND NO ONE SOURCE MAY FILL THE LIST. Gmail is 8,487 of 22,951 chunks, so "who else
       * was around" is answered entirely by email unless it is capped — which is the same
       * reason `retrieve()` holds a per-source share, and the same number.
       */
      .filter((x, _i, all) => {
        const cap = Math.max(2, Math.floor(MAX_RELATED * 0.4));
        return all.filter((y) => y.c.source === x.c.source).indexOf(x) < cap;
      })
      .slice(0, MAX_RELATED)
      .map(({ c, shared, gap }) => ({
        sourceId: `${c.source}/${c.source_id}`,
        source: c.source,
        title: String(c.title ?? "(untitled)").slice(0, 110),
        periodEnd: c.period_end,
        shared,
        dayGap: gap,
      }))
  );
}

export async function relatedContext(id: string): Promise<RelatedResult | { error: string }> {
  const slash = id.indexOf("/");
  if (slash <= 0) {
    return {
      error:
        `\`id\` is \`source/source_id\`, exactly as search_company_context and browse_context ` +
        `print it — for example \`drive/doc:1AbC\`. "${id}" has no source on the front.`,
    };
  }
  const source = id.slice(0, slash);
  const sourceId = id.slice(slash + 1);

  const anchorRes = await supabaseFetch(
    `/rest/v1/brain_chunk?select=source_id,source,title,period_end,meta&source=eq.${encodeURIComponent(source)}` +
      `&source_id=eq.${encodeURIComponent(sourceId)}&limit=1`
  );
  if (!anchorRes.ok)
    return {
      error: `Could not read ${id} (${anchorRes.status}). That is a failed read, not a record with nothing around it.`,
    };
  const [anchor] = (await anchorRes.json()) as Array<{
    source_id: string;
    source: string;
    title: string | null;
    period_end: string | null;
    meta: Record<string, unknown> | null;
  }>;
  if (!anchor)
    return {
      error: `No record \`${id}\`. Ids come from search_company_context and browse_context, which print them on every hit.`,
    };

  const people = Array.isArray(anchor.meta?.people) ? (anchor.meta.people as string[]) : [];
  const base = {
    sourceId: id,
    title: String(anchor.title ?? "(untitled)").slice(0, 110),
    people,
    periodEnd: anchor.period_end,
  };

  if (people.length < MIN_SHARED_PEOPLE) {
    return {
      anchor: base,
      related: [],
      note:
        `This record names ${people.length} colleague${people.length === 1 ? "" : "s"}, and this ` +
        `connection needs at least ${MIN_SHARED_PEOPLE} in common. That is a property of THIS ` +
        `record, not evidence that nothing happened around it.`,
    };
  }
  if (!anchor.period_end) {
    return {
      anchor: base,
      related: [],
      note:
        `This record carries no date, and the connection is "the same people within ` +
        `${WINDOW_DAYS} days". Undated records cannot be placed in time, which is a gap in ` +
        `what we know about this one rather than an absence of related work.`,
    };
  }

  // Candidates: anything naming ANY of the anchor's people in the window. The
  // two-person rule is applied after, in `pickRelated`, so the filter stays a cheap
  // containment query rather than a combinatorial one.
  const from = new Date(Date.parse(`${anchor.period_end}T00:00:00Z`) - WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const to = new Date(Date.parse(`${anchor.period_end}T00:00:00Z`) + WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  /**
   * ANY of the anchor's people, which is an OR of containments — not one containment
   * over the whole list.
   *
   * `meta=cs.{"people":[...]}` with every name means ALL of them, which returns only
   * records with the identical roster. And `ov.` — the first thing tried here — is an
   * ARRAY/RANGE operator; against a jsonb column PostgREST answers 404, so the query
   * failed outright rather than returning nothing. That 404 was invisible until a
   * multi-person anchor was tested, because a record naming fewer than two colleagues
   * returns before the query runs.
   *
   * Names are quoted through JSON.stringify, so an apostrophe or a comma in a name
   * cannot break out of the filter.
   */
  const anyOf = people
    .map((name) => `meta.cs.${encodeURIComponent(JSON.stringify({ people: [name] }))}`)
    .join(",");
  const res = await supabaseFetch(
    `/rest/v1/brain_chunk?select=source_id,source,title,period_end,meta` +
      `&or=(${anyOf})&period_end=gte.${from}&period_end=lte.${to}&limit=200`
  );
  if (!res.ok) {
    return {
      error: `Could not look for related records (${res.status}). A failed read, not an unconnected record.`,
    };
  }
  const related = pickRelated(people, anchor.period_end, id, await res.json());

  return {
    anchor: base,
    related,
    note: related.length
      ? `POSSIBLE connections, not links: these records name at least ${MIN_SHARED_PEOPLE} of the ` +
        `same people within ${WINDOW_DAYS} days. Two colleagues in a room on the same day is a ` +
        `coincidence often enough to matter, so read the overlap and the gap before relying on ` +
        `any of them. For a connection that is CERTAIN, use the \`linked:\` id printed on a ` +
        `search hit — that joins a meeting to its own notes.`
      : `Nothing else names ${MIN_SHARED_PEOPLE}+ of the same people within ${WINDOW_DAYS} days of ` +
        `${anchor.period_end}. This record may simply be unconnected, and the window is narrow — ` +
        `widen the question rather than concluding nothing was happening.`,
  };
}

export function renderRelated(r: RelatedResult): string {
  const head = `${r.anchor.title}\n  ${r.anchor.periodEnd ?? "undated"} · names ${r.anchor.people.join(", ") || "nobody"}\n`;
  const body = r.related.length
    ? r.related
        .map(
          (x) =>
            `  possible — shares ${x.shared.length} (${x.shared.join(", ")}), ${x.dayGap} day${x.dayGap === 1 ? "" : "s"} apart\n` +
            `    [${x.source}] ${x.title}\n    id: ${x.sourceId}`
        )
        .join("\n")
    : "";
  return `${head}\n${r.note}${body ? `\n\n${body}` : ""}`;
}
