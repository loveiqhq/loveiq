import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(),
  fetchAllRows: vi.fn(),
}));
vi.mock("@shared/emails/suppression", () => ({ isEmailSuppressed: vi.fn() }));
vi.mock("@features/mira/server/store", () => ({ logMiraEvent: vi.fn(), addMessages: vi.fn() }));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@shared/http/is-prod-cron-host", () => ({ isProdCronHost: () => true }));
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  recordCronRun: vi.fn(),
  startCronTimer: vi.fn().mockReturnValue(async () => {}),
}));
vi.mock("@features/mira/server/nudges", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/mira/server/nudges")>()),
  runNudges: vi.fn().mockResolvedValue({
    candidates: 0,
    due: 0,
    sent: 0,
    skipped: {},
    errors: 0,
    stoppedEarly: false,
  }),
}));

import { fetchAllRows, supabaseFetch } from "@features/admin/server/supabase";
import { reminderEmail, runJournalReminders } from "@features/mira/server/journal";
import { readToken, runNudges } from "@features/mira/server/nudges";
import { logMiraEvent } from "@features/mira/server/store";
import { isEmailSuppressed } from "@shared/emails/suppression";
import { recordCronRun } from "@shared/observability/slack-alert-dedup";
import { GET as nudgeCron } from "@/app/api/cron/mira-nudges/route";

process.env.UNSUBSCRIBE_SECRET = "test-secret-for-mira-journal-0123456789";
process.env.RESEND_API_KEY = "re_test";
process.env.CRON_SECRET = "cron-secret";
process.env.NEXT_PUBLIC_SITE_URL = "https://www.loveiq.org";

const A = "aaaaaaaa-1111-4222-8333-444444444444";
const B = "bbbbbbbb-1111-4222-8333-444444444444";
const C = "cccccccc-1111-4222-8333-444444444444";
const person = (id: string, time_zone: string, time: string, reminded: string | null = null) => ({
  id,
  email: `${id.slice(0, 1)}@example.com`,
  time_zone,
  journal_reminder_time: time,
  journal_reminded_on: reminded,
});
// 19:05 UTC on Saturday 21 Nov 2026: 20:05 in Berlin, 14:05 in New York.
const NOW = new Date("2026-11-21T19:05:00Z");
const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });

let candidates: unknown[];
let entryToday: boolean;
let crisis: boolean;
let checks: Array<{ scale: string; answers: number[] }>;
let claimed: boolean;
const writes = () =>
  vi
    .mocked(supabaseFetch)
    .mock.calls.filter(([, init]) => init?.method && init.method !== "GET")
    .map(([path, init]) => ({ path, body: JSON.parse(String(init!.body)) as unknown }));

beforeEach(() => {
  vi.clearAllMocks();
  candidates = [person(A, "Europe/Berlin", "20:00")];
  entryToday = false;
  crisis = false;
  checks = [];
  claimed = true;
  vi.mocked(fetchAllRows).mockImplementation(async () => candidates as never);
  vi.mocked(isEmailSuppressed).mockResolvedValue(false);
  send.mockResolvedValue({ data: { id: "re_1" }, error: null });
  vi.mocked(supabaseFetch).mockImplementation(async (path: string, init?: { method?: string }) => {
    if (path.startsWith("/rest/v1/mira_journal_entry"))
      return json(entryToday ? [{ day: "2026-11-21" }] : []);
    if (path.startsWith("/rest/v1/mira_event")) return json(crisis ? [{ id: 1 }] : []);
    if (path.startsWith("/rest/v1/mira_check")) return json(checks);
    if (init?.method === "PATCH" && path.includes("journal_reminded_on"))
      return json(claimed ? [{ id: A }] : []);
    return json([]);
  });
});

describe("the daily journal reminder", () => {
  it("emails the people due in the hour from their chosen time, on their own clock", async () => {
    candidates = [
      person(A, "Europe/Berlin", "20:00"),
      person(B, "America/New_York", "20:00"),
      person(C, "Europe/Berlin", "08:00"),
    ];
    const summary = await runJournalReminders(NOW);
    expect(summary).toMatchObject({ candidates: 3, due: 1, sent: 1, errors: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    const [email, opts] = send.mock.calls[0]!;
    expect(email.to).toBe("a@example.com");
    // One key per run: a retry within the run never sends twice, the slot's second run is new.
    expect(opts).toEqual({
      idempotencyKey: `mira-journal-reminder-${A}-2026-11-21-${NOW.getTime()}`,
    });
    expect(logMiraEvent).toHaveBeenCalledWith("journal_reminder_sent", { userId: A });
  });

  it("never reads anyone Mira stopped as under 18, nor anyone without a reminder on", async () => {
    await runJournalReminders(NOW);
    const [path] = vi.mocked(fetchAllRows).mock.calls[0]!;
    expect(path).toContain("journal_reminder_time=not.is.null");
    expect(path).toContain("minor_at=is.null");
  });

  it("claims the person's day before it sends, so two runs never send twice", async () => {
    await runJournalReminders(NOW);
    expect(writes()[0]).toEqual({
      path: `/rest/v1/mira_user?id=eq.${A}&journal_reminder_time=not.is.null&minor_at=is.null&or=(journal_reminded_on.is.null,journal_reminded_on.neq.2026-11-21)&select=id`,
      body: { journal_reminded_on: "2026-11-21" },
    });
    claimed = false; // another run got there first
    send.mockClear();
    expect(await runJournalReminders(NOW)).toMatchObject({
      sent: 0,
      skipped: { "already-today": 1 },
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("sends nothing to someone already reminded today or already checked in", async () => {
    candidates = [person(A, "Europe/Berlin", "20:00", "2026-11-21")];
    expect(await runJournalReminders(NOW)).toMatchObject({ skipped: { "already-today": 1 } });
    candidates = [person(A, "Europe/Berlin", "20:00")];
    entryToday = true;
    expect(await runJournalReminders(NOW)).toMatchObject({ skipped: { "checked-in": 1 } });
    expect(send).not.toHaveBeenCalled();
  });

  it("sends nothing to a suppressed address, nor for 14 days after support lines were shown", async () => {
    vi.mocked(isEmailSuppressed).mockResolvedValueOnce(true);
    expect(await runJournalReminders(NOW)).toMatchObject({ skipped: { suppressed: 1 } });
    crisis = true;
    expect(await runJournalReminders(NOW)).toMatchObject({ skipped: { "recent-crisis": 1 } });
    const crisisRead = vi
      .mocked(supabaseFetch)
      .mock.calls.map(([p]) => String(p))
      .find((p) => p.startsWith("/rest/v1/mira_event"))!;
    expect(crisisRead).toContain(`user_id=eq.${A}&name=eq.crisis_shown&created_at=gte.`);
    expect(decodeURIComponent(crisisRead)).toContain("2026-11-07T19:05:00.000Z");
    expect(send).not.toHaveBeenCalled();
    // The mood check's question 9 above "Not at all" counts the same, from the results.
    crisis = false;
    checks = [{ scale: "phq9", answers: [0, 0, 0, 0, 0, 0, 0, 0, 2] }];
    expect(await runJournalReminders(NOW)).toMatchObject({ skipped: { "recent-crisis": 1 } });
    const checkRead = vi
      .mocked(supabaseFetch)
      .mock.calls.map(([p]) => String(p))
      .find((p) => p.startsWith("/rest/v1/mira_check"))!;
    expect(checkRead).toContain(`user_id=eq.${A}&`);
    expect(decodeURIComponent(checkRead)).toContain("created_at=gte.2026-11-07T19:05:00.000Z");
    expect(send).not.toHaveBeenCalled();
  });

  it("gives the day back when the email fails, so the slot's second run can send it", async () => {
    send.mockResolvedValueOnce({ data: null, error: { name: "rate_limit_exceeded" } });
    expect(await runJournalReminders(NOW)).toMatchObject({ sent: 0, errors: 1 });
    expect(writes().at(-1)).toEqual({
      path: `/rest/v1/mira_user?id=eq.${A}`,
      body: { journal_reminded_on: null },
    });
    expect(logMiraEvent).not.toHaveBeenCalled();
  });

  it("gives the day back when sending throws, too", async () => {
    send.mockRejectedValueOnce(new Error("socket hang up"));
    expect(await runJournalReminders(NOW)).toMatchObject({ sent: 0, errors: 1 });
    expect(writes().at(-1)).toEqual({
      path: `/rest/v1/mira_user?id=eq.${A}`,
      body: { journal_reminded_on: null },
    });
  });

  it("starts nobody once its time is spent", async () => {
    expect(await runJournalReminders(NOW, { outOfTime: () => true })).toMatchObject({
      sent: 0,
      stoppedEarly: true,
    });
    expect(send).not.toHaveBeenCalled();
  });
});

describe("the reminder email", () => {
  it("carries nothing of the journal: a neutral subject, today's check-in and a one-click stop", async () => {
    await runJournalReminders(NOW);
    const [email] = send.mock.calls[0]!;
    expect(email.from).toBe("Mira <hello@send.loveiq.org>");
    expect(email.subject).toBe("Your check-in for today");
    const stopUrl = email.headers["List-Unsubscribe"].slice(1, -1) as string;
    expect(stopUrl).toMatch(/^https:\/\/www\.loveiq\.org\/api\/mira\/journal\/unsubscribe\?t=/);
    const t = new URL(stopUrl).searchParams.get("t");
    expect(readToken("journal-stop", t)).toBe(A);
    // Its own purpose: forwarded, it can't open the person's nudge preferences.
    expect(readToken("prefs", t)).toBeNull();
    expect(email.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(email.text).toContain("https://www.loveiq.org/mira/journal?checkin=1");
    expect(email.text).toContain(
      "Stop these reminders: https://www.loveiq.org/mira/journal/reminder?t="
    );
    expect(email.text).toContain("Applied Psychometrics UG (haftungsbeschränkt)");
  });

  it("is the same short note for everyone", () => {
    const one = reminderEmail({ checkInUrl: "https://x/c", stopUrl: "https://x/s?t=1&a=2" });
    expect(one.html).toContain('href="https://x/s?t=1&amp;a=2"');
    expect(one.html.replace(/<[^>]+>/g, "")).toContain("How is life feeling today?");
    // The neutral line leads both parts, so an inbox preview shows it and nothing else.
    expect(one.text.split("\n")[0]).toBe("A short note for you.");
  });
});

describe("the nudge cron", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());
  const cron = () =>
    nudgeCron(
      new Request("http://localhost/api/cron/mira-nudges", {
        headers: { authorization: "Bearer cron-secret" },
      })
    );

  it("sends the journal reminders first, then the nudges, inside one time budget", async () => {
    process.env.MIRA_NUDGES_ENABLED = "true";
    const body = await (await cron()).json();
    expect(body.journal).toMatchObject({ sent: 1 });
    expect(runNudges).toHaveBeenCalledTimes(1);
    expect(send.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(runNudges).mock.invocationCallOrder[0]!
    );
    expect(recordCronRun).toHaveBeenLastCalledWith(
      "mira-nudges",
      expect.any(Number),
      "success",
      undefined
    );
  });

  it("records failed reminders as an error, and still sends the nudges", async () => {
    process.env.MIRA_NUDGES_ENABLED = "true";
    vi.mocked(fetchAllRows).mockResolvedValueOnce(null);
    expect((await cron()).status).toBe(200);
    expect(runNudges).toHaveBeenCalledTimes(1);
    expect(recordCronRun).toHaveBeenLastCalledWith(
      "mira-nudges",
      expect.any(Number),
      "error",
      expect.stringContaining("journal reminders")
    );
  });
});
