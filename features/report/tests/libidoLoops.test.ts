import { describe, expect, it } from "vitest";
import config from "@/data/report2-archetype-config.json";
import { getReport2Section } from "@/data/report2";
import { LIBIDO_LOOP_STEPS, getLibidoLoopSteps } from "@/data/report2-libido-loops";

const SLUGS = Object.keys(config as Record<string, unknown>).filter((s) => !s.startsWith("_"));

describe("report2 libido loop steps", () => {
  it("covers all 14 archetypes with three steps each", () => {
    expect(SLUGS).toHaveLength(14);
    for (const slug of SLUGS) {
      const steps = getLibidoLoopSteps(slug);
      expect(steps, `${slug} has no loop steps`).toBeTruthy();
      expect(steps, `${slug} step count`).toHaveLength(3);
      for (const step of steps!) expect(step.length, `${slug} step`).toBeGreaterThan(20);
    }
  });

  it("keeps the two Figma-verbatim sets untouched", () => {
    expect(getLibidoLoopSteps("spiritual-lover")).toEqual([
      "Daily life feels ordinary — not sacred, not inviting",
      "You wait for the right mood — it rarely arrives on its own",
      "Chances pass, doubt grows — and tomorrow looks like today",
    ]);
    expect(getLibidoLoopSteps("spark-seeker")![0]).toBe(
      "Desire spikes fast — novelty, pursuit, anticipation"
    );
  });

  it("never repeats the diagnostic rows shown beneath the chips", () => {
    // The old implementation printed row1..row3 as the chips, duplicating the text
    // directly below them. Every step must be its own line.
    for (const slug of SLUGS) {
      const name = (config as Record<string, { name: string }>)[slug]!.name;
      const rows = [1, 2, 3, 4].map((i) => getReport2Section(name, "libido")[`row${i}.value`]);
      for (const step of getLibidoLoopSteps(slug)!) {
        expect(rows, `${slug} step duplicates a row`).not.toContain(step);
      }
    }
  });

  it("matches the Figma register: no full stop, short beats", () => {
    for (const slug of SLUGS) {
      for (const step of getLibidoLoopSteps(slug)!) {
        expect(step.endsWith("."), `${slug} "${step}"`).toBe(false);
        const words = step.split(/\s+/).length;
        // Bound taken from Figma's own longest verbatim step ("You wait for the
        // right mood — it rarely arrives on its own"), not from taste.
        expect(words, `${slug} "${step}" word count`).toBeLessThanOrEqual(14);
      }
    }
  });

  it("gives every archetype its own wording", () => {
    const all = Object.values(LIBIDO_LOOP_STEPS).flat();
    expect(new Set(all).size, "a step repeats across archetypes").toBe(all.length);
  });

  it("returns null for an unknown slug", () => {
    expect(getLibidoLoopSteps("nope")).toBeNull();
    expect(getLibidoLoopSteps(null)).toBeNull();
  });
});
