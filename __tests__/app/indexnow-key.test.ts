import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// IndexNow (scripts/indexnow.mjs) proves we own www.loveiq.org with public/<key>.txt,
// whose content must be exactly its own name. Engines fetch it before accepting a batch.
describe("IndexNow key file", () => {
  it("is a single public/<32 hex>.txt that contains its own key", () => {
    const publicDir = path.join(process.cwd(), "public");
    const keyFiles = readdirSync(publicDir).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
    expect(keyFiles).toHaveLength(1);

    const key = keyFiles[0]!.replace(/\.txt$/, "");
    expect(readFileSync(path.join(publicDir, keyFiles[0]!), "utf8").trim()).toBe(key);
  });
});
