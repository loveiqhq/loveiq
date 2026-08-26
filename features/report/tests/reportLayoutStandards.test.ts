import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Cross-chapter layout standards for the PAID report.
 *
 * The report was built chapter by chapter, so pieces that repeat — the ✳ take-away
 * block, the body paragraph that explains a chapter's visual — drifted apart: same
 * component, eight different spacings, seven different type sizes. These tests pin the
 * shared values so a new chapter cannot quietly invent its own again.
 *
 * They read the CSS as text on purpose: jsdom does no layout, so a rendering test
 * cannot see spacing at all, and the numbers here were verified in a real browser at
 * 320-1600px when they were set.
 */
const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const ruleBody = (selector: string) => {
  const at = css.indexOf(selector + " {");
  expect(at, `missing rule: ${selector}`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at));
};

describe("report layout standards", () => {
  it("gives every chapter's takeaway block the same spacing", () => {
    // Eight chapters close with ✳ + italic line + short rule, built one at a time, so
    // no two were spaced alike: at 1440 the space above the star ran 16-38px, below the
    // rule 17-44px, over five internal gaps. One shared class now owns all of it
    // (MO, 2026-08-21). The parent card's row-gap lands on both sides of the block and
    // differs per chapter, so each chapter declares it and the shared rule subtracts
    // it — otherwise "standard padding" still renders eight different gaps.
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const shared = css.slice(css.indexOf(".report-verdict {"));
    const body = shared.slice(0, shared.indexOf("}"));
    expect(body).toContain("gap: clamp(13px, 1.5vw, 16px)");
    expect(body).toContain(
      "padding-block: calc(clamp(30px, 3.4vw, 48px) - var(--verdict-parent-gap, 0px))"
    );
    // The follower's own top margin has to lose, and by specificity rather than by
    // source order: two chapters declare theirs further down the file.
    expect(css).toContain(".report-verdict + [class] {");

    // Every wrapper carries the shared class...
    const wrappers: [string, string][] = [
      ["AcceleratorsSection.tsx", "report-accel__verdict"],
      ["CuriositySection.tsx", "report-curiosity__verdict"],
      ["EnergySection.tsx", "report-energy__verdict"],
      ["GrowthSection.tsx", "report-growth__close"],
      ["InitiationSection.tsx", "report-initiation__verdict"],
      ["InsecuritiesSection.tsx", "report-insecurities__verdict"],
      ["PowerSection.tsx", "report-power__verdict"],
      ["RewardSection.tsx", "report-reward__verdict"],
    ];
    for (const [file, cls] of wrappers) {
      const src = readFileSync(join(process.cwd(), "features/report/ui/sections", file), "utf8");
      expect(src, file).toContain(`className="${cls} report-verdict"`);
      // ...and none of them re-declares the spacing the shared rule owns.
      const rule = css.slice(css.indexOf(`.${cls} {`), css.indexOf("}", css.indexOf(`.${cls} {`)));
      for (const prop of ["gap", "padding", "padding-block", "margin-top", "display"]) {
        // Anchored to the start of a declaration, so `--verdict-parent-gap` and the
        // "row-gap" in the comment above it do not count as re-declaring `gap`.
        expect(rule, `${cls} should leave ${prop} to .report-verdict`).not.toMatch(
          new RegExp(`^\\s*${prop}:`, "m")
        );
      }
    }
    // ...and each declares its own card's row-gap so the subtraction is right.
    for (const cls of [
      "report-insecurities__verdict",
      "report-reward__verdict",
      "report-energy__verdict",
      "report-power__verdict",
      "report-curiosity__verdict",
      "report-initiation__verdict",
      "report-growth__close",
    ]) {
      const rule = css.slice(css.indexOf(`.${cls} {`), css.indexOf("}", css.indexOf(`.${cls} {`)));
      expect(rule, cls).toContain("--verdict-parent-gap:");
    }
  });

  it("gives every chapter's body text block the same type", () => {
    // The paragraph that explains a chapter's visual. Attachment's was 14.5px fixed and
    // centred, Love Language's centred, Beliefs' a size smaller, and Curiosity's and
    // Power's used a clamp whose min (1rem) sat ABOVE its max (0.988rem) — which pins
    // it to the min, so those two silently rendered 16px. MO picked Core Insecurities
    // as the reference (2026-08-21), so its pair is now a token.
    // Declared with the other report tokens on the page root. (There are two
    // `.report-page` rules; anchor on the token block, not on the first match.)
    const tokens = css.slice(css.indexOf("/* Report Figma alignment overrides */"));
    const tokenBody = tokens.slice(0, tokens.indexOf("}"));
    expect(tokenBody).toContain("--report-body-size: clamp(0.95rem, 1.35vw, 0.987rem)");
    expect(tokenBody).toContain("--report-body-lh: 1.68");

    for (const sel of [
      ".report-insecurities__body",
      ".report-attachment__map-caption",
      ".report-lovelang__catch",
      ".report-beliefs__note",
      ".report-curiosity__lead",
      ".report-initiation__body",
      ".report-power__body",
    ]) {
      const body = ruleBody(sel);
      expect(body, sel).toContain("font-size: var(--report-body-size)");
      expect(body, sel).toContain("line-height: var(--report-body-lh)");
      // "Normally these text blocks are left aligned. See other sections." — MO
      expect(body, sel).not.toMatch(/^\s*text-align:\s*center/m);
    }
  });

  it("leaves no purple box carrying its own box or type", () => {
    for (const dead of [
      ".report-stage2-card__need {",
      ".report-stage2-card__need-label {",
      ".report-stage2-card__need-glow {",
      ".report-attachment-card__insight {",
      ".report-attachment-card__insight-label {",
      ".report-attachment-card__insight-value {",
      ".report-arousal__reframe-label {",
      ".report-arousal__reframe-value {",
    ]) {
      expect(css, `${dead} should be the shared block's job now`).not.toContain(dead);
    }
    // the glow is gone from the markup too
    const stage = readFileSync(
      join(process.cwd(), "features/report/ui/sections/SexualStageSection.tsx"),
      "utf8"
    );
    expect(stage).not.toContain("need-glow");
  });

  it("gives the beliefs closing line room on both sides", () => {
    // It sat 18px under the belief columns and 26px above the purple Learn band, so the
    // three read as one block (MO, 2026-08-22). The same seam elsewhere runs 31-43px,
    // and the chapters that close with the star block carry 48.
    expect(ruleBody(".report-beliefs__note")).toContain("margin: clamp(26px, 2.8vw, 40px) 0 0");
    expect(ruleBody(".report-beliefs__details")).toContain("margin-top: clamp(26px, 2.8vw, 40px)");
  });

  it("gives every educational and practical piece the same prose", () => {
    // "Standardise fonts and font sizes in educational pieces and practical pieces"
    // (MO, 2026-08-22). Fifteen chapters, fifteen hand-written rules, four different
    // results: Manrope 14.5 (4 chapters), Manrope 15.2 (7), Lora 17 (2), Lora 17.008
    // (2, the gold practical blocks). Six of the sans clamps also had their min ABOVE
    // their max — `clamp(0.95rem, 1.3vw, 0.9rem)` pins to 0.95 — so those chapters
    // rendered a size nobody chose.
    const tokens = css.slice(css.indexOf("/* Report Figma alignment overrides */"));
    const tokenBody = tokens.slice(0, tokens.indexOf("}"));
    // the expander prose IS the chapter prose: one voice, one source of truth
    expect(tokenBody).toContain("--report-prose-size: var(--report-body-size)");
    expect(tokenBody).toContain("--report-prose-lh: var(--report-body-lh)");
    expect(tokenBody).toContain("--report-teaser-size: clamp(0.95rem, 1.2vw, 1.023rem)");

    const chapters = [
      "accel",
      "arousal",
      "attachment",
      "beliefs",
      "confidence",
      "curiosity",
      "energy",
      "fantasy",
      "initiation",
      "insecurities",
      "libido",
      "lovelang",
      "partnership",
      "power",
      "reward",
    ];
    for (const c of chapters) {
      const para = ruleBody(`.report-${c}__details-para`);
      expect(para, c).toContain("font-family: var(--font-sans)");
      expect(para, c).toContain("font-size: var(--report-prose-size)");
      expect(para, c).toContain("line-height: var(--report-prose-lh)");
      const teaser = ruleBody(`.report-${c}__details-teaser`);
      expect(teaser, c).toContain("font-family: var(--font-serif)");
      expect(teaser, c).toContain("font-size: var(--report-teaser-size)");
      expect(teaser, c).toContain("line-height: var(--report-teaser-lh)");
      // no chapter may re-introduce its own size
      expect(para, `${c} hardcodes a size`).not.toMatch(/font-size:\s*(clamp|[\d.]+(px|rem))/);
      expect(teaser, `${c} hardcodes a size`).not.toMatch(/font-size:\s*(clamp|[\d.]+(px|rem))/);
    }
    // the pattern cards sit inside the educational piece and take the same prose
    const family = ruleBody(".report-attachment-family__body");
    expect(family).toContain("font-size: var(--report-prose-size)");
    expect(family).toContain("line-height: var(--report-prose-lh)");
  });

  it("keeps the constellation headline's colour while matching the title type", () => {
    // "Match Headline type and style" (MO, 2026-08-21) was read as including the
    // colour, so the pink → violet gradient on "constellation," was dropped and the
    // headline went flat black. Eman asked for the colour back — the colour only: the
    // italic belonged to the type that was being matched away.
    const accent = ruleBody(".report-constellation__heading-accent");
    expect(accent).toContain(
      "linear-gradient(156.8deg, #d05976 20.5%, #c167cf 48.1%, #8887f6 79.2%)"
    );
    expect(accent).toContain("background-clip: text");
    // painted through the glyphs, so the fill has to be transparent
    expect(accent).toContain("color: transparent");
    expect(accent).not.toContain("font-style: italic");

    const src = readFileSync(
      join(process.cwd(), "features/report/ui/sections/ConstellationSection.tsx"),
      "utf8"
    );
    // a span, not an <em>: <em> would italicise it again by default
    expect(src).toContain(
      '<span className="report-constellation__heading-accent">constellation,</span>'
    );
    expect(src).not.toContain('<em className="report-constellation__heading-accent"');
  });

  it("lets a line break typed into the copy survive into the body blocks", () => {
    // "How do I best give you this?" — MO, 2026-08-21. Answer: type the break in the
    // copy sheet. The educational paragraphs already worked that way (that is how the
    // "• " lists inside `edu.body.p2/p3` break); the body blocks collapsed newlines to
    // a space, so the same copy came out as one blob.
    // Report-wide, because MO asked for breaks "here and there": it was set on 12 of
    // the report's 82 prose blocks, so a break typed anywhere else was collapsed to a
    // space. `pre-line` inherits and differs from `normal` only in honouring newlines,
    // and forcing it back to `normal` in the browser changed neither the document
    // height nor any of 380 measured boxes at 1440/768/390 — it is a no-op until
    // someone types a break.
    const tokens = css.slice(css.indexOf("/* Report Figma alignment overrides */"));
    expect(tokens.slice(0, tokens.indexOf("}"))).toContain("white-space: pre-line");
    for (const sel of [
      ".report-insecurities__body",
      ".report-attachment__map-caption",
      ".report-lovelang__catch",
      ".report-beliefs__note",
      ".report-curiosity__lead",
      ".report-initiation__body",
      ".report-power__body",
    ]) {
      expect(ruleBody(sel), sel).toContain("white-space: pre-line");
    }
    // ...and in those blocks one typed break reads as a PARAGRAPH break, which is the
    // case MO showed. The copy generator lives outside this repo, so relying on a blank
    // line surviving it would be a guess; a single newline provably survives.
    for (const [file, slot] of [
      ["InsecuritiesSection.tsx", 'copyParagraphs(copy["body.p1"])'],
      ["AttachmentPatternsSection.tsx", 'copyParagraphs(copy["body.p1"])'],
      ["LoveLanguageSection.tsx", 'copyParagraphs(copy["body.p1"])'],
      ["BeliefsSection.tsx", 'copyParagraphs(copy["body.p1"])'],
      ["InitiationSection.tsx", 'copyParagraphs(copy["body.p1"])'],
      ["PowerSection.tsx", 'copyParagraphs(copy["body.p1"])'],
      // Curiosity is NOT in this list any more: it no longer renders `body.p1` at all
      // (2026-08-26), so it has no body block for a typed break to survive into.
    ] as const) {
      const src = readFileSync(join(process.cwd(), "features/report/ui/sections", file), "utf8");
      expect(src, file).toContain(slot);
    }
  });

  it("leaves the curiosity paragraphs the design has no place for unrendered", () => {
    // `body.p2` and `body.p3` are real handoff copy — 14 archetypes each in
    // `data/report2-copy.ts`, generated from copy-matrix-v2.csv — and the report route
    // has gated and sent them since the original Report 2.0 build (79903323). Nothing
    // rendered them. Rendering them (2026-08-22) put three paragraphs where Figma's
    // Report_2.0 frame has one, which is what made the block look like it had moved up
    // over the illustration; the design won. The payload keeps them: the copy exists,
    // so where it goes is the designer's call, not something to delete quietly.
    const route = readFileSync(join(process.cwd(), "app/api/report/route.ts"), "utf8");
    expect(route).toContain('"body.p2": curiosityUnlocked');
    expect(route).toContain('"body.p3": curiosityUnlocked');
    const src = readFileSync(
      join(process.cwd(), "features/report/ui/sections/CuriositySection.tsx"),
      "utf8"
    );
    // declared on the props, so the payload stays typed and visible to the next reader
    expect(src).toContain('"body.p2"?: string | null;');
    // ...but not rendered
    expect(src).not.toMatch(/copy\["body\.p2"\]\s*\?/);
    expect(src).not.toMatch(/copy\["body\.p3"\]\s*\?/);
    // `body.p1` joined them on 2026-08-26. It was the "Novelty-first curiosity sets
    // the terms…" lead, which restated the archetype's curiosity type immediately
    // above the new scale that names that type and describes it in the document's
    // words. Same treatment as p2/p3: still gated and sent, still declared, not drawn.
    expect(route).toContain('"body.p1": curiosityUnlocked');
    expect(src).toContain('"body.p1"?: string | null;');
    expect(src).not.toMatch(/copy\["body\.p1"\]\s*\?/);

    // The scale sits ABOVE the fit table, which is where the list it replaced sat.
    const scale = src.indexOf("<CuriosityScale");
    const table = src.indexOf("<FitTable fit={relationshipFit} />");
    expect(scale).toBeGreaterThan(-1);
    expect(table).toBeGreaterThan(scale);
  });

  it("draws the Energy & Risk callout as the standard purple block", () => {
    // It was the same idea drawn differently: no border, a heavier tint, Manrope 14.7px
    // where the standard is Lora 17.3px, and "Depth replaces speed." running inline in
    // italic instead of being the block's label (MO, 2026-08-21).
    expect(ruleBody(".report-purple-block")).toContain(
      "border: 1px solid rgba(157, 138, 215, 0.28)"
    );
    expect(ruleBody(".report-purple-block__body")).toContain("font-family: var(--font-serif)");
    expect(ruleBody(".report-block-label")).toContain("text-transform: uppercase");

    // "Lets keep the same look and feel for ALL purple boxes" (MO, 2026-08-22). Five of
    // them: Confidence's way-out (the reference), Energy's callout, Attachment's key,
    // Arousal's reframe, and the Sexual Stage need tile — which was the furthest off,
    // with an opaque #f2ecfa fill, an 18px non-uppercase label, a 15px sans body and a
    // radial glow blob behind it. Verified in a browser: box, label and body computed
    // identically across all five at 1440/768/390.
    for (const [file, sel] of [
      ["ConfidenceSection.tsx", "report-confidence__wayout report-purple-block"],
      ["EnergySection.tsx", "report-energy__note report-purple-block"],
      ["AttachmentPatternsSection.tsx", "report-attachment-card__insight report-purple-block"],
      ["ArousalSection.tsx", "report-arousal__reframe report-purple-block"],
      ["SexualStageSection.tsx", "report-stage2-card__need report-purple-block"],
    ] as const) {
      const src = readFileSync(join(process.cwd(), "features/report/ui/sections", file), "utf8");
      expect(src, file).toContain(`className="${sel}"`);
      expect(src, file).toContain('className="report-block-label"');
      // the stage tile keeps its own class for its margin, so match the class not the
      // whole attribute
      expect(src, file).toContain("report-purple-block__body");
    }
    // the inline italic emphasis and its rule are gone
    expect(css).not.toContain(".report-energy__note-em");
    expect(
      readFileSync(join(process.cwd(), "features/report/ui/sections/EnergySection.tsx"), "utf8")
    ).not.toContain("__note-em");
  });

  it("groups the attachment patterns headline with the cards it introduces", () => {
    // It had 15px above and 40px below, so it read as the tail of the paragraph above
    // ("Attachment isn't static…") instead of the label for the cards under it
    // (MO, 2026-08-21). Now 40 above / 16 below.
    const body = ruleBody(".report-attachment__patterns");
    expect(body).toContain("gap: 16px");
    // 30 here + the parent's own 10px row-gap = 40px above the headline.
    expect(body).toContain("padding: 30px 0 24px");
    expect(ruleBody(".report-attachment__details-body")).toContain("gap: 10px");
  });
});
