import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readAppCss } from "@shared/testing/read-app-css";

/**
 * On a locked report every chapter's "Learn:" expander sits behind the blur, CTA
 * included (Eman, 2026-08-19). It used to stay sharp everywhere except Attachment,
 * on the reasoning that its three-line tease was the hook.
 *
 * Asserted against the stylesheet because the blur is CSS-only and jsdom applies
 * no CSS. A real browser check lives in the scratch audit that produced this rule:
 * all twelve locked expanders read `blur(4px)`, all fifteen unlocked read none.
 */
const CSS = readAppCss();

const LOCKED_RULE_START = ".report-section:has(.report-premium-overlay) .report-accel__details";

describe("locked chapters — Learn expander blur", () => {
  it("blurs the expander root of every chapter that has one", () => {
    // Every `.report-X__details` rule in the sheet is a chapter expander root.
    const roots = [...CSS.matchAll(/^\.(report-[a-z]+__details) \{/gm)].map((m) => m[1]!);
    expect(roots.length).toBeGreaterThan(10);

    const rule = CSS.slice(CSS.indexOf(LOCKED_RULE_START));
    const selectorBlock = rule.slice(0, rule.indexOf("{"));
    const missing = [...new Set(roots)].filter((root) => !selectorBlock.includes(`.${root}`));
    expect(missing, "a chapter expander is not covered by the locked blur").toEqual([]);
  });

  it("blurs the band as a whole, at the shared lock strength", () => {
    const rule = CSS.slice(CSS.indexOf(LOCKED_RULE_START));
    const body = rule.slice(rule.indexOf("{"), rule.indexOf("}"));
    expect(body).toContain("filter: blur(var(--report-lock-blur))");
    expect(body).toContain("pointer-events: none");
  });

  it("does not also blur the pieces inside it", () => {
    // 4px inside 4px reads as 8px. Attachment used to list its own summary and
    // teaser; that pair has to stay out of the article-level rule.
    const attachment = CSS.slice(CSS.indexOf(".report-attachment__article--locked"));
    const attachmentRule = attachment.slice(0, attachment.indexOf("{"));
    expect(attachmentRule).not.toContain("__details-summary");
    expect(attachmentRule).not.toContain("__details-teaser");
  });

  it("is scoped to the chapter that carries a paywall card", () => {
    // Not to the whole page: an `essentials` reader has some chapters open and
    // some locked, and only the locked ones blur.
    const rule = CSS.slice(CSS.indexOf(LOCKED_RULE_START));
    const selectorBlock = rule.slice(0, rule.indexOf("{"));
    const selectors = selectorBlock
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const selector of selectors) {
      expect(selector, selector).toMatch(/^\.report-section:has\(\.report-premium-overlay\) /);
    }
  });
});
