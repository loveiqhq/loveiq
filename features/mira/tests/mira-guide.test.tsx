// @vitest-environment jsdom
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

import MiraGuidePage, { metadata } from "@/app/mira/guide/page";
import { GUIDE, GUIDE_PRACTICES, SKIP_IT } from "@features/mira/content/guide";
import { MIRA_SYSTEM_PROMPT } from "@features/mira/content/system-prompt";
import { cardById } from "@features/mira/server/cards";
import { STABLE_INSTRUCTIONS } from "@features/mira/server/prompt";
import MiraHome from "@features/mira/ui/MiraHome";

/** The body confidence guide (/mira/guide) against Sanjin's spec "Body Confidence Guide Prompt". */

const dom = (el: ReactElement) => new DOMParser().parseFromString(renderToString(el), "text/html");

/** Every string in the guide, leaving out the given keys (durations, the sources list). */
function strings(value: unknown, skip: string[] = []): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((v) => strings(v, skip));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => (skip.includes(k) ? [] : strings(v, skip)));
  }
  return [];
}

/** The spec's "Verified figures (use only these)", as the guide may write them. */
const SPEC_FIGURES = [
  "45%",
  "1,249",
  "16001",
  "54",
  "42",
  "100",
  "56.74%",
  "48.08%",
  "63.95%",
  "2026",
];

describe("The guide's practices", () => {
  it("are Mira's seven, by her numbers and names, in her three stages", () => {
    expect(GUIDE_PRACTICES.map((p) => p.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const p of GUIDE_PRACTICES) expect(MIRA_SYSTEM_PROMPT).toContain(`${p.number} ${p.name}`);
    const stages = GUIDE.sections.flatMap((s) => s.stages ?? []);
    expect(stages.map((st) => st.practices.map((p) => p.number))).toEqual([
      [1, 2],
      [3, 4],
      [5, 6, 7],
    ]);
  });

  it("each have the five parts: name and time, when it helps, 3 to 5 steps, why in one sentence, skip", () => {
    const page = dom(<MiraGuidePage />);
    for (const p of GUIDE_PRACTICES) {
      expect(p.name && p.time && p.bestFor).toBeTruthy();
      expect(p.steps.length).toBeGreaterThanOrEqual(3);
      expect(p.steps.length).toBeLessThanOrEqual(5);
      expect(p.why).toMatch(/^[^.!?]+[.!?]$/);

      const section = page.getElementById(`practice-${p.number}`);
      const text = section?.textContent ?? "";
      expect(section?.querySelector("h4")?.textContent).toBe(`Practice ${p.number}: ${p.name}`);
      expect(text).toContain(`${p.time} · Best for: ${p.bestFor}`);
      expect([...(section?.querySelectorAll("ol > li") ?? [])].map((li) => li.textContent)).toEqual(
        p.steps
      );
      expect(text).toContain(`Why it works: ${p.why}`);
      expect(text.trim().endsWith(SKIP_IT)).toBe(true);
    }
  });
});

describe("The guide's words", () => {
  it("never mention weight, food, body shape or appearance goals, nor ask for self-love", () => {
    const forbidden = [
      /\bweigh/i,
      /\bdiet/i,
      /\bcalori/i,
      /\bfood/i,
      /\beat(s|ing)?\b/i,
      /\bmeals?\b/i,
      /\bshape/i,
      /\bslim/i,
      /\bthin(ner)?\b/i,
      /\bfat\b/i,
      /\bskinny\b/i,
      /\bBMI\b/,
      /\bworkout/i,
      /\bgym\b/i,
      /\bfitness\b/i,
      /\blove (your|my) (own )?bod(y|ies)\b/i,
      /\blove yourself\b/i,
      /\b(think|stay|be) positive/i,
      /\bpositive thinking\b/i,
    ];
    const text = strings(GUIDE).join("\n");
    for (const word of forbidden) expect(text).not.toMatch(word);
  });

  it("use no number but the spec's verified figures (durations and sources aside)", () => {
    const prose = strings(GUIDE, ["time", "sources"]).join("\n");
    const numbers = prose.match(/\d+(?:[.,]\d+)*%?/g) ?? [];
    expect(numbers).toContain("45%");
    for (const n of numbers) expect(SPEC_FIGURES).toContain(n);
  });

  it("say once that most of the research was done with women", () => {
    const text = strings(GUIDE, ["sources"]).join("\n");
    expect(text.match(/most of the research/gi)).toHaveLength(1);
    expect(text).toContain("most of the research behind this guide was done with women");
  });
});

describe("The guide page", () => {
  it("renders the guide with its contents, stages, practice anchors and sources", () => {
    const page = dom(<MiraGuidePage />);
    expect(page.querySelector("h1")?.textContent).toBe(GUIDE.title);
    const toc = [...page.querySelectorAll('nav[aria-label="Contents"] a')].map((a) =>
      a.getAttribute("href")
    );
    expect(toc).toEqual([
      ...GUIDE.sections.flatMap((s) => [
        `#${s.id}`,
        ...(s.stages ?? []).map((_, i) => `#stage-${i + 1}`),
      ]),
      "#sources",
    ]);
    for (const href of toc) expect(page.getElementById(href!.slice(1))).not.toBeNull();
    expect([...page.querySelectorAll("h3")].map((h) => h.textContent)).toEqual(
      expect.arrayContaining([
        "Stage 1: Get out of your head",
        "Stage 2: Make peace with your body",
        "Stage 3: Make intimacy yours",
      ])
    );
    const path = [...page.querySelectorAll('ol[aria-label="Where to start"] a')];
    expect(path.map((a) => a.getAttribute("href"))).toEqual(
      GUIDE_PRACTICES.map((p) => `#practice-${p.number}`)
    );
    expect(page.body.textContent?.split(SKIP_IT)).toHaveLength(8);

    const sources = page.getElementById("sources")?.textContent ?? "";
    for (const id of GUIDE.sources.cards) {
      const card = cardById(id);
      expect(card, id).toBeDefined();
      expect(sources).toContain(card!.citation);
    }
  });

  it("is titled for LoveIQ and kept out of search, like Mira's other pages", () => {
    expect(metadata.title).toBe("Body confidence guide | LoveIQ");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});

describe("Wired in", () => {
  it("the menu on every signed-in page opens /mira/guide", () => {
    vi.stubEnv("NEXT_PUBLIC_MIRA_GUIDE_URL", "");
    const home = dom(<MiraHome />);
    vi.unstubAllEnvs();
    const nav = home.querySelector('nav[aria-label="Mira"]')!;
    expect(nav.querySelector('a[href="/mira/guide"]')).not.toBeNull();
  });

  it("Mira knows the guide is published at /mira/guide and can give its steps", () => {
    expect(MIRA_SYSTEM_PROMPT).toContain("loveiq.org/mira/guide");
    expect(MIRA_SYSTEM_PROMPT).not.toMatch(/not published|on its way/i);
    expect(STABLE_INSTRUCTIONS).toContain("THE GUIDE'S PRACTICES");
    for (const p of GUIDE_PRACTICES) {
      expect(STABLE_INSTRUCTIONS).toContain(`loveiq.org/mira/guide#practice-${p.number}`);
      p.steps.forEach((s, i) => expect(STABLE_INSTRUCTIONS).toContain(`${i + 1}. ${s}`));
    }
  });
});
