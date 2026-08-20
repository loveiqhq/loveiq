// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AcceleratorsSection, {
  type AccelCopy,
} from "@features/report/ui/sections/AcceleratorsSection";

/**
 * What a locked Accelerators & Brakes chapter shows.
 *
 * It used to be two legend words — "▲ What opens you", "▼ What shuts you down" —
 * over a raster of the whole chapter. Same treatment as Typical Beliefs now (Eman,
 * 2026-08-19): the real columns, the first three triggers of each live, the softness
 * climbing, the rest as per-column pixels, and the paywall card below everything a
 * reader is allowed to read.
 *
 * The rows come from `data/report2-accel-rows.ts` (per archetype, keyed by slug), not
 * from the payload, so the tease costs the server nothing. `takeaway` — the verdict
 * sentence — is the premium slot and stays withheld.
 */
const lockedCopy: AccelCopy = {
  "edu.eyebrow": "The dual-control model",
  "edu.teaser": "Arousal runs on two independent pedals.",
  "learn.eyebrow": "What you will learn",
  "learn.body": "In this chapter you will learn which conditions open you.",
  takeaway: null,
  locked: true,
};

const renderLocked = () =>
  render(
    <AcceleratorsSection
      archetype="Relational Nurturer"
      copy={lockedCopy}
      onUnlock={() => {}}
      sectionTitle="Accelerators & Brakes"
    />
  );

afterEach(cleanup);

describe("AcceleratorsSection — locked tease", () => {
  it("teases three real triggers per column, with an image after each", () => {
    const { container } = renderLocked();
    const cols = [
      ...container.querySelectorAll(".report-accel__columns--tease .report-accel__col"),
    ];
    expect(cols).toHaveLength(2);

    for (const col of cols) {
      expect(col.querySelectorAll(".report-accel__row")).toHaveLength(3);
      // The image is the last child of the row list, so it continues that column.
      const list = col.querySelector(".report-accel__rows")!;
      expect(list.lastElementChild?.className).toContain("report-locked-preview");
    }

    // Real per-archetype triggers, not a stand-in.
    expect(cols[0]).toHaveTextContent("Warm emotional check-in");
    expect(cols[1]).toHaveTextContent("Emotional coldness");

    // Both headings render, where the locked view used to show only a legend.
    expect(container.querySelector(".report-accel__legend")).toBeNull();
    expect(container).toHaveTextContent("What opens you");
    expect(container).toHaveTextContent("What shuts you down");
  });

  it("withholds the verdict sentence, the meter and the whole-chapter raster", () => {
    const { container } = renderLocked();
    expect(container.querySelector(".report-accel__meter")).toBeNull();
    expect(container.querySelector(".report-accel__quote")).toBeNull();
    const sources = [...container.querySelectorAll("img")].map((i) => i.getAttribute("src"));
    expect(sources).toEqual([
      "/report-previews/accel-opens-desktop.jpg",
      "/report-previews/accel-shuts-desktop.jpg",
      // The meter box and the verdict line, so the locked chapter shows the shape of
      // everything behind the paywall rather than stopping at the rows.
      "/report-previews/accel-tail-desktop.jpg",
    ]);
    expect(sources.some((s) => s?.includes("/accel-desktop"))).toBe(false);
  });

  it("shows every row and the meter once bought", () => {
    const { container } = render(
      <AcceleratorsSection
        archetype="Relational Nurturer"
        copy={{ ...lockedCopy, locked: false, takeaway: "Remove the brake first." }}
        onUnlock={() => {}}
        sectionTitle="Accelerators & Brakes"
      />
    );
    expect(container.querySelectorAll(".report-accel__row")).toHaveLength(10);
    expect(container.querySelector(".report-accel__meter")).not.toBeNull();
    expect(container.querySelector(".report-accel__quote")).toHaveTextContent(
      "Remove the brake first."
    );
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.querySelector(".report-accel__tail-preview")).toBeNull();
    expect(container.querySelector(".report-accel__columns--tease")).toBeNull();
  });

  it("keeps the tease count, the capture and the ramp in step", () => {
    const src = readFileSync(
      join(process.cwd(), "features/report/ui/sections/AcceleratorsSection.tsx"),
      "utf8"
    );
    expect(src).toMatch(/const ACCEL_TEASE_ROWS = 3;/);

    // The capture must hide exactly those rows, or the live rows and the image
    // double up or skip one.
    const gen = readFileSync(join(process.cwd(), "scripts/generate-locked-previews.mjs"), "utf8");
    const block = gen.slice(gen.indexOf('name: "accel-opens"'), gen.indexOf("const VIEWPORTS"));
    expect(block).toMatch(/keepRows: 3/);

    // Row three blurs in live text so the ramp starts before the image, and the
    // image is graded rather than flat — same as beliefs.
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const bodyAt = (selector: string) => {
      const at = css.indexOf(selector);
      expect(at, `missing rule: ${selector}`).toBeGreaterThan(-1);
      return css.slice(at, css.indexOf("}", at));
    };
    expect(bodyAt(".report-accel__columns--tease .report-accel__row:nth-child(3)")).toContain(
      "filter: blur(1.2px)"
    );
    expect(bodyAt(".report-accel__columns--tease .report-locked-preview::after")).toContain(
      "backdrop-filter"
    );
    // The tail raster is graded too, so the box does not sit at one flat blur.
    expect(bodyAt(".report-accel__tail-preview::after")).toContain("backdrop-filter");
    // Column crops are captured at half scale with a heavier blur: at quarter scale
    // they upscaled 4x next to live text and read as mush rather than as blur.
    expect(gen).toMatch(/const COLUMN_CAPTURE_SCALE = 0\.5;/);
    expect(gen).toMatch(/const COLUMN_BLUR_PX = 5;/);
    // And the card is pushed clear of the live rows.
    expect(bodyAt(".report-accel__verdict--locked .report-accel__preview--tease")).toContain(
      "margin-top"
    );
  });
});
