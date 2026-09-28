/**
 * The month -> column mapping is the one piece of this cron that can do damage
 * quietly. Every other failure is loud: a bad token throws, a missing folder is
 * created, an unparsed total is skipped and reported. But an off-by-one column
 * writes a real invoice into the wrong month, the row still looks plausible, and
 * the =SUM at the top still adds up — so nobody notices until a runway
 * conversation is built on it.
 *
 * These assert the anchors on a row 1 shaped like the real sheet's: column I is November
 * 2025, and column S is September 2026 (the month the 2026-09-19 audit corrected by hand).
 * The column is found in row 1's run of monthly date serials, so an inserted column moves
 * it with them, and nothing outside that run is ever written.
 */

import { describe, it, expect } from "vitest";
import {
  colLetter,
  columnForMonth,
  driveQuoteEscape,
  monthFullyCovered,
  LOOKBACK_DAYS,
  amountFrom,
  betterCharge,
  rateOn,
  toEur,
} from "@/app/api/cron/file-invoices/route";
import { monthColumns } from "@features/brain/server/cost-sheet";

// Row 1 as the real Costs tab has it: a label, blanks, then one date serial per month,
// November 2025 (column I) to February 2027 (column X).
const serial = (y: number, m: number) =>
  (Date.UTC(y, m - 1, 1) - Date.UTC(1899, 11, 30)) / 86_400_000;
const MONTHS = Array.from({ length: 16 }, (_, i) =>
  serial(2025 + Math.floor((10 + i) / 12), ((10 + i) % 12) + 1)
);
const HEADER = ["Costs in €", "", "", "", "", "", "", "", ...MONTHS];
const col = (y: number, m: number, header: unknown[] = HEADER) => {
  const i = columnForMonth(header, y, m);
  return i === null ? null : colLetter(i);
};

describe("colLetter", () => {
  it("maps 0-based indexes onto spreadsheet letters", () => {
    expect(colLetter(0)).toBe("A");
    expect(colLetter(8)).toBe("I");
    expect(colLetter(23)).toBe("X");
  });

  it("carries past Z, which a 26-column assumption would get wrong", () => {
    expect(colLetter(25)).toBe("Z");
    expect(colLetter(26)).toBe("AA");
    expect(colLetter(51)).toBe("AZ");
  });
});

describe("columnForMonth", () => {
  it("anchors November 2025 to column I", () => {
    expect(col(2025, 11)).toBe("I");
  });

  it("puts September 2026 in column S — the month the audit corrected by hand", () => {
    expect(col(2026, 9)).toBe("S");
  });

  it("crosses the year boundary without drifting", () => {
    expect(col(2025, 12)).toBe("J");
    expect(col(2026, 1)).toBe("K");
    expect(col(2027, 1)).toBe("W");
    expect(col(2027, 2)).toBe("X");
  });

  it("refuses a month before the sheet starts rather than wrapping to column H", () => {
    expect(col(2025, 10)).toBeNull();
    expect(col(2024, 11)).toBeNull();
  });

  it("refuses a month past the last column rather than inventing one", () => {
    // The sheet has no March 2027. Writing there would silently extend the model
    // past where anyone has forecast, outside the =SUM range shown in the header.
    expect(col(2027, 3)).toBeNull();
  });

  it("follows the months when a column is inserted before them", () => {
    // A fixed "column I is November 2025" wrote September into August's column here.
    expect(col(2026, 9, ["Costs in €", "Notes", ...HEADER.slice(1)])).toBe("T");
  });

  it("is not fooled by an 'as of' date, or any other number, left of the months", () => {
    // 19 September 2026 in C1 matched September first and sent the write to column C.
    const asOf = ["Costs in €", "", serial(2026, 9) + 18, 1e9, ...HEADER.slice(4)];
    expect(col(2026, 9, asOf)).toBe("S");
    // Right beside November 2025 it does not join the months either: it is not the month before.
    expect(col(2026, 9, [...HEADER.slice(0, 7), serial(2026, 9) + 18, ...MONTHS])).toBe("S");
  });

  it("ends the months where row 1 stops going up one month at a time", () => {
    // A "Total 2026" column after December: the carry-forward must stop before it.
    const withTotal = [...HEADER.slice(0, 22), "Total 2026", ...HEADER.slice(22)];
    expect(monthColumns(withTotal)).toEqual({ first: 8, last: 21 });
    expect(col(2027, 1, withTotal)).toBeNull();
    expect(monthColumns(HEADER)).toEqual({ first: 8, last: 23 });
    // Two runs of the same length: the older, leftmost one, every time.
    const twoRuns = ["Costs in €", ...MONTHS.slice(0, 3), "gap", ...MONTHS.slice(5, 8)];
    expect(monthColumns(twoRuns)).toEqual({ first: 1, last: 3 });
    expect(monthColumns(["Costs in €", "note"])).toBeNull();
  });
});

describe("monthFullyCovered", () => {
  // The scenario that made this necessary: the cron runs on 3 October with a
  // 45-day lookback, so the window opens on 19 August. August is half-invisible.
  const runOn3Oct = Date.UTC(2026, 9, 3);
  const windowStart = runOn3Oct - 45 * 86_400_000;

  it("accepts September, every day of which is inside the window", () => {
    expect(monthFullyCovered(2026, 9, windowStart)).toBe(true);
  });

  it("REFUSES August, because invoices from the 1st to the 18th are invisible", () => {
    // Summing only the visible part and writing it would replace a correct
    // August total with a smaller one, then carry that error forward.
    expect(monthFullyCovered(2026, 8, windowStart)).toBe(false);
  });

  it("refuses anything older still", () => {
    expect(monthFullyCovered(2026, 7, windowStart)).toBe(false);
    expect(monthFullyCovered(2025, 12, windowStart)).toBe(false);
  });

  it("accepts a month starting EXACTLY on the window boundary", () => {
    // >= not >. A month whose first instant is the window's first instant is
    // wholly visible; treating it as partial would skip a month forever whenever
    // the run lands on that boundary.
    expect(monthFullyCovered(2026, 9, Date.UTC(2026, 8, 1))).toBe(true);
    expect(monthFullyCovered(2026, 9, Date.UTC(2026, 8, 1) + 1)).toBe(false);
  });

  it("accepts the month the run happens in", () => {
    expect(monthFullyCovered(2026, 10, windowStart)).toBe(true);
  });

  it("never covers two closed months, so a carried write reaches only the month in progress", () => {
    // Two did, and an earlier month's carry-forward would overwrite a later closed month
    // that the run left for a person to enter by hand.
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2029, 0, 1); t += 86_400_000) {
      const now = new Date(t);
      const start = t - LOOKBACK_DAYS * 86_400_000;
      const closed = [1, 2].filter((back) => {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
        return monthFullyCovered(d.getUTCFullYear(), d.getUTCMonth() + 1, start);
      });
      expect(closed.length, now.toISOString().slice(0, 10)).toBeLessThanOrEqual(1);
    }
  });
});

describe("driveQuoteEscape", () => {
  it("leaves an ordinary invoice name alone", () => {
    expect(driveQuoteEscape("Invoice-MKWVRQXU-0010.pdf")).toBe("Invoice-MKWVRQXU-0010.pdf");
  });

  it("escapes an apostrophe, which would otherwise end the Drive query literal", () => {
    expect(driveQuoteEscape("Eman's invoice.pdf")).toBe("Eman\\'s invoice.pdf");
  });

  it("escapes backslashes BEFORE quotes, or the escape character escapes itself", () => {
    expect(driveQuoteEscape("a\\b.pdf")).toBe("a\\\\b.pdf");
    expect(driveQuoteEscape("a\\'b.pdf")).toBe("a\\\\\\'b.pdf");
  });
});

/**
 * Every case here is a verbatim fragment of a real invoice that broke an earlier
 * version. A live dry run found each of them; none was reachable from a unit test
 * written in advance, which is why they are pinned here now.
 */
/** A one-page PDF whose only text is `line`, with a correct cross-reference table. */
function pdfWith(line: string): Buffer {
  const content = `BT /F1 18 Tf 20 60 Td (${line}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 144] /Contents 4 0 R " +
      "/Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = objects.map((body, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

describe("amountFrom", () => {
  const read = (text: string) => amountFrom(null, text);

  it("reads the total from the PDF itself, handed over as the Buffer the route holds", async () => {
    // pdf.js refuses a Buffer, and the fallback to the email body hid it: every PDF failed
    // from the first run, and vendors whose total is only in the PDF were never written.
    await expect(amountFrom(pdfWith("Total EUR 58.31"), "")).resolves.toEqual({
      value: 58.31,
      currency: "EUR",
    });
  });

  it("takes the gross total, not the net or a line item", async () => {
    // Anthropic, invoice MKWVRQXU-0010, August 2026.
    await expect(
      read(
        "Subtotal EUR378.81\nTotal excluding tax EUR378.81\nVAT EUR71.97\nTotal EUR450.78\nAmount paid EUR450.78"
      )
    ).resolves.toEqual({ value: 450.78, currency: "EUR" });
  });

  it("survives the NUL bytes PDF extraction embeds inside the currency code", async () => {
    // VERBATIM from Contentsquare invoice MT-INV00945830, as unpdf returns it.
    // A hand-typed version of this string passes with or without the fix, which
    // is exactly why the first attempt at this test proved nothing.
    await expect(amountFrom(null, "Total cost \u20ac\u0000EUR\u0000 58.31")).resolves.toEqual({
      value: 58.31,
      currency: "EUR",
    });
  });

  it("tolerates a space after the symbol AND two before the number", async () => {
    // Contentsquare prints "Total cost € EUR  58.31". An `\s?` here allowed one
    // space, so a euro invoice was classed currency-less and never written.
    await expect(read("Total cost \u20ac EUR  58.31")).resolves.toEqual({
      value: 58.31,
      currency: "EUR",
    });
  });

  it("refuses a VAT-EXCLUSIVE euro figure and falls back to the gross dollar one", async () => {
    // Atlassian states EUR 46.64 net and never prints the EUR gross (55.50).
    // Preferring the euro number would book the charge 16% light, every month,
    // and look entirely plausible doing it.
    await expect(
      read(
        "Invoice Total: USD 64.62\nThe VAT exclusive total on this invoice is \u20ac 46.64 (EUR)."
      )
    ).resolves.toEqual({ value: 64.62, currency: "USD" });
  });

  it("reports dollars as dollars rather than passing them off as euros", async () => {
    // The Costs tab is in euros. Writing 20.00 for a USD 20 charge is not a
    // rounding error, it is the wrong number.
    await expect(read("Total $20.00")).resolves.toEqual({ value: 20, currency: "USD" });
  });

  it("marks an unmarked total OTHER instead of assuming euros", async () => {
    await expect(read("Total 41.25")).resolves.toEqual({ value: 41.25, currency: "OTHER" });
  });

  it("never lets a zero line hide a real total", async () => {
    // Round-10 audit: once zero counted, the euro pass returned "Total VAT €0.00" before the
    // dollar pass ran, and the USD 20 charge was neither written nor flagged.
    await expect(read("Total $20.00 USD\nTotal VAT €0.00")).resolves.toEqual({
      value: 20,
      currency: "USD",
    });
    await expect(read("Amount due €0.00\nTotal 44.44")).resolves.toEqual({
      value: 44.44,
      currency: "OTHER",
    });
    // A bill that really is zero still says so.
    await expect(read("Total €0.00 EUR")).resolves.toEqual({ value: 0, currency: "EUR" });
  });

  it("returns null when there is no total at all", async () => {
    await expect(read("Thanks for your business!")).resolves.toBeNull();
  });
});

describe("betterCharge", () => {
  const eur = (v: number) => ({ value: v, currency: "EUR" }) as const;
  const usd = (v: number) => ({ value: v, currency: "USD" }) as const;

  it("takes the first reading when there is nothing to compare", () => {
    expect(betterCharge(usd(20), null)).toBe(true);
  });

  it("prefers a SMALLER euro figure over a larger dollar one", () => {
    // One email carries the invoice and the receipt for a single charge. Comparing
    // on value alone would discard the only figure we can write into a euro column.
    expect(betterCharge(eur(58.31), usd(64.62))).toBe(true);
    expect(betterCharge(usd(64.62), eur(58.31))).toBe(false);
  });

  it("falls back to the larger value when both are the same currency", () => {
    expect(betterCharge(eur(450.78), eur(378.81))).toBe(true);
    expect(betterCharge(eur(378.81), eur(450.78))).toBe(false);
  });
});

/**
 * Real ECB euro reference rates (USD per EUR). The gaps are real too: the ECB
 * publishes on business days only, and 2026-06-22 is the oldest day the 90-day
 * feed carries.
 */
const RATES = new Map<string, number>([
  ["2026-06-22", 1.1456],
  ["2026-08-20", 1.1681],
  ["2026-08-28", 1.1643], // Friday
  ["2026-08-31", 1.1596], // the following Monday — deliberately DIFFERENT
  ["2026-09-02", 1.1578],
  ["2026-09-04", 1.1622],
]);

describe("rateOn", () => {
  it("uses the rate published on the invoice date", () => {
    expect(rateOn(RATES, "2026-09-04")).toBe(1.1622);
  });

  it("walks BACK over a weekend, not forward", () => {
    // 29 August 2026 was a SATURDAY, and Figma bills on the 29th — so this is a
    // real invoice date with no rate of its own. Friday was 1.1643 and Monday
    // 1.1596, so the direction changes the answer: walking forward would convert
    // a Saturday charge at a rate that did not exist when it was made.
    expect(rateOn(RATES, "2026-08-29")).toBe(1.1643);
    expect(rateOn(RATES, "2026-08-30")).toBe(1.1643);
  });

  it("gives up rather than reaching back indefinitely for a stale rate", () => {
    // 2026-06-22 IS in the map, thirteen days earlier. An unbounded walk would
    // find it and convert a July charge at a June rate; the bound refuses.
    expect(rateOn(RATES, "2026-07-05")).toBeNull();
  });

  it("returns null for a date it cannot parse", () => {
    expect(rateOn(RATES, "not-a-date")).toBeNull();
  });
});

describe("toEur", () => {
  it("converts dollars at the rate on the invoice's OWN date", () => {
    // Vercel, USD 20.00 on 4 Sep 2026.
    expect(toEur({ value: 20, currency: "USD" }, RATES, "2026-09-04")).toEqual({
      value: 17.21,
      currency: "EUR",
    });
    // GitHub, USD 16.00 on 20 Aug — a different rate, so a different euro figure.
    // Converting both at one current rate would silently restate history.
    expect(toEur({ value: 16, currency: "USD" }, RATES, "2026-08-20")).toEqual({
      value: 13.7,
      currency: "EUR",
    });
  });

  it("leaves a euro charge untouched rather than round-tripping it", () => {
    const eur = { value: 450.78, currency: "EUR" } as const;
    expect(toEur(eur, RATES, "2026-09-04")).toEqual(eur);
  });

  it("refuses to convert an unmarked total instead of assuming dollars", () => {
    expect(toEur({ value: 41.25, currency: "OTHER" }, RATES, "2026-09-04")).toBeNull();
  });

  it("refuses when no rate covers the date", () => {
    expect(toEur({ value: 20, currency: "USD" }, RATES, "2026-07-01")).toBeNull();
  });
});
