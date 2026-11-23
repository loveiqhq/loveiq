import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, json } from "./fake-db";

/**
 * When the address a weekly session's invite went to goes away (the account is deleted, or its
 * email changes), a cancellation takes the session out of that calendar: best effort, within the
 * day's session emails, and never in the way of the deletion or the change.
 */

const send = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send } };
  }),
}));
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(),
  fetchAllRows: vi.fn(),
}));
vi.mock("@features/brain/server/sign-in", () => ({ memberByEmail: vi.fn() }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@shared/emails/suppression", () => ({
  isEmailSuppressed: vi.fn().mockResolvedValue(false),
  isUndeliverable: vi.fn().mockResolvedValue(false),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { supabaseFetch } from "@features/admin/server/supabase";
import { memberByEmail } from "@features/brain/server/sign-in";
import { changeAccountEmail } from "@features/mira/server/email-change";
import { deleteAccount } from "@features/mira/server/store";
import { flushAfterResponse } from "@shared/http/after-response";
import { checkRateLimit } from "@shared/http/ratelimit";

process.env.UNSUBSCRIBE_SECRET = "test-secret-for-mira-sessions-0123456789";
process.env.RESEND_API_KEY = "re_test";
process.env.NEXT_PUBLIC_SITE_URL = "https://www.loveiq.org";

const LEA = { id: "6f2c4a1e-1111-4222-8333-944455556666", email: "lea@example.com" };
const SLOT = {
  id: "0a0b0c0d-1111-4222-8333-444455556666",
  user_id: LEA.id,
  weekday: 2,
  local_time: "19:00",
  time_zone: "Europe/Berlin",
  sequence: 2,
  paused_at: null,
};

let db: ReturnType<typeof fakeDb>;
const allow = (sessionMail: boolean) =>
  vi.mocked(checkRateLimit).mockImplementation(
    async (_k: string, o: { bucket: string }) =>
      ({
        allowed: o.bucket !== "mira-session-mail" || sessionMail,
        remaining: 0,
        resetAt: new Date(),
      }) as never
  );
/** The email sent: its fields and its invite's lines. */
const sent = () => {
  expect(send).toHaveBeenCalledTimes(1);
  const [mail] = send.mock.calls[0]! as [Record<string, unknown>];
  const attachment = (mail.attachments as Array<{ content: string }>)[0]!;
  const ics = Buffer.from(attachment.content, "base64").toString("utf8");
  return { mail, ics: ics.replace(/\r\n /g, "").split("\r\n") };
};

beforeEach(() => {
  vi.clearAllMocks();
  allow(true);
  vi.mocked(memberByEmail).mockResolvedValue(null);
  send.mockResolvedValue({ data: { id: "re_1" }, error: null });
  db = fakeDb(
    {
      mira_user: [{ id: LEA.id, email: LEA.email }],
      mira_session_slot: [{ ...SLOT }],
      admin_users: [],
    },
    { auth: (b) => json({ id: LEA.id, ...b }) }
  );
  vi.mocked(supabaseFetch).mockImplementation((p, i) => db.handle(p, i));
});

describe("deleting the account", () => {
  it("first sends the cancellation that takes the session out of the account's calendar", async () => {
    await deleteAccount(LEA);
    const { mail, ics } = sent();
    expect(mail.to).toBe(LEA.email);
    expect(mail.subject).toBe("Your weekly session is cancelled");
    expect(String(mail.text)).toContain("as your account was deleted");
    expect(String(mail.text)).not.toMatch(/Book a new time/);
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain(`UID:${SLOT.id}@loveiq.org`);
    expect(ics).toContain("SEQUENCE:3");
    // Before the account (and with it the slot) is deleted.
    const deleted = vi
      .mocked(supabaseFetch)
      .mock.calls.findIndex(([path, init]) => init?.method === "DELETE" && path.includes("/auth/"));
    expect(send.mock.invocationCallOrder[0]!).toBeLessThan(
      vi.mocked(supabaseFetch).mock.invocationCallOrder[deleted]!
    );
  });

  it("past the day's session emails, deletes the account without it", async () => {
    allow(false);
    await deleteAccount(LEA);
    expect(send).not.toHaveBeenCalled();
    expect(
      vi
        .mocked(supabaseFetch)
        .mock.calls.some(([path, init]) => init?.method === "DELETE" && path.includes("/auth/"))
    ).toBe(true);
  });

  it("never stops the deletion when the email fails", async () => {
    send.mockRejectedValue(new Error("resend down"));
    await expect(deleteAccount(LEA)).resolves.toBeUndefined();
  });
});

describe("changing the account's email", () => {
  it("takes the session out of the old address's calendar, and says where it went", async () => {
    expect(await changeAccountEmail(LEA.id, LEA.email, "lea.new@example.com")).toBe("changed");
    await flushAfterResponse();
    const { mail, ics } = sent();
    expect(mail.to).toBe(LEA.email);
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain(`UID:${SLOT.id}@loveiq.org`);
    expect(String(mail.text)).toContain("now goes to the new email address on your account");
    expect(String(mail.text)).not.toContain("lea.new@example.com"); // the old inbox may be shared
    expect(String(mail.text)).not.toMatch(/is cancelled/);
  });

  // Round-4 security SEC-R4-2: the address being left keeps whatever it receives, and a stop
  // token never expires, so its last email carries none (no stop link, no one-click header).
  it("sends the old address no token: no stop link and no one-click unsubscribe", async () => {
    await changeAccountEmail(LEA.id, LEA.email, "lea.new@example.com");
    await flushAfterResponse();
    const { mail, ics } = sent();
    expect(mail.headers ?? {}).not.toHaveProperty("List-Unsubscribe");
    const everything = [mail.html, mail.text, JSON.stringify(mail.headers ?? {}), ...ics];
    expect(everything.join("\n")).not.toMatch(/[?&]t=|\/stop\b/);
  });
});
