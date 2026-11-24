import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@features/admin/server/supabase", () => ({ supabaseFetch: vi.fn() }));
vi.mock("@features/brain/server/sign-in", () => ({ memberByEmail: vi.fn() }));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { supabaseFetch } from "@features/admin/server/supabase";
import {
  adoptAnonChat,
  deleteAnonChats,
  keepAnonExchange,
  listChats,
} from "@features/mira/server/store";
import { fakeDb, type Row } from "./fake-db";

/**
 * Signed-out chats are kept too (Eman, 24 Nov 2026): in mira_chat under the browser's id, with
 * the consent they were kept under, moved into the account at sign-up and never kept twice.
 */

const BROWSER = "aBcD1234eFgH5678iJkL9012";
const OTHER_BROWSER = "zYxW9876vUtS5432rQpO1098";
const LEA = "6f2c4a1e-1111-4222-8333-944455556666";
const KEPT = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b";
const THEIRS = "7a3d5b2f-2222-4333-8444-a55566667777";
const VERSION = "mira-2026-11-24";
const owner = { anonId: BROWSER, consentVersion: VERSION };

let db: ReturnType<typeof fakeDb>;
const install = (tables: Record<string, Row[]>) => {
  db = fakeDb(tables);
  vi.mocked(supabaseFetch).mockImplementation(db.handle);
};
const chat = (id: string) => db.tables.mira_chat!.find((c) => c.id === id);
const messagesOf = (id: string) => db.tables.mira_message!.filter((m) => m.chat_id === id);

beforeEach(() => {
  vi.clearAllMocks();
  install({ mira_chat: [], mira_message: [] });
});

describe("20261124010000_mira_anon_chats.sql", () => {
  const sql = readFileSync("supabase/migrations/20261124010000_mira_anon_chats.sql", "utf8");
  const down = readFileSync("supabase/rollbacks/20261124010000_mira_anon_chats_down.sql", "utf8");

  it("lets a chat belong to a browser instead of an account, never to both or neither", () => {
    expect(sql).toContain("ALTER TABLE public.mira_chat ALTER COLUMN user_id DROP NOT NULL;");
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS anon_id text CHECK \(anon_id ~ '\^\[A-Za-z0-9_-\]\{16,64\}\$'\)/
    );
    expect(sql).toMatch(
      /ADD CONSTRAINT mira_chat_owner\s+CHECK \(num_nonnulls\(user_id, anon_id\) = 1 AND \(anon_id IS NULL OR consent_version IS NOT NULL\)\)/
    );
    // Re-runnable, in one transaction with a lock timeout, and adds nothing anyone else may read.
    expect(sql).toContain("DROP CONSTRAINT IF EXISTS mira_chat_owner;");
    expect(sql).toMatch(/BEGIN;\s+SET LOCAL lock_timeout = '5s';/);
    expect(sql).not.toMatch(/\bGRANT\b|CREATE POLICY|CREATE INDEX/);
  });

  it("rolls back to account-only chats, deleting only the signed-out ones", () => {
    expect(down).toContain("DELETE FROM public.mira_chat WHERE user_id IS NULL;");
    expect(down).toContain("ALTER TABLE public.mira_chat ALTER COLUMN user_id SET NOT NULL;");
    expect(down).toContain("DROP COLUMN IF EXISTS anon_id;");
    expect(down).toContain("DROP COLUMN IF EXISTS consent_version;");
  });
});

describe("keepAnonExchange", () => {
  const exchange = [
    { role: "user" as const, content: "I hide during sex" },
    { role: "assistant" as const, content: "Tell me more.", ask: null, goal: null },
  ];

  it("starts a chat of this browser's, with the consent it was kept under, and no account", async () => {
    const id = await keepAnonExchange(owner, null, "I hide during sex", exchange);
    expect(chat(id)).toMatchObject({
      anon_id: BROWSER,
      consent_version: VERSION,
      title: "I hide during sex",
    });
    expect(chat(id)).not.toHaveProperty("user_id");
    expect(messagesOf(id).map((m) => [m.role, m.content])).toEqual([
      ["user", "I hide during sex"],
      ["assistant", "Tell me more."],
    ]);
  });

  it("goes on in the browser's own kept chat, never in another browser's or an account's", async () => {
    install({
      mira_chat: [
        { id: KEPT, anon_id: BROWSER, consent_version: VERSION, title: "Mine" },
        { id: THEIRS, anon_id: OTHER_BROWSER, consent_version: VERSION, title: "Theirs" },
        { id: LEA, user_id: LEA, title: "An account's" },
      ],
      mira_message: [],
    });
    expect(await keepAnonExchange(owner, KEPT, "unused", exchange)).toBe(KEPT);
    expect(messagesOf(KEPT)).toHaveLength(2);
    for (const asked of [THEIRS, LEA, "not-a-chat"]) {
      const id = await keepAnonExchange(owner, asked, "New", exchange);
      expect(id).not.toBe(asked);
      expect(chat(id)).toMatchObject({ anon_id: BROWSER, title: "New" });
    }
    expect(messagesOf(THEIRS)).toHaveLength(0);
    expect(messagesOf(LEA)).toHaveLength(0);
  });

  it("is never listed for an account", async () => {
    await keepAnonExchange(owner, null, "Signed out", exchange);
    expect(await listChats(LEA)).toEqual([]);
  });
});

describe("adoptAnonChat: the chat comes with you, never kept twice", () => {
  const seed = (count: number) =>
    install({
      mira_chat: [
        { id: KEPT, anon_id: BROWSER, consent_version: VERSION, title: "Mine" },
        { id: THEIRS, anon_id: OTHER_BROWSER, consent_version: VERSION, title: "Theirs" },
      ],
      mira_message: [
        ...Array.from({ length: count }, (_, i) => ({ id: i + 1, chat_id: KEPT, role: "user" })),
        { id: 99, chat_id: THEIRS, role: "user" },
      ],
    });

  it("makes the kept chat the account's own, in one update that clears the browser id", async () => {
    seed(2);
    expect(await adoptAnonChat(BROWSER, KEPT, LEA, 2)).toBe(true);
    expect(chat(KEPT)).toMatchObject({ user_id: LEA, anon_id: null, consent_version: VERSION });
    expect(db.tables.mira_chat!.filter((c) => c.anon_id === BROWSER)).toEqual([]);
    expect(messagesOf(KEPT)).toHaveLength(2); // moved with it, not copied
    const writes = db.calls.filter((c) => !c.startsWith("GET"));
    expect(writes).toEqual([
      `PATCH /rest/v1/mira_chat?id=eq.${KEPT}&anon_id=eq.${BROWSER}&select=id`,
    ]);
  });

  it("deletes a kept copy that misses turns the browser shows, so its turns are carried instead", async () => {
    seed(1); // begun before chats were kept, or a turn wasn't saved
    expect(await adoptAnonChat(BROWSER, KEPT, LEA, 4)).toBe(false);
    expect(chat(KEPT)).toBeUndefined();
  });

  it("never moves or deletes another browser's chat", async () => {
    seed(2);
    expect(await adoptAnonChat(BROWSER, THEIRS, LEA, 0)).toBe(false);
    expect(await adoptAnonChat(BROWSER, THEIRS, LEA, 5)).toBe(false);
    expect(await adoptAnonChat(BROWSER, "not-a-chat", LEA, 0)).toBe(false);
    expect(chat(THEIRS)).toMatchObject({ anon_id: OTHER_BROWSER });
    expect(chat(THEIRS)).not.toHaveProperty("user_id");
  });
});

describe("deleteAnonChats", () => {
  beforeEach(() =>
    install({
      mira_chat: [
        { id: KEPT, anon_id: BROWSER, consent_version: VERSION },
        { id: "0b1c2d3e-4f50-4617-8829-3a4b5c6d7e8f", anon_id: BROWSER, consent_version: VERSION },
        { id: THEIRS, anon_id: OTHER_BROWSER, consent_version: VERSION },
        { id: LEA, user_id: LEA },
      ],
    })
  );

  it("deletes every chat this browser keeps, and nobody else's, and says how many", async () => {
    expect(await deleteAnonChats(BROWSER)).toBe(2);
    expect(db.tables.mira_chat!.map((c) => c.id)).toEqual([THEIRS, LEA]);
    expect(await deleteAnonChats(BROWSER)).toBe(0);
  });

  it("deletes only the one named, and nothing at all for a name that isn't a chat id", async () => {
    expect(await deleteAnonChats(BROWSER, KEPT)).toBe(1);
    expect(chat(KEPT)).toBeUndefined();
    expect(db.tables.mira_chat).toHaveLength(3);
    expect(await deleteAnonChats(BROWSER, "not-a-chat")).toBe(0);
    expect(db.tables.mira_chat).toHaveLength(3);
  });

  it("says so when the delete fails", async () => {
    vi.mocked(supabaseFetch).mockResolvedValueOnce(new Response("oops", { status: 500 }));
    await expect(deleteAnonChats(BROWSER)).rejects.toThrow(/delete failed/);
  });
});
