#!/usr/bin/env tsx
/**
 * Apply the corpus redaction rules to chunks written BEFORE those rules existed.
 *
 * `upsertChunks` redacts on the way in, so everything written since the guard shipped is
 * clean. Nothing ever went back for what was already there — and most sources never
 * rewrite an old chunk, so a day of WhatsApp from May keeps whatever it was ingested with
 * forever. `updated_at` moves because of the touch, which makes those rows look freshly
 * maintained rather than stale.
 *
 * Found by audit on 2026-09-17: 88 chunks still held a redactable secret, including six
 * live, never-expiring `report_access_token` values — each one opens a named person's
 * paid report with no login — plus Calendly cancellation links and customer.io
 * unsubscribe links, which act on a customer in one click.
 *
 * This is the same shape as the `#email-inbox` denylist found the same day: the
 * prevention shipped, the cleanup did not. A guard that only applies to new writes leaves
 * the exposure it was written for sitting in the corpus.
 *
 * Idempotent and safe to re-run: redaction only ever replaces a secret with `[redacted]`,
 * so a second pass changes nothing. Run:
 *
 *   npx tsx --env-file-if-exists=.env.local scripts/brain-redact-backfill.ts [--apply]
 *
 * Without `--apply` it only reports, because a script that writes by default is one
 * somebody runs by accident.
 */
import { redactUrlSecrets } from "@features/brain/server/ingest/upsert";
import { supabaseFetch } from "@features/admin/server/supabase";

const PAGE = 1000;

interface Row {
  id: number;
  source: string;
  title: string;
  body: string;
  url: string | null;
}

export interface Fix {
  id: number;
  source: string;
  title?: string;
  body?: string;
  url?: string | null;
}

/** The fields that change for one row, or null when it is already clean. Pure. */
export function fixFor(row: Row): Fix | null {
  const title = redactUrlSecrets(row.title);
  const body = redactUrlSecrets(row.body);
  const url = row.url === null ? null : redactUrlSecrets(row.url);
  if (title === row.title && body === row.body && url === row.url) return null;
  const fix: Fix = { id: row.id, source: row.source };
  if (title !== row.title) fix.title = title;
  if (body !== row.body) fix.body = body;
  if (url !== row.url) fix.url = url;
  return fix;
}

async function scan(): Promise<Fix[]> {
  const out: Fix[] = [];
  let offset = 0;
  for (;;) {
    const res = await supabaseFetch(
      `/rest/v1/brain_chunk?select=id,source,title,body,url&order=id&limit=${PAGE}&offset=${offset}`
    );
    if (!res.ok) throw new Error(`could not read brain_chunk (${res.status})`);
    const rows = (await res.json()) as Row[];
    if (rows.length === 0) break;
    for (const r of rows) {
      const fix = fixFor(r);
      if (fix) out.push(fix);
    }
    offset += rows.length;
    if (rows.length < PAGE) break;
  }
  return out;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const fixes = await scan();

  const bySource = new Map<string, number>();
  for (const f of fixes) bySource.set(f.source, (bySource.get(f.source) ?? 0) + 1);
  console.log(`\n${fixes.length} chunk(s) still hold a redactable secret`);
  for (const [s, n] of [...bySource].sort((a, b) => b[1] - a[1]))
    console.log(`  ${String(n).padStart(4)}  ${s}`);

  if (fixes.length === 0) {
    console.log("\nNothing to do.\n");
    process.exit(0);
  }
  if (!apply) {
    console.log("\nReport only. Re-run with --apply to redact them.\n");
    process.exit(0);
  }

  let done = 0;
  let failed = 0;
  for (const fix of fixes) {
    const { id, source: _source, ...fields } = fix;
    const res = await supabaseFetch(`/rest/v1/brain_chunk?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      /**
       * The embedding is cleared with the text. It was computed from a body containing the
       * secret, and leaving it would keep a vector of the unredacted text against a
       * redacted row — nothing readable, but the two would no longer describe each other.
       * `embedMissing` refills it on the next fast-lane run.
       */
      body: JSON.stringify({ ...fields, embedding: null }),
    });
    if (res.ok) done += 1;
    else {
      failed += 1;
      console.log(`  FAILED id=${id} (${res.status})`);
    }
  }
  console.log(`\nredacted ${done}, failed ${failed}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

if (process.argv[1]?.includes("brain-redact-backfill")) {
  main().catch((err) => {
    console.error(`brain-redact-backfill failed — ${err?.message ?? err}`);
    process.exit(1);
  });
}
