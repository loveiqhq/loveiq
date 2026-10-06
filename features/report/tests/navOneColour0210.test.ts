import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Review 02.10, the sync. Mark, of the drawer's "Core Archetype" drawn in the selected colour:
// "the color needs to be the same as everyone else… let's just find one color and stick to
// it". The drawer he cleaned up after (961:333) sets every label in #3f3a4d, the active row's
// too; its wash and dot mark it. The desktop sidebar already kept the label's colour.
const v3 = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);

describe("the V4 nav — one label colour", () => {
  it("keeps the active drawer row's label in the rows' #3f3a4d", () => {
    expect(v3).toMatch(
      /\.rv3\.rv4 \.report-mobile-nav__link\.is-active \.report-mobile-nav__label \{\s*color: #3f3a4d;\s*\}/
    );
  });
});
