import {
  COST_SHEET_ID,
  COST_SHEET_READ_URL,
  NEVER_ATTACHES,
  TOOL_CATEGORIES,
} from "@features/brain/server/cost-sheet";
import { supabaseFetch } from "@features/admin/server/supabase";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { getDelegatedToken } from "@shared/http/google-oauth";

/**
 * WHAT WE PAY FOR TOOLS AND SERVICES, month by month, read live from the Business Case
 * cost sheet that the monthly invoice filing keeps current (plan item G17).
 *
 * People's pay is left out. The Costs tab lists each person's monthly fee beside the
 * tools, and a spend question does not need to read anyone's pay.
 *
 * A month counts as settled once the filing that covers it has run, at 06:40 UTC on the
 * 3rd for the month before. Until then its column is a mix of the invoices filed so far
 * and each other vendor's last figure carried forward, and the answer says so.
 *
 * Three vendors never send a PDF, so their lines are typed in by hand, and a line nobody
 * typed simply keeps last month's figure: on 2026-09-27 Adwords showed July's EUR 1,129.00
 * for August too, where GA4 recorded EUR 1,252.99. So a hand-kept line that has not moved
 * is called out, and Google Ads is set beside what GA4 recorded.
 */

/** The sheet's people categories today, so only a category that is neither is called unknown. */
export const PEOPLE_CATEGORY = /FTE|freelance|intern|employee|salary|contractor/i;
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export interface CostLine {
  name: string;
  category: string;
  /** Month (YYYY-MM) to EUR spent, positive; null where the sheet says N/A. */
  months: Map<string, number | null>;
}

/** The month a Costs-tab date serial stands for (a spreadsheet day count from 1899-12-30). */
export function serialMonth(serial: number): string {
  return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 7);
}

export function parseCosts(rows: unknown[][]): { months: string[]; lines: CostLine[] } {
  const months: string[] = [];
  const monthCols: number[] = [];
  (rows[0] ?? []).forEach((v, i) => {
    if (typeof v === "number" && v > 40_000 && v < 80_000) {
      months.push(serialMonth(v));
      monthCols.push(i);
    }
  });
  const header = rows.findIndex((r) => String(r?.[0] ?? "").trim() === "Name");
  const lines: CostLine[] = [];
  for (const r of header < 0 ? [] : rows.slice(header + 1)) {
    const name = String(r?.[0] ?? "").trim();
    if (!name) continue;
    const byMonth = new Map<string, number | null>();
    monthCols.forEach((col, k) => {
      const v = r?.[col];
      // Costs are negative in the sheet; a positive figure is a credit.
      // `0 - v`, not `-v`: a zero in the sheet came out as -0 and printed "EUR -0.00".
      byMonth.set(months[k]!, typeof v === "number" ? 0 - v : null);
    });
    lines.push({ name, category: String(r?.[2] ?? "").trim(), months: byMonth });
  }
  return { months, lines };
}

/** The latest month the filing has settled. It runs at 06:40 UTC on the 3rd (vercel.json). */
export function lastBilledMonth(now: Date): string {
  const ran = now.getTime() >= Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 3, 7);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (ran ? 1 : 2), 1))
    .toISOString()
    .slice(0, 7);
}

const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};
const label = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
const eur = (v: number) =>
  `EUR ${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Google Ads spend GA4 recorded for a month, to set beside the sheet's hand-typed line. */
export interface AdsCheck {
  eur: number;
  /** Days of the month GA4's ad data covers, of `days`. */
  covered: number;
  days: number;
}

/** Sum GA4's daily ad cost over one month, counting the days its data covers. */
export function adsForMonth(
  ad: { byDay: Map<string, number>; from: string | null; to: string | null },
  month: string
): AdsCheck {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let eurSum = 0;
  let covered = 0;
  for (let d = 1; d <= days; d += 1) {
    const day = `${month}-${String(d).padStart(2, "0")}`;
    if (ad.from === null || ad.to === null || day < ad.from || day > ad.to) continue;
    covered += 1;
    eurSum += ad.byDay.get(day) ?? 0;
  }
  return { eur: eurSum, covered, days };
}

/** The sheet's name for the Google Ads line, the one GA4 can check. */
const ADS_LINE = "Adwords";

export function renderCostWatch(
  parsed: { months: string[]; lines: CostLine[] },
  now: Date,
  ads?: AdsCheck,
  /**
   * Whether a successful filing run settled the month (see filingSettled): left out to
   * skip the check. The month is named by the calendar; this says when no run settled it.
   */
  settledByFiling?: boolean | "unreadable"
): string {
  const tools = parsed.lines.filter((l) => TOOL_CATEGORIES.includes(l.category));
  const unknown = [
    ...new Set(
      parsed.lines
        .filter((l) => !TOOL_CATEGORIES.includes(l.category) && !PEOPLE_CATEGORY.test(l.category))
        .map((l) => l.category || "(none)")
    ),
  ];
  const billed = lastBilledMonth(now);
  const prev = shiftMonth(billed, -1);
  if (!parsed.months.includes(billed)) {
    return `The cost sheet has no column for ${label(billed)}, so there is nothing to compare yet.`;
  }
  const amount = (l: CostLine, month: string) => l.months.get(month) ?? null;
  const total = (month: string) => tools.reduce((s, l) => s + (amount(l, month) ?? 0), 0);

  const latest = total(billed);
  const before = total(prev);
  const change = before
    ? ` (${latest >= before ? "+" : ""}${(((latest - before) / before) * 100).toFixed(1)}%)`
    : "";
  const out = [
    `Tools and services, EUR a month, from the Business Case cost sheet. People's pay is left out.`,
    "",
    `${label(billed)}, the latest month the invoice filing has settled: ${eur(latest)}, against ${eur(before)} in ${label(prev)}${change}.`,
    ...filingCaveat(billed, settledByFiling),
    "",
    "Biggest:",
    ...tools
      .filter((l) => (amount(l, billed) ?? 0) > 0)
      .sort((a, b) => (amount(b, billed) ?? 0) - (amount(a, billed) ?? 0))
      .slice(0, 8)
      .map((l) => `- ${l.name} (${l.category}) ${eur(amount(l, billed)!)}`),
  ];

  const moved = tools
    .filter((l) => {
      const a = amount(l, prev);
      const b = amount(l, billed);
      return a && b && Math.abs(b - a) >= Math.max(5, a * 0.1);
    })
    .sort(
      (x, y) =>
        Math.abs(amount(y, billed)! - amount(y, prev)!) -
        Math.abs(amount(x, billed)! - amount(x, prev)!)
    );
  if (moved.length) {
    out.push(
      "",
      `Moved since ${label(prev)}:`,
      ...moved.map((l) => {
        const a = amount(l, prev)!;
        const b = amount(l, billed)!;
        return `- ${l.name} ${eur(a)} → ${eur(b)} (${b > a ? "+" : "-"}${eur(Math.abs(b - a))})`;
      })
    );
  }
  const started = tools.filter((l) => !amount(l, prev) && (amount(l, billed) ?? 0) > 0);
  if (started.length) {
    out.push(
      `New in ${label(billed)}: ${started.map((l) => `${l.name} ${eur(amount(l, billed)!)}`).join(", ")}.`
    );
  }
  const stopped = tools.filter((l) => (amount(l, prev) ?? 0) > 0 && !amount(l, billed));
  if (stopped.length) {
    out.push(`Stopped in ${label(billed)}: ${stopped.map((l) => l.name).join(", ")}.`);
  }

  const trend = parsed.months.filter((m) => m <= billed);
  out.push("", `Trend: ${trend.map((m) => `${label(m)} ${eur(total(m))}`).join(" · ")}.`);

  const open = shiftMonth(billed, 1);
  if (parsed.months.includes(open)) {
    out.push(
      "",
      `${label(open)} is not settled yet: ${eur(total(open))} on the sheet so far, the invoices ` +
        `filed to date plus each other vendor's last figure. The filing on 3 ${label(shiftMonth(open, 1))} settles it.`
    );
  }

  const byHand = tools.filter((l) => NEVER_ATTACHES.some((v) => v.sheetName === l.name));
  if (byHand.length) {
    out.push(
      "",
      `Typed in by hand, since no invoice PDF reaches our mailboxes: ${byHand.map((l) => l.name).join(", ")}.`
    );
    for (const l of byHand) {
      const figure = amount(l, billed);
      const unchanged = figure !== null && figure === amount(l, prev);
      const ga4 = l.name === ADS_LINE && ads && ads.covered > 0;
      if (!unchanged && !ga4) continue;
      out.push(
        `- ${l.name}: ${figure === null ? "no figure" : eur(figure)} for ${label(billed)}.` +
          (unchanged
            ? ` The same as ${label(prev)}, so ${label(billed)} may never have been entered.`
            : "") +
          (ga4
            ? ` GA4 recorded ${eur(ads.eur)} of Google Ads spend that month` +
              (ads.covered < ads.days
                ? `, over the ${ads.covered} of ${ads.days} days its data covers.`
                : ".")
            : "")
      );
    }
  }
  if (unknown.length) {
    out.push(
      "",
      `Left out, in a category this does not know: ${unknown.join(", ")}. If it is not anyone's ` +
        `pay, add it to TOOL_CATEGORIES in features/brain/server/cost-sheet.ts.`
    );
  }
  out.push("", `Sheet: https://docs.google.com/spreadsheets/d/${COST_SHEET_ID}/edit`);
  return out.join("\n");
}

/**
 * The window in which a filing run can settle `month`: from the scheduled run (06:40 UTC on
 * the 3rd of the month after) until the month's first day falls out of the filing's 45-day
 * look-back. A run outside it (a re-run on the 20th) files the month but cannot reconcile it.
 */
export function settleWindow(month: string): { from: Date; to: Date } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return {
    from: new Date(Date.UTC(y, m, 3, 6, 40)),
    to: new Date(Date.UTC(y, m - 1, 1) + 45 * 86_400_000),
  };
}

/** A warning when no successful filing run could have settled `billed`. */
function filingCaveat(billed: string, settled: boolean | "unreadable" | undefined): string[] {
  if (settled === undefined || settled === true) return [];
  if (settled === "unreadable") {
    return [
      "The invoice filing's runs could not be read, so whether it settled the month is not checked.",
    ];
  }
  const w = settleWindow(billed);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  return [
    `No run of the invoice filing settled ${label(billed)} (only a successful run between ` +
      `${day(w.from)} and ${day(w.to)} can), so its figures are only as good as the sheet's ` +
      `last hand edit.`,
  ];
}

/** Whether a successful filing run settled `month`; "unreadable" when that cannot be read. */
export async function filingSettled(month: string): Promise<boolean | "unreadable"> {
  const w = settleWindow(month);
  let res: Response | null | undefined;
  try {
    res = await supabaseFetch(
      "/rest/v1/cron_run?select=started_at&cron_name=eq.file-invoices&status=eq.success" +
        `&started_at=gte.${w.from.toISOString()}&started_at=lte.${w.to.toISOString()}&limit=1`
    );
  } catch {
    res = null;
  }
  if (!res?.ok) return "unreadable";
  const rows = (await res.json().catch(() => null)) as unknown[] | null;
  return Array.isArray(rows) ? rows.length > 0 : "unreadable";
}

/** The Costs tab, as the filing reads it. Throws when it cannot be read. */
export async function loadCostSheet(oidcToken?: string | null): Promise<unknown[][]> {
  const token = await getDelegatedToken("ec@loveiq.org", SHEETS_SCOPE, Date.now(), oidcToken);
  if (!token) throw new Error("no Google token for the cost sheet");
  const res = await fetchWithTimeout(COST_SHEET_READ_URL, {
    headers: { Authorization: `Bearer ${token}` },
    timeoutMs: 10_000,
  });
  if (!res.ok) throw new Error(`the cost sheet could not be read (${res.status})`);
  return ((await res.json()) as { values?: unknown[][] }).values ?? [];
}
