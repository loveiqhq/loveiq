/**
 * A small in-memory stand-in for Supabase's data API (PostgREST), for the account tests: the
 * filters, upserts and `return=representation` writes features/mira/server uses, on plain rows.
 * Install it as supabaseFetch's mock; `rpc` and `auth` answer the RPC and Auth admin paths.
 */
export type Row = Record<string, unknown>;
type Handler = (body: Record<string, unknown>, path: string) => Response | Promise<Response>;

const KEYS: Record<string, string> = {
  mira_email_change: "user_id",
  mira_sign_in_code: "email",
};

/** An access token as Supabase issues it (the signature is Supabase's to check, mocked here). */
export const token = (claims: Record<string, unknown>) =>
  ["h", Buffer.from(JSON.stringify(claims)).toString("base64url"), "sig"].join(".");

export const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json" } });

function compare(a: unknown, b: string): number {
  const x = String(a);
  if (/^-?\d+(\.\d+)?$/.test(x) && /^-?\d+(\.\d+)?$/.test(b)) return Number(x) - Number(b);
  const [dx, db] = [Date.parse(x), Date.parse(b)];
  if (/^\d{4}-\d\d-\d\dT/.test(x) && !Number.isNaN(dx) && !Number.isNaN(db)) return dx - db;
  return x < b ? -1 : x > b ? 1 : 0;
}

function matches(row: Row, filters: Array<[string, string]>): boolean {
  return filters.every(([col, expr]) => {
    const v = row[col];
    const [op, ...rest] = expr.split(".");
    const arg = rest.join(".");
    if (op === "not") return !matches(row, [[col, arg]]);
    if (op === "is") return arg === "null" ? v === null || v === undefined : String(v) === arg;
    if (v === null || v === undefined) return false;
    if (op === "eq") return String(v) === arg;
    if (op === "neq") return String(v) !== arg;
    if (op === "ilike") return String(v).toLowerCase() === arg.toLowerCase();
    if (op === "in")
      return arg
        .replace(/^\(|\)$/g, "")
        .split(",")
        .includes(String(v));
    if (op === "gt") return compare(v, arg) > 0;
    if (op === "gte") return compare(v, arg) >= 0;
    if (op === "lt") return compare(v, arg) < 0;
    if (op === "lte") return compare(v, arg) <= 0;
    throw new Error(`fake-db: no operator ${op}`);
  });
}

const pick = (row: Row, select: string | null) =>
  !select || select === "*"
    ? { ...row }
    : Object.fromEntries(select.split(",").map((c) => [c, row[c] ?? null]));

export function fakeDb(
  tables: Record<string, Row[]> = {},
  extra: { rpc?: Record<string, Handler>; auth?: Handler } = {}
) {
  const calls: string[] = [];
  const rowsOf = (t: string) => (tables[t] ??= []);
  async function handle(path: string, init: RequestInit = {}): Promise<Response> {
    const method = init.method ?? "GET";
    calls.push(`${method} ${path}`);
    const body = init.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
    if (path.startsWith("/auth/v1/")) {
      if (!extra.auth) throw new Error(`fake-db: unexpected ${method} ${path}`);
      return extra.auth((body ?? {}) as Record<string, unknown>, `${method} ${path}`);
    }
    const url = new URL(path, "http://db");
    const [, , , name, fn] = url.pathname.split("/");
    if (name === "rpc") {
      const h = extra.rpc?.[fn!];
      if (!h) throw new Error(`fake-db: no rpc ${fn}`);
      return h((body ?? {}) as Record<string, unknown>, path);
    }
    const table = name!;
    const rows = rowsOf(table);
    const key = KEYS[table] ?? "id";
    const filters = [...url.searchParams].filter(
      ([k]) => !["select", "order", "limit", "on_conflict"].includes(k)
    );
    const prefer = new Headers(init.headers).get("Prefer") ?? "";
    const represent = prefer.includes("return=representation");
    const select = url.searchParams.get("select");
    const out = (list: Row[], status: number) =>
      represent || method === "GET"
        ? json(
            list.map((r) => pick(r, select)),
            status
          )
        : new Response(null, { status: status === 200 ? 204 : status });

    if (method === "GET") {
      let found = rows.filter((r) => matches(r, filters));
      const order = url.searchParams.get("order");
      if (order) {
        const [col, dir] = order.split(",")[0]!.split(".");
        found = [...found].sort(
          (a, b) => compare(a[col!], String(b[col!])) * (dir === "desc" ? -1 : 1)
        );
      }
      const limit = Number(url.searchParams.get("limit") ?? Infinity);
      return out(found.slice(0, limit), 200);
    }
    if (method === "POST") {
      const items = (Array.isArray(body) ? body : [body]) as Row[];
      const upsert = prefer.includes("resolution=merge-duplicates");
      const written: Row[] = [];
      for (const item of items) {
        const at = rows.findIndex((r) => item[key] !== undefined && r[key] === item[key]);
        if (at >= 0 && !upsert) return json({ code: "23505", message: "duplicate key" }, 409);
        const row: Row =
          at >= 0
            ? { ...rows[at], ...item }
            : {
                created_at: new Date().toISOString(),
                ...(table === "mira_session" ? { last_seen_at: new Date().toISOString() } : {}),
                ...(key === "id" && item.id === undefined ? { id: crypto.randomUUID() } : {}),
                ...item,
              };
        if (at >= 0) rows[at] = row;
        else rows.push(row);
        written.push(row);
      }
      return out(written, 201);
    }
    if (method === "PATCH") {
      const changed = rows.filter((r) => matches(r, filters));
      for (const r of changed) Object.assign(r, body);
      return out(changed, 200);
    }
    if (method === "DELETE") {
      const gone = rows.filter((r) => matches(r, filters));
      tables[table] = rows.filter((r) => !gone.includes(r));
      return out(gone, 200);
    }
    throw new Error(`fake-db: unexpected ${method} ${path}`);
  }
  return { tables, calls, handle };
}
