/**
 * brain_chunk.exact_terms against a real database: the trigger that fills it, the backfill
 * that fills the older rows without touching an embedding, and find_text's filter over it
 * (supabase/migrations/20261017120000_brain_chunk_exact_terms.sql).
 *
 * WRITES ROWS, so it runs only against a TEST database and never production: set
 * SUPABASE_TEST_URL and SUPABASE_TEST_SERVICE_ROLE_KEY (staging's), or it is skipped. Every
 * row it writes carries one run's source_id prefix and is deleted at the end.
 *
 *   SUPABASE_TEST_URL=https://<staging>.supabase.co SUPABASE_TEST_SERVICE_ROLE_KEY=... \
 *     npx vitest run --config vitest.integration.config.ts __tests__/integration/brain-exact-terms.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findTextFilterForTest } from "@/app/api/mcp/route";

const BASE = process.env.SUPABASE_TEST_URL;
const KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
if (BASE?.includes("pveqkhdpypfzxggwjsnk")) {
  throw new Error("brain-exact-terms writes rows: never point it at production");
}
const describeMaybe = BASE && KEY ? describe : describe.skip;

const RUN = `exact-terms-it:${Date.now().toString(36)}:`;
const VEC = `[${Array.from({ length: 384 }, (_, i) => ((i % 7) - 3) / 10).join(",")}]`;

async function rest(path: string, init: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    method: init.method ?? "GET",
    headers: {
      apikey: KEY!,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

type Row = {
  id: number;
  source_id: string;
  title: string;
  body: string;
  exact_terms: string | null;
  embedding: string | null;
  updated_at: string;
  fts: string;
};
const COLUMNS = "id,source_id,title,body,exact_terms,embedding,updated_at,fts";

/** Each shape the word index keeps whole, and the one a trigram index on runs cannot see. */
const SHAPES: Record<string, { title?: string; body: string }> = {
  link: {
    title:
      "Share the deck https://docs.example.test/document/d/1Ab/edit?userstoinvite=it-a@example.test&role=writer#h.x",
    body: "Task",
  },
  joined: { body: "Owners\nit.b@example.testib@example.test\nnotes" },
  redirect: {
    body: "Book: <https://track.example.test/r?t=V2&url=https%3A%2F%2Fbooking.example.test%2Fit-c%2F30-min> today",
  },
  file: { body: "Your receipt\nInvoice-IT9C0DE-0001.pdf\nThank you" },
  atOnly: { body: "unsubscribe?email=it-e%40example.test now" },
  colonOnly: { body: "q=https%3A%2F%2Fit-f.example.test%2Fbook" },
  wwwOnly: { body: "see www.it-www.example.test/x" },
  schemeOnly: { body: "open https://it.example.test/p/itg9z/more" },
  latin1: { body: "write caf%E9%40example.test now" },
  spaced: { body: "see Report IT8NEG.pdf attached" },
  words: { body: "the itpartword appears here" },
};

/** What the trigger must write for each, as a set of runs (their order is the collation's). */
const TERMS: Record<string, string[] | null> = {
  link: [
    "https://docs.example.test/document/d/1ab/edit?userstoinvite=it-a@example.test&role=writer#h.x",
  ],
  joined: ["it.b@example.testib@example.test"],
  redirect: [
    "<https://track.example.test/r?t=v2&url=https%3a%2f%2fbooking.example.test%2fit-c%2f30-min>",
    "<https://track.example.test/r?t=v2&url=https://booking.example.test/it-c/30-min>",
  ],
  file: ["invoice-it9c0de-0001.pdf"],
  atOnly: ["unsubscribe?email=it-e%40example.test", "unsubscribe?email=it-e@example.test"],
  colonOnly: ["q=https%3a%2f%2fit-f.example.test%2fbook", "q=https://it-f.example.test/book"],
  wwwOnly: ["www.it-www.example.test/x"],
  schemeOnly: ["https://it.example.test/p/itg9z/more"],
  // A Latin-1 é is no UTF-8: the printable ASCII escapes are decoded, and the write succeeds.
  latin1: ["caf%e9%40example.test", "caf%e9@example.test"],
  spaced: ["it8neg.pdf"],
  words: null,
};

const runs = (terms: string | null) => (terms === null ? null : [...terms.split(" ")].sort());
const byKey = async (): Promise<Record<string, Row>> => {
  const rows = (await rest(
    `brain_chunk?select=${COLUMNS}&source_id=like.${encodeURIComponent(RUN)}*`
  )) as Row[];
  return Object.fromEntries(rows.map((r) => [r.source_id.slice(RUN.length), r]));
};

describeMaybe("brain_chunk.exact_terms on a real database", () => {
  beforeAll(async () => {
    await rest("brain_chunk", {
      method: "POST",
      body: Object.entries(SHAPES).map(([key, s]) => ({
        source: "gmail",
        source_id: `${RUN}${key}`,
        title: s.title ?? `Email: ${key}`,
        url: null,
        body: s.body,
        meta: {},
        period_end: "2026-10-17",
        embedding: VEC,
      })),
    });
  });

  afterAll(async () => {
    await rest(`brain_chunk?source_id=like.${encodeURIComponent(RUN)}*`, { method: "DELETE" });
  });

  it("fills exact_terms on insert with each kept run, lower-cased, and its decoded form", async () => {
    const rows = await byKey();
    for (const [key, want] of Object.entries(TERMS)) {
      expect(runs(rows[key]!.exact_terms), key).toEqual(want === null ? null : [...want].sort());
    }
  });

  it.each([
    ["an address inside a link", "it-a@example.test", ["link"]],
    ["an address run into the next", "it.b@example.test", ["joined"]],
    ["a link found only URL-decoded", "booking.example.test/it-c", ["redirect"]],
    ["a number inside a file name", "IT9C0DE-0001", ["file"]],
    ["an address written %40", "it-e@example.test", ["atOnly"]],
    ["a link written %3A%2F%2F", "it-f.example.test/book", ["colonOnly"]],
    ["a host after www.", "it-www.example.test", ["wwwOnly"]],
    ["a path inside a link", "itg9z/more", ["schemeOnly"]],
    ["a file name's stem", "IT8NEG", ["spaced"]],
    ["part of a longer word: not found, as the tool says", "itpart", []],
    [
      "a text with a space, a word of it in a file name: not found, as it says",
      "Report IT8NEG",
      [],
    ],
  ])("find_text's filter finds %s", async (_what, text, want) => {
    const rows = (await rest(
      `brain_chunk?select=source_id&source_id=like.${encodeURIComponent(RUN)}*` +
        `&or=${encodeURIComponent(findTextFilterForTest(text))}`
    )) as Array<{ source_id: string }>;
    expect(rows.map((r) => r.source_id.slice(RUN.length)).sort()).toEqual(want);
  });

  it("recomputes exact_terms when the body changes", async () => {
    const id = (await byKey()).words!.id;
    await rest(`brain_chunk?id=eq.${id}`, {
      method: "PATCH",
      body: { body: "now at it-z@example.test" },
    });
    const row = (await byKey()).words!;
    expect(row.exact_terms).toBe("it-z@example.test");
    // The embedding trigger's own rule, unchanged: new text, so the old vector goes.
    expect(row.embedding).toBeNull();
  });

  it("leaves exact_terms alone when only other columns change", async () => {
    const id = (await byKey()).file!.id;
    // Written alone, exact_terms fires neither trigger: a marker the trigger would overwrite.
    await rest(`brain_chunk?id=eq.${id}`, { method: "PATCH", body: { exact_terms: "marker" } });
    await rest(`brain_chunk?id=eq.${id}`, { method: "PATCH", body: { meta: { touched: true } } });
    expect((await byKey()).file!.exact_terms).toBe("marker");
  });

  it("backfills only exact_terms, keeping every embedding, and a second run writes nothing", async () => {
    const before = await byKey();
    await rest(`brain_chunk?id=eq.${before.link!.id}`, {
      method: "PATCH",
      body: { exact_terms: null },
    });
    const ids = Object.values(before).map((r) => r.id);
    const call = async () =>
      (
        (await rest("rpc/brain_backfill_exact_terms", {
          method: "POST",
          body: { p_after: Math.min(...ids) - 1, p_limit: ids.length },
        })) as Array<{ last_id: number; scanned: number; written: number }>
      )[0]!;

    const first = await call();
    expect(first.last_id).toBe(Math.max(...ids));
    expect(first.written).toBe(2); // the emptied link and the marked file
    const after = await byKey();
    expect(runs(after.link!.exact_terms)).toEqual(TERMS.link);
    expect(runs(after.file!.exact_terms)).toEqual(TERMS.file);
    for (const key of Object.keys(SHAPES)) {
      const [b, a] = [before[key]!, after[key]!];
      expect(
        [a.title, a.body, a.embedding, a.updated_at, a.fts],
        `${key} kept its text, vector, time and word index`
      ).toEqual([b.title, b.body, b.embedding, b.updated_at, b.fts]);
    }
    expect(after.link!.embedding).toBe(before.link!.embedding);
    expect(after.link!.embedding).not.toBeNull();

    expect((await call()).written).toBe(0);
  });
});
