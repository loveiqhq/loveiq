import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A server component that imports a value, not a component, from a "use client" module gets
 * a client reference instead of the value, and Next renders it as a function's source. PHero
 * and PFooter imported PP_FOCUS from PCta that way, and five links shipped
 * `class="… function(){throw Error("Attempted to call PP_FOCUS() from the server …")}"`
 * without their focus ring (final review, 15 Nov). Unit renders never see it: they run
 * without the RSC transform. So the rule is checked on the source: from a client module, a
 * server component imports its default export (the component) and nothing else. Shared
 * values live in a module without the directive (ppStyles.ts).
 */
const DIR = join(process.cwd(), "features/landing/ui/painpoint");
const files = readdirSync(DIR).filter((f) => /\.tsx?$/.test(f));
const source = (f: string) => readFileSync(join(DIR, f), "utf8");
const isClient = (f: string) => /^\s*["']use client["']/.test(source(f));

describe("the new page's server/client boundary", () => {
  it("imports only the component from a client module into a server component", () => {
    const clientModules = new Set(files.filter(isClient).map((f) => f.replace(/\.tsx?$/, "")));
    expect(clientModules.size).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const f of files.filter((f) => !isClient(f))) {
      for (const m of source(f).matchAll(
        /import\s+(?!type\s)([^;]+?)\s+from\s+["']\.\/([\w-]+)["']/g
      )) {
        if (clientModules.has(m[2]!) && m[1]!.includes("{"))
          offenders.push(`${f} ← ${m[2]}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
