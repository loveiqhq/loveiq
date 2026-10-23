/**
 * A small in-memory PostgREST for the unlock-feedback tests: the filters, writes and the two
 * tier RPCs the grant, the report access, the upgrade credit and the refund path use, so a
 * purchase sequence runs through the real code end to end. Every call waits a tick first, so
 * two requests started together interleave as they do on the server.
 *
 * Wire it in with `vi.mock("@shared/http/fetch-with-timeout", ...)` calling `db.fetch`.
 */
import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";
import { hashLinkToken } from "@features/unlock-feedback/server/link";

type Row = Record<string, unknown>;

export const READER = {
  submissionId: 70,
  userId: 9,
  email: "reader@example.com",
  personalReportId: 5,
  archetype: "Loyal Ritualist",
  reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
  linkToken: "A".repeat(43),
};

const TIER_RANK: Record<string, number> = { essentials: 1, full_report: 2 };

function field(row: Row, key: string): unknown {
  const [column, path] = key.split("->>");
  const value = row[column!];
  if (path === undefined) return value;
  return value && typeof value === "object" ? (value as Row)[path] : undefined;
}

function matches(row: Row, key: string, raw: string): boolean {
  const value = field(row, key);
  const text = value === null || value === undefined ? null : String(value);
  if (raw === "is.null") return text === null;
  if (raw === "not.is.null") return text !== null;
  if (raw === "is.true") return value === true;
  if (raw === "is.false") return value === false;
  const [op, ...rest] = raw.split(".");
  const operand = rest.join(".");
  if (op === "eq") return text === operand;
  if (op === "neq") return text !== null && text !== operand;
  if (op === "gt") return text !== null && Number(text) > Number(operand);
  if (op === "in")
    return operand
      .replace(/[()]/g, "")
      .split(",")
      .includes(text ?? "");
  throw new Error(`fakeDb: unsupported filter ${key}=${raw}`);
}

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict"]);

export function createFakeDb() {
  const tables: Record<string, Row[]> = {
    survey_submission: [],
    scoring_result: [],
    personal_report: [],
    payment: [],
    payment_item: [],
    payment_webhook_event: [],
    report_access_token: [],
    unlock_feedback: [],
  };
  let nextId = 100;
  const calls: Array<{ method: string; url: string; body: unknown }> = [];

  const insert = (table: string, row: Row): Row | "conflict" => {
    const rows = (tables[table] ??= []);
    if (
      table === "payment" &&
      field(row, "metadata->>source") === "unlock_feedback" &&
      rows.some(
        (p) =>
          field(p, "metadata->>source") === "unlock_feedback" &&
          p.personal_report_id === row.personal_report_id
      )
    ) {
      return "conflict";
    }
    if (
      table === "personal_report" &&
      rows.some((p) => p.survey_submission_id === row.survey_submission_id)
    ) {
      return "conflict";
    }
    const stored = { created_date_time: new Date().toISOString(), id: nextId++, ...row };
    if (table === "payment" && stored.is_test === undefined) stored.is_test = false;
    rows.push(stored);
    return stored;
  };

  const setTiers = (personalReportId: number, update: (tiers: Row) => Row) => {
    const report = tables.personal_report!.find((r) => r.id === personalReportId);
    if (!report) throw new Error(`fakeDb: no personal_report ${personalReportId}`);
    const tiers = update({ ...((report.archetype_tiers as Row) ?? {}) });
    report.archetype_tiers = tiers;
    report.unlocked_archetypes = Object.keys(tiers);
    return tiers;
  };

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  async function fetch(
    url: string,
    init: { method?: string; body?: string; headers?: Record<string, string> } = {}
  ) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    const { pathname, searchParams } = new URL(url);
    const wantsRows = (init.headers?.Prefer ?? "").includes("return=representation");

    const rpc = pathname.match(/\/rest\/v1\/rpc\/(\w+)$/)?.[1];
    if (rpc === "upsert_archetype_tier") {
      return json(
        setTiers(body.p_personal_report_id, (tiers) => {
          const current = tiers[body.p_archetype] as string | undefined;
          if (!current || TIER_RANK[body.p_tier]! > TIER_RANK[current]!) {
            tiers[body.p_archetype] = body.p_tier;
          }
          return tiers;
        })
      );
    }
    if (rpc === "unlock_all_archetypes") {
      return json(
        setTiers(body.p_personal_report_id, () =>
          Object.fromEntries(KNOWN_ARCHETYPES.map((name) => [name, "full_report"]))
        )
      );
    }
    if (rpc) throw new Error(`fakeDb: unsupported rpc ${rpc}`);

    const table = pathname.match(/\/rest\/v1\/(\w+)$/)?.[1];
    if (!table || !(table in tables)) throw new Error(`fakeDb: unsupported ${method} ${url}`);
    const filters = [...searchParams.entries()].filter(([key]) => !RESERVED.has(key));
    const selected = () =>
      tables[table]!.filter((row) => filters.every(([key, raw]) => matches(row, key, raw)));

    if (method === "GET") {
      const limit = Number(searchParams.get("limit") ?? Infinity);
      return json(selected().slice(0, limit));
    }
    if (method === "PATCH") {
      const rows = selected();
      for (const row of rows) Object.assign(row, body);
      return wantsRows ? json(rows) : new Response(null, { status: 204 });
    }
    if (method === "POST") {
      const stored = insert(table, body as Row);
      if (stored === "conflict") return json({ code: "23505" }, 409);
      return wantsRows ? json([stored], 201) : new Response(null, { status: 201 });
    }
    throw new Error(`fakeDb: unsupported method ${method}`);
  }

  /** One reader with a report, their email sent: the state the send leaves behind. */
  function seedReader() {
    tables.survey_submission!.push({
      id: READER.submissionId,
      user_id: READER.userId,
      app_user: { id: READER.userId, email: READER.email },
    });
    tables.scoring_result!.push({
      survey_submission_id: READER.submissionId,
      primary_archetype: READER.archetype,
      v5_primary_archetype: READER.archetype,
    });
    tables.personal_report!.push({
      id: READER.personalReportId,
      survey_submission_id: READER.submissionId,
      payment_id: null,
      payment_status: null,
      url: `/report/${READER.reportToken}`,
      unlocked_archetypes: [],
      archetype_tiers: {},
    });
    tables.report_access_token!.push({
      survey_submission_id: READER.submissionId,
      token: READER.reportToken,
      created_at: "2026-10-18T09:00:00.000Z",
      revoked_at: null,
    });
    tables.unlock_feedback!.push({
      id: 1,
      survey_submission_id: READER.submissionId,
      personal_report_id: READER.personalReportId,
      link_hash: hashLinkToken(READER.linkToken),
      sent_at: "2026-10-18T12:00:00.000Z",
      reason: null,
      first_reason: null,
      answered_at: null,
      changed_at: null,
      answer_loads: 0,
      chips: [],
      note: null,
      detail_at: null,
      device: null,
      already_paid: false,
      unlocked_at: null,
      payment_id: null,
    });
  }

  /** A Stripe purchase as fulfillment records it: its payment row and the tiers it opens. */
  function buy({
    plan,
    archetype = READER.archetype,
    amount,
    chargeId,
    isTest = false,
  }: {
    plan: "full_report" | "all_reports";
    archetype?: string;
    amount: number;
    chargeId: string;
    isTest?: boolean;
  }) {
    const payment = insert("payment", {
      amount,
      currency: "EUR",
      is_test: isTest,
      metadata: plan === "all_reports" ? { plan } : { plan, archetype },
      personal_report_id: READER.personalReportId,
      refund_amount: null,
      status: "succeeded",
      stripe_charge_id: chargeId,
      user_id: READER.userId,
    }) as Row;
    setTiers(READER.personalReportId, (tiers) =>
      plan === "all_reports"
        ? Object.fromEntries(KNOWN_ARCHETYPES.map((name) => [name, "full_report"]))
        : { ...tiers, [archetype]: "full_report" }
    );
    return payment;
  }

  return {
    tables,
    calls,
    fetch,
    seedReader,
    buy,
    feedback: () => tables.unlock_feedback![0]!,
    report: () => tables.personal_report!.find((r) => r.id === READER.personalReportId)!,
    grants: () =>
      tables.payment!.filter((p) => field(p, "metadata->>source") === "unlock_feedback"),
  };
}

export type FakeDb = ReturnType<typeof createFakeDb>;
