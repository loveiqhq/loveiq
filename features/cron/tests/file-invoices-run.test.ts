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
let more: Record<string, { day: number; text: string }> = {};
const invoiceOn = (id: string, day: number, text: string) => ({
  internalDate: String(day),
  payload: {
    headers: [
      { name: "From", value: "Vercel Inc. <invoice@vercel.com>" },
      { name: "Subject", value: "Your receipt" },
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
      return ok(spec ? invoiceOn(id, spec.day, spec.text) : invoice(mailbox));
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
    expect(text).toContain("could not be converted, enter by hand");
    // As it was charged, not as the "OTHER" that keeps it out of the sheet.
    expect(text).toContain("Vercel 2026/09: USD 11.70 on 2026-09-20, no ECB rate for it");
    expect(text).not.toContain("converted to EUR");
    expect(text).not.toContain("already matched");
  });

  it("calls an empty cell blank, not zero", async () => {
    inbox = { "ec@loveiq.org": ["m1"] };
    sheet = [HEADER, vercelRow(HEADER).map((c, i) => (i === 18 ? "" : c))];
    await run();
    expect(slackText()).toContain("Vercel 2026/09: (blank) → -10.00");
  });

  it("carries a changed month into the next one, even where that month's own total matched", async () => {
    // September moves to EUR 12 (a 10 and a 2 proration) and October stays EUR 10. The sheet
    // read before the batch said -10 in October, so October was skipped and kept the -12
    // just carried into it.
    inbox = { "ec@loveiq.org": ["sep10", "sep2", "oct10"] };
    more = {
      sep10: { day: Date.UTC(2026, 8, 10, 12), text: "Total €10.00 EUR" },
      sep2: { day: Date.UTC(2026, 8, 12, 12), text: "Total €2.00 EUR" },
      oct10: { day: Date.UTC(2026, 9, 2, 12), text: "Total €10.00 EUR" },
    };
    sheet = [HEADER, vercelRow(HEADER).map((c, i) => (i >= 18 ? -10 : c))];
    await run();
    expect(sheetWrites[0]?.data).toEqual([
      { range: "Costs!S2:X2", values: [[-12, -12, -12, -12, -12, -12]] },
      { range: "Costs!T2:X2", values: [[-10, -10, -10, -10, -10]] },
    ]);
  });

  it("reports the month in progress when it has no column, without failing the run", async () => {
    // On the 3rd the month holds the invoices of the 1st and 2nd. Failing the run for it
    // told cost_watch that the whole run had settled nothing.
    inbox = { "ec@loveiq.org": ["oct10"] };
    more = { oct10: { day: Date.UTC(2026, 9, 2, 12), text: "Total €10.00 EUR" } };
    const noOctober = HEADER.map((c, i) => (i === 19 ? "Oct" : c));
    sheet = [noOctober, vercelRow(noOctober)];
    await run();
    expect(slackText()).toContain("nothing written for:* Vercel 2026/10");
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
  });
});
