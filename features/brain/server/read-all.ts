import { supabaseFetch } from "@features/admin/server/supabase";

/**
 * Every row a PostgREST query matches, a page at a time: one read returns at most 1,000
 * rows and says nothing about the rest. Null when a page fails, or past the ceiling, so a
 * partial read is never passed off as the whole. `path` is a full `/rest/v1/...?` query
 * with a stable `order=`, or pages can repeat and skip rows.
 */
export async function readAll<T>(path: string, maxRows = 20_000): Promise<T[] | null> {
  const rows: T[] = [];
  for (let offset = 0; offset < maxRows; offset += 1000) {
    const res = await supabaseFetch(`${path}&limit=1000&offset=${offset}`);
    if (!res.ok) return null;
    const batch = (await res.json().catch(() => null)) as T[] | null;
    if (!Array.isArray(batch)) return null;
    rows.push(...batch);
    if (batch.length < 1000) return rows;
  }
  return null;
}
