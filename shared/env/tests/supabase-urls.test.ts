import { execSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { supabaseAuthUrl, supabaseRestUrl } from "@shared/env/supabase-urls";

const BASE = "https://proj.supabase.co";

describe("supabaseRestUrl / supabaseAuthUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("are SUPABASE_URL, exactly, while the overrides are unset", () => {
    vi.stubEnv("SUPABASE_URL", `${BASE}/`);
    expect(supabaseRestUrl()).toBe(`${BASE}/`);
    expect(supabaseAuthUrl()).toBe(`${BASE}/`);
    vi.stubEnv("SUPABASE_URL", undefined);
    expect(supabaseRestUrl()).toBeUndefined();
    expect(supabaseAuthUrl()).toBeUndefined();
  });

  it("each takes its own override and leaves the other alone", () => {
    vi.stubEnv("SUPABASE_URL", BASE);
    vi.stubEnv("SUPABASE_REST_URL", " https://db.example ");
    expect(supabaseRestUrl()).toBe("https://db.example");
    expect(supabaseAuthUrl()).toBe(BASE);
    vi.stubEnv("SUPABASE_REST_URL", undefined);
    vi.stubEnv("SUPABASE_AUTH_URL", "https://auth.example");
    expect(supabaseAuthUrl()).toBe("https://auth.example");
    expect(supabaseRestUrl()).toBe(BASE);
  });

  it("drop a trailing slash from an override, so the path is never //auth/v1", () => {
    vi.stubEnv("SUPABASE_URL", BASE);
    vi.stubEnv("SUPABASE_REST_URL", "https://db.example/");
    vi.stubEnv("SUPABASE_AUTH_URL", "https://auth.example// ");
    expect(supabaseRestUrl()).toBe("https://db.example");
    expect(supabaseAuthUrl()).toBe("https://auth.example");
  });

  it.each(["", "   "])("treat an override of %j as unset", (value) => {
    vi.stubEnv("SUPABASE_URL", BASE);
    vi.stubEnv("SUPABASE_REST_URL", value);
    vi.stubEnv("SUPABASE_AUTH_URL", value);
    expect(supabaseRestUrl()).toBe(BASE);
    expect(supabaseAuthUrl()).toBe(BASE);
  });

  /**
   * ONE PLACE DECIDES WHERE THE SERVER REACHES SUPABASE. A direct read of SUPABASE_URL for
   * `/rest/v1` or `/auth/v1` keeps the old address after an override has moved everything
   * else, which splits reads and writes across two places with no error to say so. The
   * brain's embedder calls Edge Functions (`/functions/v1`), which have no override.
   */
  it("are the only server code that reads SUPABASE_URL", () => {
    const out = execSync(
      "grep -rlF 'process.env.SUPABASE_URL' --include='*.ts' --include='*.tsx' app/ features/ shared/ proxy.ts || true",
      { cwd: process.cwd(), encoding: "utf8" }
    );
    const readers = out
      .split("\n")
      .filter((file) => file && !/\/tests\/|\.test\.tsx?$/.test(file))
      .sort();
    expect(readers).toEqual(["features/brain/server/embed.ts", "shared/env/supabase-urls.ts"]);
  });
});
