import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** The migration as written: no database runs here, the lead applies it on staging. */
const sql = readFileSync("supabase/migrations/20261122070000_mira_account.sql", "utf8");
const down = readFileSync("supabase/rollbacks/20261122070000_mira_account_down.sql", "utf8");
const TABLES = ["mira_passkey", "mira_webauthn_challenge", "mira_session", "mira_email_change"];
const create = (t: string) =>
  new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t} \\(([\\s\\S]*?)\\n\\);`).exec(sql)![1]!;

describe("20261122070000_mira_account.sql", () => {
  it("keeps every new table service-role only, like every Mira table", () => {
    expect(sql).toContain(`ARRAY['${TABLES.join("', '")}']`);
    for (const rule of [
      "ENABLE ROW LEVEL SECURITY",
      "REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated",
      "GRANT ALL ON public.%I TO service_role",
      'CREATE POLICY "Service role only" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
    ]) {
      expect(sql).toContain(rule);
    }
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.mira_claim_email_change_attempt\(uuid, integer, integer\) FROM PUBLIC, anon, authenticated;/
    );
  });

  it("deletes every row with its account: deleting an account (or a DSAR) leaves nothing behind", () => {
    for (const t of TABLES) {
      expect(create(t), t).toMatch(/REFERENCES public\.mira_user \(id\) ON DELETE CASCADE/);
    }
  });

  it("stores no secret beyond a public key: a code only as a keyed hash, no IP, no biometrics", () => {
    expect(create("mira_email_change")).toMatch(
      /code_hash\s+text NOT NULL CHECK \(code_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/
    );
    expect(create("mira_email_change")).not.toMatch(/\bcode\s+text/);
    expect(create("mira_session")).not.toMatch(/\bip\b|user_agent/);
    expect(create("mira_passkey")).toMatch(/public_key\s+text NOT NULL/);
  });

  it("reserves an email change's guesses in one UPDATE, as the sign-in code's are", () => {
    const fn =
      /CREATE OR REPLACE FUNCTION public\.mira_claim_email_change_attempt[\s\S]*?\$\$;/.exec(
        sql
      )![0];
    expect(fn).toMatch(/UPDATE public\.mira_email_change\s+SET attempts = attempts \+ 1/);
    expect(fn).toMatch(/AND attempts < p_max/);
    expect(fn).toMatch(/issued_at > now\(\) - make_interval\(secs => p_ttl_seconds\)/);
    expect(fn).toMatch(/SECURITY INVOKER/);
  });

  it("rolls back everything it adds", () => {
    for (const t of TABLES) expect(down).toContain(`DROP TABLE IF EXISTS public.${t};`);
    expect(down).toContain("DROP COLUMN IF EXISTS google_connected_at");
    expect(down).toContain("DROP FUNCTION IF EXISTS public.mira_claim_email_change_attempt");
  });
});
