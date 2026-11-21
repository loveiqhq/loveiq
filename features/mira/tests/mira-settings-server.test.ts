import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** This browser's cookies (the under-18 mark lives here). */
const cookieJar = new Map<string, string>();
const jar = {
  get: vi.fn((name: string) =>
    cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined
  ),
  set: vi.fn((name: string, value: string) => void cookieJar.set(name, value)),
};
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => jar) }));
vi.mock("@features/admin/server/supabase", () => ({ supabaseFetch: vi.fn() }));
vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: vi.fn().mockResolvedValue(true) }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@features/mira/server/nudges", () => ({ isValidTimeZone: () => true }));
vi.mock("@features/mira/server/session", () => ({
  getMiraAccount: vi.fn(),
  createMiraSupabase: vi.fn(),
}));
vi.mock("@features/mira/server/store", () => ({
  deleteAccount: vi.fn(),
  deleteChats: vi.fn().mockResolvedValue(undefined),
  findAssessment: vi.fn().mockResolvedValue(null),
  getProfile: vi.fn(),
  listChats: vi.fn().mockResolvedValue([]),
  logMiraEvent: vi.fn(),
  updateProfile: vi.fn().mockResolvedValue(undefined),
}));

import { PATCH } from "@/app/api/mira/me/route";
import { supabaseFetch } from "@features/admin/server/supabase";
import { MINOR_COOKIE } from "@features/mira/server/config";
import { stopForMinor } from "@features/mira/server/minor";
import {
  personalInstructions,
  replyLanguageInstruction,
  STABLE_INSTRUCTIONS,
} from "@features/mira/server/prompt";
import { isCrisisMessage, parseReply } from "@features/mira/server/safety";
import { getMiraAccount } from "@features/mira/server/session";
import { logMiraEvent, updateProfile } from "@features/mira/server/store";
import { REPLY_LANGUAGES, type ReplyLanguage } from "@features/mira/reply-languages";
import {
  accountLook,
  DEFAULT_LOOK,
  lookCookie,
  parseLook,
  TEXT_SIZES,
  THEMES,
} from "@features/mira/ui/prefs";

const LEA = { id: "u1", email: "lea@example.com" };
const patch = (body: unknown) =>
  PATCH(
    new Request("http://localhost/api/mira/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-csrf-token": "t" },
      body: JSON.stringify(body),
    })
  );
/** The account has no under-18 mark (the minor check reads mira_user.minor_at). */
const notMinor = () =>
  vi.mocked(supabaseFetch).mockResolvedValue(new Response("[]", { status: 200 }));

beforeEach(() => {
  vi.clearAllMocks();
  cookieJar.clear();
  vi.mocked(getMiraAccount).mockResolvedValue(LEA);
  notMinor();
});

describe("the look cookie", () => {
  it("reads only the themes and sizes there are, and falls back per part", () => {
    expect(parseLook("dark.large")).toEqual({ theme: "dark", text: "large" });
    expect(parseLook("light.oops")).toEqual({ theme: "light", text: "default" });
    expect(parseLook('"><script>.small')).toEqual({ theme: "system", text: "small" });
    expect(parseLook(undefined)).toEqual(DEFAULT_LOOK);
    expect(DEFAULT_LOOK).toEqual({ theme: "system", text: "default" });
  });

  it("is written for Mira's pages only, for a year, Secure on https", () => {
    expect(lookCookie({ theme: "dark", text: "small" }, true)).toBe(
      "mira_look=dark.small; Path=/mira; Max-Age=31536000; SameSite=Lax; Secure"
    );
    expect(lookCookie({ theme: "light", text: "default" }, false)).not.toContain("Secure");
  });

  it("takes what the account saved over this browser's, and keeps the browser's where it saved nothing", () => {
    const here = { theme: "dark", text: "large" } as const;
    expect(accountLook({ theme: "light", text_size: null }, here)).toEqual({
      theme: "light",
      text: "large",
    });
    expect(accountLook({ theme: "neon", text_size: undefined }, here)).toEqual(here);
  });
});

/** A crisis message in each language Mira may be set to reply in: the fixed reply must catch it. */
const CRISIS_SAMPLE: Record<ReplyLanguage, string> = {
  en: "I want to kill myself",
  de: "Ich will sterben",
  fr: "Je veux mourir",
  es: "Quiero suicidarme",
  it: "Voglio morire",
  pt: "Quero morrer",
  nl: "Ik wil dood",
  pl: "Chcę umrzeć",
  tr: "Ölmek istiyorum",
  ru: "Я хочу умереть",
  ar: "أريد أن أموت",
  bs: "Želim umrijeti",
  hr: "Mislim na samoubojstvo",
  sr: "Hoću da umrem",
};

describe("Mira replies in", () => {
  it("offers only languages whose crisis words are read before the model", () => {
    expect(REPLY_LANGUAGES.map((l) => l.code).sort()).toEqual(Object.keys(CRISIS_SAMPLE).sort());
    for (const { code } of REPLY_LANGUAGES) {
      expect(isCrisisMessage(CRISIS_SAMPLE[code]), code).toBe(true);
    }
  });

  it("matches the person's messages unless a language is chosen, for anonymous chats too", () => {
    expect(replyLanguageInstruction(null)).toContain("the language of the person's latest message");
    expect(personalInstructions({}, { signedIn: false })).toContain(
      "the language of the person's latest message"
    );
    const german = personalInstructions({}, { signedIn: true, replyLanguage: "de" });
    expect(german).toContain("Reply in German, whatever language the person writes in");
    expect(german).not.toContain("latest message");
    // Serbian in the script the crisis patterns read.
    expect(replyLanguageInstruction("sr")).toContain("Latin script");
  });

  it("keeps the Sources line and the markers in English, which the app reads", () => {
    expect(STABLE_INSTRUCTIONS).not.toContain("Reply in English only");
    expect(STABLE_INSTRUCTIONS).toContain("ABOUT THIS CONVERSATION");
    expect(STABLE_INSTRUCTIONS).toMatch(/write the Sources line and the markers .* in English/);
    // A German reply's sources still become tags only when the line says "Sources:".
    expect(parseReply("Hallo.\nSources: [C01]").sources).toHaveLength(1);
    expect(parseReply("Hallo.\nQuellen: [C01]").sources).toHaveLength(0);
  });
});

describe("PATCH /api/mira/me (appearance and reply language)", () => {
  it("saves the theme, text size and reply language, and counts each change by its id", async () => {
    const res = await patch({ theme: "dark", text_size: "large", reply_language: "de" });
    expect(res.status).toBe(200);
    expect(vi.mocked(updateProfile).mock.calls[0]![1]).toEqual({
      theme: "dark",
      text_size: "large",
      reply_language: "de",
    });
    const events = vi
      .mocked(logMiraEvent)
      .mock.calls.filter(([name]) => name !== "settings_saved")
      .map(([name, , props]) => [name, props]);
    expect(events).toEqual([
      ["theme_changed", { value: "dark" }],
      ["text_size_changed", { value: "large" }],
      ["reply_language_changed", { value: "de" }],
    ]);
  });

  it("takes null as Match my messages, and nothing it doesn't know", async () => {
    expect((await patch({ reply_language: null })).status).toBe(200);
    expect(vi.mocked(updateProfile).mock.calls[0]![1]).toEqual({ reply_language: null });
    for (const body of [
      { theme: "neon" },
      { text_size: "huge" },
      { reply_language: "xx" },
      { reply_language: "DE" },
    ]) {
      expect((await patch(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(updateProfile).toHaveBeenCalledTimes(1);
  });

  it("refuses an account stopped as under 18 (403), and saves nothing", async () => {
    vi.mocked(supabaseFetch).mockResolvedValue(
      new Response(JSON.stringify([{ id: "u1" }]), { status: 200 })
    );
    expect((await patch({ theme: "dark" })).status).toBe(403);
    cookieJar.set(MINOR_COOKIE, "1");
    notMinor();
    expect((await patch({ reply_language: "de" })).status).toBe(403);
    expect(updateProfile).not.toHaveBeenCalled();
    expect(logMiraEvent).not.toHaveBeenCalled();
  });
});

describe("an under-18 stop", () => {
  it("also forgets the account's appearance and reply language", async () => {
    await stopForMinor("u1");
    expect(vi.mocked(updateProfile).mock.calls[0]![1]).toMatchObject({
      theme: null,
      text_size: null,
      reply_language: null,
    });
  });
});

describe("migration 20261122060000_mira_settings.sql", () => {
  const sql = readFileSync("supabase/migrations/20261122060000_mira_settings.sql", "utf8");
  /** The values a column's CHECK allows. */
  const allowed = (column: string) =>
    [
      ...(new RegExp(`CHECK \\(${column} IN \\(([^)]*)\\)`).exec(sql)?.[1] ?? "").matchAll(
        /'([a-z]+)'/g
      ),
    ].map((m) => m[1]);

  it("allows exactly the languages, themes and sizes the app offers, null by default", () => {
    expect(allowed("reply_language")).toEqual(REPLY_LANGUAGES.map((l) => l.code));
    expect(allowed("theme")).toEqual([...THEMES]);
    expect(allowed("text_size")).toEqual([...TEXT_SIZES]);
    expect(sql).not.toMatch(/NOT NULL/);
    const down = readFileSync("supabase/rollbacks/20261122060000_mira_settings_down.sql", "utf8");
    for (const column of ["reply_language", "theme", "text_size"]) {
      expect(down).toContain(`DROP COLUMN IF EXISTS ${column}`);
    }
  });
});
