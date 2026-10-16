import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Every Workspace account on Jarvis's people list. Ajna's account was created on 2026-10-01
 * and was still missing on 2026-10-16, when 5 of the week's 9 empty searches had filtered by
 * her name. Names here are placeholders: the repository is public.
 */
const directory: { users: unknown[]; ok: boolean } = { users: [], ok: true };
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(async () => ({
    ok: directory.ok,
    status: directory.ok ? 200 : 403,
    json: async () => ({ users: directory.users }),
  })),
}));
const token = { value: "tok" as string | null };
vi.mock("@shared/http/google-oauth", () => ({
  DIRECTORY_SCOPE: "directory",
  DRIVE_SCOPE: "drive",
  getDelegatedToken: vi.fn(async () => token.value),
  readVercelOidcToken: () => null,
}));
const registry = { value: null as Map<string, { canonical: string; kind: string }> | null };
vi.mock("@features/brain/server/people", () => ({
  loadPeople: vi.fn(async () => registry.value),
  nameKey: (n: string) => n.normalize("NFC").trim().toLowerCase(),
}));
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(),
  countRows: vi.fn(),
  fetchAllRows: vi.fn(),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { directoryPeopleReading } from "@/app/api/cron/brain-reconcile/route";
import { reconcile } from "@features/brain/server/reconcile";

const req = () => new Request("https://www.loveiq.org/api/cron/brain-reconcile");

beforeEach(() => {
  process.env.GOOGLE_WORKSPACE_ADMIN = "admin@example.test";
  process.env.GOOGLE_WORKSPACE_DOMAIN = "example.test";
  token.value = "tok";
  directory.ok = true;
  directory.users = [
    { primaryEmail: "jane@example.test", name: { fullName: "Jane Doe" } },
    { primaryEmail: "team@example.test", name: { fullName: "Team Inbox" } },
    { primaryEmail: "old@example.test", name: { fullName: "Old Colleague" }, suspended: true },
  ];
  registry.value = new Map([
    ["jane@example.test", { canonical: "Jane Doe", kind: "person" }],
    ["team@example.test", { canonical: "team (shared mailbox)", kind: "shared" }],
  ]);
});

describe("Workspace accounts on Jarvis's people list", () => {
  it("agrees when every active account is a person or a shared account on the list", async () => {
    const reading = (await directoryPeopleReading(req()))!;
    expect(reading.left.value).toBe(2);
    expect(reconcile([reading])).toEqual([]);
  });

  it("names an account missing from the list, so somebody can add it", async () => {
    directory.users.push({ primaryEmail: "new@example.test", name: { fullName: "New Starter" } });
    const [gap] = reconcile([(await directoryPeopleReading(req()))!]);
    expect(gap!.detail).toContain("new@example.test (New Starter)");
    expect(gap!.gap).toBe(1);
  });

  it("is not checked, rather than fine, when the directory or the list cannot be read", async () => {
    directory.ok = false;
    expect(await directoryPeopleReading(req())).toBeNull();
    directory.ok = true;
    registry.value = null;
    expect(await directoryPeopleReading(req())).toBeNull();
    registry.value = new Map();
    token.value = null;
    expect(await directoryPeopleReading(req())).toBeNull();
  });
});
