/**
 * The filing as a whole run: a walk that cannot read every mailbox must not record
 * "success". Both an unreachable mailbox and running out of time used to, in silence, and
 * cost_watch trusts a successful run to have settled a month.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
// Drive and Sheets always work; a Gmail mailbox answers only when `gmailOpen` says so.
let gmailOpen: (mailbox: string) => boolean = () => false;
vi.mock("@shared/http/google-oauth", async (importOriginal) => {
  const real = await importOriginal<typeof import("@shared/http/google-oauth")>();
  return {
    ...real,
    getDelegatedToken: vi.fn(async (subject: string, scope: string) =>
      scope !== real.GMAIL_SCOPE ? "token" : gmailOpen(subject) ? `gmail:${subject}` : null
    ),
  };
});

// Row 1 as the real Costs tab has it (date serials from November 2025, column I, to
// February 2027, column X) and one vendor row holding -5 in every month.
const serial = (y: number, m: number) =>
  (Date.UTC(y, m - 1, 1) - Date.UTC(1899, 11, 30)) / 86_400_000;
const MONTHS = Array.from({ length: 16 }, (_, i) =>
  serial(2025 + Math.floor((10 + i) / 12), ((10 + i) % 12) + 1)
);
const HEADER = ["Costs in €", "", "", "", "", "", "", "", ...MONTHS];
const vercelRow = (header: unknown[]) =>
  header.map((c, i) => (i === 0 ? "Vercel" : i < 8 ? "" : -5));
let sheet: unknown[][] = [];

/** mailbox -> the ids its invoice search lists; "p2" pages the listing once. */
let inbox: Record<string, string[]> = {};
let paged = false;
/** What the one invoice email says; its PDF does not parse, so this is read instead. */
let invoiceText = "Total $11.70 USD";
/** A mailbox whose copy arrived relayed through a group, under another sender line. */
let relayedIn = "";
let ecbDown = false;
/** More Vercel invoices by message id, each with its own day, text and Message-ID. */
let more: Record<string, { day: number; text: string; subject?: string }> = {};
const invoiceOn = (id: string, day: number, text: string, subject = "Your receipt") => ({
  internalDate: String(day),
  payload: {
    headers: [
      { name: "From", value: "Vercel Inc. <invoice@vercel.com>" },
      { name: "Subject", value: subject },
      { name: "Message-Id", value: `<${id}@vercel.com>` },
    ],
    parts: [
      { filename: `${id}.pdf`, body: { attachmentId: "a1" } },
      { mimeType: "text/plain", body: { data: Buffer.from(text).toString("base64url") } },
    ],
  },
});
const invoice = (mailbox: string) => ({
  // Sunday 20 September 2026, so conversion walks back to Friday's rate.
  internalDate: String(Date.UTC(2026, 8, 20, 12)),
  payload: {
    headers: [
      {
        name: "From",
        value:
          mailbox === relayedIn
            ? "'Vercel Inc.' via Billing <billing@loveiq.org>"
            : "Vercel Inc. <invoice@vercel.com>",
      },
      { name: "Subject", value: "Your receipt" },
      { name: "Message-Id", value: "<receipt-1@vercel.com>" },
    ],
    parts: [
      { filename: "receipt.pdf", body: { attachmentId: "a1" } },
      { mimeType: "text/plain", body: { data: Buffer.from(invoiceText).toString("base64url") } },
    ],
  },
});
const ECB = `<Cube><Cube time='2026-09-18'><Cube currency='USD' rate='1.1700'/></Cube></Cube>`;

/** What the Google Ads API answers for the month's spend; null is the API down. */
let adsAnswer: unknown = null;
const spendOf = (micros: string, currencyCode = "EUR") => ({
  results: [{ customer: { currencyCode }, metrics: { costMicros: micros } }],
});
/** The Adwords line: August (column R) and September (S) onward as given. */
const adwordsRow = (aug: number, sep: number) =>
  HEADER.map((c, i) => (i === 0 ? "Adwords" : i < 8 ? "" : i < 17 ? -1000 : i === 17 ? aug : sep));
const fetched: string[] = [];
const sheetWrites: Array<{ data: Array<{ range: string; values: number[][] }> }> = [];
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    fetched.push(u);
    const ok = (body: unknown, text = "") => ({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => text,
    });
    if (u.includes("googleads.googleapis.com")) {
      if (adsAnswer === null)
        return { ok: false, status: 503, json: async () => ({}), text: async () => "down" };
      return ok(adsAnswer);
    }
    if (u.includes(":batchUpdate")) {
      sheetWrites.push(JSON.parse(String(init?.body)));
      return ok({});
    }
    if (u.includes("sheets.googleapis.com")) return ok({ values: sheet });
    if (u.includes("ecb.europa.eu")) {
      if (ecbDown) return { ok: false, status: 503, json: async () => ({}), text: async () => "" };
      return ok({}, ECB);
    }
    const mailbox = String((init?.headers as Record<string, string>)?.Authorization ?? "").replace(
      "Bearer gmail:",
      ""
    );
    if (u.includes("/attachments/"))
      return ok({ data: Buffer.from("not a pdf").toString("base64url") });
    if (u.includes("format=full")) {
      const id = /messages\/([^/?]+)\?/.exec(u)?.[1] ?? "";
      const spec = more[id];
      return ok(spec ? invoiceOn(id, spec.day, spec.text, spec.subject) : invoice(mailbox));
    }
    if (u.includes("gmail.googleapis.com")) {
      const ids = inbox[mailbox] ?? [];
      if (paged && !u.includes("pageToken=p2")) return ok({ messages: [], nextPageToken: "p2" });
      return ok({ messages: ids.map((id) => ({ id })) });
    }
    // Every folder exists and every PDF is already filed, so nothing is uploaded.
    if (u.includes("www.googleapis.com/drive/v3/files?q=")) return ok({ files: [{ id: "f" }] });
    return { ok: false, status: 503, json: async () => ({}), text: async () => "down" };
  }),
}));
const mockNotify = vi.fn();
vi.mock("@shared/observability/slack", () => ({
  notifySlack: (...a: unknown[]) => mockNotify(...a),
  escapeSlack: (s: string) => s,
}));
vi.mock("@shared/http/is-prod-cron-host", () => ({ isProdCronHost: () => true }));
const mockRecord = vi.fn();
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  recordCronRun: (...a: unknown[]) => mockRecord(...a),
  startCronTimer: () => async () => undefined,
}));

import { GET, shouldWriteSheet } from "@/app/api/cron/file-invoices/route";

const run = () =>
  GET(
    new Request("https://www.loveiq.org/api/cron/file-invoices", {
      headers: { authorization: "Bearer s" },
    })
  );
const slackText = () => String((mockNotify.mock.calls.at(-1)?.[0] as { text: string }).text);

beforeEach(() => {
  vi.clearAllMocks();
  fetched.length = 0;
  sheetWrites.length = 0;
  inbox = {};
  paged = false;
  invoiceText = "Total $11.70 USD";
  relayedIn = "";
  ecbDown = false;
  more = {};
  adsAnswer = null;
  sheet = [HEADER, vercelRow(HEADER)];
  process.env.CRON_SECRET = "s";
  // The scheduled run on 3 October: September is wholly inside the 45-day window.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T06:40:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("a filing run that could not read every mailbox", () => {
  beforeEach(() => {
    gmailOpen = (m) => m === "teamwork@loveiq.org";
  });

  it("records an error, not success, and says so in #ops", async () => {
    paged = true;
    await run();
    expect(mockRecord).toHaveBeenCalledWith(
      "file-invoices",
      expect.any(Number),
      "error",
      expect.stringContaining("no Gmail access to")
    );
    const text = slackText();
    expect(text).toContain("Incomplete run, so the cost sheet was NOT updated");
    // It saw only part of the mail, so it cannot say the sheet matched.
    expect(text).not.toContain("already matched");
    // Every page of a mailbox's invoice list is read, not just the first hundred.
    expect(
      fetched.some((u) => u.includes("gmail.googleapis.com") && u.includes("pageToken=p2"))
    ).toBe(true);
  });

  it("writes nothing to the sheet, and lists what would have changed", async () => {
    inbox = { "teamwork@loveiq.org": ["m1"] };
    await run();
    expect(sheetWrites).toEqual([]);
    expect(slackText()).toContain("Cost sheet NOT updated, these would have changed");
    expect(slackText()).toContain("Vercel 2026/09: -5.00 → -10.00");
  });

  it("writes reconciled figures only from a complete walk", () => {
    expect(shouldWriteSheet([{}], [])).toBe(true);
    expect(shouldWriteSheet([{}], ["no Gmail access to x@loveiq.org"])).toBe(false);
    expect(shouldWriteSheet([], [])).toBe(false);
  });
});

describe("a complete filing run", () => {
  beforeEach(() => {
    gmailOpen = () => true;
  });

  it("counts an email that reached two mailboxes once, converted at the ECB rate", async () => {
    inbox = { "ec@loveiq.org": ["m1"], "teamwork@loveiq.org": ["m1"] };
    await run();
    expect(mockRecord).toHaveBeenCalledWith(
      "file-invoices",
      expect.any(Number),
      "success",
      undefined
    );
    // USD 11.70 at Friday's 1.17 is EUR 10.00, written from September to the last column.
    expect(sheetWrites).toEqual([
      {
        valueInputOption: "USER_ENTERED",
        data: [{ range: "Costs!S2:X2", values: [[-10, -10, -10, -10, -10, -10]] }],
      },
    ]);
    expect(slackText()).toContain("converted to EUR at the ECB reference rate");
  });

  it("says nothing about converting when every invoice was already in euros", async () => {
    inbox = { "ec@loveiq.org": ["m1"] };
    invoiceText = "Total €10.00 EUR";
    await run();
    expect(sheetWrites).toHaveLength(1);
    expect(slackText()).not.toContain("converted to EUR");
  });

  it("counts the direct copy when a group-relayed copy of it was read first", async () => {
    // The relayed copy's sender line does not name the vendor. Marking it seen before that
    // check made the direct copy a duplicate, and the invoice was never counted.
    inbox = { "ec@loveiq.org": ["m1"], "mb@loveiq.org": ["m1"] };
    relayedIn = "ec@loveiq.org";
    await run();
    expect(sheetWrites[0]?.data).toEqual([
      { range: "Costs!S2:X2", values: [[-10, -10, -10, -10, -10, -10]] },
    ]);
  });

  it("stops the carried figure at the last month, sparing a total column after it", async () => {
    inbox = { "ec@loveiq.org": ["m1"] };
    const withTotal = [...HEADER.slice(0, 22), "Total 2026", ...HEADER.slice(22)];
    sheet = [withTotal, vercelRow(withTotal)];
    await run();
    // September (S) to December 2026 (V); the total in W and the months after it untouched.
    expect(sheetWrites[0]?.data).toEqual([
      { range: "Costs!S2:V2", values: [[-10, -10, -10, -10]] },
    ]);
  });

  it("reports a month the sheet has no column for, and records an error", async () => {
    inbox = { "ec@loveiq.org": ["m1"] };
    const noSeptember = HEADER.map((c, i) => (i === 18 ? "Sep" : c));
    sheet = [noSeptember, vercelRow(noSeptember)];
    await run();
    expect(sheetWrites).toEqual([]);
    expect(slackText()).toContain(
      "No month column in the cost sheet, so nothing written for:* Vercel 2026/09"
    );
    expect(slackText()).not.toContain("already matched");
    expect(mockRecord).toHaveBeenCalledWith(
      "file-invoices",
      expect.any(Number),
      "error",
      "no sheet column for Vercel 2026/09"
    );
  });

  it("leaves a dollar invoice it could not convert to a person, and says so", async () => {
    inbox = { "ec@loveiq.org": ["m1"] };
    ecbDown = true;
    await run();
    expect(sheetWrites).toEqual([]);
    const text = slackText();
    expect(text).toContain("could not be read or converted, enter by hand");
    // As it was charged, not as the "OTHER" that keeps it out of the sheet.
    expect(text).toContain("Vercel 2026/09: USD 11.70 on 2026-09-20, no ECB rate for it");
    expect(text).not.toContain("converted to EUR");
    expect(text).not.toContain("already matched");
    // September is closed, so the run did not settle it and must not say it did.
    expect(mockRecord).toHaveBeenCalledWith(
      "file-invoices",
      expect.any(Number),
      "error",
      "not written, needs a person: Vercel 2026/09"
    );
  });

  it("never drops an invoice whose total it cannot read", async () => {
    // Dropped, September was written as -450.78, the readable invoice alone.
    inbox = { "ec@loveiq.org": ["eur", "blank"] };
    more = {
      eur: { day: Date.UTC(2026, 8, 10, 12), text: "Total €450.78 EUR" },
      blank: { day: Date.UTC(2026, 8, 12, 12), text: "Thanks for your business!" },
    };
    await run();
    expect(sheetWrites).toEqual([]);
    expect(slackText()).toContain(
      "Vercel 2026/09: EUR 450.78 + a total that could not be read (2026-09-12)"
    );
    expect(mockRecord).toHaveBeenCalledWith(
      "file-invoices",
      expect.any(Number),
      "error",
      "not written, needs a person: Vercel 2026/09"
    );
  });

  it("reads a stated zero as nothing charged, and a PDF that is not a bill as no invoice", async () => {
    // Round-9 audit: both failed the run as "a total that could not be read", every month.
    const settled = () =>
      expect(mockRecord).toHaveBeenCalledWith(
        "file-invoices",
        expect.any(Number),
        "success",
        undefined
      );
    inbox = { "ec@loveiq.org": ["free"] };
    more = { free: { day: Date.UTC(2026, 8, 10, 12), text: "Total €0.00 EUR" } };
    await run();
    expect(slackText()).not.toContain("could not be read");
    expect(sheetWrites).toEqual([]);
    settled();

    mockRecord.mockClear();
    inbox = { "ec@loveiq.org": ["brochure"] };
    more = {
      brochure: {
        day: Date.UTC(2026, 8, 10, 12),
        text: "Thanks for being a customer.",
        subject: "What is new this autumn",
      },
    };
    await run();
    expect(slackText()).not.toContain("could not be read");
    settled();
  });

  it("fails a no-row vendor only for a month a run could write", async () => {
    // 25 August is only partly inside the window on 3 October: no run can ever write it.
    inbox = { "ec@loveiq.org": ["aug"] };
    more = { aug: { day: Date.UTC(2026, 7, 25, 12), text: "Total €5.00 EUR" } };
    sheet = [HEADER, ["Slack", ...HEADER.slice(1).map(() => -5)]];
    await run();
    expect(slackText()).toContain("No row in the cost sheet for:* Vercel");
    expect(mockRecord).toHaveBeenCalledWith(
      "file-invoices",
      expect.any(Number),
      "success",
      undefined
    );
  });

  it("does not claim every invoice matched when a month was only filed, or none was found", async () => {
    // August is only partly inside the window on 3 October, so it is filed, not compared.
    inbox = { "ec@loveiq.org": ["aug"] };
    more = { aug: { day: Date.UTC(2026, 7, 10, 12), text: "Total €5.00 EUR" } };
    await run();
    expect(slackText()).toContain("Filed but not reconciled");
    expect(slackText()).not.toContain("already matched");

    inbox = {};
    await run();
    expect(slackText()).toContain("No invoice total was found to compare with the cost sheet.");
  });

  it("calls an empty cell blank, not zero", async () => {
    inbox = { "ec@loveiq.org": ["m1"] };
    sheet = [HEADER, vercelRow(HEADER).map((c, i) => (i === 18 ? "" : c))];
    await run();
    expect(slackText()).toContain("Vercel 2026/09: (blank) → -10.00");
  });

  it("enters the closed month and carries it forward, and holds the month in progress", async () => {
    // September moves to EUR 12 (a 10 and a 2 proration). October's first invoice, dated the
    // 2nd, is the month in progress: filed, and entered next month once October is complete,
    // so the forecast comes from September's whole month rather than two days of October.
    inbox = { "ec@loveiq.org": ["sep10", "sep2", "oct2"] };
    more = {
      sep10: { day: Date.UTC(2026, 8, 10, 12), text: "Total €10.00 EUR" },
      sep2: { day: Date.UTC(2026, 8, 12, 12), text: "Total €2.00 EUR" },
      oct2: { day: Date.UTC(2026, 9, 2, 12), text: "Total €3.00 EUR" },
    };
    sheet = [HEADER, vercelRow(HEADER).map((c, i) => (i >= 18 ? -10 : c))];
    await run();
    expect(sheetWrites[0]?.data).toEqual([
      { range: "Costs!S2:X2", values: [[-12, -12, -12, -12, -12, -12]] },
    ]);
    expect(slackText()).toContain("entered next month once the month is complete: Vercel 2026/10");
    expect(slackText()).not.toContain("already matched");
  });

  it("holds the month in progress for the next run, even with no column yet, without failing", async () => {
    // On the 3rd the month holds the invoices of the 1st and 2nd. It is not entered at all
    // until it closes, so a missing column is next month's question, and failing the run for
    // it would tell cost_watch that the whole run had settled nothing.
    inbox = { "ec@loveiq.org": ["oct10"] };
    more = { oct10: { day: Date.UTC(2026, 9, 2, 12), text: "Total €10.00 EUR" } };
    const noOctober = HEADER.map((c, i) => (i === 19 ? "Oct" : c));
    sheet = [noOctober, vercelRow(noOctober)];
    await run();
    expect(sheetWrites).toEqual([]);
    expect(slackText()).toContain("entered next month once the month is complete: Vercel 2026/10");
    expect(slackText()).not.toContain("nothing written for");
    expect(mockRecord).toHaveBeenCalledWith(
      "file-invoices",
      expect.any(Number),
      "success",
      undefined
    );
  });

  it("lists every charge of a month it cannot write, not only the unconvertible one", async () => {
    // Typed in from a line naming only the 66.82, the month would be EUR 450.78 short.
    inbox = { "ec@loveiq.org": ["eur", "bare"] };
    more = {
      eur: { day: Date.UTC(2026, 8, 10, 12), text: "Total €450.78 EUR" },
      bare: { day: Date.UTC(2026, 8, 12, 12), text: "Total 66.82" },
    };
    await run();
    expect(sheetWrites).toEqual([]);
    expect(slackText()).toContain(
      "Vercel 2026/09: EUR 450.78 + 66.82 with no currency beside the total"
    );
  });

  it("says a vendor has no row, without calling that an update", async () => {
    inbox = { "ec@loveiq.org": ["m1"] };
    sheet = [HEADER, ["Slack", ...HEADER.slice(1).map(() => -5)]];
    await run();
    expect(slackText()).toContain("No row in the cost sheet for:* Vercel");
    expect(slackText()).not.toContain("Cost sheet updated");
    expect(mockRecord).toHaveBeenCalledWith(
      "file-invoices",
      expect.any(Number),
      "error",
      "not written, needs a person: Vercel 2026/09"
    );
  });
});

describe("Google Ads, which sends no invoice by email", () => {
  beforeEach(() => {
    gmailOpen = () => true;
  });

  it("puts the closed month's spend in while the line still carries the month before", async () => {
    // July's 1,129 typed once and carried: what August and September showed until 2026-10-04.
    sheet = [HEADER, vercelRow(HEADER), adwordsRow(-1129, -1129)];
    adsAnswer = spendOf("1217940961");
    await run();
    expect(sheetWrites[0]?.data).toContainEqual({
      range: "Costs!S3:X3",
      values: [[-1217.94, -1217.94, -1217.94, -1217.94, -1217.94, -1217.94]],
    });
    expect(fetched.some((u) => u.includes("googleads.googleapis.com"))).toBe(true);
    expect(slackText()).toContain(
      "Adwords 2026/09: -1129.00 → -1217.94 (spend, until the invoice)"
    );
    expect(slackText()).toContain(
      "Google Ads 2026/09 is the month's spend, standing in for the invoice"
    );
    expect(mockRecord).toHaveBeenCalledWith(
      "file-invoices",
      expect.any(Number),
      "success",
      undefined
    );
  });

  it("never replaces a total entered from the invoice, and does not ask the API", async () => {
    sheet = [HEADER, vercelRow(HEADER), adwordsRow(-1254.91, -1219.31)];
    adsAnswer = spendOf("1217940961");
    await run();
    expect(sheetWrites.flatMap((w) => w.data).some((d) => d.range.endsWith("3:X3"))).toBe(false);
    expect(fetched.some((u) => u.includes("googleads.googleapis.com"))).toBe(false);
    expect(slackText()).toContain(
      "Google Ads 2026/09: -1219.31 on the sheet, entered from the invoice"
    );
  });

  it("says so when the spend cannot be read, writes nothing for it, and still succeeds", async () => {
    sheet = [HEADER, vercelRow(HEADER), adwordsRow(-1129, -1129)];
    await run();
    expect(sheetWrites.flatMap((w) => w.data).some((d) => d.range.endsWith("3:X3"))).toBe(false);
    expect(slackText()).toContain("Google Ads 2026/09 could not be read from the Google Ads API");
    expect(mockRecord).toHaveBeenCalledWith(
      "file-invoices",
      expect.any(Number),
      "success",
      undefined
    );
  });

  it("refuses a spend in another currency rather than converting it", async () => {
    sheet = [HEADER, vercelRow(HEADER), adwordsRow(-1129, -1129)];
    adsAnswer = spendOf("1400000000", "USD");
    await run();
    expect(sheetWrites.flatMap((w) => w.data).some((d) => d.range.endsWith("3:X3"))).toBe(false);
    expect(slackText()).toContain("could not be read from the Google Ads API");
  });
});
