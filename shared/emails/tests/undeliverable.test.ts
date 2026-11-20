import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/http/fetch-with-timeout", () => ({ fetchWithTimeout: vi.fn() }));
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { isUndeliverable } from "@shared/emails/suppression";

const reply = (rows: unknown, ok = true) =>
  vi
    .mocked(fetchWithTimeout)
    .mockResolvedValueOnce(new Response(JSON.stringify(rows), { status: ok ? 200 : 500 }));

describe("isUndeliverable: what stops a transactional email", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    vi.clearAllMocks();
  });
  const setEnv = () => {
    process.env.SUPABASE_URL = "https://db.example";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  };

  it("asks only for hard bounces and complaints, never unsubscribes", async () => {
    setEnv();
    reply([{ email: "a@example.com" }]);
    expect(await isUndeliverable("a@example.com")).toBe(true);
    const url = String(vi.mocked(fetchWithTimeout).mock.calls[0]![0]);
    expect(url).toContain("reason=in.(hard_bounce,complaint)");
    expect(url).not.toContain("unsubscribed");
  });

  it("sends when nothing is found or the lookup fails", async () => {
    setEnv();
    reply([]);
    expect(await isUndeliverable("b@example.com")).toBe(false);
    reply({}, false);
    expect(await isUndeliverable("b@example.com")).toBe(false);
  });
});
