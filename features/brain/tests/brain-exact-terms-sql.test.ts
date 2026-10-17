import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The rules of brain_chunk.exact_terms that only the SQL holds. What the database does with
 * them is checked against staging by __tests__/integration/brain-exact-terms.integration.test.ts,
 * which writes rows and so never runs in CI.
 */
const SQL = readFileSync("supabase/migrations/20261017120000_brain_chunk_exact_terms.sql", "utf8");
const DOWN = readFileSync(
  "supabase/rollbacks/20261017120000_brain_chunk_exact_terms_down.sql",
  "utf8"
);
const ROUTE = readFileSync("app/api/mcp/route.ts", "utf8");
/** The statements, without the comments that describe them. */
const CODE = SQL.replace(/--[^\n]*/g, "");
const fn = (name: string) => {
  const at = CODE.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(at, name).toBeGreaterThanOrEqual(0);
  return CODE.slice(at, CODE.indexOf("$function$;", at));
};

describe("brain_chunk.exact_terms, in SQL", () => {
  it("adds a plain column, so the table is not rewritten, and leaves fts alone", () => {
    expect(CODE).toMatch(
      /ALTER TABLE public\.brain_chunk ADD COLUMN IF NOT EXISTS exact_terms text;/
    );
    expect(CODE).not.toMatch(/exact_terms text\s+(DEFAULT|NOT NULL|GENERATED)/i);
    expect(CODE).not.toMatch(/\bfts\b/);
  });

  it("is filled on insert and when title or body changes, and on nothing else", () => {
    expect(CODE).toMatch(
      /CREATE TRIGGER brain_chunk_exact_terms_follow_text\s+BEFORE INSERT OR UPDATE OF title, body ON public\.brain_chunk\s+FOR EACH ROW\s+EXECUTE FUNCTION public\.brain_chunk_set_exact_terms\(\);/
    );
    expect(fn("brain_chunk_set_exact_terms")).toContain(
      "NEW.exact_terms := public.brain_exact_terms(NEW.title, NEW.body);"
    );
  });

  it("keeps the runs that hold @, ://, www., %40 or %3A or end in a file extension", () => {
    const pattern =
      /regexp_matches\(\s*lower\(coalesce\(p_title, ''\) \|\| ' ' \|\| coalesce\(p_body, ''\)\),\s*'([^']+)',\s*'g'\)/.exec(
        fn("brain_exact_terms")
      )![1]!;
    // The whole pattern, so a dropped extension or a widened run is a failing test.
    expect(pattern).toBe(
      "(\\S*(?:@|://|www\\.|%40|%3a)\\S*|\\S*\\.(?:pdf|docx?|xlsx?|xlsm|pptx?|od[tsp]|rtf|txt|csv|tsv|md|json|xml|ya?ml|html?|sql|ics|eml|png|jpe?g|gif|svg|webp|heic|mp[34]|m4a|mov|wav|zip|[jt]sx?|mjs|css|sh|py)[^a-z0-9[:space:]]*(?=\\s|$))"
    );
    // Runs are joined by a space: joined by nothing, a text with no spaces could match
    // across the end of one run and the start of the next.
    expect(fn("brain_exact_terms")).toContain("SELECT string_agg(DISTINCT v.t, ' ')");
    expect(fn("brain_exact_terms")).toMatch(
      /CASE WHEN strpos\(r\.m\[1\], '%'\) > 0 THEN public\.brain_url_decode\(r\.m\[1\]\) END/
    );
  });

  it("decodes as the route's mirror does, falling back to ASCII escapes, never failing", () => {
    const decode = fn("brain_url_decode");
    expect(decode).toContain("'%([0-9a-f]{2})|([^%]+|%)', 'gi'");
    expect(decode).toMatch(/EXCEPTION WHEN character_not_in_repertoire THEN/);
    // The bytes are read as UTF-8, as the route's TextDecoder reads them.
    expect(decode).toMatch(/''::bytea ORDER BY n\)[\s\S]*?\),\s*'UTF8'\);/);
    expect(decode).toContain("'%([2-7][0-9a-f])|([^%]+|%)', 'gi'");
    expect(ROUTE).toContain(
      "decodeEscapes(run, /%[0-9a-f]{2}/iy) ?? decodeEscapes(run, /%[2-7][0-9a-f]/iy)"
    );
  });

  it("backfills exact_terms alone, in id order, at most 1,000 rows, waiting 2 s for a lock", () => {
    const backfill = fn("brain_backfill_exact_terms");
    expect(backfill).toMatch(/SET lock_timeout TO '2s'/);
    expect(backfill).toMatch(
      /WHERE id > p_after\s+ORDER BY id\s+LIMIT least\(greatest\(p_limit, 1\), 1000\)/
    );
    expect(backfill).toMatch(
      /SELECT id, title, body, public\.brain_exact_terms\(title, body\) AS terms/
    );
    const set = /UPDATE public\.brain_chunk c\s+SET ([\s\S]*?)\s+FROM batch b/.exec(backfill)?.[1];
    expect(set).toBe("exact_terms = b.terms");
    // Only where it differs, and never over a row an ingester rewrote after the batch was read.
    expect(backfill).toMatch(
      /AND c\.exact_terms IS DISTINCT FROM b\.terms\s+AND c\.title IS NOT DISTINCT FROM b\.title\s+AND c\.body = b\.body/
    );
  });

  it("lets only the service role call its functions", () => {
    for (const sig of [
      "brain_url_decode(text)",
      "brain_exact_terms(text, text)",
      "brain_backfill_exact_terms(bigint, integer)",
    ]) {
      expect(CODE).toContain(
        `REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated;`
      );
      expect(CODE).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO service_role;`);
    }
  });

  it("indexes it by trigram, built concurrently after the transaction", () => {
    const tail = CODE.slice(CODE.lastIndexOf("COMMIT;"));
    expect(tail).toMatch(
      /CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brain_chunk_exact_terms_trgm\s+ON public\.brain_chunk USING gin \(exact_terms gin_trgm_ops\);/
    );
  });

  it("rolls back every object it creates", () => {
    const created = [...CODE.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map(
      (m) => m[1]
    );
    expect(created).toHaveLength(4);
    for (const name of created) expect(DOWN).toContain(`DROP FUNCTION IF EXISTS public.${name}(`);
    expect(DOWN).toContain(
      "DROP INDEX CONCURRENTLY IF EXISTS public.idx_brain_chunk_exact_terms_trgm;"
    );
    expect(DOWN).toContain(
      "DROP TRIGGER IF EXISTS brain_chunk_exact_terms_follow_text ON public.brain_chunk;"
    );
    expect(DOWN).toContain("ALTER TABLE public.brain_chunk DROP COLUMN IF EXISTS exact_terms;");
  });
});
