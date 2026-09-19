/**
 * Fill `meta.people` on chunks written before the person spine existed.
 *
 * WHY THIS IS NEEDED. `meta.people` is derived centrally in the shared upsert path,
 * so every ingester gains it at once — but only for rows it actually REWRITES. A
 * chunk whose content has not changed is touched, not rewritten, which is the whole
 * point of that optimisation and also why the field never arrived on anything older
 * than the feature. Measured 2026-09-11: all 232 WhatsApp chunks carried `speakers`
 * that resolve cleanly against the registry, and not one had `people`.
 *
 * Re-ingesting is not an option for every source — the WhatsApp sync reads a local
 * phone export that exists on one laptop — so this backfills in place instead.
 *
 * Safe to run against production, and safe to re-run:
 *   - It only reads rows that LACK `meta.people`, so a second run does nothing.
 *   - It writes only when the registry resolves a name; an unresolvable author
 *     (a vendor, a shared mailbox, "someone") is left alone rather than stamped empty.
 *   - It does not touch `updated_at`, so source sweeps are unaffected.
 *   - `embedText` is title + body only, so metadata never invalidates an embedding.
 *
 *   npx tsx scripts/brain-backfill-people.ts --dry
 *   npx tsx scripts/brain-backfill-people.ts
 */
import { supabaseFetch } from "@features/admin/server/supabase";
import { loadPeople, peopleIn } from "@features/brain/server/people";

const PAGE = 500;

async function main() {
  const dry = process.argv.includes("--dry");
  const byAlias = await loadPeople();
  // A registry that cannot be read must stop the run, not quietly stamp nothing.
  if (!byAlias) {
    console.error("  the person registry could not be read — nothing was written");
    process.exitCode = 1;
    return;
  }

  const scanned: Record<string, number> = {};
  const written: Record<string, number> = {};
  let failures = 0;

  for (const source of ["whatsapp", "slack", "drive", "gmail", "notion", "calendar", "decision"]) {
    let offset = 0;
    for (;;) {
      const res = await supabaseFetch(
        `/rest/v1/brain_chunk?select=id,meta&source=eq.${source}&limit=${PAGE}&offset=${offset}`
      );
      if (!res.ok) {
        console.error(`  ${source}: read failed ${res.status}`);
        failures++;
        break;
      }
      const rows = (await res.json()) as Array<{
        id: number;
        meta: Record<string, unknown> | null;
      }>;
      if (rows.length === 0) break;

      for (const row of rows) {
        const meta = row.meta ?? {};
        if (meta.people) continue;
        scanned[source] = (scanned[source] ?? 0) + 1;
        const people = peopleIn(meta, byAlias);
        if (!people) continue;
        if (!dry) {
          // PATCH replaces the whole jsonb column, so the existing meta is spread back in.
          const put = await supabaseFetch(`/rest/v1/brain_chunk?id=eq.${row.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify({ meta: { ...meta, people } }),
          });
          if (!put.ok) {
            failures++;
            continue;
          }
        }
        written[source] = (written[source] ?? 0) + 1;
      }

      offset += PAGE;
      if (rows.length < PAGE) break;
    }
    if (scanned[source]) {
      console.log(
        `  ${source.padEnd(9)} ${String(written[source] ?? 0).padStart(5)} of ${String(scanned[source]).padStart(5)} ` +
          `chunks without \`people\` resolved${dry ? " (dry run, nothing written)" : ""}`
      );
    }
  }

  const total = Object.values(written).reduce((a, b) => a + b, 0);
  console.log(`\n  ${dry ? "would write" : "wrote"} ${total} row(s)`);
  if (failures > 0) {
    console.error(`  ${failures} request(s) failed — the backfill is incomplete, re-run it`);
    process.exitCode = 1;
  }
}

void main();
