/**
 * Do the brain's own descriptions still tell the truth?
 *
 * `brain:drift` compares the DEPLOYED brief against this repo. It cannot catch a claim
 * the two agree on that is false about the world, and that is the failure that actually
 * happened: on 2026-09-14 three places told every caller `resend_webhook_event` "has never
 * held a row -- the webhook was never registered" while the table held 39. Repo and
 * deployment matched perfectly. Both were wrong.
 *
 * The descriptions are deliberately claim-heavy because they are load-bearing guidance,
 * and every claim is a future lie with nothing watching it. This watches them.
 *
 * ONLY MODEL-VISIBLE TEXT. The claims are read out of `TOOLS`, `EXTERNAL_SERVICES` and
 * `MCP_INSTRUCTIONS` -- what the model is actually served -- and never out of the source
 * file. Grepping `route.ts` finds hundreds of measurements inside CODE COMMENTS, which are
 * notes to whoever edits the file next and are supposed to be dated; flagging those would
 * bury the handful of claims that reach a caller. Measured 2026-09-15: the whole
 * model-visible surface is ~24k characters across 27 strings.
 *
 * Exit 0 clean, 1 on a contradicted claim, 3 when a check could not be run -- inconclusive
 * is not success, and a checker with no way to say so reports a verified zero it never
 * measured.
 */
import { supabaseFetch } from "@features/admin/server/supabase";

type Severity = "error" | "warn" | "inconclusive";
interface Finding {
  severity: Severity;
  where: string;
  claim: string;
  detail: string;
}

const STALE_AFTER_DAYS = 60;

async function tableCount(table: string): Promise<number | null> {
  const res = await supabaseFetch(`/rest/v1/${table}?select=*&limit=1`, {
    headers: { Prefer: "count=exact", Range: "0-0" },
  });
  if (!res.ok) return null;
  const n = Number(res.headers.get("content-range")?.split("/")[1]);
  return Number.isFinite(n) ? n : null;
}

/** Every table, view and function the database actually has. */
async function knownNames(): Promise<Set<string> | null> {
  const res = await supabaseFetch("/rest/v1/");
  if (!res.ok) return null;
  const spec = (await res.json().catch(() => null)) as {
    definitions?: Record<string, { properties?: Record<string, unknown> }>;
    paths?: Record<string, unknown>;
  } | null;
  if (!spec?.definitions) return null;
  const names = new Set<string>();
  for (const [table, def] of Object.entries(spec.definitions)) {
    names.add(table);
    for (const col of Object.keys(def.properties ?? {})) names.add(col);
  }
  for (const p of Object.keys(spec.paths ?? {})) {
    if (p.startsWith("/rpc/")) names.add(p.slice(5));
  }
  return names;
}

export async function collectFindings(
  texts: Array<{ where: string; text: string }>,
  deps: {
    tableCount: (t: string) => Promise<number | null>;
    knownNames: () => Promise<Set<string> | null>;
    listedGetFunctions: () => Promise<number | null>;
    today?: Date;
  }
): Promise<Finding[]> {
  const out: Finding[] = [];
  const today = deps.today ?? new Date();

  // 1. EMPTINESS. The Resend shape: a named table asserted to hold nothing. These flip
  //    silently the moment the thing starts working, and they mislead hardest -- a caller
  //    told a table is empty stops looking, and reports "none happened" for "not recorded".
  const emptyRe =
    /`(\w+)`[^.]{0,90}?(?:is EMPTY|is empty|never held a row|has never held|holds no rows|has no rows)/g;
  for (const { where, text } of texts) {
    for (const m of text.matchAll(emptyRe)) {
      const table = m[1]!;
      const n = await deps.tableCount(table);
      if (n === null)
        out.push({
          severity: "inconclusive",
          where,
          claim: m[0].slice(0, 90),
          detail: `could not count ${table}`,
        });
      else if (n > 0)
        out.push({
          severity: "error",
          where,
          claim: m[0].slice(0, 90),
          detail: `${table} holds ${n} rows — the claim that it is empty is false`,
        });
    }
  }

  // 2. THE get_* COUNT. Named explicitly because it is the one live numeric claim about a
  //    thing that grows: every migration adding an analysis function makes it staler, and
  //    nothing recomputes it. It was 44 against a real 46 when this check was written.
  for (const { where, text } of texts) {
    for (const m of text.matchAll(/`?list_product_tables`?\s+lists\s+(\d+)/g)) {
      const claimed = Number(m[1]);
      const actual = await deps.listedGetFunctions();
      if (actual === null)
        out.push({
          severity: "inconclusive",
          where,
          claim: m[0],
          detail: "could not list the product tables",
        });
      else if (actual !== claimed)
        out.push({
          severity: "error",
          where,
          claim: m[0],
          detail: `list_product_tables lists ${actual} get_* functions, not ${claimed}`,
        });
    }
  }

  // 3. NAMES THAT NO LONGER EXIST. A description naming a dropped table sends a caller to
  //    something that cannot answer. `calendly_webhook_event` was dropped on 2026-09-14 and
  //    every mention of it had to be found by hand.
  const known = await deps.knownNames();
  if (!known) {
    out.push({
      severity: "inconclusive",
      where: "schema",
      claim: "identifier existence",
      detail: "could not read the schema, so no identifier was checked",
    });
  } else {
    const seen = new Set<string>();
    for (const { where, text } of texts) {
      for (const m of text.matchAll(/`([a-z][a-z0-9]*(?:_[a-z0-9]+){1,})`/g)) {
        const id = m[1]!;
        if (seen.has(id) || known.has(id) || KNOWN_NON_SCHEMA.has(id)) continue;
        seen.add(id);
        out.push({
          severity: "warn",
          where,
          claim: `\`${id}\``,
          detail: "not a table, view, function, column or tool — dropped, renamed, or prose",
        });
      }
    }
  }

  // 4. DATED MEASUREMENTS go stale rather than false, so they warn.
  for (const { where, text } of texts) {
    for (const m of text.matchAll(
      /(?:measured|checked|as of)[^.]{0,25}?\b(20\d\d-\d\d-\d\d)\b/gi
    )) {
      const age = Math.floor((today.getTime() - new Date(m[1]!).getTime()) / 86_400_000);
      if (age > STALE_AFTER_DAYS)
        out.push({
          severity: "warn",
          where,
          claim: m[0].slice(0, 80),
          detail: `measured ${age} days ago — re-check or drop the date`,
        });
    }
  }
  return out;
}

/** Tool names and other identifiers that are deliberately not database objects. */
const KNOWN_NON_SCHEMA = new Set([
  "search_company_context",
  "browse_context",
  "count_context",
  "fetch_document",
  "list_sources",
  "list_product_tables",
  "query_product_data",
  "get_business_numbers",
  "query_external_service",
  "record_decision",
  "post_to_slack",
  "send_email",
  "write_to_notion",
  "write_to_google_doc",
  "show_design",
  "show_page",
  "related_context",
  "exclude_sources",
  "learned_since",
  "order_by",
  "group_by",
  "per_source",
  "meta_filter",
  "query_embedding",
  "anchor_date",
  "anchor_grain",
  "file_key",
  "node_id",
  "max_px",
  "thread_ts",
  "reply_broadcast",
  "doc_id",
  "page_id",
  "utm_tracker",
  "figma_file_key",
]);

async function main() {
  const m = (await import("@/app/api/mcp/route")) as unknown as {
    TOOLS: Array<{ name: string; description?: string }>;
    EXTERNAL_SERVICES: Record<string, { note?: string }>;
    MCP_INSTRUCTIONS: string;
  };
  const texts: Array<{ where: string; text: string }> = [
    ...m.TOOLS.map((t) => ({ where: `tool:${t.name}`, text: String(t.description ?? "") })),
    ...Object.entries(m.EXTERNAL_SERVICES).map(([k, v]) => ({
      where: `service:${k}`,
      text: String(v.note ?? ""),
    })),
    { where: "instructions", text: String(m.MCP_INSTRUCTIONS ?? "") },
  ];
  const chars = texts.reduce((t, x) => t + x.text.length, 0);
  console.log(`checking ${chars} characters of model-visible text across ${texts.length} strings`);

  const findings = await collectFindings(texts, {
    tableCount,
    knownNames,
    listedGetFunctions: async () => {
      const { POST } = (await import("@/app/api/mcp/route")) as unknown as {
        POST: (r: Request) => Promise<Response>;
      };
      const res = await POST(
        new Request("https://local/api/mcp", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${process.env.LOVEIQ_MCP_TOKEN ?? ""}`,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "list_product_tables", arguments: {} },
          }),
        })
      );
      const j = (await res.json().catch(() => null)) as {
        result?: { content?: Array<{ text?: string }> };
      } | null;
      const text = j?.result?.content?.[0]?.text;
      if (!text) return null;
      return [...text.matchAll(/^rpc\/(get_\w+)\(/gm)].length;
    },
  });

  const bySeverity = (s: Severity) => findings.filter((f) => f.severity === s);
  for (const f of findings) {
    console.log(`\n${f.severity.toUpperCase()} [${f.where}]`);
    console.log(`  claim : ${f.claim.replace(/\s+/g, " ")}`);
    console.log(`  truth : ${f.detail}`);
  }
  const errors = bySeverity("error").length;
  const inconclusive = bySeverity("inconclusive").length;
  console.log(
    `\n=== claims: ${errors} contradicted, ${bySeverity("warn").length} stale/unknown, ${inconclusive} unchecked ===`
  );
  if (errors) process.exit(1);
  if (inconclusive) process.exit(3);
  process.exit(0);
}

if (process.argv[1]?.includes("check-mcp-claims")) {
  main().catch((e) => {
    console.error("claims check failed to run:", e instanceof Error ? e.message : e);
    process.exit(3);
  });
}
