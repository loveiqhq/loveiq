/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SITE_ID = "6687189";
const USER_ID = "74c9fff6-aea0-5389-854f-c0942203ddb4";

const ORIGINAL_ENV = process.env.NEXT_PUBLIC_HOTJAR_SITE_ID;

beforeEach(() => {
  process.env.NEXT_PUBLIC_HOTJAR_SITE_ID = SITE_ID;
  document.cookie.split(";").forEach((entry) => {
    const name = entry.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  });
  vi.resetModules();
});

afterEach(() => {
  process.env.NEXT_PUBLIC_HOTJAR_SITE_ID = ORIGINAL_ENV;
});

async function loadModule() {
  return await import("@/lib/hotjar");
}

describe("readHotjarUserId", () => {
  it("returns null when the env var is missing", async () => {
    process.env.NEXT_PUBLIC_HOTJAR_SITE_ID = "";
    const { readHotjarUserId } = await loadModule();
    document.cookie = `_hjSessionUser_${SITE_ID}=anything`;
    expect(readHotjarUserId()).toBeNull();
  });

  it("returns null when the cookie is absent", async () => {
    const { readHotjarUserId } = await loadModule();
    expect(readHotjarUserId()).toBeNull();
  });

  it("parses plain URL-encoded JSON (legacy format)", async () => {
    const json = JSON.stringify({ id: USER_ID, created: 1693675654092, existing: true });
    document.cookie = `_hjSessionUser_${SITE_ID}=${encodeURIComponent(json)}`;
    const { readHotjarUserId } = await loadModule();
    expect(readHotjarUserId()).toBe(USER_ID);
  });

  it("parses base64-encoded JSON (Hotjar v6 default)", async () => {
    const json = JSON.stringify({ id: USER_ID, created: 1693675654092, existing: true });
    const base64 = Buffer.from(json, "utf8").toString("base64");
    document.cookie = `_hjSessionUser_${SITE_ID}=${encodeURIComponent(base64)}`;
    const { readHotjarUserId } = await loadModule();
    expect(readHotjarUserId()).toBe(USER_ID);
  });

  it("supports the alternate `user_id` shape", async () => {
    const json = JSON.stringify({ user_id: USER_ID });
    const base64 = Buffer.from(json, "utf8").toString("base64");
    document.cookie = `_hjSessionUser_${SITE_ID}=${encodeURIComponent(base64)}`;
    const { readHotjarUserId } = await loadModule();
    expect(readHotjarUserId()).toBe(USER_ID);
  });

  it("returns null on garbage values", async () => {
    document.cookie = `_hjSessionUser_${SITE_ID}=not-base64-or-json!!!`;
    const { readHotjarUserId } = await loadModule();
    expect(readHotjarUserId()).toBeNull();
  });

  it("clamps very long ids to the max length", async () => {
    const long = "x".repeat(200);
    const json = JSON.stringify({ id: long });
    const base64 = Buffer.from(json, "utf8").toString("base64");
    document.cookie = `_hjSessionUser_${SITE_ID}=${encodeURIComponent(base64)}`;
    const { readHotjarUserId } = await loadModule();
    const result = readHotjarUserId();
    expect(result?.length).toBe(64);
  });
});
