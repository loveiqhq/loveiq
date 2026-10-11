import { readAll } from "@features/brain/server/read-all";

/**
 * SALES SPLIT BY WHAT WAS BOUGHT AND HOW: plan, price list, device, traffic source, country
 * price tier, landing arm or month, in one call.
 *
 * Asked for four times before this existed, Mark's first session included, and failed each
 * time: a payment's plan, price list, device and source live in its `metadata`, which
 * query_product_data cannot select, and `payment` has no `plan` or `created_at` column.
 *
 * A sale is the recorded definition (decision:2026-09-19-3dba3f01ef), counted as the daily
 * numbers count it: succeeded, not a test, above EUR 0, on the UTC day it was paid, net of
 * refunds. A EUR 0 unlock is a comp, shown beside the sales and never in them. No group is
 * hidden: these are what was sold, not who bought, which is user_totals' job and its floor.
 */
export const SALE_GROUPS = [
  "plan",
  "price_list",
  "device",
  "source",
  "country_tier",
  "landing",
  "month",
] as const;
export type SaleGroup = (typeof SALE_GROUPS)[number];

export interface Sale {
  /** The UTC day it was paid. */
  day: string;
  /** What was charged: EUR 0 is a comp. */
  charged: number;
  /** What we kept, net of refunds. */
  net: number;
  currency: string;
  groups: Record<Exclude<SaleGroup, "month">, string | null>;
}

interface Row {
  amount: string | number | null;
  refund_amount: string | number | null;
  currency: string | null;
  payment_date_time: string | null;
  created_date_time: string;
  plan: string | null;
  price_list: string | null;
  device: string | null;
  source: string | null;
  country_tier: string | null;
  landing: string | null;
}

/** Every real succeeded payment, comps included. Null when the read fails. */
export async function loadSales(): Promise<Sale[] | null> {
  const rows = await readAll<Row>(
    // The filters first, in one literal, where payment-test-exclusion.test.ts reads them.
    "/rest/v1/payment?is_test=is.false&status=eq.succeeded&order=id.asc" +
      "&select=amount,refund_amount,currency,payment_date_time,created_date_time," +
      "plan:metadata->>plan,price_list:metadata->>experimentGroup,device:metadata->>deviceType," +
      "source:metadata->>trafficSource,country_tier:metadata->>countryTier," +
      "landing:metadata->>landingVariant"
  );
  return (
    rows?.map((r) => ({
      day: (r.payment_date_time ?? r.created_date_time).slice(0, 10),
      charged: Number(r.amount ?? 0),
      // In cents, so 19.99 less a 5.00 refund is 14.99 and not 14.989999999999998.
      net: Math.round((Number(r.amount ?? 0) - Number(r.refund_amount ?? 0)) * 100) / 100,
      currency: (r.currency ?? "EUR").toUpperCase(),
      groups: {
        plan: r.plan,
        price_list: r.price_list,
        device: r.device,
        source: r.source,
        country_tier: r.country_tier,
        landing: r.landing,
      },
    })) ?? null
  );
}

const eur = (n: number) => `EUR ${n.toFixed(2)}`;
const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function renderSales(sales: Sale[], by: SaleGroup[], since: string, until: string): string {
  const label = (s: Sale, g: SaleGroup) =>
    g === "month" ? s.day.slice(0, 7) : (s.groups[g] ?? "not recorded");
  const groups = new Map<
    string,
    { sales: number; revenue: number; comps: number; other: number }
  >();
  for (const s of sales) {
    if (s.day < since || s.day > until) continue;
    const key = by.map((g) => label(s, g)).join(" · ");
    const t = groups.get(key) ?? { sales: 0, revenue: 0, comps: 0, other: 0 };
    if (s.charged <= 0) t.comps += 1;
    else {
      t.sales += 1;
      // Counted as a sale, kept out of the EUR total: there is no rate to convert at.
      if (s.currency === "EUR") t.revenue += s.net;
      else t.other += 1;
    }
    groups.set(key, t);
  }
  const all = [...groups.values()];
  const total = (k: "sales" | "revenue" | "comps" | "other") => all.reduce((n, t) => n + t[k], 0);
  const head =
    `Sales by ${by.join(" and ").replace(/_/g, " ")}, ${since} to ${until} (UTC days, by the day ` +
    `paid): ${count(total("sales"), "sale")}, ${eur(total("revenue"))}` +
    (total("comps") ? `, and ${count(total("comps"), "EUR 0 comp")}` : "") +
    ".\nA sale is a succeeded, non-test payment above EUR 0, net of refunds; a comp is a " +
    "EUR 0 unlock, never counted as a sale. Price lists A and B are the 2.x price test, " +
    "A3 and B3 Pricing 3.0.";
  if (!all.length) return `${head}\nNo sales or comps in that period.`;
  const lines = [...groups.entries()]
    .sort(([, a], [, b]) => b.revenue - a.revenue || b.sales - a.sales || b.comps - a.comps)
    .map(
      ([key, t]) =>
        `- ${key}: ${count(t.sales, "sale")}, ${eur(t.revenue)}` +
        (t.sales > t.other ? ` (average ${eur(t.revenue / (t.sales - t.other))})` : "") +
        (t.other ? `, ${t.other} in another currency, not in the total` : "") +
        (t.comps ? `; ${count(t.comps, "comp")}` : "")
    );
  return [head, ...lines].join("\n");
}
